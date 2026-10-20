require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { Prisma } = require('@prisma/client');
const { DashboardService } = require('../dist/dashboard/dashboard.service');
const { DashboardController } = require('../dist/dashboard/dashboard.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');

function fixture(overrides = {}) {
  const calls = [];
  const modules = ['SCHEDULE', 'STABLES', 'CASHBOX', 'VETERINARY', 'STAFF_PAYROLL'];
  const access = { forRole: async role => modules.map(module => ({ module, isEnabled: true, accessLevel: 'FULL', ...overrides[module] })) };
  const record = (model, method, result) => async args => { calls.push({ model, method, args }); return typeof result === 'function' ? result(args) : result; };
  const money = amount => new Prisma.Decimal(amount);
  const prisma = {
    clubSchedule: { upsert: async () => ({ openTime: '09:00', closeTime: '21:00' }) },
    lesson: {
      findMany: record('lesson', 'findMany', []), count: record('lesson', 'count', 0),
      groupBy: record('lesson', 'groupBy', [{ status: 'COMPLETED', _count: { _all: 2 } }, { status: 'SCHEDULED', _count: { _all: 3 } }, { status: 'CANCELLED', _count: { _all: 1 } }]),
    },
    horse: { findMany: record('horse', 'findMany', []), groupBy: record('horse', 'groupBy', [
      { healthStatus: 'HEALTHY', _count: { _all: 10 } }, { healthStatus: 'TREATMENT', _count: { _all: 2 } }, { healthStatus: 'QUARANTINE', _count: { _all: 1 } },
    ]) },
    workShift: { findMany: record('workShift', 'findMany', [{ id: 'shift', staffId: 'staff', status: 'SCHEDULED', startTime: '08:00', endTime: '20:00', staff: { fullName: 'Trainer', roleTitle: 'Trainer' } }]) },
    vetEvent: { count: record('vetEvent', 'count', 4) },
    leadRequest: { findMany: async () => [], count: async () => 0 },
    membership: { count: record('membership', 'count', 0) },
    payment: { groupBy: record('payment', 'groupBy', args => [
      { method: 'CASH', _sum: { amount: money(args.where.OR?.[0]?.paidAt?.gte ? '100.10' : '1000.10') }, _count: { _all: 2 } },
      { method: 'CARD_TERMINAL', _sum: { amount: money('500.20') }, _count: { _all: 1 } },
      { method: 'SBP', _sum: { amount: money('50.30') }, _count: { _all: 1 } },
    ]) },
    expense: { groupBy: record('expense', 'groupBy', [{ paymentMethod: 'CASH', _sum: { amount: money('20.05') } }, { paymentMethod: 'CARD', _sum: { amount: money('10.10') } }]) },
  };
  prisma.$transaction = async work => work(prisma);
  return { service: new DashboardService(prisma, access), calls };
}

test('Moscow midnight and the full calendar day drive all daily aggregates, regardless of club hours', async () => {
  for (const [instant, date, start, end] of [
    ['2026-10-19T21:00:00.000Z', '2026-10-20', '2026-10-19T21:00:00.000Z', '2026-10-20T21:00:00.000Z'],
    ['2026-12-31T20:59:59.999Z', '2026-12-31', '2026-12-30T21:00:00.000Z', '2026-12-31T21:00:00.000Z'],
    ['2026-12-31T21:00:00.000Z', '2027-01-01', '2026-12-31T21:00:00.000Z', '2027-01-01T21:00:00.000Z'],
  ]) {
    const { service, calls } = fixture();
    const summary = await service.getSummary('ADMIN', new Date(instant));
    assert.equal(summary.workDay.date, date);
    assert.equal(summary.workDay.timeZone, 'Europe/Moscow');
    const filter = calls.find(row => row.model === 'lesson' && row.method === 'groupBy').args.where.startTime;
    assert.equal(filter.gte.toISOString(), start); assert.equal(filter.lt.toISOString(), end);
    assert.deepEqual(summary.todayLessons, { total: 6, completed: 2, cancelled: 1 });
    assert.deepEqual(summary.horsesStatus, { total: 13, healthy: 10, treatment: 2, quarantine: 1 });
    assert.equal(summary.activeShifts, 1); assert.equal(summary.pendingVetAlerts, 4);
    const shift = calls.find(row => row.model === 'workShift').args.where;
    assert.equal(shift.date.toISOString(), `${date}T00:00:00.000Z`);
    assert.deepEqual(shift.status.in, ['SCHEDULED', 'COMPLETED']);
    const vet = calls.find(row => row.model === 'vetEvent').args.where;
    assert.equal(vet.eventDate.lt.toISOString(), end);
    assert.deepEqual(vet.status.in, ['scheduled', 'overdue']);
  }
});

test('cash and noncash use decimal arithmetic and canonical paid/non-cancelled ledger filters', async () => {
  const { service, calls } = fixture();
  const result = await service.getSummary('MANAGER', new Date('2026-10-20T10:00:00Z'));
  assert.deepEqual(result.cashboxSummary, { cash: '980.05', card: '540.40', revenueToday: '650.60', expensesToday: '30.15' });
  for (const row of calls.filter(row => row.model === 'payment')) assert.equal(row.args.where.status, 'PAID');
  for (const row of calls.filter(row => row.model === 'expense')) assert.equal(row.args.where.cancelledAt, null);
});

test('hidden and globally disabled blocks are absent and never queried; read-only cash is visible', async () => {
  for (const setting of [{ accessLevel: 'HIDDEN' }, { isEnabled: false }]) {
    const { service, calls } = fixture({ CASHBOX: setting, SCHEDULE: setting, STABLES: setting, STAFF_PAYROLL: setting, VETERINARY: setting });
    const result = await service.getSummary('MANAGER');
    for (const key of ['cashboxSummary', 'todayLessons', 'horsesStatus', 'activeShifts', 'onDutyStaff', 'pendingVetAlerts', 'upcomingLessons']) assert.equal(Object.hasOwn(result, key), false, key);
    assert.deepEqual(calls, []);
  }
  assert.ok((await fixture({ CASHBOX: { accessLevel: 'READ_ONLY' } }).service.getSummary('MANAGER')).cashboxSummary);
});

test('GET /api/dashboard/summary forwards authenticated role and strips hidden financial data', async () => {
  const { service } = fixture({ CASHBOX: { accessLevel: 'HIDDEN' } });
  const module = await Test.createTestingModule({ controllers: [DashboardController], providers: [RolesGuard, { provide: DashboardService, useValue: service }] })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
      const req = context.switchToHttp().getRequest();
      if (!req.headers['x-role']) return false;
      req.user = { id: 'actor', role: req.headers['x-role'] }; return true;
    } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
  try {
    const response = await request(app.getHttpServer()).get('/api/dashboard/summary').set('x-role', 'MANAGER').expect(200);
    assert.equal(Object.hasOwn(response.body, 'cashboxSummary'), false);
    await request(app.getHttpServer()).get('/api/dashboard/summary').expect(403);
    await request(app.getHttpServer()).get('/api/dashboard/summary').set('x-role', 'TRAINER').expect(403);
  } finally { await app.close(); }
});
