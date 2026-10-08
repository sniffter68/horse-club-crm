import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BookingStatus, type Membership, type MembershipType } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { BookingValidationError } from './booking-validation.error';
import type { CancelBookingDto } from './dto/cancel-booking.dto';

export const cancellationStatus = (start: Date, now: Date): BookingStatus =>
  +start - +now >= 12 * 60 * 60 * 1000 ? 'cancelled_client' : 'penalty_cancellation';
export const bookingCharge = (type: MembershipType, cost: Prisma.Decimal) => type === 'fixed_lessons' ? new Prisma.Decimal(1) : cost;
type Action = 'complete' | 'no-show' | 'cancel';

@Injectable()
export class BookingLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async transition(id: string, action: Action, cancellation?: CancelBookingDto) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const initial = await tx.booking.findUnique({ where: { id } });
          if (!initial) throw new NotFoundException('Бронирование не найдено');
          if (initial.lessonId || initial.legacyLessonBinding) throw new BookingValidationError('BOOKING_STATE_CONFLICT', 'Для этого занятия используйте прежние действия посещения и отмены');
          // Same resource order as the rules engine. Membership precedes Booking,
          // matching legacy attendance; Serializable retries cover concurrent edits.
          if (initial.arenaId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Arena" WHERE "id" = ${initial.arenaId}::uuid FOR UPDATE`);
          if (initial.horseId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Horse" WHERE "id" = ${initial.horseId}::uuid FOR UPDATE`);
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Trainer" WHERE "id" = ${initial.trainerId}::uuid FOR UPDATE`);
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Client" WHERE "id" = ${initial.clientId}::uuid FOR UPDATE`);
          // Idempotency is based on the committed terminal state, not on a newly
          // evaluated cancellation window, which can change between retries.
          const same = action === 'complete' ? initial.status === 'completed' : action === 'no-show' ? initial.status === 'no_show'
            : cancellation?.cancelledBy === 'club' ? initial.status === 'cancelled_club' : ['cancelled_client', 'penalty_cancellation'].includes(initial.status);
          if (same) return initial;
          if (initial.status !== 'scheduled') throw new BookingValidationError('BOOKING_STATE_CONFLICT', 'Исход тренировки уже зафиксирован. Обновите расписание');
          const [{ now: lookupTime }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          let membership: Membership | null = null;
          if (initial.membershipId) membership = await this.lockMembership(tx, initial.membershipId);
          else if (action !== 'cancel' || cancellation!.cancelledBy === 'client') {
            const candidates = await tx.membership.findMany({ where: {
              clientId: initial.clientId, type: { in: ['fixed_lessons', 'deposit'] }, status: 'active',
              validFrom: { lte: lookupTime }, validTo: { gte: lookupTime },
              OR: [{ allowedDisciplines: { isEmpty: true } }, { allowedDisciplines: { has: initial.serviceType! } }],
            }, orderBy: [{ validTo: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
            for (const candidate of candidates) {
              const current = await this.lockMembership(tx, candidate.id);
              if (current && this.usable(current, initial.clientId, initial.serviceType!, lookupTime)
                && current.remainingUnits.gte(bookingCharge(current.type, initial.costAmount))) { membership = current; break; }
            }
          }
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Booking" WHERE "id" = ${id}::uuid FOR UPDATE`);
          // Evaluate the policy after waiting for financial/booking locks: a
          // request cannot obtain free cancellation using a stale pre-lock clock.
          const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          const status: BookingStatus = action === 'complete' ? 'completed' : action === 'no-show' ? 'no_show'
            : cancellation!.cancelledBy === 'club' ? 'cancelled_club' : cancellationStatus(initial.startTime, now);
          const billable = ['completed', 'no_show', 'penalty_cancellation'].includes(status);
          if (membership && membership.clientId !== initial.clientId) throw new BookingValidationError('MEMBERSHIP_INVALID', 'Абонемент не принадлежит клиенту');
          if (billable) {
            if (await tx.payment.count({ where: { bookingId: id, status: 'PAID' } })) throw new BookingValidationError('BOOKING_STATE_CONFLICT', 'Тренировка уже оплачена деньгами. Согласуйте способ оплаты перед списанием абонемента');
            if (!membership) throw new BookingValidationError('MEMBERSHIP_REQUIRED', 'Нет подходящего абонемента или депозита. Выдайте его клиенту и повторите действие');
            if (!this.usable(membership, initial.clientId, initial.serviceType!, now)) throw new BookingValidationError('MEMBERSHIP_UNAVAILABLE', 'Абонемент недействителен или не подходит для этой дисциплины');
            const charge = bookingCharge(membership.type, initial.costAmount);
            if (membership.remainingUnits.lt(charge)) throw new BookingValidationError('MEMBERSHIP_INSUFFICIENT', 'Недостаточно занятий или средств на абонементе');
            await tx.membership.update({ where: { id: membership.id }, data: {
              remainingUnits: { decrement: charge }, status: membership.remainingUnits.eq(charge) ? 'exhausted' : 'active',
            } });
            await tx.ledgerTransaction.create({ data: {
              clientId: initial.clientId, bookingId: id, membershipId: membership.id,
              transactionType: status === 'completed' ? 'usage' : 'penalty_cancellation', amount: charge.negated(),
              description: status === 'completed' ? 'Завершение тренировки' : status === 'no_show' ? 'Неявка на тренировку' : 'Штрафная отмена менее чем за 12 часов',
            } });
            await tx.payment.updateMany({ where: { bookingId: id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
          } else if (status === 'cancelled_club' && membership) {
            const validTo = DateTime.fromJSDate(membership.validTo, { zone: process.env.CLUB_TIME_ZONE || 'Europe/Moscow' }).plus({ days: 7 }).toJSDate();
            await tx.membership.update({ where: { id: membership.id }, data: { validTo } });
          }
          return tx.booking.update({ where: { id }, data: {
            status, membershipId: billable ? membership?.id ?? initial.membershipId : initial.membershipId,
            attended: status === 'completed', attendanceStatus: status === 'completed' ? 'ATTENDED' : status === 'no_show' ? 'NO_SHOW' : 'PENDING',
            ...(action === 'cancel' ? { cancellationReason: cancellation!.reason } : {}),
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
      } catch (error) {
        if (isSerializationFailure(error) && attempt < 4) continue;
        if (isSerializationFailure(error)) throw new BookingValidationError('BOOKING_CONTENTION', 'Запись или баланс изменились одновременно. Повторите действие');
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BookingValidationError('BOOKING_STATE_CONFLICT', 'Списание для этой записи уже существует');
        throw error;
      }
    }
    throw new BookingValidationError('BOOKING_CONTENTION', 'Повторите действие');
  }

  private usable(m: Membership, clientId: string, discipline: string, now: Date) {
    return m.clientId === clientId && ['fixed_lessons', 'deposit'].includes(m.type) && m.status === 'active'
      && m.validFrom <= now && m.validTo >= now && (!m.allowedDisciplines.length || m.allowedDisciplines.includes(discipline));
  }
  private async lockMembership(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text AS lock`;
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Membership" WHERE "id" = ${id}::uuid FOR UPDATE`);
    return tx.membership.findUnique({ where: { id } });
  }
}
