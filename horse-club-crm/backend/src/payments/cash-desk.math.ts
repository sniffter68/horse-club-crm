import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function calculateCashChange(amount: number | string, given?: number | string) {
  const cost = new Prisma.Decimal(amount);
  if (!cost.isFinite() || cost.lte(0) || cost.decimalPlaces() > 2) throw new BadRequestException('Некорректная сумма платежа');
  if (given === undefined) return null;
  const cash = new Prisma.Decimal(given);
  if (!cash.isFinite() || cash.decimalPlaces() > 2 || cash.lt(cost)) throw new BadRequestException('Внесено меньше суммы чека');
  return cash.minus(cost);
}
export function aggregatePaymentMethods(groups: Array<{ method: string; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }>) {
  let totalCash = new Prisma.Decimal(0), totalCard = new Prisma.Decimal(0), totalUnspecified = new Prisma.Decimal(0), operationsCount = 0;
  for (const group of groups) {
    const amount = group._sum.amount ?? new Prisma.Decimal(0);
    if (group.method === 'CASH') totalCash = totalCash.plus(amount);
    else if (group.method === 'UNSPECIFIED') totalUnspecified = totalUnspecified.plus(amount);
    else totalCard = totalCard.plus(amount);
    operationsCount += group._count._all;
  }
  return { totalCash, totalCard, totalUnspecified, totalRevenue: totalCash.plus(totalCard).plus(totalUnspecified), operationsCount };
}
