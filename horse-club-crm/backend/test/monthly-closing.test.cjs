const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { membershipLessonPrice, membershipDeferred } = require('../dist/payments/accrual.math');
const { MonthlyClosingService } = require('../dist/payments/monthly-closing.service');
const { MonthlyClosingDto } = require('../dist/payments/dto/monthly-closing.dto');
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
});

function fixture({ missingPrice = false, fail = false } = {}) {
  let saved, extended, calls = 0;
  const queries = [];
  const memberships = [{ id: 'membership', remaining: 3, totalLessons: 8, totalPrice: missingPrice ? null : decimal(8000), pricePerLesson: decimal(1000) }];
  const tx = {
    $queryRaw: async (sql, ...values) => { queries.push({ sql: sql.join(''), values }); return sql.join('').includes('FROM "Membership"') ? memberships : []; },
    monthlyFinancialClosing: {
      findUnique: async () => saved, findFirst: async () => null,
      create: async ({ data }) => { if (fail) throw new Error('snapshot failed'); return saved = { id: 'closing', closedAt: new Date(), ...data }; },
    },
    payment: { aggregate: async query => { queries.push(query); return { _sum: { amount: decimal(8000) } }; } },
    expense: { aggregate: async () => ({ _sum: { amount: decimal(500) } }) },
    revenueRecognition: { aggregate: async () => ({ _sum: { amount: decimal(5000) } }) },
    booking: { count: async () => 0 },
    membership: { updateMany: async query => { extended = query; return { count: 1 }; } },
  };
  const service = new MonthlyClosingService({ $transaction: async work => {
    calls++; const before = extended;
    try { return await work(tx); } catch (error) { extended = before; throw error; }
  } });
  return { service, state: () => ({ saved, extended, calls, queries }) };
}

test('closing snapshots cash, earned revenue and advances separately; retry returns same snapshot', async () => {
  const h = fixture(), period = { year: 2026, month: 9 };
  const preview = await h.service.status(period);
  assert.equal(preview.isClosed, false);
  assert.equal(preview.cashFlowIncome.toString(), '8000');
  assert.equal(preview.recognizedRevenue.toString(), '5000');
  assert.equal(preview.deferredRevenueCarriedOver.toString(), '3000');
  assert.equal(h.state().extended, undefined);
  const closed = await h.service.close(period, 'admin');
  assert.equal(closed.closedById, 'admin'); assert.equal(closed.activeMembershipsCarriedOver, 1);
  assert.equal(h.state().extended.data.status, 'active');
  assert.equal(h.state().extended.data.validUntil.getTime(), h.state().extended.data.validTo.getTime());
  assert.equal((await h.service.close(period, 'admin')).id, closed.id);
  assert.equal((await h.service.status(period)).isClosed, true);
  const cashQuery = h.state().queries.find(q => q.where?.operationType === 'INCOME');
  assert.equal(cashQuery.where.OR[0].paidAt.gte.toISOString(), '2026-08-31T21:00:00.000Z');
  assert.equal(cashQuery.where.OR[0].paidAt.lt.toISOString(), '2026-09-30T21:00:00.000Z');
});

test('future closing, unknown legacy value and failed snapshot cannot silently close a month', async () => {
  await assert.rejects(fixture().service.close({ year: 2099, month: 1 }, 'admin'), { status: 400 });
  await assert.rejects(fixture({ missingPrice: true }).service.close({ year: 2026, month: 9 }, 'admin'), { status: 409 });
  const h = fixture({ fail: true });
  await assert.rejects(h.service.close({ year: 2026, month: 9 }, 'admin'), /snapshot failed/);
  assert.equal(h.state().saved, undefined); assert.equal(h.state().extended, undefined);
});
