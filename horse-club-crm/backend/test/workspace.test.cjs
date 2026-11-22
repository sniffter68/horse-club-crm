require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { Prisma } = require('@prisma/client');
const { WorkspaceService } = require('../dist/workspace/workspace.service');
const { WorkspaceController } = require('../dist/workspace/workspace.controller');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { LessonsController, trainerLessonView } = require('../dist/lessons/lessons.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');
const { trainerPayout } = require('../dist/staff/staff.service');
const id = '11111111-1111-4111-8111-111111111111';
const actor = { id, email: 'trainer@club.test', role: 'TRAINER', trainerId: 'trainer-1' };
const decimal = n => new Prisma.Decimal(n);
const row = () => ({ id, trainerId: 'trainer-1', status: 'SCHEDULED', trainerNote: null,
  startTime: new Date('2026-11-17T07:00:00Z'), endTime: new Date('2026-11-17T08:00:00Z'),
  trainer: { id: 'trainer-1', name: 'Мария', baseRate: 1000 }, service: { id: 'service', name: 'Выездка', title: 'Выездка', price: decimal(2000), allowMembership: true },
  arena: { id: 'arena', name: 'Манеж' }, cost: decimal(0), prepaymentAmount: decimal(0),
  operations: [], bookings: [{ id: 'booking', clientId: 'client', membershipId: 'membership', membership: { clientId: 'client' }, costAmount: decimal(2000),
    prepaymentAmount: decimal(0), finalPaymentAmount: decimal(0), isPaid: true, payments: [], clientConfirmed: false,
    client: { id: 'client', name: 'Анна', balance: 9000, phone: 'private' }, horse: { id: 'horse', name: 'Валдай' } }] });
const project = (value, select) => Object.fromEntries(Object.entries(select).map(([key, option]) => [key,
  option === true ? value[key] : Array.isArray(value[key]) ? value[key].map(item => project(item, option.select)) : value[key] == null ? null : project(value[key], option.select)]));
function harness() {
  let lesson = row(), debits = 0, audit = [];
  const tx = { user: { findUnique: async () => ({ ...actor, crmAccess: true, trainer: { isActive: true } }), findMany: async () => [] },
    lesson: { findUnique: async () => lesson, findUniqueOrThrow: async () => lesson,
      update: async ({ data }) => { Object.assign(lesson, data); return lesson; } },
    cashAuditLog: { create: async ({ data }) => { audit.push(data); } },
  };
  let queue = Promise.resolve();
  const prisma = { $transaction: work => {
    const result = queue.then(() => work(tx)); queue = result.catch(() => {}); return result;
  } };
  const ledger = { debitLesson: async () => { debits++; lesson.operations.push({ membershipId: 'membership', attendeeClientId: 'client', type: 'DEBIT' }); } };
  return { service: new LessonsService(prisma, ledger), tx, get lesson() { return lesson; }, get debits() { return debits; }, audit };
}

test('trainer status forbids foreign, unlinked and inactive trainers before any writes', async () => {
  for (const override of [{ trainerId: 'other' }, { trainerId: null }, { trainer: { isActive: false } }, { crmAccess: false }]) {
    const h = harness();
    h.tx.user.findUnique = async () => ({ ...actor, crmAccess: true, trainer: { isActive: true }, ...override });
    await assert.rejects(h.service.updateLessonStatus(id, 'COMPLETED', {}, actor, undefined, undefined, { status: 'COMPLETED' }), { status: 403 });
    assert.equal(h.debits, 0); assert.equal(h.audit.length, 0); assert.equal(h.lesson.status, 'SCHEDULED');
  }
});

for (const status of ['COMPLETED', 'NO_SHOW']) test(`trainer ${status} is idempotent and journals note with membership debit`, async () => {
  const h = harness();
  const mark = () => h.service.updateLessonStatus(id, status, {}, actor, undefined, undefined, { status, trainerNote: '  Спокойная нагрузка  ' });
  await Promise.all([mark(), mark()]);
  assert.equal(h.lesson.status, status); assert.equal(h.lesson.trainerNote, 'Спокойная нагрузка');
  assert.equal(h.debits, 1); assert.equal(h.audit.length, 1);
  assert.equal(trainerPayout(h.lesson), 600); // Nominal 2000 × 30%, even with membership payment.
  const other = status === 'COMPLETED' ? 'NO_SHOW' : 'COMPLETED';
  await assert.rejects(h.service.updateLessonStatus(id, other, {}, actor, undefined, undefined, { status: other }), { status: 409 });
});

test('trainer board has Moscow boundaries, all active trainers and no financial projection', async () => {
  let where;
  const tx = { roleAccess: { findUnique: async () => null }, trainer: { findMany: async () => [{ id: 'trainer-1', name: 'Мария' }, { id: 'trainer-2', name: 'Иван' }] },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00' }) },
    lesson: { findMany: async query => { where = query.where; return [row(), { ...row(), id: 'foreign', trainerId: 'trainer-2' }].map(value => project(value, query.select)); } } };
  const service = new WorkspaceService({ $transaction: fn => fn(tx) }, {}, {});
  const data = await service.trainerBoard(actor, '2026-11-17');
  assert.equal(where.endTime.gt.toISOString(), '2026-11-16T21:00:00.000Z');
  assert.equal(where.startTime.lt.toISOString(), '2026-11-17T21:00:00.000Z');
  assert.equal(data.trainers.length, 2); assert.equal(data.lessons[0].isOwn, true); assert.equal(data.lessons[1].isOwn, false);
  assert.equal(data.lessons[1].bookings[0].client, null); assert.equal(data.horses.length, 2);
  for (const field of ['balance', 'cost', 'price', 'payments', 'baseRate', 'phone']) assert.equal(JSON.stringify(data).includes(`"${field}"`), false);
  await assert.rejects(service.trainerBoard(actor, '2026-02-30'), { status: 400 });
  await assert.rejects(service.trainerBoard({ ...actor, trainerId: null }, '2026-11-17'), { status: 403 });
  const detail = trainerLessonView(row(), actor);
  assert.equal(detail.bookings[0].client.name, 'Анна'); assert.equal('balance' in detail.bookings[0].client, false); assert.equal('cost' in detail, false);
});

test('trainer board excludes archived horses from its resource list but retains lesson history', async () => {
  const lesson = row();
  lesson.bookings[0].horse.deletedAt = new Date();
  const tx = { roleAccess: { findUnique: async () => null }, trainer: { findMany: async () => [{ id: actor.trainerId, name: 'Тренер' }] },
    lesson: { findMany: async query => [project(lesson, query.select)] }, clubSchedule: { findUnique: async () => null } };
  const service = new WorkspaceService({ $transaction: fn => fn(tx) }, {}, {});
  const data = await service.trainerBoard(actor, '2026-11-17');
  assert.deepEqual(data.horses, []);
  assert.equal(data.lessons[0].bookings[0].horse.name, 'Валдай');
});

test('admin summary aggregates month, uses actual cashboxes and removes finances for hidden cashbox', async () => {
  const filters = [], lessonFilters = [];
  const prisma = { lesson: { findMany: async query => { lessonFilters.push(query.where); return [project(row(), query.select)]; } },
    client: { count: async () => 9 }, leadRequest: { count: async () => 3, findMany: async () => [] },
    cashAuditLog: { findMany: async query => { assert.equal(query.take, 15); return []; } },
    payment: { aggregate: async query => { filters.push(query.where); return { _sum: { amount: decimal(query.where.status === 'PAID' ? 1200 : 300) } }; } },
    revenueRecognition: { aggregate: async () => ({ _sum: { amount: decimal(500) } }) },
    $transaction: fn => fn(prisma),
  };
  let accessLevel = 'FULL';
  const service = new WorkspaceService(prisma, { summary: async () => ({ mainBalance: 4200, boardingBalance: 1800 }) }, { forRole: async () => [{ module: 'CASHBOX', isEnabled: true, accessLevel }] });
  const admin = { ...actor, role: 'ADMIN' };
  const data = await service.adminSummary(admin, new Date('2026-11-16T22:00:00Z'));
  assert.equal(data.date, '2026-11-17'); assert.equal(data.kpi.newLeads, 3); assert.equal(data.kpi.activeRiders, 9);
  assert.equal(data.finance.mainBalance, 4200); assert.equal(data.finance.boardingBalance, 1800);
  assert.equal(data.finance.paid, '1200.00'); assert.equal(data.finance.debt, '300.00'); assert.equal(data.finance.recognizedMembershipRevenue, '500.00');
  assert.equal(filters[0].OR[0].paidAt.gte.toISOString(), '2026-10-31T21:00:00.000Z');
  assert.equal(lessonFilters[1].startTime.lt.toISOString(), '2026-11-17T22:00:00.000Z');
  accessLevel = 'HIDDEN'; assert.equal((await service.adminSummary({ ...admin, role: 'MANAGER' })).finance, null);
  await assert.rejects(service.adminSummary(actor), { status: 403 });
});

test('HTTP workspace enforces role, FULL mutations, UUID and status/note validation', async () => {
  let level = 'FULL'; const h = harness();
  const module = await Test.createTestingModule({ controllers: [WorkspaceController, LessonsController], providers: [
    { provide: WorkspaceService, useValue: { trainerBoard: async () => ({ lessons: [] }), adminSummary: async () => ({ kpi: {} }) } },
    { provide: LessonsService, useValue: h.service },
    { provide: ModuleAccessService, useValue: { forRole: async role => [{ module: 'SCHEDULE', isEnabled: true, accessLevel: role === 'ADMIN' ? 'FULL' : level }] } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) { const req = ctx.switchToHttp().getRequest(); req.user = { ...actor, role: req.headers['x-role'] || 'TRAINER' }; return true; } }).compile();
  const app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  try {
    const api = request(app.getHttpServer());
    await api.get('/workspace/admin-summary').expect(403);
    await api.get('/workspace/admin-summary').set('x-role', 'ADMIN').expect(200);
    await api.get('/workspace/trainer-board?date=2026-11-17').expect(200);
    await api.get('/workspace/trainer-board?date=bad').expect(400);
    await api.patch(`/lessons/${id}/trainer-status`).send({ status: 'CANCELLED' }).expect(400);
    await api.patch(`/lessons/${id}/trainer-status`).send({ status: 'COMPLETED', trainerNote: 'a'.repeat(1001) }).expect(400);
    await api.patch(`/lessons/${id}/trainer-status`).send({ status: 'COMPLETED', trainerNote: null }).expect(400);
    await api.patch('/lessons/bad/trainer-status').send({ status: 'COMPLETED' }).expect(400);
    for (const value of ['READ_ONLY', 'HIDDEN']) { level = value; await api.patch(`/lessons/${id}/trainer-status`).send({ status: 'COMPLETED' }).expect(403); }
    level = 'FULL'; h.tx.user.findUnique = async () => ({ ...actor, trainerId: 'other', crmAccess: true, trainer: { isActive: true } });
    await api.patch(`/lessons/${id}/trainer-status`).send({ status: 'COMPLETED' }).expect(403);
    h.tx.user.findUnique = async () => ({ ...actor, crmAccess: true, trainer: { isActive: true } });
    const result = await api.patch(`/lessons/${id}/trainer-status`).send({ status: 'COMPLETED', trainerNote: 'Шаг' }).expect(200);
    assert.deepEqual(result.body, { id, status: 'COMPLETED', trainerNote: 'Шаг', isOwn: true });
  } finally { await app.close(); }
});
