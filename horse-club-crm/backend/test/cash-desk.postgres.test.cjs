const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require(process.env.CASH_DESK_TEST_CLIENT || '@prisma/client');
const { CashDeskService } = require('../dist/payments/cash-desk.service');

test('PostgreSQL cash desk atomicity, concurrency, shifts and aggregation', { skip: process.env.RUN_CASH_DESK_TESTS !== '1', timeout: 60000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.ok(url.searchParams.get('schema')?.startsWith('cash_desk_check_'));
  const p = new PrismaClient(); const desk = new CashDeskService(p);
  const ids = { user: randomUUID(), client: randomUUID(), trainer: randomUUID(), booking: randomUUID(), membership: randomUUID(), horse: randomUUID(), arena: randomUUID() };
  try {
    await p.user.create({ data: { id: ids.user, email: `${ids.user}@cash.test`, passwordHash: 'test', role: 'ADMIN' } });
    await p.client.create({ data: { id: ids.client, name: 'Cash QA' } });
    await p.trainer.create({ data: { id: ids.trainer, name: 'Cash QA' } });
    await p.horse.create({ data: { id: ids.horse, name: 'Cash QA' } });
    await p.arena.create({ data: { id: ids.arena, name: ids.arena } });
    await p.booking.create({ data: { id: ids.booking, clientId: ids.client, trainerId: ids.trainer, horseId: ids.horse, arenaId: ids.arena, serviceType: 'dressage', startTime: new Date('2090-01-01T09:00:00Z'), endTime: new Date('2090-01-01T10:00:00Z'), costAmount: '1200.10' } });
    await p.membership.create({ data: { id: ids.membership, clientId: ids.client, type: 'deposit', initialUnits: 0, remainingUnits: 0, validTo: new Date('2090-12-31') } });
    const shift = await desk.openShift({ startingCash: 1000 }, ids.user);
    const dto = { clientId: ids.client, bookingId: ids.booking, amount: 1200.1, method: 'CASH', cashGiven: 2000, requestId: randomUUID() };
    await t.test('parallel retries create exactly one payment and purchase', async () => {
      const results = await Promise.all([desk.pay(dto, ids.user), desk.pay(dto, ids.user), desk.pay(dto, ids.user)]);
      assert.equal(new Set(results.map(row => row.id)).size, 1);
      assert.equal(results[0].cashChange.toString(), '799.9'); assert.equal(results[0].shiftId, shift.id);
      assert.equal(await p.ledgerTransaction.count({ where: { cashDeskPaymentId: results[0].id } }), 1);
      assert.equal((await p.booking.findUnique({ where: { id: ids.booking } })).isPaid, true);
      await assert.rejects(() => desk.pay({ ...dto, requestId: randomUUID() }, ids.user), e => e.status === 409);
    });
    await t.test('deposit increments and summary excludes starting cash and pending charges', async () => {
      await desk.pay({ clientId: ids.client, membershipId: ids.membership, amount: 800.2, method: 'SBP', requestId: randomUUID() }, ids.user);
      await p.payment.create({ data: { clientId: ids.client, amount: 500, method: 'CASH', status: 'PENDING' } });
      assert.equal((await p.membership.findUnique({ where: { id: ids.membership } })).remainingUnits.toString(), '800.2');
      const summary = await desk.summary({ from: '2020-01-01T00:00:00Z', to: '2099-01-01T00:00:00Z', cashierId: ids.user, page: 1, pageSize: 1 });
      assert.equal(summary.totalCash.toString(), '1200.1'); assert.equal(summary.totalCard.toString(), '800.2');
      assert.equal(summary.totalRevenue.toString(), '2000.3'); assert.equal(summary.operationsCount, 2); assert.equal(summary.operations.length, 1);
    });
    await t.test('failed ledger insert rolls back receipt and deposit increment', async () => {
      const before = (await p.membership.findUnique({ where: { id: ids.membership } })).remainingUnits.toString();
      const requestId = randomUUID();
      // Real transaction, inject a failure only at the final journal write.
      const failing = new CashDeskService({ $transaction: (fn, opts) => p.$transaction(tx => fn(new Proxy(tx, { get(target, prop) {
        if (prop === 'ledgerTransaction') return { create: async () => { throw new Error('injected ledger failure'); } };
        const value = target[prop]; return typeof value === 'function' ? value.bind(target) : value;
      } })), opts) });
      await assert.rejects(() => failing.pay({ clientId: ids.client, membershipId: ids.membership, amount: 999, method: 'TRANSFER', requestId }, ids.user), /injected ledger failure/);
      assert.equal(await p.payment.count({ where: { requestId } }), 0);
      assert.equal((await p.membership.findUnique({ where: { id: ids.membership } })).remainingUnits.toString(), before);
    });
    await t.test('closed shift does not receive further payments', async () => {
      await desk.closeShift(shift.id, ids.user);
      const payment = await desk.pay({ clientId: ids.client, amount: 100, method: 'CARD_TERMINAL', requestId: randomUUID() }, ids.user);
      assert.equal(payment.shiftId, null);
      assert.equal(await desk.currentShift(ids.user), null);
    });
  } finally {
    await p.ledgerTransaction.deleteMany({ where: { clientId: ids.client } });
    await p.payment.deleteMany({ where: { clientId: ids.client } });
    await p.booking.deleteMany({ where: { clientId: ids.client } });
    await p.membership.deleteMany({ where: { clientId: ids.client } });
    await p.cashShift.deleteMany({ where: { cashierId: ids.user } });
    await p.horse.deleteMany({ where: { id: ids.horse } });
    await p.arena.deleteMany({ where: { id: ids.arena } });
    await p.trainer.deleteMany({ where: { id: ids.trainer } });
    await p.client.deleteMany({ where: { id: ids.client } });
    await p.user.deleteMany({ where: { id: ids.user } });
    await p.$disconnect();
  }
});
