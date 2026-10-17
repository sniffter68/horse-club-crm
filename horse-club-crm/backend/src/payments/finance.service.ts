import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { CreateExpenseDto, ExpenseQueryDto } from './dto/expense.dto';
import { CashSummaryQueryDto } from './dto/cash-desk.dto';
import { aggregatePaymentMethods } from './cash-desk.math';

// Date-only values are Moscow business days; timestamps must carry an explicit offset.
export function financeDate(value: string, endOfDay = false): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) throw new BadRequestException('Укажите часовой пояс даты');
  let parsed = DateTime.fromISO(value, { zone: 'Europe/Moscow' });
  if (!parsed.isValid) throw new BadRequestException('Некорректная дата');
  if (dateOnly && endOfDay) parsed = parsed.plus({ days: 1 });
  return parsed.toJSDate();
}
const author = { createdBy: { select: { id: true, email: true } } } satisfies Prisma.ExpenseInclude;
export function expenseTotals(groups: Array<{ paymentMethod: string; _sum: { amount: Prisma.Decimal | null } }>) {
  let cash = new Prisma.Decimal(0), card = new Prisma.Decimal(0);
  for (const row of groups) {
    if (row.paymentMethod === 'CASH') cash = cash.plus(row._sum.amount ?? 0);
    else card = card.plus(row._sum.amount ?? 0);
  }
  return { cash, card, total: cash.plus(card) };
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}
  private async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: 'Serializable' }); }
      catch (error) { if (isSerializationFailure(error) && attempt < 4) continue; throw error; }
    }
  }
  create(dto: CreateExpenseDto, createdById: string) {
    const date = dto.date ? financeDate(dto.date) : new Date();
    if (date > new Date()) throw new BadRequestException('Дата расхода не может быть в будущем');
    return this.atomic(async tx => {
      if (dto.requestId) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.requestId}, 0))::text`;
        const existing = await tx.expense.findUnique({ where: { requestId: dto.requestId }, include: author });
        if (existing) {
          if (existing.createdById !== createdById || !existing.amount.equals(dto.amount) || existing.paymentMethod !== dto.paymentMethod
            || existing.category !== dto.category || existing.description !== dto.description.trim()
            || existing.receiptUrl !== (dto.receiptUrl ?? null) || (dto.date && existing.date.getTime() !== date.getTime())) {
            throw new ConflictException('Ключ операции уже использован для другого расхода');
          }
          return existing;
        }
      }
      const shift = await tx.cashShift.findFirst({ where: { cashierId: createdById, closedAt: null, openedAt: { lte: date } } });
      return tx.expense.create({ data: { ...dto, date, description: dto.description.trim(), createdById, shiftId: shift?.id }, include: author });
    });
  }
  private range(from?: string, to?: string) {
    const gte = from ? financeDate(from) : undefined, lt = to ? financeDate(to, true) : undefined;
    if (gte && lt && gte >= lt) throw new BadRequestException('Начало периода должно быть раньше конца');
    return { gte, lt };
  }
  list(query: ExpenseQueryDto) {
    const where: Prisma.ExpenseWhereInput = { cancelledAt: null, date: this.range(query.from, query.to), paymentMethod: query.paymentMethod, category: query.category, shiftId: query.shiftId };
    return this.prisma.$transaction(async tx => ({
      data: await tx.expense.findMany({ where, include: author, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      total: await tx.expense.count({ where }), page: query.page, pageSize: query.pageSize,
    }), { isolationLevel: 'RepeatableRead' });
  }
  cancel(id: string, user: { id: string; role: Role }) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Отмена расхода доступна только администратору');
    return this.atomic(async tx => {
      const existing = await tx.expense.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Расход не найден');
      if (existing.cancelledAt) return existing;
      return tx.expense.update({ where: { id }, data: { cancelledAt: new Date(), cancelledById: user.id } });
    });
  }
  summary(query: CashSummaryQueryDto) {
    const { gte, lt } = this.range(query.from, query.to);
    const paymentWhere = (start?: Date): Prisma.PaymentWhereInput => ({ status: 'PAID',
      OR: [{ paidAt: { gte: start, lt } }, { paidAt: null, createdAt: { gte: start, lt } }],
      ...(query.cashierId ? { cashierId: query.cashierId } : {}), ...(query.shiftId ? { shiftId: query.shiftId } : {}),
    });
    const expenseWhere = (start?: Date): Prisma.ExpenseWhereInput => ({ cancelledAt: null, date: { gte: start, lt },
      ...(query.cashierId ? { createdById: query.cashierId } : {}), ...(query.shiftId ? { shiftId: query.shiftId } : {}),
    });
    return this.prisma.$transaction(async tx => {
      const incomeGroups = await tx.payment.groupBy({ by: ['method'], where: paymentWhere(gte), _sum: { amount: true }, _count: { _all: true } });
      const expenseGroups = await tx.expense.groupBy({ by: ['paymentMethod'], where: expenseWhere(gte), _sum: { amount: true } });
      const allIncomeGroups = await tx.payment.groupBy({ by: ['method'], where: paymentWhere(), _sum: { amount: true }, _count: { _all: true } });
      const allExpenseGroups = await tx.expense.groupBy({ by: ['paymentMethod'], where: expenseWhere(), _sum: { amount: true } });
      const income = aggregatePaymentMethods(incomeGroups), expenses = expenseTotals(expenseGroups);
      const allIncome = aggregatePaymentMethods(allIncomeGroups), allExpenses = expenseTotals(allExpenseGroups);
      const balanceCash = allIncome.totalCash.minus(allExpenses.cash), balanceCard = allIncome.totalCard.minus(allExpenses.card);
      const operations = await tx.payment.findMany({ where: paymentWhere(gte), include: {
        client: { select: { id: true, name: true, firstName: true, lastName: true, phone: true } }, cashier: { select: { id: true, email: true } }, service: true,
        booking: { include: { lesson: { include: { service: true } } } }, membership: { include: { pricingPlan: true } },
      }, orderBy: [{ paidAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { ...income, totalExpensesCash: expenses.cash, totalExpensesCard: expenses.card, totalExpenses: expenses.total,
        netCash: income.totalCash.minus(expenses.cash), netCard: income.totalCard.minus(expenses.card), netTotal: income.totalRevenue.minus(expenses.total),
        balanceCash, balanceCard, balanceUnspecified: allIncome.totalUnspecified, balanceTotal: allIncome.totalRevenue.minus(allExpenses.total),
        operations, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
