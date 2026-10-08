const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { LessonsController } = require('../dist/lessons/lessons.controller');
const { HorseWorkloadController } = require('../dist/lessons/horse-workload.controller');

const schedule = { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] };
const interval = { startTime: new Date('2026-10-08T07:00:00Z'), endTime: new Date('2026-10-08T08:00:00Z') };

test('daily workload counts each horse once per group lesson, returns idle horses and status, and uses club day bounds', async () => {
  const service = new LessonsService({
    clubSchedule: { findUnique: async () => schedule },
    horse: { findMany: async () => [
      { id: 'h1', name: 'Валдай', maxDailyMinutes: 120, isUnavailable: false },
      { id: 'h2', name: 'Буран', maxDailyMinutes: 60, isUnavailable: false },
      { id: 'h3', name: 'Орион', maxDailyMinutes: 30, isUnavailable: false },
      { id: 'h4', name: 'Резерв', maxDailyMinutes: 120, isUnavailable: false },
      { id: 'h5', name: 'Отдых', maxDailyMinutes: 120, isUnavailable: true },
    ] },
    lesson: { findMany: async ({ where }) => {
      assert.equal(where.status.not, 'CANCELLED');
      assert.equal(where.startTime.lt.toISOString(), '2026-10-08T18:00:00.000Z');
      assert.equal(where.endTime.gt.toISOString(), '2026-10-08T06:00:00.000Z');
      assert.deepEqual(where.id, { not: 'moving-lesson' });
      return [{ ...interval, bookings: [{ horseId: 'h1' }, { horseId: 'h1' }, { horseId: 'h2' }, { horseId: 'h3' }, { horseId: null }] }];
    } },
    $transaction: async queries => Promise.all(queries),
  }, {});
  const rows = await service.getDailyHorseWorkload('2026-10-08', 'moving-lesson');
  assert.deepEqual(rows.map(row => [row.currentWorkloadMinutes, row.status]), [[60, 'AVAILABLE'], [60, 'AT_LIMIT'], [60, 'OVERLOADED'], [0, 'AVAILABLE'], [0, 'UNAVAILABLE']]);
  assert.equal(rows[0].horseName, 'Валдай');
  await assert.rejects(service.getDailyHorseWorkload('2026-02-30'), error => error.getStatus() === 400);
});

test('existing single-horse read still returns workload when a lowered limit is already exceeded', async () => {
  const service = new LessonsService({
    clubSchedule: { findUnique: async () => schedule },
    horse: { findUnique: async () => ({ name: 'Валдай', maxDailyMinutes: 30 }) },
    lesson: { findMany: async () => [interval] },
  }, {});
  assert.deepEqual(await service.getHorseWorkload('h1', '2026-10-08'), { maxDailyMinutes: 30, usedMinutes: 60, remainingMinutes: 0 });
  await assert.rejects(service.validateHorseDailyLoad('h1', interval.startTime, 1), error => error.getStatus() === 409);
});

function rescheduleHarness(options = {}) {
  const updates = [];
  const reads = [];
  const lesson = { id: 'lesson-a', trainerId: 'trainer-a', arenaId: null, status: options.status || 'SCHEDULED',
    ...interval, bookings: [{ horseId: 'h1', membership: options.membership || null }], arena: null };
  const tx = {
    clubSchedule: { findUnique: async () => schedule },
    horse: { findUnique: async () => ({ name: 'Валдай', maxDailyMinutes: 120, isUnavailable: options.unavailable || false }) },
    lesson: {
      findUnique: async () => lesson,
      findMany: async ({ where }) => {
        reads.push(where);
        assert.deepEqual(where.id, { not: 'lesson-a' });
        return where.OR ? (options.conflict ? [{ trainerId: 'trainer-a', bookings: [] }] : []) : [interval];
      },
      update: async args => { updates.push(args); return { ...lesson, ...args.data }; },
    },
  };
  return { updates, reads, service: new LessonsService({ $transaction: async (fn, config) => {
    assert.equal(config.isolationLevel, 'Serializable'); return fn(tx);
  } }, {}) };
}

test('reschedule excludes itself from conflicts and workload and accepts exact daily limit without modifying bookings or ledger', async () => {
  const harness = rescheduleHarness();
  const result = await harness.service.rescheduleLesson('lesson-a', '2026-10-08T09:00:00Z', 60);
  assert.equal(result.endTime.toISOString(), '2026-10-08T10:00:00.000Z');
  assert.equal(harness.reads.length, 2);
  assert.deepEqual(Object.keys(harness.updates[0].data).sort(), ['endTime', 'startTime']);
});

for (const [name, options, duration] of [
  ['daily overload', {}, 61], ['resource conflict', { conflict: true }, 60],
  ['finalized lesson', { status: 'COMPLETED' }, 60], ['unavailable horse', { unavailable: true }, 60],
  ['membership expired at new lesson end', { membership: { remainedLessons: 4, validUntil: new Date('2026-10-08T09:30:00Z') } }, 60],
]) {
  test(`reschedule rejects ${name} before mutation`, async () => {
    const harness = rescheduleHarness(options);
    await assert.rejects(harness.service.rescheduleLesson('lesson-a', '2026-10-08T09:00:00Z', duration), error => error.getStatus() === 409);
    assert.equal(harness.updates.length, 0);
  });
}

test('workload is readable by trainers while transfers remain restricted to ADMIN/MANAGER', () => {
  assert.deepEqual(Reflect.getMetadata('auth:roles', HorseWorkloadController.prototype.getDailyWorkload), ['ADMIN', 'MANAGER', 'TRAINER']);
  assert.deepEqual(Reflect.getMetadata('auth:roles', LessonsController.prototype.reschedule), ['ADMIN', 'MANAGER']);
});

test('HTTP workload routing, DTO validation and transfer authorization match the frontend API', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const { HorsesController } = require('../dist/horses/horses.controller');
  const { HorsesService } = require('../dist/horses/horses.service');
  const id = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  // AppModule registers LessonsModule before HorsesModule; keep that ordering here.
  const module = await Test.createTestingModule({
    controllers: [HorseWorkloadController, LessonsController, HorsesController],
    providers: [RolesGuard, { provide: HorsesService, useValue: {} }, { provide: LessonsService, useValue: {
      getDailyHorseWorkload: async (date, excluded) => { calls.push([date, excluded]); return [{ horseId: id, horseName: 'Валдай', currentWorkloadMinutes: 60, maxDailyWorkloadMinutes: 120, status: 'AVAILABLE' }]; },
      rescheduleLesson: async (...args) => { calls.push(args); return { id }; },
    } }],
  }).overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) {
    const req = ctx.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] }; return true;
  } }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  try {
    const response = await request(app.getHttpServer()).get(`/horses/workload?date=2026-10-08&excludeLessonId=${id}`).set('x-role', 'TRAINER').expect(200);
    assert.equal(response.body[0].currentWorkloadMinutes, 60);
    assert.deepEqual(calls[0], ['2026-10-08', id]);
    await request(app.getHttpServer()).get('/horses/workload').set('x-role', 'ADMIN').expect(400);
    await request(app.getHttpServer()).get('/horses/workload?date=2026-10-08&excludeLessonId=bad').set('x-role', 'ADMIN').expect(400);
    const path = `/lessons/${id}/reschedule`;
    const body = { startTime: '2026-10-08T09:00:00Z', durationMinutes: 60 };
    await request(app.getHttpServer()).patch(path).set('x-role', 'TRAINER').send(body).expect(403);
    await request(app.getHttpServer()).patch(path).set('x-role', 'ADMIN').send({ ...body, allowOverload: true }).expect(400);
    await request(app.getHttpServer()).patch(path).set('x-role', 'MANAGER').send(body).expect(200);
    assert.deepEqual(calls[1], [id, body.startTime, 60]);
  } finally { await app.close(); }
});
