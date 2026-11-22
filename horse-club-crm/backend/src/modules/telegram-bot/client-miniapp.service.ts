import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipLedgerService } from '../../memberships/membership-ledger.service';
import { isSerializationFailure } from '../../common/serialization-failure';
import { activeTelegramMembership } from './telegram-membership';
import { queueTelegramAdmins } from './telegram-delivery';
import { DateTime } from 'luxon';
import { LessonsService } from '../../lessons/lessons.service';
import { BookingRulesService } from '../../bookings/booking-rules.service';
import type { ClientRescheduleDto, TrainerTmaScheduleQuery } from './trainer-tma.dto';
import { BadRequestException } from '@nestjs/common';
import { queueTelegram } from './telegram-delivery';
import { queueVkNotification } from '../../vk-bot/vk-delivery.module';
import { clientCanReschedule, clientChangeWindowHours } from './client-lesson-policy';

const view = {
  id: true, lessonId: true, startTime: true, endTime: true, status: true,
  clientConfirmed: true, clientCancellationRequested: true,
  trainer: { select: { name: true } }, horse: { select: { name: true } },
  lesson: { select: { startTime: true, endTime: true, status: true, deletedAt: true,
    _count: { select: { bookings: { where: { status: 'scheduled' } } } },
    service: { select: { name: true, title: true, cancellationWindowHours: true } } } },
} satisfies Prisma.BookingSelect;
type Row = Prisma.BookingGetPayload<{ select: typeof view }>;
const future = (row: Row) => row.status === 'scheduled' && (!row.lesson ||
  row.lesson.status === 'SCHEDULED' && !row.lesson.deletedAt) && (row.lesson?.startTime ?? row.startTime) > new Date();
const present = (row: Row) => ({
  id: row.id, lessonId: row.lessonId, startTime: row.startTime, endTime: row.endTime,
  status: row.status, clientConfirmed: row.clientConfirmed,
  clientCancellationRequested: row.clientCancellationRequested,
  trainer: row.trainer, horse: row.horse, lesson: row.lesson,
  clientStatus: row.status === 'scheduled' ? row.clientConfirmed ? 'CONFIRMED' : 'SCHEDULED' : row.status.toUpperCase(),
  canCancel: future(row), canConfirm: future(row) && !row.clientConfirmed,
  canReschedule: clientCanReschedule(row),
});

@Injectable()
export class ClientMiniappService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: MembershipLedgerService,
    private readonly lessons: LessonsService, private readonly rules: BookingRulesService) {}

  private async movable(tx: Prisma.TransactionClient, clientId: string, id: string) {
    const row = await tx.booking.findFirst({ where: { clientId, OR: [{ id }, { lessonId: id }] },
      include: { client: true, membership: true, lesson: { include: { service: true, bookings: true } } } });
    if (!row) throw new NotFoundException('Запись не найдена');
    const start = row.lesson?.startTime ?? row.startTime;
    const hours = clientChangeWindowHours(row);
    if (row.status !== 'scheduled' || row.lesson && (row.lesson.status !== 'SCHEDULED' || row.lesson.deletedAt)
      || +start - Date.now() <= hours * 3600000) throw new ConflictException(`Перенос доступен не позднее чем за ${hours} ч. до занятия`);
    if (row.lesson && row.lesson.bookings.filter(b => b.status === 'scheduled').length !== 1)
      throw new ConflictException('Для переноса участия в групповом занятии обратитесь к администратору');
    return row;
  }

  private async validateMove(tx: Prisma.TransactionClient, row: Awaited<ReturnType<ClientMiniappService['movable']>>, dto: ClientRescheduleDto, preview = false) {
    const start = DateTime.fromISO(`${dto.date}T${dto.startTime}`, { zone: 'Europe/Moscow' });
    if (!start.isValid || start.toISODate() !== dto.date || start.toFormat('HH:mm') !== dto.startTime
      || start.toMillis() <= Date.now() || start > DateTime.now().setZone('Europe/Moscow').plus({ days: 30 }).endOf('day'))
      throw new BadRequestException('Выберите время в ближайшие 30 дней');
    const duration = +(row.lesson?.endTime ?? row.endTime) - +(row.lesson?.startTime ?? row.startTime);
    const end = start.plus({ milliseconds: duration });
    const schedule = await tx.clubSchedule.findUnique({ where: { id: 1 } });
    if (!schedule || schedule.daysOfWeekOff.includes(start.weekday % 7) || start.toISODate() !== end.toISODate()
      || start.toFormat('HH:mm') < schedule.openTime || end.toFormat('HH:mm') > schedule.closeTime)
      throw new ConflictException('Клуб закрыт в выбранное время');
    if (row.membership && (row.membership.deletedAt || row.membership.cancelledAt || row.membership.validFrom > start.toJSDate() || row.membership.validUntil < end.toJSDate()))
      throw new ConflictException('Абонемент недоступен на выбранную дату');
    await this.rules.validate(tx, { trainerId: row.lesson?.trainerId ?? row.trainerId, arenaId: row.lesson?.arenaId ?? row.arenaId,
      participants: [{ clientId: row.clientId, horseId: row.horseId }], start: start.toJSDate(), end: end.toJSDate(),
      excludeLessonId: row.lessonId ?? undefined, excludeBookingId: row.id, lockResources: !preview });
    return { start: start.toJSDate(), end: end.toJSDate() };
  }

  async rescheduleSlots(clientId: string, id: string, query: TrainerTmaScheduleQuery) {
    return this.prisma.$transaction(async tx => {
      const row = await this.movable(tx, clientId, id);
      const day = DateTime.fromISO(query.date, { zone: 'Europe/Moscow' });
      if (!day.isValid || day.toISODate() !== query.date || day.startOf('day') < DateTime.now().setZone('Europe/Moscow').startOf('day')
        || day > DateTime.now().setZone('Europe/Moscow').plus({ days: 30 }).endOf('day'))
        throw new BadRequestException('Выберите дату в ближайшие 30 дней');
      if (row.lessonId) {
        const lesson = await this.lessons.readMoveLesson(tx, row.lessonId);
        const result = await this.lessons.lessonMoveSlots(tx, lesson, query);
        return { slots: result.slots.filter(slot => slot.available) };
      }
      const slots: { startTime: string; available: boolean; reason?: string }[] = [];
      for (let minute = 0; minute < 1440; minute += 30) {
        const startTime = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
        try { await this.validateMove(tx, row, { date: query.date, startTime }, true); slots.push({ startTime, available: true }); }
        catch (error: unknown) {
          if (!(error instanceof BadRequestException || error instanceof ConflictException)) throw error;
        }
      }
      return { slots };
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  }

  async reschedule(clientId: string, id: string, dto: ClientRescheduleDto) {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(async tx => {
        const row = await this.movable(tx, clientId, id);
        const { start, end } = await this.validateMove(tx, row, dto);
        const oldStart = row.lesson?.startTime ?? row.startTime;
        if (+oldStart === +start) return { updated: true };
        if (row.lessonId) await this.lessons.rescheduleLesson(row.lessonId, start.toISOString(), (+end - +start) / 60000, undefined, undefined, undefined, { tx });
        else {
          await tx.booking.update({ where: { id: row.id }, data: { startTime: start, endTime: end, clientConfirmed: false, clientCancellationRequested: false } });
          const event = randomUUID();
          const format = (date: Date) => DateTime.fromJSDate(date, { zone: 'Europe/Moscow' }).toFormat('dd.MM.yyyy HH:mm');
          const message = `Тренировка перенесена: ${format(oldStart)} → ${format(start)} (Москва)`;
          await queueTelegramAdmins(tx, `admin:client:reschedule:${event}`, message);
          if (row.client.telegramUserId) await queueTelegram(tx, `client:${row.clientId}:reschedule:${event}`, row.client.telegramUserId, message);
          if (row.client.vkUserId) await queueVkNotification(tx, `client:${row.clientId}:reschedule:${event}`, row.client.vkUserId, message);
        }
        await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'CLIENT_LESSON_RESCHEDULED', actorId: clientId,
          actorName: 'Клиент Telegram', details: { bookingId: row.id, previousStart: oldStart.toISOString(), startTime: start.toISOString() } } });
        return { updated: true };
      }, { isolationLevel: 'Serializable', timeout: 30000 }); }
      catch (error: unknown) {
        if (isSerializationFailure(error) && attempt < 2) continue;
        if (isSerializationFailure(error)) throw new ConflictException('Запись изменилась. Обновите кабинет');
        throw error;
      }
    }
  }

  async overview(clientId: string) {
    const now = new Date();
    const [client, membership, rows] = await Promise.all([
      this.prisma.client.findFirst({ where: { id: clientId, deletedAt: null },
        select: { id: true, name: true, firstName: true, lastName: true, phone: true } }),
      activeTelegramMembership(this.prisma, clientId),
      this.prisma.booking.findMany({ where: { clientId,
        OR: [{ lesson: null, startTime: { gt: now } }, { lesson: { deletedAt: null, startTime: { gt: now } } }] }, select: view,
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }], take: 100 }),
    ]);
    if (!client) throw new NotFoundException('Профиль недоступен');
    rows.sort((a, b) => +(a.lesson?.startTime ?? a.startTime) - +(b.lesson?.startTime ?? b.startTime) || a.id.localeCompare(b.id));
    return { client, membership, bookings: rows.map(present) };
  }

  async action(clientId: string, id: string, action: 'confirm' | 'cancel') {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(async tx => {
        const row = await tx.booking.findFirst({ where: { clientId, OR: [{ id }, { lessonId: id }] },
          select: { ...view, membershipId: true, membership: { select: { clientId: true } } } });
        if (!row) throw new NotFoundException('Запись не найдена');
        if (action === 'cancel' && row.status === 'cancelled_client') return present(row);
        if (!future(row)) throw new ConflictException('Можно изменить только предстоящее занятие');
        if (action === 'confirm' && row.clientConfirmed) return present(row);
        if (action === 'cancel' && row.membershipId && row.lessonId) {
          const debit = await tx.membershipOp.findFirst({ where: { membershipId: row.membershipId,
            lessonId: row.lessonId, type: 'DEBIT', OR: [{ attendeeClientId: clientId },
              ...(row.membership?.clientId === clientId ? [{ attendeeClientId: null }] : [])] } });
          if (debit) {
            const refunded = await tx.membershipOp.findFirst({ where: { membershipId: row.membershipId,
              lessonId: row.lessonId, type: 'REFUND', OR: [{ attendeeClientId: debit.attendeeClientId },
                ...(debit.attendeeClientId === null && row.membership?.clientId === clientId ? [{ attendeeClientId: clientId }] : [])] } });
            if (!refunded) await this.ledger.refundLesson(row.membershipId, row.lessonId,
              'Отмена клиентом через Telegram', tx, debit.attendeeClientId ?? undefined);
          }
        }
        if (action === 'cancel' && row.membershipId && !row.lessonId) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${row.membershipId}, 0))::text`;
          const membership = await tx.membership.findUnique({ where: { id: row.membershipId } });
          if (membership?.type === 'fixed_lessons') {
            const charge = await tx.ledgerTransaction.findFirst({ where: { bookingId: row.id, membershipId: row.membershipId,
              clientId, sourceMembershipOpId: null, transactionType: { in: ['usage', 'penalty_cancellation'] } } });
            const refund = await tx.ledgerTransaction.findFirst({ where: { bookingId: row.id, membershipId: row.membershipId, transactionType: 'refund' } });
            if (charge && !refund) {
              await tx.membership.update({ where: { id: row.membershipId }, data: { remainingUnits: { increment: charge.amount.abs() },
                ...(membership.status === 'exhausted' ? { status: membership.validTo < new Date() ? 'expired' : 'active' } : {}) } });
              await tx.ledgerTransaction.create({ data: { clientId, ownerClientId: membership.clientId, bookingId: row.id,
                membershipId: row.membershipId, transactionType: 'refund', amount: charge.amount.abs(), description: 'Отмена клиентом через Telegram' } });
            }
          }
        }
        const updated = await tx.booking.update({ where: { id: row.id }, data: action === 'confirm'
          ? { clientConfirmed: true, clientCancellationRequested: false } : { status: 'cancelled_client', clientConfirmed: false,
            clientCancellationRequested: false, cancellationReason: 'Отмена клиентом через Telegram' }, select: view });
        if (action === 'cancel' && row.lessonId) {
          const remaining = await tx.booking.count({ where: { lessonId: row.lessonId, status: 'scheduled' } });
          if (!remaining) await tx.lesson.update({ where: { id: row.lessonId },
            data: { status: 'CANCELLED', cancelledAt: new Date() } });
        }
        await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: `CLIENT_LESSON_${action.toUpperCase()}`,
          actorId: clientId, actorName: 'Клиент Telegram', details: { clientId, bookingId: row.id,
            lessonId: row.lessonId, source: 'telegram-miniapp' } } });
        await queueTelegramAdmins(tx, `admin:client:${action}:${row.id}`, `${action === 'cancel' ? 'Отмена' : 'Подтверждение'} занятия клиентом: ${row.id}`);
        return present(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error: unknown) {
        if (isSerializationFailure(error) && attempt < 2) continue;
        if (isSerializationFailure(error)) throw new ConflictException('Запись изменилась. Обновите кабинет');
        throw error;
      }
    }
  }
}
