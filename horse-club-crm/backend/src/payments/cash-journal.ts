import { Prisma } from '@prisma/client';
import type { CashJournalQueryDto } from './dto/cash-desk.dto';

export interface CashJournalRow {
  id: string; kind: 'INCOME' | 'EXPENSE'; at: Date; amount: string; method: string;
  clientName: string | null; description: string | null; cashier: string | null;
}

export async function cashJournal(tx: Prisma.TransactionClient, query: CashJournalQueryDto, range: { gte?: Date; lt?: Date }) {
  const search = query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : null;
  const ledger = Prisma.sql`WITH movements AS (
    SELECT 'payment:' || p.id AS id, 'INCOME' AS kind, COALESCE(p."paidAt", p."createdAt") AS at,
      p.amount::text AS amount, p.method::text AS method, p."shiftId", p."cashierId" AS actor,
      CASE WHEN p."boardingContractId" IS NULL THEN 'MAIN' ELSE 'BOARDING' END AS cashbox, p."membershipId",
      COALESCE(NULLIF(c.name, ''), concat_ws(' ', c."lastName", c."firstName")) AS "clientName",
      COALESCE(p.notes, p.description, p."serviceType", s.title, 'Оплата услуги') AS description, u.email AS cashier
    FROM "Payment" p JOIN "Client" c ON c.id = p."clientId"
    LEFT JOIN "User" u ON u.id = p."cashierId" LEFT JOIN "Service" s ON s.id = p."serviceId"
    WHERE p.status = 'PAID' AND p."archivedAt" IS NULL
    UNION ALL
    SELECT 'expense:' || e.id, 'EXPENSE', e.date, e.amount::text, e."paymentMethod"::text, e."shiftId", e."createdById",
      CASE WHEN p."boardingContractId" IS NOT NULL THEN 'BOARDING' ELSE e."cashboxType" END, NULL AS "membershipId",
      COALESCE(NULLIF(c.name, ''), concat_ws(' ', c."lastName", c."firstName")), e.description, u.email
    FROM "Expense" e JOIN "User" u ON u.id = e."createdById"
    LEFT JOIN "Payment" p ON p.id = e."refundPaymentId" LEFT JOIN "Client" c ON c.id = p."clientId"
    WHERE e."archivedAt" IS NULL AND e."cancelledAt" IS NULL
  ), filtered AS (SELECT * FROM movements WHERE at >= ${range.gte} AND at < ${range.lt}
    ${query.cashboxType ? Prisma.sql`AND cashbox = ${query.cashboxType}` : Prisma.empty}
    ${query.shiftId ? Prisma.sql`AND "shiftId" = ${query.shiftId}::uuid` : Prisma.empty}
    ${query.cashierId ? Prisma.sql`AND actor = ${query.cashierId}::uuid` : Prisma.empty}
    ${query.operationType ? Prisma.sql`AND kind = ${query.operationType}` : Prisma.empty}
    ${query.source === 'MEMBERSHIP' ? Prisma.sql`AND kind = 'INCOME' AND "membershipId" IS NOT NULL` : Prisma.empty}
    ${query.paymentMethod === 'CASH' ? Prisma.sql`AND method = 'CASH'` : query.paymentMethod === 'BANK' ? Prisma.sql`AND method IN ('CARD', 'CARD_TERMINAL', 'SBP', 'TRANSFER')` : Prisma.empty}
    ${search ? Prisma.sql`AND ("clientName" ILIKE ${search} OR description ILIKE ${search})` : Prisma.empty})`;
  const [rows, counts] = await Promise.all([
    tx.$queryRaw<CashJournalRow[]>(Prisma.sql`${ledger} SELECT id, kind, at, amount, method, "clientName", description, cashier FROM filtered ORDER BY at DESC, id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`),
    tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`${ledger} SELECT COUNT(*) AS count FROM filtered`),
  ]);
  return { data: rows, total: Number(counts[0]?.count ?? 0), page: query.page, pageSize: query.pageSize };
}
