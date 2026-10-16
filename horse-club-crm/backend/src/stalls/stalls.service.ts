import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardingContractStatus, Prisma } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStallDto } from './dto/create-stall.dto';
import type { UpdateStallDto } from './dto/update-stall.dto';
import { neighborhoodWarnings } from './neighborhood';

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

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<StallWithContracts>> {
    const options = parseRefineQuery(
      query,
      ['id', 'name', 'isUnavailable', 'createdAt', 'updatedAt'],
      'name',
    );
    const where: Prisma.StallWhereInput = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { description: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};
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
    const stalls = await this.prisma.stall.findMany({ include: { horse: stallInclude.include.horse },
      orderBy: [{ zone: 'asc' }, { position: 'asc' }, { side: 'asc' }] });
    return stalls.map(stall => ({ ...stall, warnings: neighborhoodWarnings(stall, stalls) }));
  }

  assignmentHorses() {
    return this.prisma.horse.findMany({ select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  async assign(id: string, horseId: string | null) {
    await this.serializable(async tx => {
      const stall = await tx.stall.findUnique({ where: { id } });
      if (!stall) throw new NotFoundException('Денник не найден');
      if (horseId === null) {
        await tx.stall.update({ where: { id }, data: { horseId: null,
          status: stall.status === 'OCCUPIED' ? 'AVAILABLE' : stall.status } });
        if (stall.horseId) await tx.horse.update({ where: { id: stall.horseId }, data: { stallNumber: null } });
        return;
      }
      if (!await tx.horse.findUnique({ where: { id: horseId } })) throw new NotFoundException('Лошадь не найдена');
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
      if (!dto.name?.trim() && !dto.number?.trim()) throw new BadRequestException('Укажите номер или название денника');
      if (dto.status === 'OCCUPIED') throw new BadRequestException('Используйте заселение лошади');
      return await this.prisma.stall.create({ data: { ...this.normalize(dto), name: dto.name?.trim().replace(/\s+/g, ' ') || `Денник ${dto.number?.trim()}` }, include: stallInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  async update(id: string, dto: UpdateStallDto): Promise<StallWithContracts> {
    try {
      await this.serializable(async tx => {
        const current = await tx.stall.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Денник не найден');
        const status = dto.status ?? (dto.isUnavailable === undefined ? current.status : dto.isUnavailable ? 'MAINTENANCE' : current.horseId ? 'OCCUPIED' : 'AVAILABLE');
        if ((status === 'OCCUPIED') !== Boolean(current.horseId))
          throw new ConflictException('Сначала измените размещение лошади');
        await tx.stall.update({ where: { id }, data: { ...this.normalize(dto), status } });
      });
      return this.findOne(id);
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  async remove(id: string): Promise<StallWithContracts> {
    try {
      return await this.prisma.stall.delete({ where: { id }, include: stallInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  private normalize<T extends CreateStallDto | UpdateStallDto>(dto: T): T {
    return {
      ...dto,
      ...(dto.status === undefined && dto.isUnavailable !== undefined ? { status: dto.isUnavailable ? 'MAINTENANCE' as const : 'AVAILABLE' as const } : {}),
      ...(dto.number !== undefined ? { number: dto.number.trim() } : {}),
      ...(dto.status !== undefined ? { isUnavailable: ['MAINTENANCE', 'QUARANTINE'].includes(dto.status) } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim().replace(/\s+/g, ' ') } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || undefined } : {}),
    };
  }
}
