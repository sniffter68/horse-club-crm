const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { TrainerTmaService } = require('../dist/modules/telegram-bot/trainer-tma.service');
const { TrainerTmaAuthController, TrainerTmaController, TrainerTmaGuard } = require('../dist/modules/telegram-bot/trainer-tma.controller');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { BookingsService } = require('../dist/bookings/bookings.service');
const id = '11111111-1111-4111-8111-111111111111';
const trainerId = '22222222-2222-4222-8222-222222222222';
const bookingId = '33333333-3333-4333-8333-333333333333';
const horseId = '44444444-4444-4444-8444-444444444444';
const botToken = 'test:trainer-bot';
const secret = 'a-test-secret-of-at-least-32-bytes';
function signed(extra = {}) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 12345, first_name: 'Анна' }), ...extra });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  params.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(botToken).digest()).update(check).digest('hex'));
  return params.toString();
}

test('trainer TMA HTTP: signed auth, scoped JWT, ownership, DTO, dates, RBAC and revocation', async t => {
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const user = { id, email: 'trainer@test.local', role: 'TRAINER', trainerId, crmAccess: true, tokenVersion: 1,
    trainer: { isActive: true, name: 'Анна Тренер' }, staffProfile: { isActive: true } };
  let linked = true, enabled = true, level = 'FULL', owner = trainerId, scheduleQuery;
  const mutations = [];
  const lesson = { id, trainerId, status: 'SCHEDULED', deletedAt: null, startTime: new Date('2026-11-11T07:00:00Z'), endTime: new Date('2026-11-11T07:45:00Z'),
    service: { title: 'Занятие 45 мин', name: 'Занятие' }, bookings: [{ id: bookingId, cancellationReason: null,
      client: { name: 'Всадник', firstName: 'Анна', lastName: 'Тест' }, horse: { id: horseId, name: 'Гром' } }] };
  let client = null;
  const membership = { id, title: 'Абонемент', remainingLessons: 5, totalLessons: 8, validUntil: '2026-12-31T00:00:00Z' };
  const prisma = { user: { findUnique: async () => linked ? user : null, findFirst: async () => null },
    client: { findUnique: async query => {
      assert.deepEqual(query.where, { telegramUserId: '12345' });
      assert.deepEqual(query.select, { id: true, name: true, deletedAt: true });
      return client;
    } },
    lesson: { findMany: async query => { scheduleQuery = query; return [lesson]; }, findUnique: async () => ({ ...lesson, trainerId: owner }) },
    horse: { findMany: async query => { assert.deepEqual(query.where, { status: 'active', healthStatus: 'HEALTHY', isUnavailable: false }); return [{ id: horseId, name: 'Гром' }]; } } };
  const access = { forRole: async () => [{ module: 'SCHEDULE', isEnabled: enabled, accessLevel: level }] };
  const jwt = new JwtService({ secret, signOptions: { algorithm: 'HS256' } });
  const service = new TrainerTmaService(prisma, jwt, access,
    { updateLessonStatus: async (...args) => mutations.push(['status', ...args]) },
    { replaceHorse: async (...args) => mutations.push(['horse', ...args]) },
    { dashboard: async clientId => {
      assert.equal(clientId, id);
      return { membership, nextBooking: { id: bookingId } };
    } });
  const module = await Test.createTestingModule({ controllers: [TrainerTmaAuthController, TrainerTmaController], providers: [
    { provide: TrainerTmaService, useValue: service }, { provide: ModuleAccessService, useValue: access }, TrainerTmaGuard, ModuleAccessGuard,
  ] }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const api = request(app.getHttpServer());
  let session;
  await t.test('bootstrap selects client, trainer, admin without trainer, and legacy trainer bindings', async () => {
    const bootstrap = () => api.post('/api/tma/bootstrap').send({ initData: signed() });
    for (const initData of ['bad', signed() + '&user=forged', signed({ auth_date: '1' })])
      await api.post('/api/tma/bootstrap').send({ initData }).expect(401);
    await api.post('/api/tma/bootstrap').send({ initData: 42 }).expect(400);
    await api.post('/api/tma/bootstrap').send({ initData: signed(), role: 'ADMIN' }).expect(400);
    linked = false;
    let result = await bootstrap().expect(201);
    assert.equal(result.body.role, 'CLIENT'); assert.equal(result.body.token, null);
    assert.equal(result.body.user.telegramId, '12345');
    assert.equal(result.body.clientId, null);
    assert.equal(result.body.activeMembership, null);
    assert.equal(result.body.nextLesson, null);
    client = { id, name: 'Постоянный клиент', deletedAt: null };
    result = await bootstrap().expect(201);
    assert.equal(result.body.role, 'CLIENT');
    assert.equal(result.body.clientId, id);
    assert.equal(result.body.clientName, client.name);
    assert.deepEqual(result.body.activeMembership, membership);
    assert.deepEqual(result.body.nextLesson, { id: bookingId });
    client.deletedAt = new Date();
    result = await bootstrap().expect(201);
    assert.equal(result.body.clientId, null);
    assert.equal(result.body.activeMembership, null);
    client = null;
    linked = true;
    result = await bootstrap().expect(201);
    assert.equal(result.body.role, 'TRAINER'); assert.equal(result.body.trainerId, trainerId);
    assert.equal(result.headers['cache-control'], 'no-store');
    await api.get('/api/tma/admin/schedule?date=2026-11-11').auth(result.body.token, { type: 'bearer' }).expect(403);
    level = 'HIDDEN'; await bootstrap().expect(403); level = 'FULL';
    user.crmAccess = false; await bootstrap().expect(403); user.crmAccess = true;
    const trainer = user.trainer;
    user.role = 'ADMIN'; user.trainer = null; user.trainerId = null;
    result = await bootstrap().expect(201);
    assert.equal(result.body.role, 'ADMIN'); assert.equal(result.body.trainerId, null);
    await api.get('/api/tma/admin/schedule?date=2026-11-11').auth(result.body.token, { type: 'bearer' }).expect(200);
    assert.equal(scheduleQuery.where.trainerId, undefined);
    await api.get('/api/tma/schedule?date=2026-11-11').auth(result.body.token, { type: 'bearer' }).expect(403);
    const payload = jwt.decode(result.body.token);
    await assert.rejects(JwtStrategy.prototype.validate.call({ prisma }, payload), error => error.getStatus() === 401);
    user.role = 'TRAINER'; user.trainer = trainer; user.trainerId = trainerId;
    linked = false; prisma.user.findFirst = async () => user;
    result = await bootstrap().expect(201); assert.equal(result.body.role, 'TRAINER');
    await api.get('/api/tma/schedule?date=2026-11-11').auth(result.body.token, { type: 'bearer' }).expect(200);
    prisma.user.findFirst = async () => null;
    await api.get('/api/tma/schedule?date=2026-11-11').auth(result.body.token, { type: 'bearer' }).expect(401);
    linked = true;
  });
  try {
    await t.test('auth rejects forged, expired, duplicate and invalid payloads before lookup', async () => {
      for (const initData of ['bad', signed() + '&user=forged', signed({ auth_date: '1' }), signed({ auth_date: String(Math.floor(Date.now() / 1000) + 100) })])
        await api.post('/api/tma/auth').send({ initData }).expect(401);
      await api.post('/api/tma/auth').send({ initData: 42 }).expect(400);
      linked = false;
      const result = await api.post('/api/tma/auth').send({ initData: signed() }).expect(201);
      assert.deepEqual(result.body, { authenticated: false, reason: 'NOT_LINKED' }); linked = true;
      user.trainer.isActive = false; await api.post('/api/tma/auth').send({ initData: signed() }).expect(403); user.trainer.isActive = true;
      level = 'HIDDEN'; await api.post('/api/tma/auth').send({ initData: signed() }).expect(403); level = 'FULL';
    });
    await t.test('session authenticates only trainer TMA, never CRM; current binding and version are reloaded', async () => {
      const response = await api.post('/api/tma/auth').send({ initData: signed() }).expect(201);
      session = response.body.access_token;
      assert.deepEqual(response.body.trainer, { trainerId, name: 'Анна Тренер' });
      assert.equal(response.headers['cache-control'], 'no-store');
      const payload = jwt.decode(session);
      await assert.rejects(JwtStrategy.prototype.validate.call({ prisma }, payload), error => error.getStatus() === 401);
      await api.get('/api/tma/schedule?date=2026-11-11').expect(401);
      const crmToken = jwt.sign({ sub: id, email: user.email, role: user.role, authVersion: '1' });
      await api.get('/api/tma/schedule?date=2026-11-11').auth(crmToken, { type: 'bearer' }).expect(401);
      const expired = jwt.sign({ sub: id, telegramUserId: '12345', tokenType: 'trainer-tma', authVersion: '1' }, { audience: 'trainer-tma', expiresIn: -1 });
      await api.get('/api/tma/schedule?date=2026-11-11').auth(expired, { type: 'bearer' }).expect(401);
      user.tokenVersion = 2;
      await api.get('/api/tma/schedule?date=2026-11-11').auth(session, { type: 'bearer' }).expect(401); user.tokenVersion = 1;
      user.crmAccess = false;
      await api.get('/api/tma/schedule?date=2026-11-11').auth(session, { type: 'bearer' }).expect(403); user.crmAccess = true;
    });
    const get = path => api.get(`/api/tma/${path}`).auth(session, { type: 'bearer' });
    const patch = (path, body) => api.patch(`/api/tma/lessons/${path}`).auth(session, { type: 'bearer' }).send(body);
    await t.test('schedule enforces Moscow boundaries, current trainer and stable sorting; horses are healthy only', async () => {
      const response = await get('schedule?date=2026-11-11').expect(200);
      assert.equal(scheduleQuery.where.trainerId, trainerId);
      assert.equal(scheduleQuery.where.startTime.gte.toISOString(), '2026-11-10T21:00:00.000Z');
      assert.equal(scheduleQuery.where.startTime.lt.toISOString(), '2026-11-11T21:00:00.000Z');
      assert.deepEqual(scheduleQuery.orderBy, [{ startTime: 'asc' }, { id: 'asc' }]);
      assert.equal(response.body[0].participants[0].bookingId, bookingId);
      assert.equal(response.body[0].serviceName, 'Занятие 45 мин');
      for (const date of ['2026-02-30', '2026-13-01', 'bad']) await get(`schedule?date=${date}`).expect(400);
      await get('schedule?date=2026-11-11&trainerId=forged').expect(400);
      await get('horses').expect(200);
    });
    await t.test('mutations check UUIDs, status, reason, participant and ownership, then delegate to audited domain services', async () => {
      await patch('bad/status', { status: 'COMPLETED' }).expect(400);
      await patch(`${id}/status`, { status: 'SCHEDULED' }).expect(400);
      await patch(`${id}/status`, { status: 'NO_SHOW', reason: '  ' }).expect(400);
      await patch(`${id}/status`, { status: 'CANCELLED' }).expect(400);
      await patch(`${id}/horse`, { horseId: 'bad' }).expect(400);
      owner = horseId;
      await patch(`${id}/status`, { status: 'COMPLETED' }).expect(403);
      await patch(`${id}/horse`, { horseId }).expect(403); owner = trainerId;
      await patch(`${id}/horse`, { horseId, bookingId: horseId }).expect(400);
      await patch(`${id}/status`, { status: 'NO_SHOW', reason: 'Клиент не пришёл' }).expect(200);
      assert.equal(mutations[0][2], 'NO_SHOW'); assert.equal(mutations[0][6], '12345');
      assert.deepEqual(mutations[0][5], { reason: 'Клиент не пришёл' });
      await patch(`${id}/horse`, { horseId }).expect(200);
      assert.equal(mutations[1][1], bookingId); assert.equal(mutations[1][5], '12345');
      lesson.bookings.push({ ...lesson.bookings[0], id: horseId });
      await patch(`${id}/horse`, { horseId }).expect(400);
      lesson.bookings.pop();
      user.role = 'ADMIN'; owner = horseId;
      await patch(`${id}/status`, { status: 'COMPLETED' }).expect(200);
      user.role = 'TRAINER'; owner = trainerId;
    });
    await t.test('READ_ONLY allows reads and blocks both PATCH routes; HIDDEN and disabled reject reads', async () => {
      const writes = mutations.length;
      level = 'READ_ONLY'; await get('schedule?date=2026-11-11').expect(200);
      await patch(`${id}/status`, { status: 'COMPLETED' }).expect(403);
      await patch(`${id}/horse`, { horseId }).expect(403); assert.equal(mutations.length, writes);
      level = 'HIDDEN'; await get('schedule?date=2026-11-11').expect(403);
      level = 'FULL'; enabled = false; await get('horses').expect(403);
    });
  } finally { await app.close(); if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous; }
});

test('horse transaction rechecks TMA binding, owner and module before writing', async () => {
  let owner = horseId, enabled = true, rulesCalled = false;
  const actor = { id, role: 'MANAGER', trainerId, email: 'test@test.local' };
  const tx = { booking: { findUnique: async () => ({ id: bookingId, lessonId: id }) },
    lesson: { findUnique: async () => ({ trainerId: owner }) },
    user: { findUnique: async () => ({ ...actor, crmAccess: true, trainer: { isActive: true } }) },
    clubModuleSettings: { findUnique: async () => ({ isEnabled: enabled }) }, roleModulePermission: { findUnique: async () => ({ accessLevel: 'FULL' }) } };
  const service = new BookingsService({ $transaction: async operation => operation(tx) }, { validate: async () => { rulesCalled = true; } });
  await assert.rejects(service.replaceHorse(bookingId, horseId, undefined, actor, '12345'), error => error.getStatus() === 403);
  owner = trainerId; enabled = false;
  await assert.rejects(service.replaceHorse(bookingId, horseId, undefined, actor, '12345'), error => error.getStatus() === 403);
  assert.equal(rulesCalled, false);
});
