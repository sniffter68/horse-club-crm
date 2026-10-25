require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { FinanceService } = require('../dist/payments/finance.service');
const { DashboardService } = require('../dist/dashboard/dashboard.service');

test('dashboard and cash desk share current club balances regardless of period, cashier or shift', async () => {
  const queries = [];
  const tx = {
    payment: {
      groupBy: async ({ where }) => {
        queries.push(['payment', where]);
        assert.equal(where.archivedAt, null);
        assert.equal(where.status, 'PAID');
        if (where.OR[0].paidAt.gte) return [];
        assert.equal(where.cashierId, undefined);
        assert.equal(where.shiftId, undefined);
        assert.ok(where.OR[0].paidAt.lt instanceof Date);
        assert.deepEqual(where.OR[1], { paidAt: null, createdAt: where.OR[0].paidAt });
        return [['CASH', '55000.10'], ['CARD', '16000'], ['SBP', '850.20']].map(([method, amount]) =>
          ({ method, _sum: { amount: new Prisma.Decimal(amount) }, _count: { _all: 1 } }));
      },
      findMany: async () => [],
    },
    expense: { groupBy: async ({ where }) => {
      queries.push(['expense', where]);
      assert.equal(where.archivedAt, null);
      assert.equal(where.cancelledAt, null);
      if (where.date.gte) return [];
      assert.equal(where.createdById, undefined);
      assert.equal(where.shiftId, undefined);
      return [['CASH', '2500.10'], ['CARD', '500.20']].map(([paymentMethod, amount]) =>
        ({ paymentMethod, _sum: { amount: new Prisma.Decimal(amount) } }));
    } },
  };
  const prisma = { $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return work(tx);
  } };
  const dashboard = new DashboardService(prisma, {});
  const finance = new FinanceService(prisma);
  const now = new Date();
  const summary = await dashboard.cashboxSummary(new Date('2020-01-01'), new Date('2020-01-02'), now);
  assert.deepEqual(summary, { cash: '52500.00', card: '16350.00', revenueToday: '0.00', expensesToday: '0.00' });
  for (const query of [
    { from: '2020-01-01', to: '2020-01-01' },
    { from: '2021-01-01', to: '2021-02-01', shiftId: 'shift', cashierId: 'cashier' },
  ]) {
    const result = await finance.summary({ ...query, page: 1, pageSize: 20 });
    assert.equal(result.balanceCash.toFixed(2), summary.cash);
    assert.equal(result.balanceCard.toFixed(2), summary.card);
    assert.equal(result.totalRevenue.toString(), '0');
    assert.equal(result.totalExpenses.toString(), '0');
    assert.equal(result.operationsCount, 0);
  }
  const currentFilters = queries.filter(([model, where]) => model === 'payment' && !where.OR[0].paidAt.gte);
  assert.equal(currentFilters.length, 3);
  assert.equal(currentFilters[0][1].OR[0].paidAt.lt, now);
  for (const [, where] of currentFilters.slice(1)) assert.ok(where.OR[0].paidAt.lt >= now);
});
