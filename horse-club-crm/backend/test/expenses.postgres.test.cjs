require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { FinanceService } = require('../dist/payments/finance.service');

test('PostgreSQL expense idempotency, constraints, pagination, balances and audited cancellation', { skip: process.env.RUN_EXPENSE_TESTS !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.searchParams.get('schema'), /^expense_check_\d+$/);
  const p = new PrismaClient(), finance = new FinanceService(p);
  const id = randomUUID(), clientId = randomUUID();
  try {
    await p.user.create({ data: { id, email: `${id}@expense.test`, passwordHash: 'test', role: 'ADMIN' } });
    await p.client.create({ data: { id: clientId, name: 'Expense test' } });
    await p.payment.createMany({ data: [
      { clientId, amount: '5000.10', method: 'CASH', status: 'PAID', paidAt: new Date('2026-01-02T09:00Z') },
      { clientId, amount: '3000.20', method: 'CARD', status: 'PAID', paidAt: new Date('2026-01-02T09:00Z') },
      { clientId, amount: '9999', method: 'CASH', status: 'PENDING' },
    ] });
    const dto = { amount: 1500, paymentMethod: 'CASH', category: 'BEDDING', description: 'Закупка опилок', date: '2026-01-02', requestId: randomUUID() };
    const rows = await Promise.all([finance.create(dto, id), finance.create(dto, id), finance.create(dto, id)]);
    assert.equal(new Set(rows.map(row => row.id)).size, 1);
    await finance.create({ ...dto, requestId: randomUUID(), paymentMethod: 'CARD', amount: 200.1 }, id);
    const query = { from: '2026-01-02', to: '2026-01-02', page: 1, pageSize: 1 };
    const summary = await finance.summary(query);
    assert.equal(summary.balanceCash.toString(), '3500.1'); assert.equal(summary.balanceCard.toString(), '2800.1');
    assert.equal(summary.totalExpenses.toString(), '1700.1'); assert.equal(summary.operations.length, 1);
    const filtered = await finance.list({ ...query, paymentMethod: 'CASH', category: 'BEDDING' });
    assert.equal(filtered.total, 1); assert.equal(filtered.data[0].createdBy.id, id);
    const later = await finance.summary({ ...query, from: '2026-01-03', to: '2026-01-03' });
    assert.equal(later.totalExpenses.toString(), '0'); assert.equal(later.balanceCash.toString(), '3500.1');
    await assert.rejects(() => p.expense.create({ data: { ...dto, requestId: randomUUID(), date: new Date(), createdById: id, amount: 0 } }));
    await finance.cancel(rows[0].id, { id, role: 'ADMIN' });
    const cancelled = await p.expense.findUnique({ where: { id: rows[0].id } });
    assert.ok(cancelled.cancelledAt); assert.equal(cancelled.cancelledById, id);
    assert.equal((await finance.summary(query)).balanceCash.toString(), '5000.1');
    assert.equal((await finance.list({ ...query, paymentMethod: 'CASH' })).total, 0);
  } finally { await p.$disconnect(); }
});
