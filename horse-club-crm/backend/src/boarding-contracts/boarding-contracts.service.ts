import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardingContractStatus, Prisma } from '@prisma/client';
import { isSerializationFailure } from '../common/serialization-failure';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBoardingContractDto } from './dto/create-boarding-contract.dto';
import type { UpdateBoardingContractDto } from './dto/update-boarding-contract.dto';

const contractInclude = Prisma.validator<Prisma.BoardingContractDefaultArgs>()({
  include: {
    client: { select: { id: true, name: true, firstName: true, lastName: true } },
    horse: { select: { id: true, name: true } },
    stall: { select: { id: true, name: true, isUnavailable: true } },
  },
});
export type BoardingContractWithRelations = Prisma.BoardingContractGetPayload<typeof contractInclude>;

type ContractData = {
  clientId: string;
  horseId: string;
  stallId: string | null;
  status: BoardingContractStatus;
  startsAt: Date;
  endsAt: Date | null;
  monthlyRate: number | Prisma.Decimal;
  notes: string | null;
};

const RESERVING_STATUSES: BoardingContractStatus[] = [BoardingContractStatus.ACTIVE, BoardingContractStatus.SUSPENDED];
const MAX_DATE = new Date('9999-12-31T23:59:59.999Z');
const SERIALIZATION_RETRIES = 3;

@Injectable()
export class BoardingContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<BoardingContractWithRelations>> {
    const options = parseRefineQuery(
      query,
      ['id', 'status', 'startsAt', 'endsAt', 'monthlyRate', 'createdAt', 'updatedAt'],
      'startsAt',
    );
    const where: Prisma.BoardingContractWhereInput = options.search
      ? {
          OR: [
            { client: { is: { OR: [
              { name: { contains: options.search, mode: 'insensitive' } },
              { firstName: { contains: options.search, mode: 'insensitive' } },
              { lastName: { contains: options.search, mode: 'insensitive' } },
            ] } } },
            { horse: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
            { stall: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
            { notes: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.BoardingContractOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.boardingContract.count({ where }),
      this.prisma.boardingContract.findMany({
        where,
        include: contractInclude.include,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    return { total, data };
  }

  async findOne(id: string): Promise<BoardingContractWithRelations> {
    const contract = await this.prisma.boardingContract.findUnique({ where: { id }, include: contractInclude.include });
    if (!contract) throw new NotFoundException('Договор постоя не найден');
    return contract;
  }

  async create(dto: CreateBoardingContractDto): Promise<BoardingContractWithRelations> {
    try {
      return await this.runSerializable(async tx => {
        const data = this.createData(dto);
        await this.validate(tx, data);
        return tx.boardingContract.create({ data, include: contractInclude.include });
      });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Договор постоя');
    }
  }

  async update(id: string, dto: UpdateBoardingContractDto): Promise<BoardingContractWithRelations> {
    try {
      return await this.runSerializable(async tx => {
        const current = await tx.boardingContract.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Договор постоя не найден');
        const data: ContractData = {
          clientId: dto.clientId ?? current.clientId,
          horseId: dto.horseId ?? current.horseId,
          stallId: dto.stallId === undefined ? current.stallId : dto.stallId,
          status: dto.status ?? current.status,
          startsAt: dto.startsAt ? this.date(dto.startsAt, 'Некорректная дата начала') : current.startsAt,
          endsAt: dto.endsAt === undefined ? current.endsAt : dto.endsAt ? this.date(dto.endsAt, 'Некорректная дата окончания') : null,
          monthlyRate: dto.monthlyRate ?? current.monthlyRate,
          notes: dto.notes === undefined ? current.notes : dto.notes?.trim() || null,
        };
        await this.validate(tx, data, id);
        return tx.boardingContract.update({ where: { id }, data, include: contractInclude.include });
      });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Договор постоя');
    }
  }

  async remove(id: string): Promise<BoardingContractWithRelations> {
    try {
      return await this.prisma.boardingContract.delete({ where: { id }, include: contractInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Договор постоя');
    }
  }

  private createData(dto: CreateBoardingContractDto): ContractData {
    return {
      clientId: dto.clientId,
      horseId: dto.horseId,
      stallId: dto.stallId ?? null,
      status: dto.status ?? BoardingContractStatus.DRAFT,
      startsAt: this.date(dto.startsAt, 'Некорректная дата начала'),
      endsAt: dto.endsAt ? this.date(dto.endsAt, 'Некорректная дата окончания') : null,
      monthlyRate: dto.monthlyRate,
      notes: dto.notes?.trim() || null,
    };
  }

  private async validate(tx: Prisma.TransactionClient, data: ContractData, excludeId?: string): Promise<void> {
    if (data.endsAt && data.endsAt <= data.startsAt) {
      throw new BadRequestException('Дата окончания должна быть позже даты начала');
    }
    const [client, horse, stall] = await Promise.all([
      tx.client.findUnique({ where: { id: data.clientId }, select: { id: true } }),
      tx.horse.findUnique({ where: { id: data.horseId }, select: { id: true } }),
      data.stallId
        ? tx.stall.findUnique({ where: { id: data.stallId }, select: { id: true, isUnavailable: true } })
        : Promise.resolve(null),
    ]);
    if (!client) throw new NotFoundException('Клиент не найден');
    if (!horse) throw new NotFoundException('Лошадь не найдена');
    if (data.stallId && !stall) throw new NotFoundException('Денник не найден');
    if (stall?.isUnavailable) throw new ConflictException('Выбранный денник недоступен');
    if (!RESERVING_STATUSES.includes(data.status)) return;

    const interval = {
      status: { in: RESERVING_STATUSES },
      startsAt: { lt: data.endsAt ?? MAX_DATE },
      OR: [{ endsAt: null }, { endsAt: { gt: data.startsAt } }],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    } satisfies Prisma.BoardingContractWhereInput;
    const horseConflict = await tx.boardingContract.findFirst({ where: { ...interval, horseId: data.horseId }, select: { id: true } });
    if (horseConflict) throw new ConflictException('У лошади уже есть пересекающийся договор постоя');
    if (data.stallId) {
      const stallConflict = await tx.boardingContract.findFirst({ where: { ...interval, stallId: data.stallId }, select: { id: true } });
      if (stallConflict) throw new ConflictException('Денник уже занят на выбранный период');
    }
  }

  private date(value: string, message: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(message);
    return date;
  }

  private async runSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (attempt < SERIALIZATION_RETRIES && isSerializationFailure(error)) continue;
        throw error;
      }
    }
  }
}
