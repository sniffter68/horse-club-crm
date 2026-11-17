require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { statementPeriod, TrainerPayoutService } = require('../dist/staff/trainer-payout.service');
const { closingRange, PeriodClosingService } = require('../dist/payments/period-closing.service');
const d = value => new Prisma.Decimal(value);
const actor = { id: 'actor', email: 'admin@test' };

test('Moscow defaults: advance 1–15, final full month, invalid and cross-month ranges rejected', () => {
  const advance = statementPeriod({ type: 'ADVANCE', month: '2026-10' });
  assert.equal(advance.start.toISOString(), '2026-09-30T21:00:00.000Z');
  assert.equal(advance.end.toISOString(), '2026-10-15T21:00:00.000Z');
  assert.equal(statementPeriod({ type: 'FINAL_SALARY', month: '2026-02' }).periodEnd.toISOString().slice(0, 10), '2026-02-28');
  for (const dto of [{ type: 'ADVANCE', month: '2026-02', periodEnd: '2026-02-30' }, { type: 'ADVANCE', month: '2026-02', periodEnd: '2026-03-01' }, { type: 'FINAL_SALARY', month: '2026-02', periodEnd: '2026-02-15' }]) assert.throws(() => statementPeriod(dto));
  assert.equal(closingRange({ type: 'SHIFT', date: '2026-10-01' }).end.toISO(), '2026-10-02T00:00:00.000+03:00');
});

function payrollFixture() {
  let row, expenses = [], audit = [], paid = [], failAudit = false;
  const tx = {
    $queryRaw: async () => [],
    staffProfile: { findMany: async () => [{ id: 'staff' }], findUnique: async () => ({ user: { trainerId: 'trainer' } }) },
    payrollCalculation: { findFirst: async () => null },
    lesson: { findMany: async query => { assert.equal(query.where.status, 'COMPLETED'); return [
      { id: 'lesson', startTime: new Date('2026-10-02T07:00Z'), service: { name: 'Урок', price: d('1000.50') }, costAmount: d(100) },
    ]; } },
    trainerPayout: {
      findUnique: async () => row, findMany: async () => paid,
      upsert: async ({ create }) => row = { id: 'statement', status: 'DRAFT', staff: { fullName: 'Тренер' }, ...create },
      update: async ({ data }) => { row = { ...row, ...data }; if (row.status === 'PAID') paid = [row]; return row; },
    },
    expense: { create: async ({ data }) => { const expense = { id: 'expense', ...data }; expenses.push(expense); return expense; } },
    cashAuditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit failed'); audit.push(data); return data; } },
  };
  const service = new TrainerPayoutService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); const before = { row, expenses: [...expenses], audit: [...audit], paid: [...paid] };
    try { return await work(tx); } catch (error) { ({ row, expenses, audit, paid } = before); throw error; }
  } });
  return { service, state: () => ({ row, expenses, audit }), fail: () => { failAudit = true; }, setPaid: rows => { paid = rows; } };
}

test('advance uses 30% nominal ignoring discount; approval and payout are atomic, MAIN salary and idempotent', async () => {
  const f = payrollFixture();
  const [row] = await f.service.generate({ type: 'ADVANCE', month: '2026-10' }, actor);
  assert.equal(row.accrued.toFixed(2), '300.15'); assert.equal(row.nominalBase.toFixed(2), '1000.50');
  await assert.rejects(() => f.service.transition(row.id, true, actor), /Сначала утвердите/);
  await f.service.transition(row.id, false, actor);
  const paid = await f.service.transition(row.id, true, actor);
  assert.equal(paid.status, 'PAID'); assert.equal(paid.expenseId, 'expense');
  const expense = f.state().expenses[0];
  assert.equal(expense.category, 'SALARY'); assert.equal(expense.refundPaymentId, undefined);
  assert.equal(expense.amount.toFixed(2), '300.15'); assert.equal(expense.createdById, actor.id);
  assert.equal(f.state().audit.at(-1).details.cashbox, 'MAIN');
  await f.service.transition(row.id, true, actor); assert.equal(f.state().expenses.length, 1);
});

test('final subtracts only paid advances; audit failure rolls expense and paid state back', async () => {
  const f = payrollFixture(); f.setPaid([{ type: 'ADVANCE', totalAmount: d('100.05') }]);
  const [row] = await f.service.generate({ type: 'FINAL_SALARY', month: '2026-10' }, actor);
  assert.equal(row.advanceDeducted.toFixed(2), '100.05'); assert.equal(row.totalAmount.toFixed(2), '200.10');
  await f.service.transition(row.id, false, actor); f.fail();
  await assert.rejects(() => f.service.transition(row.id, true, actor), /audit failed/);
  assert.equal(f.state().expenses.length, 0); assert.equal(f.state().row.status, 'APPROVED');
});

test('negative final settlement is rejected; changed advances invalidate approved final', async () => {
  const f = payrollFixture(); f.setPaid([{ type: 'ADVANCE', totalAmount: d(500) }]);
  await assert.rejects(() => f.service.generate({ type: 'FINAL_SALARY', month: '2026-10' }, actor), /превышают/);
  f.setPaid([]); const [row] = await f.service.generate({ type: 'FINAL_SALARY', month: '2026-10' }, actor);
  await f.service.transition(row.id, false, actor); f.setPaid([{ type: 'ADVANCE', totalAmount: d(100) }]);
  await assert.rejects(() => f.service.transition(row.id, true, actor), /Начисления изменились/);
  assert.equal(f.state().expenses.length, 0);
});

test('closing reconciliation separates both cashboxes, freezes snapshot and rejects incomplete/future days', async () => {
  let saved, pending = 0, audit = [];
  const tx = {
    financialPeriodClosing: { findUnique: async () => saved, create: async ({ data }) => saved = { id: 'closing', closedAt: new Date(), ...data } },
    monthlyFinancialClosing: { findUnique: async () => null },
    $queryRaw: async sql => sql.join('').includes('WITH movements') ? ['MAIN', 'BOARDING'].map(cashbox => ({ cashbox, opening: d(1000), income: d(500), expense: d(cashbox === 'MAIN' ? 300 : 50), oneOff: d(200), memberships: d(200), other: d(100) })) : [],
    revenueRecognition: { aggregate: async () => ({ _sum: { amount: d(200) } }) },
    membership: { findMany: async () => [{ totalPrice: d(1000), totalLessons: 5, revenueRecognitions: [{ type: 'REVENUE_RECOGNITION', amount: d(200) }] }] },
    lesson: { count: async () => pending },
    cashShift: { updateMany: async () => ({ count: 0 }) },
    cashAuditLog: { create: async ({ data }) => { audit.push(data); } },
  };
  const service = new PeriodClosingService({ $transaction: work => work(tx) }, {});
  const dto = { type: 'SHIFT', date: '2026-10-01' };
  const preview = await service.preview(dto);
  assert.equal(preview.cashboxes[0].closing, '1200.00'); assert.equal(preview.cashboxes[1].closing, '1450.00');
  assert.equal(preview.memberships.deferred, '800.00'); assert.equal(preview.memberships.remainingLessons, 4);
  pending = 1; await assert.rejects(() => service.close(dto, actor), /Отметьте/); assert.equal(saved, undefined);
  pending = 0; const closed = await service.close(dto, actor); assert.equal(closed.isClosed, true); assert.equal(audit.length, 1);
  assert.equal((await service.preview(dto)).isClosed, true);
  await assert.rejects(() => service.close(dto, actor), /уже закрыт/);
  await assert.rejects(() => service.close({ type: 'SHIFT', date: '2099-01-01' }, actor), /завершённый/);
});
