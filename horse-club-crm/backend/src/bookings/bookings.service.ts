import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingServiceType, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { parseRefineQuery } from '../common/refine';
import type { BookingAvailabilityDto, BookingRangeDto, HorseIssuesQueryDto, ListBookingsDto } from './dto/booking-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { BookingRulesService } from './booking-rules.service';
import { BookingValidationError } from './booking-validation.error';
import type { CreateBookingDto } from './dto/create-booking.dto';
import { queueTrainingConfirmation } from '../vk-bot/vk-training-notifications';
import type { AuthUser } from '../auth/auth.types';
import { assertHorseReplacement, defaultRolePermissions } from '../auth/role-access';

const trainingTypes: Record<BookingServiceType, string> = {
  dressage: 'Выездка', jumping: 'Конкур', walks: 'Прогулка', beginners: 'Начальная подготовка',
  photoshoot: 'Фотосессия', corde: 'Корда',
};

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService, private readonly rules: BookingRulesService) {}

  async horseIssues(query: HorseIssuesQueryDto) {
    const paging = parseRefineQuery(query, ['startTime', 'id'], 'startTime');
    const now = new Date();
    const where: Prisma.BookingWhereInput = {
      ...(query.horseId ? { horseId: query.horseId } : { horse: { OR: [{ status: { not: 'active' } }, { isUnavailable: true }] } }),
      OR: [
        { lessonId: null, status: 'scheduled', startTime: { gt: now } },
        { lesson: { status: 'SCHEDULED', startTime: { gt: now } } },
      ],
    };
    const [total, bookings] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({ where, skip: paging.skip, take: paging.take, orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        include: { horse: true, client: { select: { id: true, name: true, firstName: true, lastName: true } },
          lesson: { select: { startTime: true, endTime: true, trainerId: true } } } }),
    ]);
    return { total, data: bookings.map(b => ({ id: b.id, horseId: b.horseId, horseName: b.horse?.name, trainerId: b.lesson?.trainerId ?? b.trainerId,
      client: b.client, startTime: b.lesson?.startTime ?? b.startTime, endTime: b.lesson?.endTime ?? b.endTime })) };
  }

  private async authorizeReplacement(tx: Prisma.TransactionClient, actor: AuthUser, trainerId: string) {
    const permissions = actor?.role === 'TRAINER'
      ? await tx.roleAccess.findUnique({ where: { role: 'TRAINER' } }) ?? defaultRolePermissions('TRAINER')
      : defaultRolePermissions(actor?.role);
    // Read the current account binding inside the transaction, never from request body.
    const current = actor?.role === 'TRAINER' ? await tx.user.findUnique({ where: { id: actor.id }, select: { trainerId: true } }) : null;
    if (actor?.role === 'TRAINER' && !current) throw new ForbiddenException('Вы можете заменять лошадей только в своих занятиях');
    assertHorseReplacement(actor?.role === 'TRAINER' ? { ...actor, trainerId: current?.trainerId ?? null } : actor, trainerId, permissions);
  }

  private async replacementInput(tx: Prisma.TransactionClient, id: string, horseId: string, actor: AuthUser) {
    const booking = await tx.booking.findUnique({ where: { id }, include: { lesson: { include: { bookings: true } } } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    const lesson = booking.lesson;
    await this.authorizeReplacement(tx, actor, lesson?.trainerId ?? booking.trainerId);
    const start = lesson?.startTime ?? booking.startTime;
    const end = lesson?.endTime ?? booking.endTime;
    if ((lesson ? lesson.status !== 'SCHEDULED' : booking.status !== 'scheduled') || start <= new Date()) {
      throw new BookingValidationError('BOOKING_NOT_UPCOMING', 'Заменить лошадь можно только в предстоящем запланированном занятии');
    }
    if (lesson?.bookings.some(row => row.id !== id && row.horseId === horseId)) {
      throw new BookingValidationError('HORSE_REST_VIOLATION', 'Лошадь уже назначена другому участнику занятия');
    }
    // Validate the changed participant; other riders may also need a replacement.
    return { trainerId: lesson?.trainerId ?? booking.trainerId!, arenaId: lesson ? lesson.arenaId : booking.arenaId,
      participants: [{ clientId: booking.clientId, horseId }], start, end, excludeBookingId: id,
      excludeLessonId: lesson?.id, existingRiders: lesson ? lesson.bookings.length - 1 : 0, requireRiderWeight: true };
  }

  async availableHorses(id: string, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const booking = await tx.booking.findUnique({ where: { id } });
      if (!booking) throw new NotFoundException('Бронирование не найдено');
      await this.replacementInput(tx, id, booking.horseId ?? '', actor);
      const horses = await tx.horse.findMany({ where: { status: 'active', isUnavailable: false, id: { not: booking.horseId ?? undefined } }, orderBy: { name: 'asc' } });
      const available: typeof horses = [];
      // Check the record even when no active alternatives exist.
      for (const horse of horses) {
        try {
          await this.rules.validate(tx, { ...await this.replacementInput(tx, id, horse.id, actor), lockResources: false });
          available.push(horse);
        } catch (error) {
          if (!(error instanceof BookingValidationError)) throw error;
          if (error.getResponse() && ['RIDER_WEIGHT_REQUIRED', 'BOOKING_NOT_UPCOMING'].includes((error.getResponse() as { code: string }).code)) throw error;
        }
      }
      return available;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 10000 });
  }

  async replaceHorse(id: string, horseId: string, reason: string | undefined, actor: AuthUser) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const previous = await tx.booking.findUnique({ where: { id } });
          const oldHorseId = previous?.horseId ?? null;
          await this.rules.validate(tx, await this.replacementInput(tx, id, horseId, actor));
          const updated = await tx.booking.update({ where: { id }, data: { horseId, horseChangeReason: reason?.trim() || null } });
          await tx.bookingHorseChange.create({ data: { bookingId: id, actorUserId: actor.id,
            oldHorseId, newHorseId: horseId, reason: reason?.trim() || null } });
          return updated;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
      } catch (error: unknown) {
        if (!isSerializationFailure(error)) throw error;
        if (attempt === 4) throw new BookingValidationError('BOOKING_CONTENTION', 'Ресурсы изменились одновременно. Повторите замену');
      }
    }
    throw new BookingValidationError('BOOKING_CONTENTION', 'Повторите замену');
  }

  async horseHistory(id: string, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const booking = await tx.booking.findUnique({ where: { id }, include: { lesson: { select: { trainerId: true } } } });
      if (!booking) throw new NotFoundException('Бронирование не найдено');
      await this.authorizeReplacement(tx, actor, booking.lesson?.trainerId ?? booking.trainerId);
      return tx.bookingHorseChange.findMany({ where: { bookingId: id }, orderBy: [{ changedAt: 'desc' }, { id: 'asc' }], take: 100 });
    });
  }

  async createBooking(dto: CreateBookingDto) {
    return this.save(dto);
  }

  async updateBooking(id: string, dto: CreateBookingDto) {
    return this.save(dto, id);
  }

  private async save(dto: CreateBookingDto, id?: string) {
    const start = new Date(dto.startTime), end = new Date(dto.endTime);
    const zoned = /T.*(?:Z|[+-]\d{2}:\d{2})$/i;
    if (!zoned.test(dto.startTime) || !zoned.test(dto.endTime) || !Number.isFinite(+start) || !Number.isFinite(+end) || start >= end) {
      throw new BadRequestException('Укажите корректный интервал с часовым поясом');
    }
    if (!Object.values(BookingServiceType).includes(dto.serviceType) || !Number.isFinite(dto.costAmount) || dto.costAmount < 0 || dto.costAmount > 999999999999.99 || new Prisma.Decimal(dto.costAmount).decimalPlaces() > 2) {
      throw new BadRequestException('Некорректный тип услуги или стоимость');
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          if (id) {
            const current = await tx.booking.findUnique({ where: { id } });
            if (!current || current.lessonId !== null || current.status !== 'scheduled') throw new BookingValidationError('BOOKING_NOT_EDITABLE', 'Редактировать можно только запланированное бронирование тройного ресурса');
          }
          await this.rules.validate(tx, { trainerId: dto.trainerId, arenaId: dto.arenaId, participants: [{ clientId: dto.clientId, horseId: dto.horseId }], start, end, excludeBookingId: id });
          if (dto.membershipId) {
            await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Membership" WHERE "id" = ${dto.membershipId}::uuid FOR UPDATE`);
            const membership = await tx.membership.findUnique({ where: { id: dto.membershipId } });
            if (!membership || membership.deletedAt || membership.clientId !== dto.clientId) throw new BookingValidationError('MEMBERSHIP_INVALID', 'Абонемент не принадлежит клиенту');
          }
          const data = {
            clientId: dto.clientId, trainerId: dto.trainerId, horseId: dto.horseId, arenaId: dto.arenaId,
            membershipId: dto.membershipId ?? null, startTime: start, endTime: end,
            serviceType: dto.serviceType, costAmount: new Prisma.Decimal(dto.costAmount), status: 'scheduled' as const,
          };
          if (id) return tx.booking.update({ where: { id }, data });
          const created = await tx.booking.create({ data, include: { trainer: true, client: true, horse: true } });
          await queueTrainingConfirmation(tx, `booking:${created.id}:created`, {
            startTime: created.startTime, endTime: created.endTime, trainer: created.trainer,
            trainingType: trainingTypes[dto.serviceType], participants: [{ client: created.client, horse: created.horse }],
          });
          // Keep the API response unchanged; included profiles contain BigInt VK IDs.
          const { trainer: _trainer, client: _client, horse: _horse, ...booking } = created;
          return booking;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
      } catch (error: unknown) {
        if (!isSerializationFailure(error)) throw error;
        if (attempt === 4) throw new BookingValidationError('BOOKING_CONTENTION', 'Ресурсы изменились одновременно. Повторите бронирование');
      }
    }
    throw new BookingValidationError('BOOKING_CONTENTION', 'Повторите бронирование');
  }

  private interval(query: BookingRangeDto) {
    const start = new Date(query.from), end = new Date(query.to);
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(query.from) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(query.to)
      || !Number.isFinite(+start) || !Number.isFinite(+end) || start >= end || +end - +start > 62 * 86400000) {
      throw new BadRequestException('Укажите интервал с часовым поясом длительностью не более 62 дней');
    }
    return { start, end };
  }

  async findAll(query: ListBookingsDto) {
    const { start, end } = this.interval(query);
    const paging = parseRefineQuery(query, ['startTime', 'id'], 'startTime');
    const where: Prisma.BookingWhereInput = { lessonId: null, legacyLessonBinding: false, startTime: { lt: end }, endTime: { gt: start },
      ...(query.trainerId ? { trainerId: query.trainerId } : {}), ...(query.horseId ? { horseId: query.horseId } : {}), ...(query.arenaId ? { arenaId: query.arenaId } : {}) };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({ where, skip: paging.skip, take: paging.take, orderBy: [{ startTime: 'asc' }, { id: 'asc' }], include: {
        client: { select: { id: true, name: true, firstName: true, lastName: true, phone: true, weightKg: true } },
        horse: { select: { id: true, name: true, maxRiderWeight: true, maxDailyWorkloadMinutes: true, requiredRestMinutes: true, status: true, isUnavailable: true } },
        trainer: { select: { id: true, name: true, fullName: true, specializations: true, isActive: true } },
        arena: { select: { id: true, name: true, maxRidersCapacity: true, isActive: true, isUnavailable: true } },
      } }),
    ]);
    return { total, data };
  }

  async availability(query: BookingAvailabilityDto) {
    const { start, end } = this.interval(query);
    const zone = process.env.CLUB_TIME_ZONE || 'Europe/Moscow';
    const day = DateTime.fromJSDate(start, { zone }).startOf('day');
    const dayStart = day.toJSDate(), dayEnd = day.plus({ days: 1 }).toJSDate();
    const windowStart = new Date(Math.min(+start, +dayStart)), windowEnd = new Date(Math.max(+end, +dayEnd));
    return this.prisma.$transaction(async tx => {
      const horses = await tx.horse.findMany();
      const arenas = await tx.arena.findMany();
      const direct = await tx.booking.findMany({ where: { lessonId: null, status: { in: ['scheduled', 'completed'] }, startTime: { lt: windowEnd }, endTime: { gt: windowStart },
        ...(query.excludeBookingId ? { id: { not: query.excludeBookingId } } : {}) } });
      const lessons = await tx.lesson.findMany({ where: { status: { in: ['SCHEDULED', 'COMPLETED'] }, startTime: { lt: windowEnd }, endTime: { gt: windowStart },
        ...(query.excludeLessonId ? { id: { not: query.excludeLessonId } } : {}) }, include: { bookings: { select: { horseId: true } } } });
      const rows = [
        ...direct.map(b => ({ horseIds: b.horseId ? [b.horseId] : [], arenaId: b.arenaId, riders: 1, start: b.startTime, end: b.endTime })),
        ...lessons.map(l => ({ horseIds: [...new Set(l.bookings.flatMap(b => b.horseId ? [b.horseId] : []))], arenaId: l.arenaId, riders: l.bookings.length, start: l.startTime, end: l.endTime })),
      ];
      return { date: day.toISODate(), horseWorkloads: horses.map(h => {
        const used = rows.filter(r => r.horseIds.includes(h.id)).reduce((sum, r) => sum + Math.max(0, Math.min(+r.end, +dayEnd) - Math.max(+r.start, +dayStart)), 0) / 60000;
        return { horseId: h.id, horseName: h.name, currentWorkloadMinutes: used, maxDailyWorkloadMinutes: h.maxDailyWorkloadMinutes,
          status: h.status !== 'active' || h.isUnavailable ? 'UNAVAILABLE' : used > h.maxDailyWorkloadMinutes ? 'OVERLOADED' : used === h.maxDailyWorkloadMinutes ? 'AT_LIMIT' : 'AVAILABLE' };
      }), arenaOccupancy: arenas.map(a => {
        const events = rows.filter(r => r.arenaId === a.id && r.start < end && r.end > start).flatMap(r => [
          { at: Math.max(+r.start, +start), delta: r.riders }, { at: Math.min(+r.end, +end), delta: -r.riders },
        ]).sort((a, b) => a.at - b.at || a.delta - b.delta);
        let occupied = 0, peak = 0;
        for (const event of events) { occupied += event.delta; peak = Math.max(peak, occupied); }
        return { arenaId: a.id, occupied: peak, maxRidersCapacity: a.maxRidersCapacity };
      }) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
