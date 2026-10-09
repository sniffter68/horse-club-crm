const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { calculateCashChange, aggregatePaymentMethods } = require('../dist/payments/cash-desk.math');
const { CashDeskService } = require('../dist/payments/cash-desk.service');
const { PaymentsService } = require('../dist/payments/payments.service');

test('cash calculator uses exact kopecks, accepts exact payment and optional tender', () => {
  assert.equal(calculateCashChange(1000.10, 2000).toString(), '999.9');
  assert.equal(calculateCashChange('0.1', '0.3').toString(), '0.2');
  assert.equal(calculateCashChange(1200, 1200).toString(), '0');
  assert.equal(calculateCashChange(1200), null);
});
test('cash calculator rejects insufficient, negative, nonfinite and fractional kopecks', () => {
  for (const [amount, cash] of [[1000, 999.99], [0, 100], [-1, 100], [NaN, 100], [1, Infinity], [1.001, 2], [1, 2.001]]) {
    assert.throws(() => calculateCashChange(amount, cash), error => error.status === 400);
  }
});
test('summary counts cash as receipt amount, aggregates all noncash and exact totals', () => {
  const groups = [['CASH', '1200.10', 2], ['CARD_TERMINAL', '3000', 1], ['SBP', '900.20', 1], ['TRANSFER', '200', 1], ['CARD', '100', 1]]
    .map(([method, amount, count]) => ({ method, _sum: { amount: new Prisma.Decimal(amount) }, _count: { _all: count } }));
  const sum = aggregatePaymentMethods(groups);
  assert.equal(sum.totalCash.toString(), '1200.1');
  assert.equal(sum.totalCard.toString(), '4200.2');
  assert.equal(sum.totalRevenue.toString(), '5400.3');
  assert.equal(sum.operationsCount, 6);
  assert.equal(aggregatePaymentMethods([]).totalRevenue.toString(), '0');
});
function fixture({ booking, membership, previous = null, pending = null, failLedger = false } = {}) {
  const calls = [];
  const tx = {
    $queryRaw: async () => [],
    client: { findUnique: async () => ({ id: 'c1' }) },
    cashShift: { findFirst: async () => ({ id: 'shift1' }) },
    booking: { findUnique: async () => booking, update: async args => calls.push(['booking', args]) },
    membership: { findUnique: async () => membership, update: async args => calls.push(['membership', args]) },
    payment: {
      findUnique: async () => previous, count: async () => 0, findFirst: async () => pending,
      create: async args => { calls.push(['payment', args]); return { id: 'p1', ...args.data }; },
      update: async args => { calls.push(['settle', args]); return { id: args.where.id, ...args.data }; },
      updateMany: async args => calls.push(['cancel', args]),
    },
    ledgerTransaction: { create: async args => { if (failLedger) throw new Error('ledger failed'); calls.push(['ledger', args]); } },
  };
  const prisma = { $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(tx); } };
  return { service: new CashDeskService(prisma), calls };
}
const dto = { clientId: 'c1', amount: 1200.1, method: 'CASH', cashGiven: 2000, requestId: 'request1' };
test('cash payment links receipt, cashier, shift and purchase in one transaction', async () => {
  const { service, calls } = fixture(); const result = await service.pay(dto, 'u1');
  assert.equal(result.cashChange.toString(), '799.9'); assert.equal(result.cashierId, 'u1'); assert.equal(result.shiftId, 'shift1');
  const ledger = calls.find(([name]) => name === 'ledger')[1].data;
  assert.equal(ledger.cashDeskPaymentId, 'p1'); assert.equal(ledger.transactionType, 'purchase'); assert.equal(ledger.amount.toString(), '1200.1');
});
test('payment settles existing pending charge and marks booking paid', async () => {
  const { service, calls } = fixture({ booking: { id: 'b1', clientId: 'c1', isPaid: false, status: 'scheduled', transactions: [] }, pending: { id: 'pending1' } });
  const result = await service.pay({ ...dto, bookingId: 'b1' }, 'u1');
  assert.equal(result.id, 'pending1'); assert.equal(calls.some(([name]) => name === 'payment'), false);
  assert.equal(calls.find(([name]) => name === 'booking')[1].data.isPaid, true);
});
test('rejects paid bookings, wrong client and unsupported cash tender', async () => {
  for (const booking of [{ id: 'b1', clientId: 'other', status: 'scheduled' }, { id: 'b1', clientId: 'c1', isPaid: true, status: 'scheduled' }]) {
    const { service, calls } = fixture({ booking });
    await assert.rejects(() => service.pay({ ...dto, bookingId: 'b1' }, 'u1'), e => [400,409].includes(e.status));
    assert.equal(calls.length, 0);
  }
  await assert.rejects(() => fixture().service.pay({ ...dto, method: 'SBP' }, 'u1'), e => e.status === 400);
});
test('fixed lessons are not credited twice; deposits credit exact payment', async () => {
  for (const type of ['fixed_lessons', 'deposit']) {
    const { service, calls } = fixture({ membership: { id: 'm1', clientId: 'c1', status: 'active', type, validTo: new Date('2099-01-01') } });
    await service.pay({ ...dto, membershipId: 'm1' }, 'u1');
    const data = calls.find(([name]) => name === 'membership')[1].data;
    assert.equal(data.status, 'active');
    assert.equal(data.remainingUnits?.increment, type === 'deposit' ? dto.amount : undefined);
    assert.equal(data.remainedLessons, undefined);
  }
});
test('idempotent retry returns original payment; changed retry conflicts', async () => {
  const previous = { id: 'p1', cashierId: 'u1', clientId: 'c1', amount: new Prisma.Decimal(dto.amount), method: 'CASH', bookingId: null, membershipId: null, serviceId: null, serviceType: null, notes: null, cashGiven: new Prisma.Decimal(2000) };
  const { service, calls } = fixture({ previous });
  assert.equal((await service.pay(dto, 'u1')).id, 'p1'); assert.equal(calls.length, 0);
  await assert.rejects(() => service.pay({ ...dto, amount: 1 }, 'u1'), e => e.status === 409);
});
test('ledger failure rejects entire transactional operation', async () => {
  await assert.rejects(() => fixture({ failLedger: true }).service.pay(dto, 'u1'), /ledger failed/);
});
test('summary applies paid/date/cashier filters and paginates operations without limiting totals', async () => {
  let groupArgs, listArgs;
  const service = new CashDeskService({ $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return fn({ payment: {
      groupBy: async args => { groupArgs = args; return [{ method: 'CASH', _sum: { amount: new Prisma.Decimal(2500) }, _count: { _all: 25 } }]; },
      findMany: async args => { listArgs = args; return []; },
    } });
  } });
  const result = await service.summary({ from: '2026-10-08T21:00:00Z', to: '2026-10-09T21:00:00Z', cashierId: 'u1', page: 2, pageSize: 20 });
  assert.equal(result.operationsCount, 25); assert.equal(result.totalCash.toString(), '2500');
  assert.equal(groupArgs.where.status, 'PAID'); assert.equal(groupArgs.where.cashierId, 'u1');
  assert.equal(listArgs.skip, 20); assert.equal(listArgs.take, 20); assert.deepEqual(groupArgs.where, listArgs.where);
  await assert.rejects(() => service.summary({ from: '2026-10-10', to: '2026-10-09' }), e => e.status === 400);
});
test('cash receipts cannot be edited or removed through legacy CRUD', async () => {
  const service = new PaymentsService({ payment: { findUnique: async () => ({ cashierId: 'u1' }) } });
  await assert.rejects(() => service.update('p1', {}), e => e.status === 409);
  await assert.rejects(() => service.remove('p1'), e => e.status === 409);
});
test('legacy unspecified receipts remain in revenue without being classified as noncash', () => {
  const sum = aggregatePaymentMethods([{ method: 'UNSPECIFIED', _sum: { amount: new Prisma.Decimal(1500) }, _count: { _all: 1 } }]);
  assert.equal(sum.totalUnspecified.toString(), '1500');
  assert.equal(sum.totalRevenue.toString(), '1500');
  assert.equal(sum.totalCash.toString(), '0'); assert.equal(sum.totalCard.toString(), '0');
});
