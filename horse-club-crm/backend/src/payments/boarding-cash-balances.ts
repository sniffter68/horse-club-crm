import { Prisma } from '@prisma/client';

export async function boardingCashBalances(tx: Prisma.TransactionClient, asOf = new Date()) {
  const [income, expenses] = await Promise.all([
    tx.payment.groupBy({ by: ['method'], where: { boardingContractId: { not: null }, archivedAt: null, status: 'PAID',
      OR: [{ paidAt: { lte: asOf } }, { paidAt: null, createdAt: { lte: asOf } }] }, _sum: { amount: true } }),
    tx.expense.groupBy({ by: ['paymentMethod'], where: { archivedAt: null, cancelledAt: null, date: { lte: asOf },
      OR: [{ cashboxType: 'BOARDING' }, { refundPayment: { boardingContractId: { not: null } } }] }, _sum: { amount: true } }),
  ]);
  let cash = new Prisma.Decimal(0), bank = new Prisma.Decimal(0), unspecified = new Prisma.Decimal(0);
  for (const row of income) {
    if (row.method === 'CASH') cash = cash.plus(row._sum.amount ?? 0);
    else if (row.method === 'UNSPECIFIED') unspecified = unspecified.plus(row._sum.amount ?? 0);
    else bank = bank.plus(row._sum.amount ?? 0);
  }
  for (const row of expenses) {
    if (row.paymentMethod === 'CASH') cash = cash.minus(row._sum.amount ?? 0);
    else bank = bank.minus(row._sum.amount ?? 0);
  }
  return { cash, bank, unspecified, total: cash.plus(bank).plus(unspecified) };
}
