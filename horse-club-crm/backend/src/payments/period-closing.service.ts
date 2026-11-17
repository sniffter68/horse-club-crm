import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { PeriodClosingDto } from './dto/period-closing.dto';
import { MonthlyClosingService } from './monthly-closing.service';

const zone = 'Europe/Moscow';
export function closingRange(dto: PeriodClosingDto) {
  const value = dto.type === 'MONTH' ? `${dto.month}-01` : dto.date;
  const start = value ? DateTime.fromISO(value, { zone }).startOf('day') : DateTime.invalid('missing');
  if (!start.isValid || start.year < 2000) throw new BadRequestException('Укажите корректную дату периода');
  return { start, end: dto.type === 'MONTH' ? start.plus({ months: 1 }) : start.plus({ days: 1 }) };
}
type CashMovement = { cashbox: 'MAIN' | 'BOARDING'; opening: Prisma.Decimal; income: Prisma.Decimal; expense: Prisma.Decimal; oneOff: Prisma.Decimal; memberships: Prisma.Decimal; other: Prisma.Decimal };

@Injectable()
export class PeriodClosingService {
  constructor(private readonly prisma: PrismaService, private readonly monthly: MonthlyClosingService) {}
  private async calculate(tx: Prisma.TransactionClient, dto: PeriodClosingDto) {
    const { start, end } = closingRange(dto);
    const saved = await tx.financialPeriodClosing.findUnique({ where: { type_periodStart: { type: dto.type, periodStart: start.toJSDate() } } });
    if (saved) return { ...(saved.snapshot as Prisma.JsonObject), isClosed: true, closedAt: saved.closedAt.toISOString() };
    const monthlyClosed = await tx.monthlyFinancialClosing.findUnique({ where: { year_month: { year: start.year, month: start.month } } });
    const boxes = await tx.$queryRaw<CashMovement[]>`
      WITH movements AS (
        SELECT CASE WHEN p."boardingContractId" IS NULL THEN 'MAIN' ELSE 'BOARDING' END AS cashbox,
          COALESCE(p."paidAt", p."createdAt") AS at, p.amount AS income, 0::numeric AS expense,
          CASE WHEN p."membershipId" IS NOT NULL THEN 'memberships' WHEN p."serviceId" IS NOT NULL OR p."bookingId" IS NOT NULL THEN 'oneOff' ELSE 'other' END AS kind
        FROM "Payment" p WHERE p.status = 'PAID' AND p."archivedAt" IS NULL
        UNION ALL
        SELECT CASE WHEN p."boardingContractId" IS NULL THEN 'MAIN' ELSE 'BOARDING' END, e.date, 0, e.amount, 'other'
        FROM "Expense" e LEFT JOIN "Payment" p ON p.id = e."refundPaymentId"
        WHERE e."archivedAt" IS NULL AND e."cancelledAt" IS NULL
      ) SELECT b.cashbox,
        COALESCE(SUM(m.income-m.expense) FILTER (WHERE m.at < ${start.toJSDate()}),0) AS opening,
        COALESCE(SUM(m.income) FILTER (WHERE m.at >= ${start.toJSDate()}),0) AS income,
        COALESCE(SUM(m.expense) FILTER (WHERE m.at >= ${start.toJSDate()}),0) AS expense,
        COALESCE(SUM(m.income) FILTER (WHERE m.at >= ${start.toJSDate()} AND kind='oneOff'),0) AS "oneOff",
        COALESCE(SUM(m.income) FILTER (WHERE m.at >= ${start.toJSDate()} AND kind='memberships'),0) AS memberships,
        COALESCE(SUM(m.income) FILTER (WHERE m.at >= ${start.toJSDate()} AND kind='other'),0) AS other
      FROM (VALUES ('MAIN'),('BOARDING')) b(cashbox) LEFT JOIN movements m ON m.cashbox=b.cashbox AND m.at < ${end.toJSDate()}
      GROUP BY b.cashbox ORDER BY b.cashbox`;
    const [revenue, memberships, pending] = await Promise.all([
      tx.revenueRecognition.aggregate({ where: { membershipId: { not: null }, recognizedAt: { gte: start.toJSDate(), lt: end.toJSDate() } }, _sum: { amount: true } }),
      // Historical carry: reconstruct from sales and immutable recognition up to the period boundary.
      tx.membership.findMany({ where: { type: 'fixed_lessons', createdAt: { lt: end.toJSDate() },
        AND: [{ OR: [{ cancelledAt: null }, { cancelledAt: { gte: end.toJSDate() } }] }, { OR: [{ deletedAt: null }, { deletedAt: { gte: end.toJSDate() } }] }],
        payments: { some: { status: 'PAID', OR: [{ paidAt: { lt: end.toJSDate() } }, { paidAt: null, createdAt: { lt: end.toJSDate() } }] } } },
        select: { id: true, totalPrice: true, totalLessons: true, revenueRecognitions: { where: { recognizedAt: { lt: end.toJSDate() } }, select: { type: true, amount: true } } } }),
      tx.lesson.count({ where: { status: 'SCHEDULED', startTime: { gte: start.toJSDate(), lt: end.toJSDate() } } }),
    ]);
    let remainingLessons = 0, deferred = new Prisma.Decimal(0);
    for (const m of memberships) {
      if (m.totalPrice == null) throw new ConflictException('Есть абонементы без стоимости. Заполните стоимость перед закрытием');
      const used = m.revenueRecognitions.reduce((n, row) => n + (row.type === 'REVENUE_RECOGNITION' ? 1 : -1), 0);
      remainingLessons += Math.max(0, m.totalLessons - used);
      const recognized = m.revenueRecognitions.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
      deferred = deferred.plus(Prisma.Decimal.max(0, m.totalPrice.minus(recognized)));
    }
    return { type: dto.type, periodStart: start.toISO()!, periodEnd: end.toISO()!, isClosed: !!monthlyClosed,
      cashboxes: boxes.map(row => ({ cashbox: row.cashbox, opening: row.opening.toFixed(2), income: row.income.toFixed(2), expense: row.expense.toFixed(2),
        closing: row.opening.plus(row.income).minus(row.expense).toFixed(2), oneOff: row.oneOff.toFixed(2), memberships: row.memberships.toFixed(2), other: row.other.toFixed(2) })),
      memberships: { recognizedRevenue: (revenue._sum.amount ?? new Prisma.Decimal(0)).toFixed(2), remainingLessons, deferred: deferred.toFixed(2) },
      warnings: pending ? [`Не отмечены занятия: ${pending} шт. Проверьте их перед закрытием.`] : [], pendingLessons: pending };
  }
  preview(dto: PeriodClosingDto) {
    return this.prisma.$transaction(tx => this.calculate(tx, dto), { isolationLevel: 'RepeatableRead' });
  }
  async close(dto: PeriodClosingDto, actor: { id: string; email: string }) {
    const { start, end } = closingRange(dto);
    if (end > DateTime.now().setZone(zone)) throw new BadRequestException('Закрыть можно только завершённый день или месяц по Москве');
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(6842026)::text`;
          const snapshot = await this.calculate(tx, dto);
          if (snapshot.isClosed) throw new ConflictException('Период уже закрыт');
          if (Number(snapshot.pendingLessons) > 0) throw new ConflictException('Отметьте все занятия перед закрытием периода');
          if (dto.type === 'MONTH') await this.monthly.closeInTransaction(tx, { year: start.year, month: start.month }, actor.id);
          await tx.cashShift.updateMany({ where: { archivedAt: null, closedAt: null, openedAt: { lt: end.toJSDate() } }, data: { closedAt: end.toJSDate() } });
          const json = JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject;
          const row = await tx.financialPeriodClosing.create({ data: { type: dto.type, periodStart: start.toJSDate(), periodEnd: end.toJSDate(), snapshot: json, closedById: actor.id } });
          await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'FINANCIAL_PERIOD_CLOSED', actorId: actor.id, actorName: actor.email,
            details: { closingId: row.id, type: dto.type, periodStart: start.toISO(), periodEnd: end.toISO(), snapshot: json } } });
          return { ...snapshot, isClosed: true, closedAt: row.closedAt.toISOString() };
        }, { isolationLevel: 'Serializable', timeout: 20000 });
      } catch (error) {
        if (isSerializationFailure(error) && attempt < 4) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Период уже закрыт');
        throw error;
      }
    }
  }
}
