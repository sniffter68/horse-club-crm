require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { refundService, serviceRefundQuote } = require('../dist/payments/service-refund');
const { currentCashBalance } = require('../dist/payments/finance.service');
const { CancelServiceDto } = require('../dist/payments/dto/cancel-service.dto');
const actor = { id: 'admin', role: 'ADMIN', email: 'a@test' };
const decimal = value => new Prisma.Decimal(value);

function fixture({ amount = 8000, method = 'CASH', remaining = 5, type = 'fixed_lessons', cancelled = false } = {}) {
  const expenses = [], audits = [];
  const membership = { type, totalLessons: 8, remainedLessons: remaining, totalPrice: decimal(8000), remainingUnits: decimal(remaining), cancelledAt: cancelled ? new Date() : null, client: { name: 'Анна' } };
  const payments = [{ id: 'receipt', status: 'PAID', amount: decimal(amount), method }];
  const tx = {
    membership: { findUnique: async () => membership },
    boardingContract: { findUnique: async () => ({ status: 'ACTIVE', client: { name: 'Анна' } }) },
    payment: {
      findMany: async () => payments.filter(p => !expenses.some(e => e.refundPaymentId === p.id)),
      updateMany: async () => ({}),
      groupBy: async () => [{ method, _sum: { amount: decimal(amount) }, _count: { _all: 1 } }],
    },
    expense: {
      create: async ({ data }) => { expenses.push(data); return data; },
      groupBy: async () => expenses.map(e => ({ paymentMethod: e.paymentMethod, _sum: { amount: e.amount } })),
    },
    cashAuditLog: { create: async ({ data }) => { audits.push(data); } },
    cashShift: { findFirst: async () => null },
    roleModulePermission: { findUnique: async () => ({ accessLevel: 'READ_ONLY' }) },
  };
  return { tx, expenses, audits, payments, membership };
}

test('unused fixed visits refund sale value and reduce cash balance by 5000 only', async () => {
  const f = fixture();
  assert.equal((await serviceRefundQuote(f.tx, 'memberships', 'm')).amount.toString(), '5000');
  await refundService(f.tx, 'memberships', 'm', { refund: true }, actor);
  assert.equal((await currentCashBalance(f.tx)).balanceCash.toString(), '3000');
  assert.equal(f.expenses[0].refundPaymentId, 'receipt');
  assert.equal(f.audits[0].details.retained, '3000.00');
});
test('retaining funds creates an audit and leaves cash unchanged', async () => {
  const f = fixture();
  await refundService(f.tx, 'memberships', 'm', { refund: false, reason: 'Удержание согласовано' }, actor);
  assert.equal((await currentCashBalance(f.tx)).balanceCash.toString(), '8000');
  assert.equal(f.expenses.length, 0);
  assert.equal(f.audits[0].details.reason, 'Удержание согласовано');
  assert.equal(f.audits[0].details.retained, '8000.00');
});
test('noncash boarding receipt refunds bank balance once without changing cash', async () => {
  const f = fixture({ amount: 25000, method: 'TRANSFER' });
  await refundService(f.tx, 'boarding-contracts', 'b', { refund: true }, actor);
  const balance = await currentCashBalance(f.tx);
  assert.equal(balance.balanceCash.toString(), '0');
  assert.equal(balance.balanceCard.toString(), '0');
  assert.equal(f.expenses[0].paymentMethod, 'CARD');
  await refundService(f.tx, 'boarding-contracts', 'b', { refund: true }, actor);
  assert.equal(f.expenses.length, 1);
});
test('refunds never exceed paid money or unused deposit units', async () => {
  for (const options of [{ amount: 1200 }, { type: 'deposit', remaining: 1200 }]) {
    const f = fixture(options);
    assert.equal((await serviceRefundQuote(f.tx, 'memberships', 'm')).amount.toString(), '1200');
  }
});
test('already cancelled membership cannot be refunded later', async () => {
  const f = fixture({ cancelled: true });
  await refundService(f.tx, 'memberships', 'm', { refund: true }, actor);
  assert.equal(f.expenses.length, 0); assert.equal(f.audits.length, 0);
});
test('cash READ_ONLY cannot issue refunds but may retain payment', async () => {
  const f = fixture();
  const manager = { ...actor, role: 'MANAGER' };
  await assert.rejects(refundService(f.tx, 'memberships', 'm', { refund: true }, manager), e => e.status === 403);
  assert.equal(f.expenses.length, 0);
  await refundService(f.tx, 'memberships', 'm', { refund: false }, manager);
  assert.equal(f.audits.length, 1);
});
test('unknown payment method requires explicit destination', async () => {
  const f = fixture({ method: 'UNSPECIFIED' });
  await assert.rejects(refundService(f.tx, 'memberships', 'm', { refund: true }, actor), e => e.status === 400);
  await refundService(f.tx, 'memberships', 'm', { refund: true, refundMethod: 'BANK' }, actor);
  assert.equal(f.expenses[0].paymentMethod, 'CARD');
});
test('refund DTO validates boolean, method and reason and normalizes empty method', () => {
  for (const input of [{}, { refund: 'false' }, { refund: true, refundMethod: 'CARD' }, { refund: false, reason: 'x'.repeat(301) }]) {
    assert.ok(validateSync(plainToInstance(CancelServiceDto, input)).length > 0);
  }
  const dto = plainToInstance(CancelServiceDto, { refund: false, refundMethod: '' });
  assert.equal(validateSync(dto).length, 0); assert.equal(dto.refundMethod, undefined);
});
