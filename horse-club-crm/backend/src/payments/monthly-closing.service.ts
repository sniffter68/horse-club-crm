import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { MonthlyClosingDto } from './dto/monthly-closing.dto';
import { membershipDeferred } from './accrual.math';

const zone = 'Europe/Moscow';
type Carry = { id: string; remaining: number; totalLessons: number; totalPrice: Prisma.Decimal; pricePerLesson: Prisma.Decimal };

@Injectable()
export class MonthlyClosingService {
  constructor(private readonly prisma: PrismaService) {}

  private period(dto: MonthlyClosingDto) {
    const start = DateTime.fromObject({ year: dto.year, month: dto.month, day: 1 }, { zone });
    if (!start.isValid || !Number.isInteger(dto.year) || !Number.isInteger(dto.month)) throw new BadRequestException('Некорректный месяц');
    return { start: start.toJSDate(), end: start.plus({ months: 1 }).toJSDate() };
  }

  private async calculate(tx: Prisma.TransactionClient, dto: MonthlyClosingDto) {
    const { start, end } = this.period(dto);
    const [income, expenses, revenue, unvaluedCompleted, memberships] = await Promise.all([
      tx.payment.aggregate({ where: { status: 'PAID', operationType: 'INCOME', OR: [
        { paidAt: { gte: start, lt: end } }, { paidAt: null, createdAt: { gte: start, lt: end } },
      ] }, _sum: { amount: true } }),
      tx.expense.aggregate({ where: { cancelledAt: null, date: { gte: start, lt: end } }, _sum: { amount: true } }),
      tx.revenueRecognition.aggregate({ where: { recognizedAt: { gte: start, lt: end } }, _sum: { amount: true } }),
      tx.booking.count({ where: { membership: { type: 'fixed_lessons', OR: [{ totalPrice: null }, { pricePerLesson: null }] }, OR: [
        { lesson: { status: 'COMPLETED', startTime: { gte: start, lt: end } } },
        { lessonId: null, status: 'completed', startTime: { gte: start, lt: end } },
      ] } }),
      // Undo subsequent unit movements to reconstruct the balance at month end.
      // Cash receipts in LedgerTransaction are RUB and must never enter this sum.
      tx.$queryRaw<Carry[]>`
        SELECT m.id, (m."remainedLessons" - COALESCE((
          SELECT SUM(t.amount) FROM "LedgerTransaction" t
          LEFT JOIN "Booking" b ON b.id = t."bookingId"
          LEFT JOIN "Lesson" l ON l.id = b."lessonId"
          WHERE t."membershipId" = m.id AND t."cashDeskPaymentId" IS NULL
            AND t."sourcePaymentId" IS NULL AND t."transactionType" <> 'purchase'
            AND CASE WHEN t."transactionType" IN ('usage', 'penalty_cancellation')
              OR (t."transactionType" = 'refund' AND t."sourceMembershipOpId" IS NOT NULL)
              THEN COALESCE(l."startTime", b."startTime", t."createdAt") ELSE t."createdAt" END >= ${end}
        ), 0))::integer AS remaining, m."totalLessons", m."totalPrice", m."pricePerLesson"
        FROM "Membership" m WHERE m.type = 'fixed_lessons' AND m.status <> 'frozen'
          AND m."createdAt" < ${end} AND (m."deletedAt" IS NULL OR m."deletedAt" >= ${end})
          AND (m."cancelledAt" IS NULL OR m."cancelledAt" >= ${end})
      `,
    ]);
    const carrying = memberships.filter(m => m.remaining > 0);
    if (unvaluedCompleted || carrying.some(m => m.totalPrice == null || m.pricePerLesson == null)) {
      throw new ConflictException('Есть абонементы без стоимости. Заполните их стоимость перед закрытием месяца');
    }
    const deferred = carrying.reduce((sum, m) => sum.plus(membershipDeferred(m.totalPrice, m.pricePerLesson, m.remaining, m.totalLessons)), new Prisma.Decimal(0));
    return { values: { year: dto.year, month: dto.month, cashFlowIncome: income._sum.amount ?? new Prisma.Decimal(0),
      cashFlowExpense: expenses._sum.amount ?? new Prisma.Decimal(0), recognizedRevenue: revenue._sum.amount ?? new Prisma.Decimal(0),
      deferredRevenueCarriedOver: deferred, activeMembershipsCarriedOver: carrying.length }, carrying };
  }

  status(dto: MonthlyClosingDto) {
    return this.prisma.$transaction(async tx => {
      const closed = await tx.monthlyFinancialClosing.findUnique({ where: { year_month: dto } });
      if (closed) return { ...closed, isClosed: true };
      const { values } = await this.calculate(tx, dto);
      return { ...values, isClosed: false, closedAt: null };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async close(dto: MonthlyClosingDto, closedById: string) {
    const { end } = this.period(dto);
    if (end > new Date()) throw new BadRequestException('Месяц можно закрыть только после его окончания по Москве');
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(6842026)::text`;
          const closed = await tx.monthlyFinancialClosing.findUnique({ where: { year_month: dto } });
          if (closed) return { ...closed, isClosed: true };
          const newer = await tx.monthlyFinancialClosing.findFirst({ where: { OR: [
            { year: { gt: dto.year } }, { year: dto.year, month: { gt: dto.month } },
          ] } });
          if (newer) throw new ConflictException('Более поздний месяц уже закрыт');
          const { values, carrying } = await this.calculate(tx, dto);
          const nextEnd = DateTime.fromJSDate(end, { zone }).endOf('month');
          const validUntil = DateTime.max(nextEnd, DateTime.now().setZone(zone).endOf('month')).toJSDate();
          await tx.membership.updateMany({ where: { id: { in: carrying.map(m => m.id) }, remainedLessons: { gt: 0 },
            deletedAt: null, cancelledAt: null, status: { not: 'frozen' }, validUntil: { lt: validUntil } },
            data: { validUntil, validTo: validUntil, status: 'active' } });
          const result = await tx.monthlyFinancialClosing.create({ data: { ...values, closedById } });
          return { ...result, isClosed: true };
        }, { isolationLevel: 'Serializable', timeout: 20000 });
      } catch (error) {
        if (isSerializationFailure(error) && attempt < 4) continue;
        throw error;
      }
    }
  }
}
