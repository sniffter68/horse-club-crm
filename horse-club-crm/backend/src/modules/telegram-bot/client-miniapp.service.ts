import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipLedgerService } from '../../memberships/membership-ledger.service';
import { isSerializationFailure } from '../../common/serialization-failure';
import { activeTelegramMembership } from './telegram-membership';
import { queueTelegramAdmins } from './telegram-delivery';

const view = {
  id: true, lessonId: true, startTime: true, endTime: true, status: true,
  clientConfirmed: true, clientCancellationRequested: true,
  trainer: { select: { name: true } }, horse: { select: { name: true } },
  lesson: { select: { startTime: true, endTime: true, status: true, deletedAt: true,
    service: { select: { name: true, title: true } } } },
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
});

@Injectable()
export class ClientMiniappService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: MembershipLedgerService) {}

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
