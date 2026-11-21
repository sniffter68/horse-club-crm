import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Horse } from '@prisma/client';
import type { HorsesQueryDto } from './dto/horses-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery } from '../common/refine';
import type { PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateHorseDto } from './dto/create-horse.dto';
import type { UpdateHorseDto } from './dto/update-horse.dto';

const horseDetailsInclude = Prisma.validator<Prisma.HorseDefaultArgs>()({
  include: {
    owner: { select: { id: true, name: true, firstName: true, lastName: true } },
    stall: { include: { building: { select: { id: true, name: true } } } },
    healthLogs: { orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }], take: 20 },
    boardingContracts: {
      include: {
        client: { select: { id: true, name: true, firstName: true, lastName: true } },
        stall: { select: { id: true, name: true, number: true } },
        payments: {
          select: { id: true, amount: true, status: true, paidAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 20,
    },
    bookings: {
      where: { lessonId: { not: null } },
      include: {
        client: { select: { id: true, name: true, firstName: true, lastName: true } },
        membership: { select: { id: true } },
        payments: {
          select: { id: true, amount: true, status: true, paidAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        lesson: {
          include: {
            service: { select: { id: true, title: true, name: true } },
            trainer: { select: { id: true, name: true } },
            arena: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ lesson: { startTime: 'desc' } }, { id: 'asc' }],
      take: 20,
    },
  },
});
type HorseDetails = Prisma.HorseGetPayload<typeof horseDetailsInclude>;
export type HorseDetailsResponse = HorseDetails & { currentBoardingContract: HorseDetails['boardingContracts'][number] | null };

@Injectable()
export class HorsesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: HorsesQueryDto): Promise<PaginatedResult<Horse>> {
    const options = parseRefineQuery(
      query,
      ['id', 'name', 'maxDailyMinutes', 'minRestMinutes', 'breed', 'riderLevel', 'isUnavailable'],
      'name',
    );
    const where: Prisma.HorseWhereInput = options.search
      ? { OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { breed: { contains: options.search, mode: 'insensitive' } },
          { owner: { is: { OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { firstName: { contains: options.search, mode: 'insensitive' } },
            { lastName: { contains: options.search, mode: 'insensitive' } },
          ] } } },
        ] }
      : {};
    if (query.includeArchived !== 'true') where.deletedAt = null;
    const orderBy = { [options.sort]: options.order } as Prisma.HorseOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.horse.count({ where }),
      this.prisma.horse.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
        include: { owner: { select: { name: true } } },
      }),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<HorseDetailsResponse> {
    const horse = await this.prisma.horse.findUnique({ where: { id }, include: horseDetailsInclude.include });
    if (!horse) throw new NotFoundException('Лошадь не найдена');
    const now = new Date();
    const currentBoardingContract = await this.prisma.boardingContract.findFirst({
      where: { horseId: id, status: { in: ['ACTIVE', 'SUSPENDED'] }, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      include: horseDetailsInclude.include.boardingContracts.include,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
    });
    return { ...horse, currentBoardingContract, boardingContracts: currentBoardingContract && !horse.boardingContracts.some(contract => contract.id === currentBoardingContract.id)
      ? [currentBoardingContract, ...horse.boardingContracts] : horse.boardingContracts };
  }

  create(dto: CreateHorseDto): Promise<Horse> {
    return this.prisma.horse.create({ data: this.normalize(dto) });
  }

  async update(id: string, dto: UpdateHorseDto): Promise<Horse> {
    try {
      return await this.prisma.horse.update({ where: { id, deletedAt: null }, data: this.normalize(dto) });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Лошадь');
    }
  }

  private normalize<T extends CreateHorseDto | UpdateHorseDto>(dto: T): T {
    if ((dto.maxDailyMinutes !== undefined && dto.maxDailyWorkloadMinutes !== undefined && dto.maxDailyMinutes !== dto.maxDailyWorkloadMinutes)
      || (dto.minRestMinutes !== undefined && dto.requiredRestMinutes !== undefined && dto.minRestMinutes !== dto.requiredRestMinutes)
      || (dto.status !== undefined && dto.isUnavailable !== undefined && (dto.status !== 'active') !== dto.isUnavailable)) {
      throw new BadRequestException('Параметры доступности или нагрузки противоречат друг другу');
    }
    const daily = dto.maxDailyWorkloadMinutes ?? dto.maxDailyMinutes;
    const rest = dto.requiredRestMinutes ?? dto.minRestMinutes;
    const status = dto.status ?? (dto.isUnavailable === undefined ? undefined : dto.isUnavailable ? 'rest' as const : 'active' as const);
    return { ...dto,
      ...(daily !== undefined ? { maxDailyMinutes: daily, maxDailyWorkloadMinutes: daily } : {}),
      ...(rest !== undefined ? { minRestMinutes: rest, requiredRestMinutes: rest } : {}),
      ...(status !== undefined ? { status, isUnavailable: status !== 'active', healthStatus: status === 'sick' ? 'TREATMENT' : status === 'quarantine' ? 'QUARANTINE' : 'HEALTHY', quarantineUntil: null } : {}),
      ...(dto.feedingNotes !== undefined ? { feedingNotes: dto.feedingNotes?.trim() || null } : {}),
    };
  }

  async remove(id: string): Promise<Horse> {
    try {
      return await this.prisma.$transaction(async tx => {
        // Share the row lock used by booking writers before checking reservations.
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Horse" WHERE "id" = ${id}::uuid FOR UPDATE`);
        const horse = await tx.horse.findUnique({ where: { id }, include: {
          _count: { select: { bookings: true, boardingContracts: true, vetRecords: true,
            vetEvents: true, healthLogs: true, dailyLogs: true } },
        } });
        if (!horse || horse.deletedAt !== null) throw new NotFoundException('Лошадь не найдена');
        const now = new Date();
        const scheduled = await tx.booking.findFirst({ where: { horseId: id, OR: [
          { lessonId: null, status: 'scheduled', endTime: { gt: now } },
          { status: { in: ['scheduled', 'completed', 'no_show'] }, lesson: { is: { deletedAt: null, status: 'SCHEDULED', endTime: { gt: now } } } },
        ] }, select: { id: true } });
        if (scheduled) throw new ConflictException('У лошади есть запланированные занятия. Сначала снимите её с расписания или замените лошадь.');
        const boarding = await tx.boardingContract.findFirst({ where: { horseId: id, status: 'ACTIVE' }, select: { id: true } });
        if (boarding) throw new ConflictException('У лошади есть активный договор постоя. Сначала завершите договор постоя.');
        await tx.client.updateMany({ where: { preferredHorseId: id }, data: { preferredHorseId: null } });
        // Occupancy CHECK requires releasing the horse and status together.
        await tx.stall.updateMany({ where: { horseId: id, status: 'OCCUPIED' }, data: { horseId: null, status: 'AVAILABLE' } });
        await tx.stall.updateMany({ where: { horseId: id }, data: { horseId: null } });
        if (Object.values(horse._count).some(count => count > 0)) {
          return tx.horse.update({ where: { id }, data: { deletedAt: now, isUnavailable: true, isPublic: false, stallNumber: null } });
        }
        return tx.horse.delete({ where: { id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Связи лошади изменились. Обновите карточку и повторите удаление.');
      }
      return rethrowCatalogMutation(error, 'Лошадь');
    }
  }
}
