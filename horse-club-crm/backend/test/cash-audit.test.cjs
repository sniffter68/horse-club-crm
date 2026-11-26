require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CashJournalQueryDto, CashDeskPaymentDto } = require('../dist/payments/dto/cash-desk.dto');
const { FinanceService } = require('../dist/payments/finance.service');
const { PaymentsService } = require('../dist/payments/payments.service');
const { CashDeskService } = require('../dist/payments/cash-desk.service');
const { rethrowFinancialPeriod } = require('../dist/payments/financial-period-error');
const actor = { id: randomUUID(), email: 'audit@test' };

test('journal DTO normalizes filters and UUIDs and coerces bounded pagination', async () => {
  const dto = plainToInstance(CashJournalQueryDto, { from: '2026-11-01', to: '2026-11-02', page: '2', pageSize: '20', shiftId: '', cashierId: '', operationType: '', paymentMethod: '', search: '  Анна  ' });
  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.page, 2); assert.equal(dto.search, 'Анна');
  for (const field of ['shiftId', 'cashierId', 'operationType', 'paymentMethod']) assert.equal(dto[field], undefined);
  for (const change of [{ page: '0' }, { pageSize: 101 }, { shiftId: 'bad' }, { paymentMethod: 'SBP' }, { operationType: 'DELETE' }]) {
    assert.ok((await validate(plainToInstance(CashJournalQueryDto, { ...dto, ...change }))).length);
  }
  const payment = plainToInstance(CashDeskPaymentDto, { clientId: randomUUID(), amount: 1, method: 'CASH', bookingId: '', membershipId: '', serviceId: '', requestId: '' });
  assert.equal((await validate(payment)).length, 0);
});

test('journal builds a parameterized merged ledger with stable pagination, literal search and shared filters', async () => {
  const statements = [];
  const service = new FinanceService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return work({ $queryRaw: async statement => { statements.push(statement); return statement.sql.includes('COUNT(*) AS count') ? [{ count: 41n }] : [{ id: 'expense:x' }]; } });
  } });
  const dto = { from: '2026-11-01', to: '2026-11-02', page: 2, pageSize: 20, paymentMethod: 'BANK', operationType: 'EXPENSE', shiftId: randomUUID(), cashierId: actor.id, search: "100%_ ' OR true --" };
  const result = await service.journal(dto);
  assert.equal(result.total, 41); assert.equal(result.data[0].id, 'expense:x');
  for (const statement of statements) {
    assert.match(statement.sql, /UNION ALL/); assert.match(statement.sql, /cancelledAt/); assert.match(statement.sql, /refundPaymentId/);
    assert.match(statement.sql, /SBP/); assert.match(statement.sql, /TRANSFER/);
    assert.ok(!statement.sql.includes(dto.search));
    assert.ok(statement.values.includes("%100\\%\\_ ' OR true --%"));
    assert.ok(statement.values.includes(dto.shiftId)); assert.ok(statement.values.includes(actor.id));
    assert.ok(statement.values.some(value => value instanceof Date && value.toISOString() === '2026-10-31T21:00:00.000Z'));
  }
  assert.match(statements[0].sql, /ORDER BY at DESC, id DESC LIMIT/);
  assert.deepEqual(statements[0].values.slice(-2), [20, 20]);
});

test('membership source restricts both journal pages and totals to paid membership income', async () => {
  const dto = plainToInstance(CashJournalQueryDto, { from: '2026-11-01', to: '2026-11-02', source: 'MEMBERSHIP' });
  assert.equal((await validate(dto)).length, 0);
  assert.ok((await validate(plainToInstance(CashJournalQueryDto, { ...dto, source: 'INVALID' }))).length);
  const statements = [];
  const service = new FinanceService({ $transaction: async work => work({ $queryRaw: async sql => { statements.push(sql); return sql.sql.includes('COUNT(*) AS count') ? [{ count: 0n }] : []; } }) });
  await service.journal(dto);
  for (const statement of statements) assert.match(statement.sql, /AND kind = 'INCOME' AND "membershipId" IS NOT NULL/);
});

test('expense and its audit commit together; audit failure rolls back, retries never create a second event', async () => {
  let committed = { expense: null, audit: null }, failAudit = true;
  const service = new FinanceService({ $transaction: async work => {
    const draft = { ...committed };
    const tx = { $queryRaw: async () => [], cashShift: { findFirst: async () => null }, expense: {
      findUnique: async () => draft.expense,
      create: async ({ data }) => draft.expense = { ...data, id: randomUUID(), amount: new Prisma.Decimal(data.amount), receiptUrl: null },
    }, cashAuditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit failed'); draft.audit = data; } } };
    const result = await work(tx); committed = draft; return result;
  } });
  const dto = { amount: 0.1, paymentMethod: 'CASH', category: 'OTHER', description: 'Расход', requestId: randomUUID() };
  await assert.rejects(service.create(dto, actor.id), /audit failed/);
  assert.deepEqual(committed, { expense: null, audit: null });
  failAudit = false;
  const first = await service.create(dto, actor.id), audit = committed.audit;
  assert.equal((await service.create(dto, actor.id)).id, first.id);
  assert.equal(committed.audit, audit); assert.equal(audit.action, 'EXPENSE_CREATED'); assert.equal(audit.actorId, actor.id);
});

test('closed shifts block backdated expenses and cancellation even for admin', async () => {
  const service = new FinanceService({ $transaction: async work => work({ cashShift: { findFirst: async () => ({ id: 'closed' }) },
    expense: { findUnique: async () => ({ id: 'e', shiftId: 'closed' }), create: async () => assert.fail('must not write'), update: async () => assert.fail('must not write') } }) });
  await assert.rejects(service.create({ amount: 1, description: 'x' }, actor.id), error => error.status === 409);
  await assert.rejects(service.cancel('e', { ...actor, role: 'ADMIN' }), error => error.status === 409);
});

test('legacy paid creation requires actor and operation key, audits once, rejects reused payload and direct refund status', async () => {
  let receipt = null; const audits = [];
  const tx = { $queryRaw: async () => [], cashShift: { findFirst: async () => null }, client: { findUnique: async () => ({ id: 'client' }) },
    payment: { findUnique: async () => receipt, create: async ({ data }) => receipt = { ...data, id: 'payment', amount: new Prisma.Decimal(data.amount) } },
    cashAuditLog: { create: async ({ data }) => audits.push(data) } };
  const service = new PaymentsService({ $transaction: async work => work(tx) });
  const dto = { clientId: 'client', amount: 100.1, method: 'CASH', status: 'PAID', requestId: randomUUID() };
  await assert.rejects(service.create(dto), error => error.status === 400);
  await assert.rejects(service.create({ ...dto, requestId: undefined }, actor), error => error.status === 400);
  await assert.rejects(service.create({ ...dto, status: 'REFUNDED' }, actor), error => error.status === 400);
  await service.create(dto, actor); await service.create(dto, actor);
  assert.equal(receipt.cashierId, actor.id); assert.equal(audits.length, 1);
  await assert.rejects(service.create({ ...dto, amount: 100.2 }, actor), error => error.status === 409);
});

test('opening and closing shift record audit events in serializable transactions', async () => {
  const audits = []; let shift;
  const service = new CashDeskService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return work({ $queryRaw: async () => [], cashShift: { findFirst: async () => shift,
      create: async ({ data }) => shift = { ...data, id: 'shift' }, update: async ({ data }) => ({ ...shift, ...data }) },
      cashAuditLog: { create: async ({ data }) => audits.push(data) } });
  } });
  await service.openShift({ startingCash: 100 }, actor.id); await service.closeShift('shift', actor.id);
  assert.deepEqual(audits.map(row => row.action), ['SHIFT_OPENED', 'SHIFT_CLOSED']);
});

test('pending charge deletion records actor and snapshot before delete; audit failure prevents deletion', async () => {
  let removed = false, failAudit = true, saved;
  const service = new PaymentsService({ $transaction: async work => work({ payment: {
    findUnique: async () => ({ id: 'p', clientId: 'c', amount: new Prisma.Decimal('123.45'), status: 'PENDING', method: 'CASH' }),
    delete: async () => { removed = true; return { id: 'p' }; },
  }, cashAuditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit failed'); saved = data; } } }) });
  await assert.rejects(service.remove('p', actor), /audit failed/); assert.equal(removed, false);
  failAudit = false; await service.remove('p', actor);
  assert.equal(saved.action, 'PAYMENT_DELETED'); assert.equal(saved.actorId, actor.id); assert.equal(saved.details.amount, '123.45');
  assert.equal(removed, true);
});

test('generic payment API cannot bypass lesson/membership settlement or revive cancelled charges', async () => {
  const service = new PaymentsService({ $transaction: async work => work({ payment: { findUnique: async () => ({ status: 'CANCELLED' }) } }) });
  for (const link of [{ bookingId: randomUUID() }, { membershipId: randomUUID() }]) {
    await assert.rejects(service.create({ ...link, clientId: randomUUID(), amount: 100, method: 'CASH', status: 'PAID', requestId: randomUUID() }, actor), error => error.status === 409);
  }
  await assert.rejects(service.update('p', { status: 'PAID' }, actor), error => error.status === 409);
});

test('closed financial period trigger errors become a useful 409 without swallowing unrelated errors', () => {
  const error = new Prisma.PrismaClientKnownRequestError('constraint', { code: 'P2004', clientVersion: '6', meta: { database_error: 'Финансовый период закрыт. Изменение проводок запрещено' } });
  assert.throws(() => rethrowFinancialPeriod(error), failure => failure.status === 409);
  const unrelated = new Error('network'); assert.throws(() => rethrowFinancialPeriod(unrelated), failure => failure === unrelated);
});
