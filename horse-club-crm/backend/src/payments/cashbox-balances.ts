import { Prisma } from '@prisma/client';

// Same ledger boundary as currentCashBalance; ordinary expenses belong to MAIN,
// boarding refunds follow their original receipt. Never read a divergent DB view.
export async function cashboxBalances(tx: Prisma.TransactionClient, asOf: Date) {
  const rows = await tx.$queryRaw<Array<{ cashbox: string; balance: Prisma.Decimal; count: bigint }>>`
    WITH movements AS (
      SELECT CASE WHEN "boardingContractId" IS NULL THEN 'MAIN' ELSE 'BOARDING' END AS cashbox, amount
      FROM "Payment" WHERE status = 'PAID' AND "archivedAt" IS NULL AND COALESCE("paidAt", "createdAt") < ${asOf}
      UNION ALL
      SELECT CASE WHEN p."boardingContractId" IS NULL THEN 'MAIN' ELSE 'BOARDING' END, -e.amount
      FROM "Expense" e LEFT JOIN "Payment" p ON p.id = e."refundPaymentId"
      WHERE e."archivedAt" IS NULL AND e."cancelledAt" IS NULL AND e.date < ${asOf}
    ) SELECT cashbox, SUM(amount) AS balance, COUNT(*) AS count FROM movements GROUP BY cashbox`;
  const main = rows.find(row => row.cashbox === 'MAIN'), boarding = rows.find(row => row.cashbox === 'BOARDING');
  return { mainBalance: new Prisma.Decimal(main?.balance ?? 0).toFixed(2), boardingBalance: new Prisma.Decimal(boarding?.balance ?? 0).toFixed(2),
    mainOperationsCount: Number(main?.count ?? 0), boardingOperationsCount: Number(boarding?.count ?? 0) };
}
