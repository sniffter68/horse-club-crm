require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Prisma, Role } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { CashManagementService } = require('../dist/payments/cash-management.service');
const { FinanceService } = require('../dist/payments/finance.service');
const { CashController } = require('../dist/payments/cash.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const user = { id: randomUUID(), email: 'owner@example.com', role: 'ADMIN' };

function fixture(failAudit = false) {
  let state = {
    payments: [{ id: 'receipt', amount: 1000.10, method: 'CASH', status: 'PAID', archivedAt: null, bookingId: 'booking', membershipId: 'membership' }],
    expenses: [{ id: 'salary', amount: 200, paymentMethod: 'CASH', archivedAt: null, cancelledAt: null }],
    shifts: [{ id: 'shift', archivedAt: null, closedAt: null }], audits: [],
    booking: { id: 'booking', isPaid: true }, ledger: { cashDeskPaymentId: 'receipt' }, payroll: { expenseId: 'salary', isPaid: true },
  };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => value === undefined || ['OR', 'date'].includes(key) || row[key] === value);
  const tx = {};
  for (const [model, key] of [['payment', 'payments'], ['expense', 'expenses'], ['cashShift', 'shifts']]) {
    tx[model] = {
      updateMany: async ({ where, data }) => { const rows = state[key].filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
      findUnique: async ({ where }) => { const row = state[key].find(row => matches(row, where)); return row ? { ...row, amount: new Prisma.Decimal(row.amount) } : null; },
      findFirst: async ({ where }) => state[key].find(row => matches(row, where)),
      findMany: async ({ where }) => state[key].filter(row => matches(row, where)),
      create: async ({ data }) => { const row = { id: randomUUID(), archivedAt: null, cancelledAt: null, ...data }; state[key].push(row); return row; },
      aggregate: async ({ where }) => ({ _sum: { amount: state[key].filter(row => matches(row, where)).reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)) } }),
      groupBy: async ({ by, where }) => {
        const groups = new Map();
        for (const row of state[key].filter(row => matches(row, where))) {
          const name = row[by[0]];
          const group = groups.get(name) ?? { [by[0]]: name, _sum: { amount: new Prisma.Decimal(0) }, _count: { _all: 0 } };
          group._sum.amount = group._sum.amount.plus(row.amount); group._count._all++; groups.set(name, group);
        }
        return [...groups.values()];
      },
    };
  }
  tx.$executeRaw = async () => 0;
  tx.user = { findUniqueOrThrow: async () => ({ ...user, staffProfile: { fullName: 'Владелец клуба' } }) };
  tx.cashAuditLog = {
    findUnique: async ({ where }) => state.audits.find(row => row.requestId === where.requestId),
    create: async ({ data }) => { if (failAudit) throw new Error('audit unavailable'); state.audits.push(data); return data; },
  };
  const prisma = { $transaction: async (work, options) => {
    assert.ok(['Serializable', 'RepeatableRead'].includes(options.isolationLevel));
    const before = structuredClone(state);
    try { return await work(tx); } catch (error) { state = before; throw error; }
  } };
  return { service: new CashManagementService(prisma), finance: new FinanceService(prisma), state: () => state };
}

test('reset archives receipts, expenses and shifts, zeros report, preserves ledger/payment/payroll links and audits actor', async () => {
  const f = fixture(); const dto = { confirmation: 'RESET_CASH', requestId: randomUUID() };
  const result = await f.service.reset(dto, user);
  assert.deepEqual(result, { success: true, message: 'Касса и история операций успешно обнулены', currentBalance: 0 });
  const s = f.state();
  assert.ok(s.payments[0].archivedAt); assert.ok(s.expenses[0].archivedAt); assert.ok(s.shifts[0].archivedAt); assert.ok(s.shifts[0].closedAt);
  assert.equal(s.payments[0].status, 'PAID'); assert.equal(s.booking.isPaid, true);
  assert.equal(s.ledger.cashDeskPaymentId, s.payments[0].id); assert.equal(s.payroll.expenseId, s.expenses[0].id); assert.equal(s.payroll.isPaid, true);
  assert.equal(s.audits[0].actorId, user.id); assert.equal(s.audits[0].actorName, 'Владелец клуба');
  assert.deepEqual([s.audits[0].details.payments, s.audits[0].details.expenses, s.audits[0].details.shifts], [1, 1, 1]);
  const report = await f.finance.summary({ from: '2026-10-21', to: '2026-10-21', page: 1, pageSize: 20 });
  for (const key of ['balanceCash', 'balanceCard', 'balanceTotal', 'totalRevenue', 'totalExpenses']) assert.equal(report[key].toString(), '0');
  assert.deepEqual(report.operations, []);
  // A lost reset response must not reset receipts accepted after the original operation.
  s.payments.push({ id: 'new', archivedAt: null });
  await f.service.reset(dto, user); assert.equal(s.payments[1].archivedAt, null); assert.equal(s.audits.length, 1);
});

test('audit failure rolls back the entire reset and withdrawal', async () => {
  for (const action of ['reset', 'withdraw']) {
    const f = fixture(true); const before = structuredClone(f.state());
    const dto = action === 'reset' ? { confirmation: 'RESET_CASH', requestId: randomUUID() } : { amount: 100, requestId: randomUUID() };
    await assert.rejects(() => f.service[action](dto, user), /audit unavailable/);
    assert.deepEqual(f.state(), before);
  }
});

test('withdrawal keeps kopecks, preserves history, prevents overdraft and duplicate/changed requests', async () => {
  const f = fixture(); const dto = { amount: 800.10, requestId: randomUUID() };
  await assert.rejects(() => f.service.withdraw({ ...dto, amount: 800.11 }, user), e => e.status === 400);
  const receipt = await f.service.withdraw(dto, user);
  assert.equal(receipt.isEncashment, true); assert.equal(receipt.createdById, user.id);
  assert.equal((await f.service.withdraw(dto, user)).id, receipt.id);
  assert.equal(f.state().expenses.length, 2); assert.equal(f.state().audits.length, 1);
  await assert.rejects(() => f.service.withdraw({ ...dto, amount: 1 }, user), e => e.status === 409);
  await assert.rejects(() => f.service.withdraw({ amount: 0.01, requestId: randomUUID() }, user), e => e.status === 400);
  const report = await f.finance.summary({ from: '2026-10-21', to: '2026-10-21', page: 1, pageSize: 20 });
  assert.equal(report.balanceCash.toString(), '0'); assert.equal(report.operations.length, 1);
  await assert.rejects(() => f.finance.cancel(receipt.id, user), e => e.status === 409);
});

test('service denies all non-admin roles and reset without exact confirmation', () => {
  const f = fixture();
  for (const role of Object.values(Role).filter(role => role !== 'ADMIN')) {
    for (const action of ['reset', 'withdraw']) assert.throws(() => f.service[action]({}, { ...user, role }), e => e.status === 403);
  }
  assert.throws(() => f.service.reset({ confirmation: 'reset_cash' }, user), e => e.status === 400);
});

test('HTTP: exact reset confirmation, UUID/money validation, session actor and ADMIN-only mutations', async () => {
  let role = 'MANAGER', authenticated = true, calls = 0;
  const module = await Test.createTestingModule({ controllers: [CashController], providers: [RolesGuard, { provide: CashManagementService, useValue: {
    reset: (dto, actor) => { calls++; assert.equal(actor.id, user.id); return { success: true }; }, withdraw: () => { calls++; return {}; },
  } }] }).overrideGuard(ModuleAccessGuard).useValue({ canActivate: () => true })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: context => { context.switchToHttp().getRequest().user = { ...user, role }; return authenticated; } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  try {
    for (role of Object.values(Role).filter(role => role !== 'ADMIN')) {
      await request(app.getHttpServer()).post('/api/cash/reset').send({ confirmation: 'RESET_CASH' }).expect(403);
      await request(app.getHttpServer()).post('/api/cash/withdraw').send({ amount: 1, requestId: randomUUID() }).expect(403);
    }
    assert.equal(calls, 0); role = 'ADMIN';
    for (const body of [{}, { confirmation: 'СБРОСИТЬ' }, { confirmation: 'RESET_CASH', actorId: randomUUID() }, { confirmation: 'RESET_CASH', requestId: 'bad' }]) await request(app.getHttpServer()).post('/api/cash/reset').send(body).expect(400);
    for (const amount of [0, -1, 1.001, '100']) await request(app.getHttpServer()).post('/api/cash/withdraw').send({ amount, requestId: randomUUID() }).expect(400);
    await request(app.getHttpServer()).post('/api/cash/reset').send({ confirmation: 'RESET_CASH' }).expect(201);
    await request(app.getHttpServer()).post('/api/cash/withdraw').send({ amount: 1, requestId: randomUUID() }).expect(201);
    authenticated = false; await request(app.getHttpServer()).post('/api/cash/reset').send({ confirmation: 'RESET_CASH' }).expect(403);
    assert.equal(calls, 2);
  } finally { await app.close(); }
});
