import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateHorseHealthLogDto } from './dto/create-horse-health-log.dto';
import type { UpdateHorseHealthLogDto } from './dto/update-horse-health-log.dto';

const withHorse = Prisma.validator<Prisma.HorseHealthLogDefaultArgs>()({
  include: { horse: { select: { id: true, name: true } } },
});
export type HorseHealthLogWithHorse = Prisma.HorseHealthLogGetPayload<typeof withHorse>;

@Injectable()
export class HorseHealthLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<HorseHealthLogWithHorse>> {
    const options = parseRefineQuery(
      query,
      ['id', 'type', 'occurredAt', 'nextDueAt', 'createdAt', 'updatedAt'],
      'occurredAt',
    );
    const where: Prisma.HorseHealthLogWhereInput = options.search
      ? {
          OR: [
            { notes: { contains: options.search, mode: 'insensitive' } },
            { horse: { name: { contains: options.search, mode: 'insensitive' } } },
          ],
        }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.HorseHealthLogOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.horseHealthLog.count({ where }),
      this.prisma.horseHealthLog.findMany({
        where,
        include: withHorse.include,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    return { total, data };
  }

  async findOne(id: string): Promise<HorseHealthLogWithHorse> {
    const healthLog = await this.prisma.horseHealthLog.findUnique({ where: { id }, include: withHorse.include });
    if (!healthLog) throw new NotFoundException('Запись журнала здоровья не найдена');
    return healthLog;
  }

  async create(dto: CreateHorseHealthLogDto): Promise<HorseHealthLogWithHorse> {
    try {
      return await this.prisma.horseHealthLog.create({ data: this.createData(dto), include: withHorse.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Запись журнала здоровья');
    }
  }

  async update(id: string, dto: UpdateHorseHealthLogDto): Promise<HorseHealthLogWithHorse> {
    try {
      return await this.prisma.horseHealthLog.update({
        where: { id },
        data: this.updateData(dto),
        include: withHorse.include,
      });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Запись журнала здоровья');
    }
  }

  async remove(id: string): Promise<HorseHealthLogWithHorse> {
    try {
      return await this.prisma.horseHealthLog.delete({ where: { id }, include: withHorse.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Запись журнала здоровья');
    }
  }

  private createData(dto: CreateHorseHealthLogDto): Prisma.HorseHealthLogUncheckedCreateInput {
    return {
      ...dto,
      nextDueAt: dto.nextDueAt || null,
      notes: dto.notes?.trim() || null,
    };
  }

  private updateData(dto: UpdateHorseHealthLogDto): Prisma.HorseHealthLogUncheckedUpdateInput {
    return {
      ...dto,
      ...(dto.nextDueAt !== undefined ? { nextDueAt: dto.nextDueAt || null } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
    };
  }
}
