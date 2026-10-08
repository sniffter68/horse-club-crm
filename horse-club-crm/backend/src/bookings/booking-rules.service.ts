import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { BookingValidationError } from './booking-validation.error';

export interface BookingRuleInput {
  trainerId: string;
  arenaId?: string | null;
  participants: readonly { clientId: string; horseId?: string | null }[];
  start: Date;
  end: Date;
  excludeLessonId?: string;
  excludeBookingId?: string;
  /** Existing participants when adding riders to one legacy group lesson. */
  existingRiders?: number;
}
interface Reservation {
  trainerId: string;
  arenaId: string | null;
  horseIds: string[];
  riders: number;
  start: Date;
  end: Date;
}
const MINUTE = 60_000;
const overlaps = (a: Date, b: Date, c: Date, d: Date) => a < d && b > c;
const intersection = (a: Date, b: Date, c: Date, d: Date) => Math.max(0, Math.min(+b, +d) - Math.max(+a, +c));

@Injectable()
export class BookingRulesService {
  async validate(tx: Prisma.TransactionClient, input: BookingRuleInput): Promise<void> {
    const { start, end, trainerId, arenaId } = input;
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || start >= end) {
      throw new BadRequestException('Время окончания должно быть позже времени начала');
    }
    const zone = process.env.CLUB_TIME_ZONE || 'Europe/Moscow';
    const firstDay = DateTime.fromJSDate(start, { zone }).startOf('day');
    const lastDay = DateTime.fromJSDate(new Date(+end - 1), { zone }).startOf('day');
    if (!firstDay.isValid || !lastDay.isValid) throw new BadRequestException('Некорректный часовой пояс клуба или дата');
    const horseIds = [...new Set(input.participants.flatMap(p => p.horseId ? [p.horseId] : []))].sort();
    const clientIds = [...new Set(input.participants.map(p => p.clientId))].sort();

    // All writers lock in the same table/UUID order. Values are parameterized.
    if (arenaId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Arena" WHERE "id" = ${arenaId}::uuid FOR UPDATE`);
    for (const id of horseIds) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Horse" WHERE "id" = ${id}::uuid FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Trainer" WHERE "id" = ${trainerId}::uuid FOR UPDATE`);
    for (const id of clientIds) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Client" WHERE "id" = ${id}::uuid FOR UPDATE`);

    const trainer = await tx.trainer.findUnique({ where: { id: trainerId } });
    if (!trainer) throw new BookingValidationError('RESOURCE_NOT_FOUND', 'Тренер не найден');
    if (!trainer.isActive) throw new BookingValidationError('TRAINER_UNAVAILABLE', 'Тренер недоступен для тренировок');
    const arena = arenaId ? await tx.arena.findUnique({ where: { id: arenaId } }) : null;
    if (arenaId && !arena) throw new BookingValidationError('RESOURCE_NOT_FOUND', 'Манеж не найден');
    if (arena && (!arena.isActive || arena.isUnavailable)) throw new BookingValidationError('ARENA_UNAVAILABLE', 'Манеж недоступен для тренировок');
    const horses = await tx.horse.findMany({ where: { id: { in: horseIds } } });
    const clients = await tx.client.findMany({ where: { id: { in: clientIds } } });
    for (const participant of input.participants) {
      const client = clients.find(c => c.id === participant.clientId);
      if (!client) throw new BookingValidationError('RESOURCE_NOT_FOUND', 'Клиент не найден');
      if (!participant.horseId) continue;
      const horse = horses.find(h => h.id === participant.horseId);
      if (!horse) throw new BookingValidationError('RESOURCE_NOT_FOUND', 'Лошадь не найдена');
      if (horse.status !== 'active' || horse.isUnavailable) throw new BookingValidationError('HORSE_UNAVAILABLE', 'Лошадь недоступна для тренировок', { horseId: horse.id });
      if (client.weightKg !== null && Number(client.weightKg) > horse.maxRiderWeight) {
        throw new BookingValidationError('RIDER_WEIGHT_EXCEEDED', 'Вес всадника превышает допустимый лимит для данной лошади', { horseId: horse.id, clientId: client.id, maxRiderWeight: horse.maxRiderWeight });
      }
    }
    const restMs = Math.max(0, ...horses.map(h => h.requiredRestMinutes)) * MINUTE;
    const windowStart = new Date(Math.min(+firstDay.toJSDate(), +start - restMs));
    const windowEnd = new Date(Math.max(+lastDay.plus({ days: 1 }).toJSDate(), +end + restMs));
    const reservations = await this.reservations(tx, input, horseIds, windowStart, windowEnd);
    for (const horse of horses) {
      const work = reservations.filter(r => r.horseIds.includes(horse.id));
      for (let day = firstDay; day <= lastDay; day = day.plus({ days: 1 })) {
        const dayStart = day.toJSDate(), dayEnd = day.plus({ days: 1 }).toJSDate();
        const minutes = (work.reduce((sum, r) => sum + intersection(r.start, r.end, dayStart, dayEnd), 0) + intersection(start, end, dayStart, dayEnd)) / MINUTE;
        if (minutes > horse.maxDailyWorkloadMinutes) throw new BookingValidationError('HORSE_OVERLOADED', 'Превышен суточный лимит нагрузки лошади', { horseId: horse.id, date: day.toISODate(), workloadMinutes: minutes, limitMinutes: horse.maxDailyWorkloadMinutes });
      }
      const rest = horse.requiredRestMinutes * MINUTE;
      if (work.some(r => overlaps(r.start, r.end, new Date(+start - rest), new Date(+end + rest)))) {
        throw new BookingValidationError('HORSE_REST_VIOLATION', `Лошади требуется отдых не менее ${horse.requiredRestMinutes} минут между тренировками`, { horseId: horse.id, requiredRestMinutes: horse.requiredRestMinutes });
      }
    }
    if (reservations.some(r => r.trainerId === trainerId && overlaps(r.start, r.end, start, end))) {
      throw new BookingValidationError('TRAINER_BUSY', 'Тренер уже занят в этот интервал времени');
    }
    if (arena) {
      const events: { at: number; delta: number }[] = [];
      for (const r of reservations.filter(r => r.arenaId === arena.id && overlaps(r.start, r.end, start, end))) {
        events.push({ at: Math.max(+start, +r.start), delta: r.riders }, { at: Math.min(+end, +r.end), delta: -r.riders });
      }
      // End events precede start events: adjacent lessons never overlap.
      events.sort((a, b) => a.at - b.at || a.delta - b.delta);
      let count = input.participants.length + (input.existingRiders ?? 0);
      if (count > arena.maxRidersCapacity) throw new BookingValidationError('ARENA_FULL', 'Манеж переполнен, лимит всадников исчерпан');
      for (const event of events) {
        count += event.delta;
        if (count > arena.maxRidersCapacity) throw new BookingValidationError('ARENA_FULL', 'Манеж переполнен, лимит всадников исчерпан', { arenaId: arena.id, maxRidersCapacity: arena.maxRidersCapacity });
      }
    }
  }

  private async reservations(tx: Prisma.TransactionClient, input: BookingRuleInput, horseIds: string[], start: Date, end: Date): Promise<Reservation[]> {
    const direct = await tx.booking.findMany({ where: {
      lessonId: null, status: { in: ['scheduled', 'completed'] }, startTime: { lt: end }, endTime: { gt: start },
      ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
      OR: [{ trainerId: input.trainerId }, ...(input.arenaId ? [{ arenaId: input.arenaId }] : []), { horseId: { in: horseIds } }],
    } });
    const lessons = await tx.lesson.findMany({ where: {
      status: { in: ['SCHEDULED', 'COMPLETED'] }, startTime: { lt: end }, endTime: { gt: start },
      ...(input.excludeLessonId ? { id: { not: input.excludeLessonId } } : {}),
      OR: [{ trainerId: input.trainerId }, ...(input.arenaId ? [{ arenaId: input.arenaId }] : []), { bookings: { some: { horseId: { in: horseIds } } } }],
    }, include: { bookings: { select: { horseId: true } } } });
    return [
      ...direct.map(b => ({ trainerId: b.trainerId, arenaId: b.arenaId, horseIds: b.horseId ? [b.horseId] : [], riders: 1, start: b.startTime, end: b.endTime })),
      ...lessons.map(l => ({ trainerId: l.trainerId, arenaId: l.arenaId, horseIds: [...new Set(l.bookings.flatMap(b => b.horseId ? [b.horseId] : []))], riders: l.bookings.length, start: l.startTime, end: l.endTime })),
    ];
  }
}
