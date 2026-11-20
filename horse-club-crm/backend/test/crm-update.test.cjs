require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Prisma } = require('@prisma/client');
const { CashboxService } = require('../dist/cashbox/cashbox.service');
const { PaymentQueryDto } = require('../dist/payments/dto/payment-query.dto');
const { PaymentsService } = require('../dist/payments/payments.service');
const { StallsService } = require('../dist/stalls/stalls.service');
const { UpdateStallDto } = require('../dist/stalls/dto/update-stall.dto');
const { trainerPayout } = require('../dist/staff/staff.service');
const { Test } = require('@nestjs/testing');
const { Reflector } = require('@nestjs/core');
const request = require('supertest');
const { CashboxController } = require('../dist/cashbox/cashbox.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');

test('cashbox maps SQL decimal/bigint and missing groups into JSON-safe numbers', async () => {
  const service = new CashboxService({ $queryRaw: async () => [
    { cashbox_type: 'MAIN', current_balance_rub: new Prisma.Decimal('1234.56'), operations_count: 12n },
    { cashbox_type: 'BOARDING', current_balance_rub: '-40.25', operations_count: 3n },
  ] });
  const summary = await service.summary();
  assert.deepEqual(summary, { mainBalance: 1234.56, boardingBalance: -40.25, mainOperationsCount: 12, boardingOperationsCount: 3 });
  assert.doesNotThrow(() => JSON.stringify(summary));
  assert.deepEqual(await new CashboxService({ $queryRaw: async () => [] }).summary(), { mainBalance: 0, boardingBalance: 0, mainOperationsCount: 0, boardingOperationsCount: 0 });
});

test('cashbox filter validates enum, empty value, numeric pagination and partitions both count and rows', async () => {
  assert.equal((await validate(plainToInstance(PaymentQueryDto, { cashboxType: 'OTHER' }))).length, 1);
  const empty = plainToInstance(PaymentQueryDto, { cashboxType: '', _start: '20', _end: '40' });
  assert.equal(empty.cashboxType, undefined); assert.equal(empty._start, 20); assert.equal((await validate(empty)).length, 0);
  const calls = [];
  const service = new PaymentsService({ payment: {
    count: async options => { calls.push(options); return 0; },
    findMany: async options => { calls.push(options); return []; },
  }, $transaction: work => Promise.all(work) });
  for (const cashboxType of ['MAIN', 'BOARDING', undefined]) {
    calls.length = 0;
    await service.findAll({ _start: 0, _end: 20, cashboxType, q: 'Анна' });
    for (const { where } of calls) {
      assert.deepEqual(where.boardingContractId, cashboxType === 'MAIN' ? null : cashboxType === 'BOARDING' ? { not: null } : undefined);
      assert.equal(where.archivedAt, null); assert.ok(where.OR.length);
    }
  }
});

test('stall and pony require numbers, service requires name, null name persists and service cannot receive horse', async () => {
  let current = { id: 's', type: 'STALL', number: '7', name: null, status: 'AVAILABLE', horseId: null };
  const prisma = { stall: {
    create: async ({ data }) => ({ id: 's', ...data }),
    findUnique: async () => current, findMany: async () => [],
    update: async ({ data }) => { current = { ...current, ...data }; return current; },
  }, cashAuditLog: { create: async ({ data }) => data }, $transaction: work => work(prisma) };
  const service = new StallsService(prisma);
  for (const type of ['STALL', 'PONY_PEN']) {
    await assert.rejects(service.create({ type, name: 'Имя без номера' }), e => e.status === 400);
    assert.equal((await service.create({ type, number: '7', name: '' })).name, null);
  }
  await assert.rejects(service.create({ type: 'SERVICE', number: '7' }), e => e.status === 400);
  assert.equal((await service.create({ type: 'SERVICE', name: ' Склад ' })).name, 'Склад');
  const actor = { id: 'actor', email: 'admin@example.test' };
  await service.update('s', { name: null }, actor); assert.equal(current.name, null);
  await assert.rejects(service.update('s', { type: 'SERVICE' }), e => e.status === 400);
  await service.update('s', { type: 'SERVICE', name: 'Склад' }, actor);
  await service.update('s', plainToInstance(UpdateStallDto, { notes: 'Обновить только заметку' }), actor);
  await assert.rejects(service.update('s', { name: '' }), e => e.status === 400);
  await assert.rejects(service.assign('s', 'h'), e => e.status === 409);
});

test('trainer share rounds once per lesson and never uses client discounted price', () => {
  for (const cost of [0, 500, 9999]) assert.equal(trainerPayout({ service: { price: new Prisma.Decimal('2005') }, bookings: [{ costAmount: new Prisma.Decimal(cost) }] }), 602);
  assert.equal(trainerPayout({ service: null, bookings: [] }), 0);
});

test('cashbox HTTP rejects unauthenticated/hidden/trainer requests and permits read-only financial readers', async () => {
  const reflector = new Reflector();
  const module = await Test.createTestingModule({ controllers: [CashboxController], providers: [
    { provide: CashboxService, useValue: { summary: async () => ({ mainBalance: 42 }) } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest();
    if (!req.headers['x-role']) return false;
    req.user = { id: 'actor', role: req.headers['x-role'] }; return true;
  } }).overrideGuard(RolesGuard).useValue(new RolesGuard(reflector))
    .overrideGuard(ModuleAccessGuard).useValue(new ModuleAccessGuard(reflector, { forRole: async role => [{ module: 'CASHBOX', isEnabled: true, accessLevel: role === 'OTHER' ? 'HIDDEN' : 'READ_ONLY' }] })).compile();
  const app = module.createNestApplication();
  await app.init();
  try {
    const server = app.getHttpServer();
    await request(server).get('/cashbox/summary').expect(403);
    for (const role of ['TRAINER', 'OTHER']) await request(server).get('/cashbox/summary').set('x-role', role).expect(403);
    for (const role of ['ADMIN', 'MANAGER']) await request(server).get('/cashbox/summary').set('x-role', role).expect(200, { mainBalance: 42 });
  } finally { await app.close(); }
});
