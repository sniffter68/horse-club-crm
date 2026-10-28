const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { membershipLessonPrice, membershipDeferred } = require('../dist/payments/accrual.math');
const { MonthlyClosingService } = require('../dist/payments/monthly-closing.service');
const { MonthlyClosingDto, ConfirmMonthlyClosingDto } = require('../dist/payments/dto/monthly-closing.dto');
const decimal = value => new Prisma.Decimal(value);

test('discounted sale price and deferred money use Decimal arithmetic', () => {
  assert.equal(membershipLessonPrice('9500.25', 8).toFixed(2), '1187.53');
  assert.equal(membershipLessonPrice('100', 3).toFixed(2), '33.33');
  assert.equal(membershipDeferred('8000', '1000', 3).toFixed(2), '3000.00');
  assert.equal(membershipDeferred('0.02', '0.01', 3).toFixed(2), '0.02');
  assert.equal(membershipDeferred('8000', '1000', 0).toFixed(2), '0.00');
  assert.equal(membershipDeferred('100', '33.33', 3, 3).toFixed(2), '100.00');
  assert.equal(membershipDeferred('100', '33.33', 2, 3).toFixed(2), '66.66');
  for (const count of [0, -1, 1.5]) assert.throws(() => membershipLessonPrice(100, count));
});

test('monthly query transforms numbers and rejects fractional/out-of-range periods', () => {
  const valid = plainToInstance(MonthlyClosingDto, { year: '2026', month: '9' });
  assert.equal(valid.month, 9); assert.equal(validateSync(valid).length, 0);
  for (const month of ['0', '13', '1.5', 'bad', '']) {
    assert.ok(validateSync(plainToInstance(MonthlyClosingDto, { year: '2026', month })).length);
  }
  assert.equal(validateSync(plainToInstance(ConfirmMonthlyClosingDto, { year: 2026, month: 9, notes: 'Сверено' })).length, 0);
  for (const notes of [123, 'x'.repeat(2001)]) {
    assert.ok(validateSync(plainToInstance(ConfirmMonthlyClosingDto, { year: 2026, month: 9, notes })).length);
  }
});

function fixture({ missingPrice = false, fail = false, failOpening = false, zero = false } = {}) {
  let saved, extended, openings = [], calls = 0;
  const queries = [];
  const memberships = zero ? [] : [{ id: 'membership', clientId: 'client', client: { name: 'Анна Орлова' }, title: '8 занятий', remainedLessons: 3, totalLessons: 8, totalPrice: missingPrice ? null : decimal(8000), pricePerLesson: decimal(1000) }];
  const tx = {
    $queryRaw: async (sql, ...values) => { queries.push({ sql: sql.join(''), values }); return []; },
    monthlyFinancialClosing: {
      findUnique: async ({ where }) => saved?.year === where.year_month.year && saved?.month === where.year_month.month ? saved : null, findFirst: async () => null,
      create: async ({ data }) => { if (fail) throw new Error('snapshot failed'); return saved = { id: 'closing', closedAt: new Date(), ...data }; },
    },
    openingBalance: {
      findUnique: async ({ where }) => openings.find(row => row.year === where.year_month.year && row.month === where.year_month.month) ?? null,
      upsert: async query => {
        queries.push(query);
        if (failOpening) throw new Error('opening failed');
        const existing = openings.find(row => row.year === query.where.year_month.year && row.month === query.where.year_month.month);
        if (existing) Object.assign(existing, query.update);
        else openings.push(query.create);
      },
    },
    payment: {
      aggregate: async query => { queries.push(query); return { _sum: { amount: zero ? null : decimal(8000) } }; },
      groupBy: async query => { queries.push(query); return zero ? [] : [{ method: 'CASH', _sum: { amount: decimal(9000) }, _count: { _all: 2 } },
        { method: 'CARD', _sum: { amount: decimal(2000) }, _count: { _all: 1 } }]; },
    },
    expense: { aggregate: async () => ({ _sum: { amount: zero ? null : decimal(500) } }),
      groupBy: async query => { queries.push(query); return zero ? [] : [{ paymentMethod: 'CASH', _sum: { amount: decimal(500) } }]; } },
    revenueRecognition: { aggregate: async () => ({ _sum: { amount: zero ? null : decimal(5000) } }) },
    booking: { count: async () => 0 },
    membership: { findMany: async query => { queries.push(query); return memberships; }, updateMany: async query => { extended = query; return { count: 1 }; } },
  };
  const service = new MonthlyClosingService({ $transaction: async work => {
    calls++; const before = { extended, saved, openings: openings.map(row => ({ ...row })) };
    try { return await work(tx); } catch (error) { extended = before.extended; saved = before.saved; openings = before.openings; throw error; }
  } });
  return { service, memberships, state: () => ({ saved, extended, openings, calls, queries }) };
}

test('preview calculates cash, revenue, expenses and per-client advances; confirm rejects duplicate', async () => {
  const h = fixture(), period = { year: 2026, month: 9 };
  const preview = await h.service.status(period);
  assert.equal(preview.isClosed, false);
  assert.equal(preview.cashFlowIncome.toString(), '8000');
  assert.equal(preview.recognizedRevenue.toString(), '5000');
  assert.equal(preview.deferredRevenueCarriedOver.toString(), '3000');
  assert.equal(preview.currentCashBalance.toString(), '10500');
  assert.equal(preview.expenses.toString(), '500');
  assert.deepEqual(preview.membershipsAdvanceSummary.rows, [{ membershipId: 'membership', clientId: 'client',
    clientName: 'Анна Орлова', membershipTitle: '8 занятий', remainingLessons: 3, pricePerLesson: '1000.00', amountToCarryOver: '3000.00' }]);
  assert.equal(preview.openingBalance, null);
  assert.equal(h.state().extended, undefined);
  const closed = await h.service.close({ ...period, notes: ' Проверено ' }, 'admin');
  assert.equal(closed.closedById, 'admin'); assert.equal(closed.activeMembershipsCarriedOver, 1);
  assert.equal(closed.status, 'CLOSED'); assert.equal(closed.notes, 'Проверено');
  assert.equal(h.state().extended.data.status, 'active');
  assert.equal(h.state().extended.data.validUntil.getTime(), h.state().extended.data.validTo.getTime());
  await assert.rejects(h.service.close(period, 'admin'), { status: 409 });
  assert.equal(h.state().openings.length, 1);
  assert.equal((await h.service.status(period)).isClosed, true);
  const cashQuery = h.state().queries.find(q => q.where?.operationType === 'INCOME');
  assert.equal(cashQuery.where.OR[0].paidAt.gte.toISOString(), '2026-08-31T21:00:00.000Z');
  assert.equal(cashQuery.where.OR[0].paidAt.lt.toISOString(), '2026-09-30T21:00:00.000Z');
  const balanceQuery = h.state().queries.find(q => q.by?.includes('method'));
  assert.ok(Math.abs(balanceQuery.where.OR[0].paidAt.lt.getTime() - Date.now()) < 5000);
  assert.equal(balanceQuery.where.OR[0].paidAt.gte, undefined);
  const membershipQuery = h.state().queries.find(q => q.where?.type === 'fixed_lessons');
  assert.equal(membershipQuery.where.status, 'active');
  assert.deepEqual(membershipQuery.where.remainedLessons, { gt: 0 });
  assert.equal(membershipQuery.where.cancelledAt, null);
  assert.equal(membershipQuery.where.deletedAt, null);
  const incoming = (await h.service.status({ year: 2026, month: 10 })).openingBalance;
  assert.equal(incoming.incomingCashBalance.toString(), '10500');
  assert.equal(incoming.incomingAdvanceBalance.toString(), '3000');
  assert.equal(incoming.closingId, closed.id);
});

test('future closing, unknown legacy value and failed snapshot cannot silently close a month', async () => {
  await assert.rejects(fixture().service.close({ year: 2099, month: 1 }, 'admin'), { status: 400 });
  await assert.rejects(fixture({ missingPrice: true }).service.close({ year: 2026, month: 9 }, 'admin'), { status: 409 });
  const h = fixture({ fail: true });
  await assert.rejects(h.service.close({ year: 2026, month: 9 }, 'admin'), /snapshot failed/);
  assert.equal(h.state().saved, undefined); assert.equal(h.state().extended, undefined);
});

test('failure to save opening balance rolls back closing and membership extension', async () => {
  const h = fixture({ failOpening: true });
  await assert.rejects(h.service.close({ year: 2026, month: 9 }, 'admin'), /opening failed/);
  assert.equal(h.state().saved, undefined); assert.equal(h.state().extended, undefined);
  assert.equal(h.state().openings.length, 0);
});

test('December carries zero balances to January of next year without creating payments', async () => {
  const h = fixture({ zero: true });
  const closed = await h.service.close({ year: 2025, month: 12 }, 'admin');
  assert.equal(closed.currentCashBalance.toString(), '0');
  assert.equal(closed.membershipsAdvanceSummary.totalAdvance.toString(), '0');
  assert.deepEqual(closed.membershipsAdvanceSummary.rows, []);
  const next = h.state().openings[0];
  assert.equal(next.year, 2026); assert.equal(next.month, 1);
  assert.equal(next.incomingCashBalance.toString(), '0');
  assert.equal(next.incomingAdvanceBalance.toString(), '0');
});

test('advance sums exact decimal lesson prices across memberships and closed preview stays immutable', async () => {
  const h = fixture();
  h.memberships[0].pricePerLesson = decimal('33.33');
  h.memberships[0].remainedLessons = 3;
  h.memberships.push({ ...h.memberships[0], id: 'second', pricePerLesson: decimal('10.25'), remainedLessons: 2 });
  const period = { year: 2026, month: 9 };
  const preview = await h.service.status(period);
  assert.equal(preview.membershipsAdvanceSummary.totalAdvance.toString(), '120.49');
  await h.service.close(period, 'admin');
  h.memberships[0].remainedLessons = 1;
  const closed = await h.service.status(period);
  assert.equal(closed.membershipsAdvanceSummary.totalAdvance.toString(), '120.49');
  assert.equal(closed.membershipsAdvanceSummary.rows[0].remainingLessons, 3);
});

test('existing next-month opening is replaced atomically rather than incremented', async () => {
  const h = fixture();
  h.state().openings.push({ year: 2026, month: 10, incomingCashBalance: decimal(100), incomingAdvanceBalance: decimal(200) });
  await h.service.close({ year: 2026, month: 9 }, 'admin');
  assert.equal(h.state().openings.length, 1);
  const opening = h.state().openings[0];
  assert.equal(opening.incomingCashBalance.toString(), '10500');
  assert.equal(opening.incomingAdvanceBalance.toString(), '3000');
});

test('concurrent unique conflict retries a fresh snapshot and reports already closed as 409', async () => {
  let attempts = 0;
  const service = new MonthlyClosingService({ $transaction: async work => {
    attempts++;
    if (attempts === 1) throw new Prisma.PrismaClientKnownRequestError('unique month', { code: 'P2002', clientVersion: '6.19.3' });
    return work({ $queryRaw: async () => [], monthlyFinancialClosing: { findUnique: async () => ({ id: 'other-closing' }) } });
  } });
  await assert.rejects(service.close({ year: 2026, month: 9 }, 'admin'), { status: 409 });
  assert.equal(attempts, 2);
});
