const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
require('reflect-metadata');
const { boardingCashBalances } = require('../dist/payments/boarding-cash-balances');
const { FinanceService } = require('../dist/payments/finance.service');
const { PaymentsService } = require('../dist/payments/payments.service');
const { MembershipsService } = require('../dist/memberships/memberships.service');
const { StallsService } = require('../dist/stalls/stalls.service');
const decimal = value => new Prisma.Decimal(value);
const actor = { id: 'actor', email: 'qa@test' };

test('boarding balances separate cash, bank, legacy methods and refunds', async () => {
  const balances = await boardingCashBalances({
    payment: { groupBy: async args => { assert.deepEqual(args.where.boardingContractId, { not: null }); return [
      { method: 'CASH', _sum: { amount: decimal(100) } }, { method: 'TRANSFER', _sum: { amount: decimal(200) } },
      { method: 'CARD', _sum: { amount: decimal(50) } }, { method: 'UNSPECIFIED', _sum: { amount: decimal(5) } }]; } },
    expense: { groupBy: async args => { assert.equal(args.where.OR[0].cashboxType, 'BOARDING'); return [
      { paymentMethod: 'CASH', _sum: { amount: decimal(20) } }, { paymentMethod: 'CARD', _sum: { amount: decimal(30) } }]; } },
  });
  assert.equal(String(balances.cash), '80'); assert.equal(String(balances.bank), '220'); assert.equal(String(balances.total), '305');
});

for (const method of ['CASH', 'CARD']) test(`boarding ${method} expense rejects overdraft and records audit on success`, async () => {
  const writes = [];
  const tx = { cashShift: { findFirst: async () => null },
    payment: { groupBy: async () => [{ method: method === 'CASH' ? 'CASH' : 'TRANSFER', _sum: { amount: decimal(100) } }] },
    expense: { groupBy: async () => [], create: async args => { writes.push(args.data); return { ...args.data, id: 'expense' }; } },
    cashAuditLog: { create: async args => { writes.push(args.data); } },
  };
  const service = new FinanceService({ $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(tx); } });
  const dto = { cashboxType: 'BOARDING', paymentMethod: method, category: 'FEED', amount: 101, description: 'Корма' };
  await assert.rejects(service.create(dto, actor.id), /Недостаточно средств/); assert.equal(writes.length, 0);
  await service.create({ ...dto, amount: 99 }, actor.id);
  assert.equal(writes[0].cashboxType, 'BOARDING'); assert.equal(writes[1].action, 'EXPENSE_CREATED');
});

function correctionFixture(closed = false) {
  const current = { id: 'receipt', clientId: 'client', amount: decimal(100), status: 'PAID', method: 'CASH',
    bookingId: null, membershipId: null, boardingContractId: 'contract', cashierId: actor.id, shiftId: 'shift',
    paidAt: new Date('2026-01-02'), createdAt: new Date('2026-01-02'), description: 'Before', archivedAt: null, refundExpense: null };
  let audit, saved;
  const tx = { $queryRaw: async () => [], cashShift: { findUnique: async () => ({ closedAt: closed ? new Date() : null }),
    findFirst: async args => args.where.closedAt === null ? { id: 'shift' } : null },
    payment: { findUnique: async () => current, update: async args => { saved = args.data; return { ...current, ...args.data }; } },
    cashAuditLog: { create: async args => { audit = args.data; } },
  };
  return { service: new PaymentsService({ $transaction: fn => fn(tx) }), read: () => ({ audit, saved }) };
}
test('paid correction updates cash channel and snapshots old/new values', async () => {
  const { service, read } = correctionFixture();
  await service.update('receipt', { method: 'CARD', amount: 90, description: 'After' }, actor);
  assert.equal(read().saved.method, 'CARD'); assert.equal(String(read().saved.amount), '90');
  assert.equal(read().audit.action, 'PAYMENT_CORRECTED');
  assert.equal(read().audit.details.before.amount, '100'); assert.equal(read().audit.details.after.amount, '90');
});
test('closed shift and changed receipt origin reject without write', async () => {
  const { service, read } = correctionFixture(true);
  await assert.rejects(service.update('receipt', { method: 'CARD' }, actor), /закрытой смены/);
  assert.equal(read().saved, undefined); assert.equal(read().audit, undefined);
  await assert.rejects(correctionFixture().service.update('receipt', { clientId: 'other' }, actor), /только способ/);
});
test('active boarding payment options retain unavailable/rest horses', async () => {
  const horse = { name: 'Шанель', status: 'rest', isUnavailable: true };
  const service = new PaymentsService({ boardingContract: { findMany: async args => {
    assert.equal(args.where.status, 'ACTIVE'); assert.deepEqual(args.where.horse, { deletedAt: null });
    assert.equal(args.where.horse.isUnavailable, undefined); return [{ id: 'contract', client: { name: 'Олеся Попова' }, horse }];
  } } });
  assert.equal((await service.boardingOptions())[0].horse.name, 'Шанель');
});
test('stall map restores a private rest horse from its active contract when snapshot is missing', async () => {
  const horse = { id: 'horse', name: 'Шанель', ownerType: 'private', status: 'rest', isUnavailable: true, sex: 'MARE' };
  const service = new StallsService({ stall: { findMany: async args => {
    assert.equal(args.include.contracts.where.horse.deletedAt, null);
    assert.equal(args.include.contracts.where.horse.isUnavailable, undefined);
    return [{ id: 'stall', horseId: null, horse: null, status: 'AVAILABLE', zone: 'MAIN', position: 9, side: 'LEFT', contracts: [{ status: 'ACTIVE', horse }] }];
  } } });
  const rows = await service.map();
  assert.equal(rows[0].horse.name, 'Шанель'); assert.equal(rows[0].status, 'OCCUPIED'); assert.equal(rows[0].horseId, horse.id);
});
test('membership filters precede pagination and share count predicate', async () => {
  let countWhere, list;
  const tx = { membership: { count: args => { countWhere = args.where; return Promise.resolve(25); },
    findMany: args => { list = args; return Promise.resolve([]); } } };
  const service = new MembershipsService({ ...tx, $transaction: promises => Promise.all(promises) });
  const result = await service.findAll({ q: '7999', state: 'active', payment: 'debt', _start: 10, _end: 20 });
  assert.equal(result.total, 25); assert.equal(list.skip, 10); assert.equal(list.take, 10);
  assert.equal(list.where, countWhere); assert.deepEqual(list.where.remainingUnits, { gt: 0 });
  assert.equal(list.where.payments.some.status, 'PENDING'); assert.ok(JSON.stringify(list.where.OR).includes('phone'));
});
