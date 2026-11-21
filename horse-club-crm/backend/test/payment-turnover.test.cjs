require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Prisma } = require('@prisma/client');
const { paymentTurnover } = require('../dist/payments/payment-turnover');
const { CashSummaryQueryDto } = require('../dist/payments/dto/cash-desk.dto');

test('date basis defaults to service, accepts both modes and rejects unsupported query values', async () => {
  const dates = { from: '2026-11-20T21:00:00Z', to: '2026-11-21T21:00:00Z' };
  assert.equal(plainToInstance(CashSummaryQueryDto, dates).dateBasis, 'service');
  for (const dateBasis of [undefined, '', 'service', 'payment']) {
    assert.deepEqual(await validate(plainToInstance(CashSummaryQueryDto, { ...dates, dateBasis })), []);
  }
  for (const dateBasis of ['createdAt', ['service'], 1]) {
    assert.ok((await validate(plainToInstance(CashSummaryQueryDto, { ...dates, dateBasis }))).some(error => error.property === 'dateBasis'));
  }
});

for (const dateBasis of [undefined, 'service', 'payment']) {
  test(`turnover ${dateBasis ?? 'default'} uses one date/filter for totals and stable paginated IDs`, async () => {
    const statements = [];
    const range = { gte: new Date('2026-11-20T21:00:00Z'), lt: new Date('2026-11-21T21:00:00Z') };
    const result = await paymentTurnover({
      $queryRaw: async statement => {
        statements.push(statement);
        return statement.sql.includes('GROUP BY method')
          ? [{ method: 'CASH', amount: new Prisma.Decimal('100.10'), count: 10 },
            { method: 'SBP', amount: new Prisma.Decimal('200.20'), count: 3 }]
          : [{ id: 'later' }, { id: 'earlier' }];
      },
      payment: { findMany: async ({ where }) => {
        assert.deepEqual(where, { id: { in: ['later', 'earlier'] } });
        return [{ id: 'earlier' }, { id: 'later' }];
      } },
    }, { dateBasis, cashierId: 'cashier', shiftId: 'shift', page: 2, pageSize: 2 }, range);
    assert.equal(result.totalRevenue.toString(), '300.3');
    assert.equal(result.operationsCount, 13);
    assert.deepEqual(result.operations.map(row => row.id), ['later', 'earlier']);
    const [totals, page] = statements;
    assert.equal(totals.sql.split(' SELECT method, SUM')[0], page.sql.split(' SELECT id FROM filtered')[0]);
    for (const statement of statements) {
      assert.deepEqual(statement.values.slice(0, 4), ['cashier', 'shift', range.gte, range.lt]);
      assert.match(statement.sql, /at >= \?/);
      assert.match(statement.sql, /at < \?/);
      if (dateBasis === 'payment') assert.doesNotMatch(statement.sql, /CASE/);
      else {
        assert.match(statement.sql, /WHEN p\."bookingId" IS NOT NULL THEN COALESCE\(l\."startTime", b\."startTime", p\."paidAt", p\."createdAt"\)/);
        assert.match(statement.sql, /WHEN p\."membershipId" IS NOT NULL THEN COALESCE\(m\."validFrom", m\."createdAt", p\."paidAt", p\."createdAt"\)/);
      }
      assert.match(statement.sql, /COALESCE\(p\."paidAt", p\."createdAt"\)/);
    }
    assert.match(page.sql, /ORDER BY at DESC, id DESC LIMIT \? OFFSET \?/);
    assert.deepEqual(page.values.slice(-2), [2, 2]);
  });
}
