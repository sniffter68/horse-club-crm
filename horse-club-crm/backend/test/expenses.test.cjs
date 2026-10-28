const { MonthlyClosingService } = require('../dist/payments/monthly-closing.service');
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Prisma } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { CreateExpenseDto, ExpenseQueryDto } = require('../dist/payments/dto/expense.dto');
const { FinanceService, financeDate } = require('../dist/payments/finance.service');
const { FinanceController } = require('../dist/payments/finance.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const valid = { amount: 1500, paymentMethod: 'CASH', category: 'BEDDING', description: 'Закупка опилок' };
const group = (method, amount) => ({ method, _sum: { amount: new Prisma.Decimal(amount) }, _count: { _all: 1 } });
const expenseGroup = (paymentMethod, amount) => ({ paymentMethod, _sum: { amount: new Prisma.Decimal(amount) } });

test('expense DTO requires positive finite kopecks and nonblank description, validates category/method/receipt', async () => {
  assert.equal((await validate(plainToInstance(CreateExpenseDto, valid))).length, 0);
  for (const change of [{ amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: Infinity }, { amount: 1.001 }, { description: '' }, { description: '   ' }, { description: undefined }, { category: 'BAD' }, { paymentMethod: 'BAD' }, { receiptUrl: 'javascript:alert(1)' }]) {
    assert.ok((await validate(plainToInstance(CreateExpenseDto, { ...valid, ...change }))).length, JSON.stringify(change));
  }
});
test('expense query transforms numeric pagination and ignores empty string filters', async () => {
  const dto = plainToInstance(ExpenseQueryDto, { page: '2', pageSize: '50', from: '', to: '', paymentMethod: '', category: ' ', shiftId: '' });
  assert.equal(dto.page, 2); assert.equal(dto.pageSize, 50);
  for (const key of ['from', 'to', 'paymentMethod', 'category', 'shiftId']) assert.equal(dto[key], undefined);
  assert.equal((await validate(dto)).length, 0);
  for (const values of [{ page: '0' }, { pageSize: '101' }, { page: 'bad' }]) assert.ok((await validate(plainToInstance(ExpenseQueryDto, values))).length);
});
test('Moscow business dates include the full final day; offsetless timestamps are rejected', () => {
  assert.equal(financeDate('2026-10-18').toISOString(), '2026-10-17T21:00:00.000Z');
  assert.equal(financeDate('2026-10-18', true).toISOString(), '2026-10-18T21:00:00.000Z');
  assert.throws(() => financeDate('2026-10-18T12:00:00'), e => e.status === 400);
});

for (const now of ['2026-10-19T21:05:00Z', '2026-10-20T20:59:59.999Z']) {
  test(`expense date validation uses the whole Moscow day at ${now}`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse(now) });
    const saved = [];
    const service = new FinanceService({ $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return work({
        cashShift: { findFirst: async () => null },
        expense: { create: async ({ data }) => { saved.push(data); return { id: randomUUID(), ...data }; } },
      });
    } });
    for (const [date, expected] of [
      ['2026-10-20', '2026-10-19T21:00:00.000Z'],
      ['2026-10-19', '2026-10-18T21:00:00.000Z'],
      ['2026-10-20T23:59:59.999+03:00', '2026-10-20T20:59:59.999Z'],
      ['2026-10-20T20:59:59.999Z', '2026-10-20T20:59:59.999Z'],
    ]) {
      const dto = plainToInstance(CreateExpenseDto, { ...valid, date });
      assert.equal((await validate(dto)).length, 0);
      const expense = await service.create(dto, 'author');
      assert.equal(expense.date.toISOString(), expected);
      assert.equal(expense.createdById, 'author');
    }
    const withoutDate = await service.create(valid, 'author');
    assert.equal(withoutDate.date.getTime(), Date.parse(now));
    for (const date of ['2026-10-21', '2026-10-21T00:00:00+03:00', '2026-10-20T21:00:00Z']) {
      assert.throws(() => service.create({ ...valid, date }, 'author'), e => e.status === 400 && e.message === 'Дата расхода не может быть в будущем');
    }
    assert.equal(saved.length, 5, 'future dates must not reach the transaction');
  });
}
test('summary subtracts CASH/CARD expenses exactly and keeps cumulative balance independent of period and pagination', async () => {
  const queries = [];
  const service = new FinanceService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return work({
      payment: { groupBy: async args => { queries.push(args); return args.where.OR[0].paidAt.gte ? [group('CASH', '5000.10'), group('CARD_TERMINAL', '3000.20'), group('SBP', '100')] : [group('CASH', '10000.10'), group('CARD', '5000.20')]; }, findMany: async args => { assert.equal(args.skip, 20); assert.equal(args.take, 20); return []; } },
      expense: { groupBy: async args => { queries.push(args); assert.equal(args.where.cancelledAt, null); return args.where.date.gte ? [expenseGroup('CASH', '1500'), expenseGroup('CARD', '200.10')] : [expenseGroup('CASH', '2500'), expenseGroup('CARD', '400.10')]; } },
    });
  } });
  const result = await service.summary({ from: '2026-10-18', to: '2026-10-18', page: 2, pageSize: 20 });
  assert.equal(result.totalExpenses.toString(), '1700.1');
  assert.equal(result.netCash.toString(), '3500.1'); assert.equal(result.netCard.toString(), '2900.1');
  assert.equal(result.balanceCash.toString(), '7500.1'); assert.equal(result.balanceCard.toString(), '4600.1');
  assert.equal(result.balanceTotal.toString(), '12100.2');
  assert.equal(queries[2].where.OR[0].paidAt.gte, undefined);
  await assert.rejects(async () => service.summary({ from: '2026-10-19', to: '2026-10-18' }), e => e.status === 400);
});
test('create attaches authenticated author, shift and amount in serializable transaction; retry returns same expense', async () => {
  let saved, writes = 0;
  const service = new FinanceService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return work({ $queryRaw: async () => [], cashShift: { findFirst: async () => ({ id: 'shift' }) }, expense: {
      findUnique: async () => saved,
      create: async ({ data }) => { writes++; return saved = { ...data, id: randomUUID(), amount: new Prisma.Decimal(data.amount), receiptUrl: null }; },
    } });
  } });
  const dto = { ...valid, requestId: randomUUID() };
  const first = await service.create(dto, 'author');
  assert.equal(first.createdById, 'author'); assert.equal(first.shiftId, 'shift');
  assert.equal((await service.create(dto, 'author')).id, first.id); assert.equal(writes, 1);
  await assert.rejects(() => service.create({ ...dto, amount: 1 }, 'author'), e => e.status === 409);
  await assert.rejects(() => service.create(dto, 'other'), e => e.status === 409);
});
test('cancel preserves financial record and actor, is idempotent and blocks MANAGER at service boundary', async () => {
  const row = { id: randomUUID(), ...valid, cancelledAt: null };
  let writes = 0;
  const service = new FinanceService({ $transaction: async work => work({ expense: { findUnique: async () => row, update: async ({ data }) => { writes++; return Object.assign(row, data); } } }) });
  assert.throws(() => service.cancel(row.id, { id: 'manager', role: 'MANAGER' }), e => e.status === 403);
  await service.cancel(row.id, { id: 'admin', role: 'ADMIN' });
  assert.equal(row.cancelledById, 'admin'); assert.ok(row.cancelledAt); assert.equal(row.amount, 1500);
  await service.cancel(row.id, { id: 'admin', role: 'ADMIN' }); assert.equal(writes, 1);
});
test('HTTP permissions: TRAINER gets 403, MANAGER creates/reads but cannot delete, ADMIN cancels; JWT author cannot be spoofed', async () => {
  let role = 'TRAINER', receivedAuthor, closingAuthor;
  const userId = randomUUID(), id = randomUUID();
  const module = await Test.createTestingModule({ controllers: [FinanceController], providers: [RolesGuard, { provide: MonthlyClosingService, useValue: {
    status: async dto => ({ ...dto, isClosed: false }), close: async (dto, author) => { closingAuthor = author; return { ...dto, isClosed: true }; },
  } }, { provide: FinanceService, useValue: {
    create: async (dto, author) => { receivedAuthor = author; return { id, ...dto }; }, list: async () => ({ data: [], total: 0 }), summary: async () => ({}), cancel: async () => ({ id }),
  } }] }).overrideGuard(require('../dist/auth/module-access.guard').ModuleAccessGuard).useValue({ canActivate: () => true })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: context => { context.switchToHttp().getRequest().user = { id: userId, role }; return true; } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    const server = app.getHttpServer();
    for (const path of ['/api/finance/expenses', '/api/finance/summary?from=2026-10-18&to=2026-10-19']) await request(server).get(path).expect(403);
    await request(server).post('/api/finance/expenses').send(valid).expect(403);
    await request(server).delete(`/api/finance/expenses/${id}`).expect(403);
    await request(server).get('/api/finance/monthly-closing/status?year=2026&month=9').expect(403);
    await request(server).post('/api/finance/monthly-closing/close').send({ year: 2026, month: 9 }).expect(403);
    await request(server).get('/api/finance/monthly-closing/preview?year=2026&month=10').expect(403);
    await request(server).post('/api/finance/monthly-closing/confirm').send({ year: 2026, month: 10 }).expect(403);
    role = 'MANAGER';
    await request(server).post('/api/finance/expenses').send(valid).expect(201); assert.equal(receivedAuthor, userId);
    await request(server).post('/api/finance/expenses').send({ ...valid, createdById: randomUUID() }).expect(400);
    await request(server).get('/api/finance/expenses?page=2&paymentMethod=&category=').expect(200);
    await request(server).delete(`/api/finance/expenses/${id}`).expect(403);
    const preview = await request(server).get('/api/finance/monthly-closing/status?year=2026&month=9').expect(200);
    assert.equal(preview.body.month, 9);
    await request(server).post('/api/finance/monthly-closing/close').send({ year: 2026, month: 9 }).expect(201);
    assert.equal(closingAuthor, userId);
    await request(server).get('/api/finance/monthly-closing/preview?year=2026&month=10').expect(200);
    await request(server).post('/api/finance/monthly-closing/confirm').send({ year: 2026, month: 10 }).expect(201);
    role = 'ADMIN'; await request(server).delete(`/api/finance/expenses/${id}`).expect(200);
    await request(server).post('/api/finance/monthly-closing/close').send({ year: 2026, month: 9 }).expect(201);
    assert.equal(closingAuthor, userId);
    await request(server).get('/api/finance/monthly-closing/preview?year=2026&month=10').expect(200);
    await request(server).post('/api/finance/monthly-closing/confirm').send({ year: 2026, month: 10 }).expect(201);
    await request(server).get('/api/finance/monthly-closing/status?year=2026&month=13').expect(400);
    await request(server).post('/api/finance/monthly-closing/close').send({ year: 2026, month: 9, closedById: randomUUID() }).expect(400);
  } finally { await app.close(); }
});
