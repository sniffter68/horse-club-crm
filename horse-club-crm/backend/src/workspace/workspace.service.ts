import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CashboxService } from '../cashbox/cashbox.service';
import { ModuleAccessService } from '../settings/module-access.service';

const zone = 'Europe/Moscow';
// Explicit projection: never return full client, service, trainer or payment records.
export const boardSelect = {
  id: true, trainerId: true, startTime: true, endTime: true, status: true, trainerNote: true,
  trainer: { select: { id: true, name: true } },
  arena: { select: { id: true, name: true } },
  bookings: { select: { id: true, clientConfirmed: true,
    client: { select: { id: true, name: true } }, horse: { select: { id: true, name: true, deletedAt: true } } } },
} satisfies Prisma.LessonSelect;

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService, private readonly cashbox: CashboxService,
    private readonly access: ModuleAccessService) {}

  async trainerBoard(actor: AuthUser, date: string) {
    const day = DateTime.fromISO(date, { zone });
    if (!day.isValid || day.toISODate() !== date) throw new BadRequestException('Укажите существующую дату YYYY-MM-DD');
    if (actor.role === 'TRAINER' && !actor.trainerId) throw new ForbiddenException('Карточка тренера не привязана');
    return this.prisma.$transaction(async tx => {
      const [trainers, lessons, schedule] = await Promise.all([
        tx.trainer.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
        tx.lesson.findMany({ where: { deletedAt: null, startTime: { lt: day.plus({ days: 1 }).toJSDate() }, endTime: { gt: day.startOf('day').toJSDate() } },
          select: boardSelect, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] }),
        tx.clubSchedule.findUnique({ where: { id: 1 }, select: { openTime: true, closeTime: true } }),
      ]);
      if (actor.role === 'TRAINER' && !trainers.some(row => row.id === actor.trainerId)) throw new ForbiddenException('Доступ тренера отключён');
      return { date, timeZone: zone, trainerId: actor.trainerId ?? null, trainers,
        openTime: schedule?.openTime ?? '08:00', closeTime: schedule?.closeTime ?? '22:00',
        lessons: lessons.map(lesson => ({ ...lesson, isOwn: lesson.trainerId === actor.trainerId,
          trainerNote: lesson.trainerId === actor.trainerId ? lesson.trainerNote : null,
          bookings: lesson.bookings.map(booking => ({ ...booking, client: lesson.trainerId === actor.trainerId ? booking.client : null })) })),
        horses: lessons.filter(lesson => lesson.status !== 'CANCELLED').flatMap(lesson => lesson.bookings.flatMap(booking => booking.horse && !booking.horse.deletedAt ? [{
          ...booking.horse, lessonId: lesson.id, trainerId: lesson.trainerId, startTime: lesson.startTime, endTime: lesson.endTime,
        }] : [])),
      };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async adminSummary(actor: AuthUser, now = new Date()) {
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') throw new ForbiddenException('Сводка доступна администратору');
    const permissions = await this.access.forRole(actor.role);
    const canFinance = permissions.some(row => row.module === 'CASHBOX' && row.isEnabled && row.accessLevel !== 'HIDDEN');
    const local = DateTime.fromJSDate(now, { zone });
    const start = local.startOf('day'), end = start.plus({ days: 7 });
    const month = local.startOf('month'), nextMonth = month.plus({ months: 1 });
    const [week, activeRiders, newLeads, unconfirmed, actions, finance, leadRequests] = await Promise.all([
      this.prisma.lesson.findMany({ where: { deletedAt: null, startTime: { gte: start.toJSDate(), lt: end.toJSDate() } }, select: boardSelect, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] }),
      this.prisma.client.count({ where: { deletedAt: null, isRider: true, isLead: false } }),
      this.prisma.leadRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.lesson.findMany({ where: { deletedAt: null, status: 'SCHEDULED', startTime: { gte: now, lt: new Date(now.getTime() + 86400000) }, bookings: { some: { clientConfirmed: false } } }, select: boardSelect, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] }),
      this.prisma.cashAuditLog.findMany({ where: { action: { in: ['LESSON_CREATED', 'LESSON_RESCHEDULED', 'LESSON_COMPLETED', 'LESSON_NO_SHOW', 'SERVICE_CANCELLED', 'PAYMENT_RECEIVED', 'LESSON_ONE_OFF_PAYMENT'] } },
        select: { id: true, action: true, actorName: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 15 }),
      canFinance ? this.monthFinance(month.toJSDate(), nextMonth.toJSDate()) : null,
      this.prisma.leadRequest.findMany({ where: { status: 'PENDING' }, select: { id: true, firstName: true, phone: true, email: true, preferences: true, createdAt: true, service: { select: { id: true, name: true, title: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 }),
    ]);
    const today = week.filter(lesson => lesson.startTime < start.plus({ days: 1 }).toJSDate());
    return { generatedAt: now, date: start.toISODate(), timeZone: zone,
      kpi: { lessonsToday: today.filter(row => row.status !== 'CANCELLED').length, activeRiders, awaitingConfirmation: unconfirmed.length, newLeads },
      today, week, unconfirmed, finance, actions, leadRequests };
  }

  private async monthFinance(start: Date, end: Date) {
    const [cashbox, amounts] = await Promise.all([this.cashbox.summary(), this.prisma.$transaction(async tx => {
      const [paid, pending, recognized, accrued] = await Promise.all([
        tx.payment.aggregate({ where: { archivedAt: null, status: 'PAID', OR: [{ paidAt: { gte: start, lt: end } }, { paidAt: null, createdAt: { gte: start, lt: end } }] }, _sum: { amount: true } }),
        tx.payment.aggregate({ where: { archivedAt: null, status: 'PENDING', createdAt: { gte: start, lt: end } }, _sum: { amount: true } }),
        tx.revenueRecognition.aggregate({ where: { membershipId: { not: null }, recognizedAt: { gte: start, lt: end } }, _sum: { amount: true } }),
        tx.payment.aggregate({ where: { archivedAt: null, status: { in: ['PAID', 'PENDING'] }, createdAt: { gte: start, lt: end } }, _sum: { amount: true } }),
      ]);
      const paidAmount = new Prisma.Decimal(paid._sum.amount ?? 0), debt = new Prisma.Decimal(pending._sum.amount ?? 0);
      return { paid: paidAmount.toFixed(2), debt: debt.toFixed(2), accrued: new Prisma.Decimal(accrued._sum.amount ?? 0).toFixed(2), recognizedMembershipRevenue: new Prisma.Decimal(recognized._sum.amount ?? 0).toFixed(2) };
    }, { isolationLevel: 'RepeatableRead' })]);
    return { ...amounts, mainBalance: cashbox.mainBalance, boardingBalance: cashbox.boardingBalance, start, end };
  }
}
