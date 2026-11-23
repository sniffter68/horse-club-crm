import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardingContractStatus, Prisma } from '@prisma/client';
import type { StallQueryDto } from './dto/stall-query.dto';
import type { LayoutBlockDto } from './dto/layout.dto';
import { validateGridBlock, type GridBlock } from './grid';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStallDto } from './dto/create-stall.dto';
import type { UpdateStallDto } from './dto/update-stall.dto';
import { neighborhoodWarnings, stallRowPosition } from './neighborhood';
import type { TransferStallDto } from './dto/transfer-stall.dto';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';

const stallInclude = Prisma.validator<Prisma.StallDefaultArgs>()({
  include: {
    horse: { include: { owner: { select: { id: true, name: true, firstName: true, lastName: true, phone: true } } } },
    contracts: {
      where: { status: { in: [BoardingContractStatus.DRAFT, BoardingContractStatus.ACTIVE, BoardingContractStatus.SUSPENDED] } },
      include: {
        horse: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, firstName: true, lastName: true } },
        payments: {
          select: { id: true, amount: true, status: true, paidAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    },
  },
});
export type StallWithContracts = Prisma.StallGetPayload<typeof stallInclude> & { warnings?: ReturnType<typeof neighborhoodWarnings> };

@Injectable()
export class StallsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: StallQueryDto): Promise<PaginatedResult<StallWithContracts>> {
    const options = parseRefineQuery(
      query,
      ['id', 'name', 'isUnavailable', 'createdAt', 'updatedAt'],
      'name',
    );
    const where: Prisma.StallWhereInput = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { number: { contains: options.search, mode: 'insensitive' } },
            { description: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};
    if (query.buildingId) where.buildingId = query.buildingId;
    const orderBy = { [options.sort]: options.order } as Prisma.StallOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.stall.count({ where }),
      this.prisma.stall.findMany({
        where,
        include: stallInclude.include,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    const neighbors = await this.prisma.stall.findMany({ include: stallInclude.include });
    return { total, data: data.map(stall => ({ ...stall, warnings: neighborhoodWarnings(stall, neighbors) })) };
  }

  async map() {
    const now = new Date();
    const stalls = await this.prisma.stall.findMany({ include: { horse: stallInclude.include.horse, contracts: { where: {
      status: { in: [BoardingContractStatus.ACTIVE, BoardingContractStatus.SUSPENDED] }, cancelledAt: null,
      horse: { deletedAt: null }, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    }, include: { horse: stallInclude.include.horse }, orderBy: [{ startsAt: 'desc' }, { id: 'asc' }], take: 1 } },
      orderBy: [{ zone: 'asc' }, { position: 'asc' }, { side: 'asc' }] });
    // A valid placement is authoritative even when legacy horseId snapshots are missing.
    // Rest/availability describes rental eligibility, never whether a stall is occupied.
    const placed = stalls.map(stall => {
      const horse = stall.contracts?.[0]?.horse ?? (stall.horse?.deletedAt ? null : stall.horse);
      return { ...stall, horse, horseId: horse?.id ?? null,
        status: horse && stall.status === 'AVAILABLE' ? 'OCCUPIED' as const : stall.status };
    });
    return placed.map(stall => ({ ...stall, rowPosition: stallRowPosition(stall, placed), warnings: neighborhoodWarnings(stall, placed) }));
  }

  assignmentHorses() {
    return this.prisma.horse.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  private validateTransfer(stalls: Array<{ id: string; type?: string; horseId: string | null; status: string; isUnavailable: boolean }>, dto: TransferStallDto) {
    if (dto.sourceStallId === dto.targetStallId) throw new BadRequestException('Выберите другой денник');
    const source = stalls.find(stall => stall.id === dto.sourceStallId);
    const target = stalls.find(stall => stall.id === dto.targetStallId);
    if (!source || !target) throw new NotFoundException('Денник не найден');
    if (source.horseId !== dto.horseId) throw new ConflictException('Размещение изменилось. Обновите карту.');
    if (dto.expectedTargetHorseId !== undefined && target.horseId !== dto.expectedTargetHorseId)
      throw new ConflictException('Целевой денник изменился. Обновите карту и повторите.');
    if (target.type === 'SERVICE' || target.isUnavailable || ['MAINTENANCE', 'QUARANTINE'].includes(target.status) ||
      (target.horseId && (source.isUnavailable || source.status !== 'OCCUPIED')))
      throw new ConflictException('Денник недоступен для заселения');
    if (target.horseId && !dto.swapIfOccupied) throw new ConflictException('Денник занят. Подтвердите рокировку.');
    return { source, target };
  }

  async transferPreview(dto: TransferStallDto) {
    const stalls = await this.prisma.stall.findMany({ include: { horse: stallInclude.include.horse } });
    const { target } = this.validateTransfer(stalls, dto);
    const source = stalls.find(stall => stall.id === dto.sourceStallId)!;
    const destination = stalls.find(stall => stall.id === target.id)!;
    const projected = stalls.map(stall => stall.id === source.id ? { ...stall, horse: destination.horse }
      : stall.id === target.id ? { ...stall, horse: source.horse } : stall);
    return projected.filter(stall => [source.id, target.id].includes(stall.id)).map(stall => ({
      stallId: stall.id, number: stall.number ?? stall.name, warnings: neighborhoodWarnings(stall, projected),
    }));
  }

  async transfer(dto: TransferStallDto, actorId: string) {
    await this.serializable(async tx => {
      const stalls = await tx.stall.findMany({ where: { id: { in: [dto.sourceStallId, dto.targetStallId] } } });
      this.validateTransfer(stalls, dto);
      const source = stalls.find(stall => stall.id === dto.sourceStallId)!;
      const target = stalls.find(stall => stall.id === dto.targetStallId)!;
      // Release unique horse IDs first; each write also satisfies the occupancy CHECK constraint.
      await tx.stall.update({ where: { id: source.id }, data: { horseId: null, status: 'AVAILABLE' } });
      if (target.horseId) {
        await tx.stall.update({ where: { id: target.id }, data: { horseId: null, status: 'AVAILABLE' } });
        await tx.stall.update({ where: { id: source.id }, data: { horseId: target.horseId, status: 'OCCUPIED' } });
        await tx.horse.update({ where: { id: target.horseId }, data: { stallNumber: source.number ?? source.name } });
      }
      await tx.stall.update({ where: { id: target.id }, data: { horseId: dto.horseId, status: 'OCCUPIED' } });
      await tx.horse.update({ where: { id: dto.horseId }, data: { stallNumber: target.number ?? target.name } });
      await tx.stallTransferLog.create({ data: { actorId, sourceStallId: source.id, targetStallId: target.id,
        horseId: dto.horseId, swappedHorseId: target.horseId } });
    });
    return this.map();
  }

  async assign(id: string, horseId: string | null) {
    await this.serializable(async tx => {
      const stall = await tx.stall.findUnique({ where: { id } });
      if (!stall) throw new NotFoundException('Денник не найден');
      if (horseId && stall.type === 'SERVICE') throw new ConflictException('В техническое помещение нельзя заселить лошадь');
      if (horseId === null) {
        await tx.stall.update({ where: { id }, data: { horseId: null,
          status: stall.status === 'OCCUPIED' ? 'AVAILABLE' : stall.status } });
        if (stall.horseId) await tx.horse.update({ where: { id: stall.horseId }, data: { stallNumber: null } });
        return;
      }
      if (!await tx.horse.findUnique({ where: { id: horseId, deletedAt: null } })) throw new NotFoundException('Лошадь не найдена');
      if (stall.isUnavailable || ['MAINTENANCE', 'QUARANTINE'].includes(stall.status))
        throw new ConflictException('Денник недоступен для заселения');
      if (stall.horseId && stall.horseId !== horseId) throw new ConflictException('Сначала освободите занятый денник');
      await tx.stall.updateMany({ where: { horseId, id: { not: id } }, data: { horseId: null, status: 'AVAILABLE' } });
      await tx.stall.update({ where: { id }, data: { horseId, status: 'OCCUPIED' } });
      await tx.horse.update({ where: { id: horseId }, data: { stallNumber: stall.number ?? stall.name } });
    });
    return this.findOne(id);
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
          if (attempt < 3) continue;
          throw new ConflictException('Размещение изменилось другим пользователем. Обновите карту и повторите.');
        }
        return rethrowCatalogMutation(error, 'Денник');
      }
    }
  }

  async findOne(id: string): Promise<StallWithContracts> {
    const stall = await this.prisma.stall.findUnique({ where: { id }, include: stallInclude.include });
    if (!stall) throw new NotFoundException('Денник не найден');
    const neighbors = await this.prisma.stall.findMany({ include: stallInclude.include });
    return { ...stall, warnings: neighborhoodWarnings(stall, neighbors) };
  }

  async create(dto: CreateStallDto): Promise<StallWithContracts> {
    try {
      this.validateRoom(dto);
      if (dto.status === 'OCCUPIED') throw new BadRequestException('Используйте заселение лошади');
      if (!dto.buildingId) return await this.prisma.stall.create({ data: this.normalize(dto), include: stallInclude.include });
      return await this.serializable(async tx => {
        const block = { row: 1, col: 1, rowSpan: 1, colSpan: 1, ...dto };
        await this.validatePlacement(tx, block);
        return tx.stall.create({ data: this.normalize(dto), include: stallInclude.include });
      });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  async update(id: string, dto: UpdateStallDto, actor: Pick<AuthUser, 'id' | 'email'>): Promise<StallWithContracts> {
    try {
      await this.serializable(async tx => {
        const current = await tx.stall.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Денник не найден');
        const placement = { ...current, ...dto };
        if ((['buildingId', 'row', 'col', 'rowSpan', 'colSpan'] as const).some(key =>
          dto[key] !== undefined && dto[key] !== current[key]))
          await this.validatePlacement(tx, placement);
        this.validateRoom({ type: dto.type ?? current.type,
          name: dto.name === undefined ? current.name : dto.name,
          number: dto.number === undefined ? current.number : dto.number });
        if (dto.type === 'SERVICE' && current.horseId) throw new ConflictException('Сначала освободите денник');
        const status = dto.status ?? (dto.isUnavailable === undefined ? current.status : dto.isUnavailable ? 'MAINTENANCE' : current.horseId ? 'OCCUPIED' : 'AVAILABLE');
        if ((status === 'OCCUPIED') !== Boolean(current.horseId))
          throw new ConflictException('Сначала измените размещение лошади');
        const updated = await tx.stall.update({ where: { id }, data: { ...this.normalize(dto),
          ...((dto.type ?? current.type) === 'SERVICE' ? { number: '' } : {}), status } });
        if (current.horseId) await tx.horse.update({ where: { id: current.horseId }, data: { stallNumber: updated.number ?? updated.name } });
        await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'STALL_UPDATED', actorId: actor.id,
          actorName: actor.email, details: { stallId: id, before: this.auditRoom(current),
            after: this.auditRoom(updated) } } });
      });
      return this.findOne(id);
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  async remove(id: string, actor: Pick<AuthUser, 'id' | 'email'>): Promise<StallWithContracts> {
    try {
      return await this.serializable(async tx => {
        const current = await tx.stall.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Денник не найден');
        const activePlacement = await tx.boardingContract.count({ where: { stallId: id,
          status: { in: [BoardingContractStatus.ACTIVE, BoardingContractStatus.SUSPENDED] } } });
        if (current.horseId || current.status === 'OCCUPIED' || activePlacement)
          throw new BadRequestException('Нельзя удалить занятый денник. Сначала освободите его или переведите лошадь');
        // Retain contracts and their financial history, including databases with a legacy restrictive FK.
        await tx.boardingContract.updateMany({ where: { stallId: id }, data: { stallId: null } });
        const deleted = await tx.stall.delete({ where: { id }, include: stallInclude.include });
        await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'STALL_DELETED', actorId: actor.id,
          actorName: actor.email, details: { stallId: id, name: current.name, number: current.number } } });
        return deleted;
      });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  private async validatePlacement(tx: Prisma.TransactionClient, block: GridBlock) {
    if (!block.buildingId) return;
    const building = await tx.stableBuilding.findUnique({ where: { id: block.buildingId } });
    if (!building) throw new BadRequestException('Корпус не найден');
    const others = await tx.stall.findMany({ where: { buildingId: block.buildingId } });
    validateGridBlock(block, building, others);
  }

  async saveLayout(blocks: LayoutBlockDto[], actor: Pick<AuthUser, 'id' | 'email'>) {
    if (!blocks.length || blocks.length > 10000 || new Set(blocks.map(b => b.id)).size !== blocks.length)
      throw new BadRequestException('Укажите непустой список помещений без повторений');
    await this.serializable(async tx => {
      const all = await tx.stall.findMany();
      if (blocks.some(b => !all.some(s => s.id === b.id))) throw new NotFoundException('Помещение не найдено');
      const buildings = await tx.stableBuilding.findMany();
      const projected = all.map(s => ({ ...s, ...blocks.find(b => b.id === s.id) }));
      for (const block of blocks) {
        const building = buildings.find(b => b.id === block.buildingId);
        if (!building) throw new BadRequestException('Корпус не найден');
        validateGridBlock(block, building, projected);
      }
      for (const { id, ...data } of blocks) {
        const current = all.find(s => s.id === id)!;
        const before = this.auditRoom(current);
        const room = { ...current, ...data };
        // Coordinate-only saves also support legacy rooms without labels.
        if (data.name !== undefined || data.number !== undefined || data.type !== undefined) this.validateRoom(room);
        if (room.type === 'SERVICE' && current.horseId) throw new ConflictException('Сначала освободите денник');
        const updated = await tx.stall.update({ where: { id }, data: { ...this.normalize(data),
          ...(room.type === 'SERVICE' ? { number: '' } : {}) } });
        if (current.horseId) await tx.horse.update({ where: { id: current.horseId }, data: { stallNumber: updated.number ?? updated.name } });
        await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'STALL_UPDATED', actorId: actor.id,
          actorName: actor.email, details: { stallId: id, source: 'layout', before, after: this.auditRoom(updated) } } });
      }
    });
    return this.map();
  }

  private auditRoom(room: { name: string | null; number: string | null; type: string; buildingId: string | null; row: number; col: number; rowSpan: number; colSpan: number }) {
    const { name, number, type, buildingId, row, col, rowSpan, colSpan } = room;
    return { name, number, type, buildingId, row, col, rowSpan, colSpan };
  }

  private validateRoom(dto: { type?: string; name?: string | null; number?: string | null }) {
    if (dto.type === 'SERVICE') {
      if (!dto.name?.trim()) throw new BadRequestException('Укажите название технического помещения');
    } else if (!dto.number?.trim()) throw new BadRequestException('Укажите номер денника или бокса пони');
  }

  private normalize<T extends CreateStallDto | UpdateStallDto>(dto: T) {
    return {
      ...dto,
      ...(dto.status === undefined && dto.isUnavailable !== undefined ? { status: dto.isUnavailable ? 'MAINTENANCE' as const : 'AVAILABLE' as const } : {}),
      ...(dto.type === 'SERVICE' ? { number: '' } : dto.number !== undefined ? { number: dto.number.trim() } : {}),
      ...(dto.status !== undefined ? { isUnavailable: ['MAINTENANCE', 'QUARANTINE'].includes(dto.status) } : {}),
      ...(dto.name !== undefined ? { name: dto.name?.trim().replace(/\s+/g, ' ') || null } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || undefined } : {}),
    };
  }
}
