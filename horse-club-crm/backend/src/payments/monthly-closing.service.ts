import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { ConfirmMonthlyClosingDto, MonthlyClosingDto } from './dto/monthly-closing.dto';
import { currentCashBalance } from './finance.service';

const zone = 'Europe/Moscow';


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
    const [income, expenses, revenue, unvaluedCompleted, memberships, cash] = await Promise.all([
      tx.payment.aggregate({ where: { status: 'PAID', operationType: 'INCOME', OR: [
        { paidAt: { gte: start, lt: end } }, { paidAt: null, createdAt: { gte: start, lt: end } },
      ] }, _sum: { amount: true } }),
      tx.expense.aggregate({ where: { cancelledAt: null, date: { gte: start, lt: end } }, _sum: { amount: true } }),
      tx.revenueRecognition.aggregate({ where: { recognizedAt: { gte: start, lt: end } }, _sum: { amount: true } }),
      tx.booking.count({ where: { membership: { type: 'fixed_lessons', OR: [{ totalPrice: null }, { pricePerLesson: null }] }, OR: [
        { lesson: { status: 'COMPLETED', startTime: { gte: start, lt: end } } },
        { lessonId: null, status: 'completed', startTime: { gte: start, lt: end } },
      ] } }),
      // Reconciliation is a snapshot of current active, unused memberships.
      tx.membership.findMany({ where: { type: 'fixed_lessons', status: 'active', remainedLessons: { gt: 0 },
        deletedAt: null, cancelledAt: null }, include: { client: true, pricingPlan: true }, orderBy: { id: 'asc' } }),
      currentCashBalance(tx),
    ]);
    const carrying = memberships;
    if (unvaluedCompleted || carrying.some(m => m.totalPrice == null || m.pricePerLesson == null)) {
      throw new ConflictException('Есть абонементы без стоимости. Заполните их стоимость перед закрытием месяца');
    }
    const rows = carrying.map(m => ({ membershipId: m.id, clientId: m.clientId,
      clientName: m.client?.name || [m.client?.lastName, m.client?.firstName].filter(Boolean).join(' ') || 'Клиент не указан',
      membershipTitle: m.title || m.serviceTitle || m.pricingPlan?.name || 'Абонемент',
      remainingLessons: m.remainedLessons, pricePerLesson: m.pricePerLesson!.toFixed(2),
      amountToCarryOver: m.pricePerLesson!.times(m.remainedLessons).toFixed(2) }));
    const deferred = rows.reduce((sum, row) => sum.plus(row.amountToCarryOver), new Prisma.Decimal(0));
    return { values: { year: dto.year, month: dto.month, cashFlowIncome: income._sum.amount ?? new Prisma.Decimal(0),
      cashFlowExpense: expenses._sum.amount ?? new Prisma.Decimal(0), recognizedRevenue: revenue._sum.amount ?? new Prisma.Decimal(0),
      deferredRevenueCarriedOver: deferred, cashBalanceCarriedOver: cash.balanceTotal,
      membershipsAdvanceRows: rows, activeMembershipsCarriedOver: carrying.length }, carrying };
  }

  private report<T extends { cashBalanceCarriedOver: Prisma.Decimal; cashFlowExpense: Prisma.Decimal;
    deferredRevenueCarriedOver: Prisma.Decimal; membershipsAdvanceRows: Prisma.JsonValue | Prisma.InputJsonValue }>(values: T) {
    return { ...values, currentCashBalance: values.cashBalanceCarriedOver, expenses: values.cashFlowExpense,
      membershipsAdvanceSummary: { totalAdvance: values.deferredRevenueCarriedOver, rows: values.membershipsAdvanceRows } };
  }

  status(dto: MonthlyClosingDto) {
    return this.prisma.$transaction(async tx => {
      this.period(dto);
      const period = { year: dto.year, month: dto.month };
      const openingBalance = await tx.openingBalance.findUnique({ where: { year_month: period } });
      const closed = await tx.monthlyFinancialClosing.findUnique({ where: { year_month: period } });
      if (closed) return { ...this.report(closed), openingBalance, isClosed: true };
      const { values } = await this.calculate(tx, dto);
      return { ...this.report(values), openingBalance, isClosed: false, closedAt: null };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async close(dto: ConfirmMonthlyClosingDto, closedById: string) {
    const { end } = this.period(dto);
    if (end > new Date()) throw new BadRequestException('Месяц можно закрыть только после его окончания по Москве');
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(6842026)::text`;
          const closed = await tx.monthlyFinancialClosing.findUnique({ where: { year_month: { year: dto.year, month: dto.month } } });
          if (closed) throw new ConflictException('Месяц уже закрыт. Остатки уже перенесены');
          const newer = await tx.monthlyFinancialClosing.findFirst({ where: { OR: [
            { year: { gt: dto.year } }, { year: dto.year, month: { gt: dto.month } },
          ] } });
          if (newer) throw new ConflictException('Более поздний месяц уже закрыт');
          const { values, carrying } = await this.calculate(tx, dto);
          const nextEnd = DateTime.fromJSDate(end, { zone }).endOf('month');
          const validUntil = DateTime.max(nextEnd, DateTime.now().setZone(zone).endOf('month')).toJSDate();
          await tx.membership.updateMany({ where: { id: { in: carrying.map(m => m.id) }, remainedLessons: { gt: 0 },
            deletedAt: null, cancelledAt: null, status: 'active', validUntil: { lt: validUntil } },
            data: { validUntil, validTo: validUntil, status: 'active' } });
          const result = await tx.monthlyFinancialClosing.create({ data: { ...values, closedById, status: 'CLOSED', notes: dto.notes?.trim() } });
          const next = DateTime.fromJSDate(end, { zone });
          const balances = { incomingCashBalance: values.cashBalanceCarriedOver,
            incomingAdvanceBalance: values.deferredRevenueCarriedOver, closingId: result.id };
          await tx.openingBalance.upsert({ where: { year_month: { year: next.year, month: next.month } },
            create: { year: next.year, month: next.month, ...balances }, update: balances });
          const openingBalance = await tx.openingBalance.findUnique({ where: { year_month: { year: dto.year, month: dto.month } } });
          return { ...this.report(result), openingBalance, isClosed: true };
        }, { isolationLevel: 'Serializable', timeout: 20000 });
      } catch (error) {
        // A concurrent serializable snapshot can surface the month unique index
        // as P2002; retry with a fresh snapshot to return the normal 409.
        const uniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if ((isSerializationFailure(error) || uniqueConflict) && attempt < 4) continue;
        throw error;
      }
    }
  }
}
