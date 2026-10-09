import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingServiceType, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { parseRefineQuery } from '../common/refine';
import type { BookingAvailabilityDto, BookingRangeDto, ListBookingsDto } from './dto/booking-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { BookingRulesService } from './booking-rules.service';
import { BookingValidationError } from './booking-validation.error';
import type { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService, private readonly rules: BookingRulesService) {}

  async replaceHorse(id: string, horseId: string, reason?: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const booking = await tx.booking.findUnique({ where: { id }, include: { lesson: { include: { bookings: true } } } });
          if (!booking) throw new NotFoundException('Бронирование не найдено');
          const lesson = booking.lesson;
          const start = lesson?.startTime ?? booking.startTime;
          const end = lesson?.endTime ?? booking.endTime;
          if ((lesson ? lesson.status !== 'SCHEDULED' : booking.status !== 'scheduled') || start <= new Date()) {
            throw new BookingValidationError('BOOKING_NOT_UPCOMING', 'Заменить лошадь можно только в предстоящем запланированном занятии');
          }
          const participants = lesson
            ? lesson.bookings.map(row => ({ clientId: row.clientId, horseId: row.id === id ? horseId : row.horseId }))
            : [{ clientId: booking.clientId, horseId }];
          const horseIds = participants.flatMap(row => row.horseId ? [row.horseId] : []);
          if (new Set(horseIds).size !== horseIds.length) throw new BookingValidationError('HORSE_REST_VIOLATION', 'Лошадь уже назначена другому участнику занятия');
          await this.rules.validate(tx, {
            trainerId: lesson?.trainerId ?? booking.trainerId!, arenaId: lesson ? lesson.arenaId : booking.arenaId,
            participants, start, end, excludeBookingId: id, excludeLessonId: lesson?.id, requireRiderWeight: true,
          });
          return tx.booking.update({ where: { id }, data: { horseId, horseChangeReason: reason?.trim() || null } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
      } catch (error: unknown) {
        if (!isSerializationFailure(error)) throw error;
        if (attempt === 4) throw new BookingValidationError('BOOKING_CONTENTION', 'Ресурсы изменились одновременно. Повторите замену');
      }
    }
    throw new BookingValidationError('BOOKING_CONTENTION', 'Повторите замену');
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
            if (!membership || membership.clientId !== dto.clientId) throw new BookingValidationError('MEMBERSHIP_INVALID', 'Абонемент не принадлежит клиенту');
          }
          const data = {
            clientId: dto.clientId, trainerId: dto.trainerId, horseId: dto.horseId, arenaId: dto.arenaId,
            membershipId: dto.membershipId ?? null, startTime: start, endTime: end,
            serviceType: dto.serviceType, costAmount: new Prisma.Decimal(dto.costAmount), status: 'scheduled' as const,
          };
          return id ? tx.booking.update({ where: { id }, data }) : tx.booking.create({ data });
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
    const where: Prisma.BookingWhereInput = { lessonId: null, startTime: { lt: end }, endTime: { gt: start },
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
