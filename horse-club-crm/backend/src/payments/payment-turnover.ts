import { Prisma } from '@prisma/client';
import type { CashSummaryQueryDto } from './dto/cash-desk.dto';
import { aggregatePaymentMethods } from './cash-desk.math';

const paymentInclude = {
  client: { select: { id: true, name: true, firstName: true, lastName: true, phone: true } },
  cashier: { select: { id: true, email: true } }, service: true,
  booking: { include: { lesson: { include: { service: true } } } },
  membership: { include: { pricingPlan: true } },
} satisfies Prisma.PaymentInclude;

// Both summary endpoints use the same date expression, filters and stable ordering.
// The caller owns the RepeatableRead transaction, including relation hydration.
export async function paymentTurnover(tx: Prisma.TransactionClient, query: CashSummaryQueryDto, range: { gte?: Date; lt?: Date }) {
  const effectiveDate = query.dateBasis === 'payment'
    ? Prisma.sql`COALESCE(p."paidAt", p."createdAt")`
    : Prisma.sql`CASE
        WHEN p."bookingId" IS NOT NULL THEN COALESCE(l."startTime", b."startTime", p."paidAt", p."createdAt")
        WHEN p."membershipId" IS NOT NULL THEN COALESCE(m."validFrom", m."createdAt", p."paidAt", p."createdAt")
        ELSE COALESCE(p."paidAt", p."createdAt") END`;
  const filtered = Prisma.sql`WITH dated AS (
    SELECT p.id, p.method, p.amount, ${effectiveDate} AS at
    FROM "Payment" p
    LEFT JOIN "Booking" b ON b.id = p."bookingId"
    LEFT JOIN "Lesson" l ON l.id = b."lessonId"
    LEFT JOIN "Membership" m ON m.id = p."membershipId"
    WHERE p.status = 'PAID' AND p."archivedAt" IS NULL
      ${query.cashierId ? Prisma.sql`AND p."cashierId" = ${query.cashierId}::uuid` : Prisma.empty}
      ${query.shiftId ? Prisma.sql`AND p."shiftId" = ${query.shiftId}::uuid` : Prisma.empty}
  ), filtered AS (SELECT * FROM dated WHERE TRUE
    ${range.gte ? Prisma.sql`AND at >= ${range.gte}` : Prisma.empty}
    ${range.lt ? Prisma.sql`AND at < ${range.lt}` : Prisma.empty})`;
  const groups = await tx.$queryRaw<Array<{ method: string; amount: Prisma.Decimal; count: number }>>(
    Prisma.sql`${filtered} SELECT method, SUM(amount) AS amount, COUNT(*)::int AS count FROM filtered GROUP BY method`,
  );
  const ids = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`${filtered} SELECT id FROM filtered ORDER BY at DESC, id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
  );
  const payments = ids.length ? await tx.payment.findMany({ where: { id: { in: ids.map(row => row.id) } }, include: paymentInclude }) : [];
  const positions = new Map(ids.map((row, index) => [row.id, index]));
  const operations = payments.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
  return { ...aggregatePaymentMethods(groups.map(row => ({ method: row.method, _sum: { amount: row.amount }, _count: { _all: row.count } }))), operations };
}
