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

function payrollFixture(initialRate = 30, scheme = {}) {
  let row, expenses = [], audit = [], paid = [], failAudit = false;
  let commissionPercent = initialRate;
  let extraLessons = [];
  const tx = {
    $queryRaw: async () => [],
    trainer: { findMany: async query => { assert.equal(query.where.isActive, true); assert.equal(query.where.lessons.some.status, 'COMPLETED'); return [{ id: 'trainer', commissionPercent: d(commissionPercent), ...scheme }]; } },
    payrollCalculation: { findFirst: async () => null },
    lesson: { findMany: async query => { assert.equal(query.where.status, 'COMPLETED'); assert.equal(query.where.trainerId, 'trainer'); assert.equal(query.where.deletedAt, null); assert.equal(query.where.bookings, undefined); return [
      { id: 'lesson', startTime: new Date('2026-10-02T07:00Z'), service: { name: 'Урок', price: d('1000.50') }, costAmount: d(100) }, ...extraLessons,
    ]; } },
    trainerPayout: {
      findFirst: async () => null,
      findUnique: async ({ where }) => where.trainerId_type_periodStart_periodEnd && row?.type !== where.trainerId_type_periodStart_periodEnd.type ? undefined : row, findMany: async () => paid,
      upsert: async ({ create }) => row = { id: 'statement', status: 'DRAFT', trainer: { name: 'Тренер' }, staff: null, ...create },
      update: async ({ data }) => { row = { ...row, ...data }; if (row.status === 'PAID') paid = [row]; return row; },
    },
    expense: { create: async ({ data }) => { const expense = { id: 'expense', ...data }; expenses.push(expense); return expense; } },
    cashAuditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit failed'); audit.push(data); return data; } },
  };
  const service = new TrainerPayoutService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); const before = { row, expenses: [...expenses], audit: [...audit], paid: [...paid] };
    try { return await work(tx); } catch (error) { ({ row, expenses, audit, paid } = before); throw error; }
  } });
  return { service, state: () => ({ row, expenses, audit }), fail: () => { failAudit = true; }, setPaid: rows => { paid = rows; }, setRate: value => { commissionPercent = value; }, setExtraLessons: rows => { extraLessons = rows; } };
}

test('individual 0/30/100/fractional commissions use nominal price and freeze approved/paid snapshots', async () => {
  for (const [rate, expected] of [[0, '0.00'], [30, '300.15'], [100, '1000.50'], [33.33, '333.47']]) {
    const f = payrollFixture(rate);
    const dto = { type: 'ADVANCE', month: '2026-10' };
    const [row] = await f.service.generate(dto, actor);
    assert.equal(row.accrued.toFixed(2), expected);
    assert.equal(row.lessonBreakdown[0].commissionPercent, rate);
    await f.service.transition(row.id, false, actor);
    f.setRate(50);
    const [again] = await f.service.generate(dto, actor);
    assert.equal(again.status, 'APPROVED');
    assert.deepEqual(again.lessonBreakdown, row.lessonBreakdown);
    const paid = await f.service.transition(row.id, true, actor);
    assert.equal(paid.accrued.toFixed(2), expected);
    const [stillPaid] = await f.service.generate(dto, actor);
    assert.deepEqual(stillPaid, paid);
  }
});

test('final retains the paid advance nominal amount and rate after a commission change', async () => {
  const f = payrollFixture(100);
  const [advance] = await f.service.generate({ type: 'ADVANCE', month: '2026-10' }, actor);
  await f.service.transition(advance.id, false, actor);
  await f.service.transition(advance.id, true, actor);
  f.setRate(0);
  f.setPaid([{ ...advance, type: 'ADVANCE', status: 'PAID' }]);
  const [final] = await f.service.generate({ type: 'FINAL_SALARY', month: '2026-10' }, actor);
  assert.equal(final.totalAmount.toFixed(2), '0.00');
  assert.equal(final.lessonBreakdown[0].commissionPercent, 100);
  assert.equal(final.accrued.toFixed(2), '1000.50');
});

test('historical 30% statement without per-line commission can still be approved and paid', async () => {
  const f = payrollFixture();
  const [row] = await f.service.generate({ type: 'ADVANCE', month: '2026-10' }, actor);
  delete row.lessonBreakdown[0].commissionPercent;
  await f.service.transition(row.id, false, actor);
  f.setRate(100);
  const paid = await f.service.transition(row.id, true, actor);
  assert.equal(paid.totalAmount.toFixed(2), '300.15');
  assert.equal(paid.lessonBreakdown[0].commissionPercent, undefined);
});

test('advance uses 30% nominal ignoring discount; approval and payout are atomic, MAIN salary and idempotent', async () => {
  const f = payrollFixture();
  const [row] = await f.service.generate({ type: 'ADVANCE', month: '2026-10' }, actor);
  assert.equal(row.accrued.toFixed(2), '300.15'); assert.equal(row.nominalBase.toFixed(2), '1000.50');
  assert.equal(row.trainerId, 'trainer'); assert.equal(row.staffId, undefined);
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


test('fixed and club schemes calculate real statements and freeze their approval snapshots', async () => {
  for (const [scheme, expected] of [[{ payScheme: 'FIXED', fixedPay: d(750) }, '750.00'], [{ payScheme: 'CLUB' }, '300.15']]) {
    const f = payrollFixture(99, scheme);
    const [row] = await f.service.generate({ type: 'ADVANCE', month: '2026-10' }, actor);
    assert.equal(row.totalAmount.toFixed(2), expected);
    assert.equal(row.lessonBreakdown[0].payScheme, scheme.payScheme);
    await f.service.transition(row.id, false, actor);
    f.setRate(1);
    const paid = await f.service.transition(row.id, true, actor);
    assert.equal(paid.totalAmount.toFixed(2), expected);
  }
});

test('legacy payroll uses exclusive schemes without adding historical lesson bonuses', () => {
  const { payrollAmounts } = require('../dist/staff/staff.service');
  const profile = { shiftRate: d(100), lessonRate: d(500), groupLessonRate: d(900) };
  const lesson = { service: { price: d(2000) }, bookings: [], trainer: { commissionPercent: d(40) } };
  assert.equal(payrollAmounts(1, profile, [lesson]).totalAmount.toNumber(), 1400);
  assert.equal(payrollAmounts(1, profile, [{ ...lesson, trainer: { ...lesson.trainer, payScheme: 'PERCENT' } }]).totalAmount.toNumber(), 900);
  assert.equal(payrollAmounts(1, profile, [{ ...lesson, trainer: { ...lesson.trainer, payScheme: 'FIXED', fixedPay: d(700) } }]).totalAmount.toNumber(), 800);
});


test('final with a fixed paid advance and a new percentage rate approves using its own rate snapshot', async () => {
  const scheme = { payScheme: 'FIXED', fixedPay: d(750) };
  const f = payrollFixture(30, scheme);
  const [advance] = await f.service.generate({ type: 'ADVANCE', month: '2026-10' }, actor);
  await f.service.transition(advance.id, false, actor);
  await f.service.transition(advance.id, true, actor);
  scheme.payScheme = 'PERCENT'; f.setRate(20);
  f.setExtraLessons([{ id: 'second', startTime: new Date('2026-10-20T07:00Z'), service: { name: 'Second', price: d('1000.50') } }]);
  const [final] = await f.service.generate({ type: 'FINAL_SALARY', month: '2026-10' }, actor);
  assert.equal(final.totalAmount.toFixed(2), '200.10');
  assert.equal(final.lessonBreakdown[0].payScheme, 'FIXED');
  assert.equal(final.lessonBreakdown[1].payScheme, 'PERCENT');
  await f.service.transition(final.id, false, actor);
});
