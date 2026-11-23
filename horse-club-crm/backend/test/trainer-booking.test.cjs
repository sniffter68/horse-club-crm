const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { LessonsController } = require('../dist/lessons/lessons.controller');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { ClientsController } = require('../dist/clients/clients.controller');
const { ClientsService } = require('../dist/clients/clients.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');
const { membershipAccessWhere } = require('../dist/memberships/membership-access');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { id: id(1), email: 'trainer@test.local', role: 'TRAINER', trainerId: id(2) };
const dto = { trainerId: id(2), serviceId: id(3), clientId: id(4), startTime: '2026-11-24T10:00:00Z' };

function setup() {
  const audits = [], writes = [];
  let policy = { lessonCreateOwn: true, lessonCreateAny: false };
  let membership = { id: id(5), clientId: id(4), status: 'active', type: 'fixed_lessons', serviceId: id(3), remainedLessons: 2, validFrom: new Date('2026-11-01'), validUntil: new Date('2026-12-01') };
  let shared = false, failAudit = false;
  const tx = {
    roleAccess: { findUnique: async () => policy },
    service: { findUnique: async () => ({ durationMinutes: 60, price: 1500, name: 'Тренировка', title: 'Тренировка', maxCapacity: 4, allowMembership: true }) },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
    membership: { findUnique: async () => membership },
    membershipMember: { findUnique: async () => shared ? { client: { deletedAt: null } } : null },
    lesson: { findMany: async () => [], create: async ({ data }) => {
      writes.push(data);
      return { ...data, id: id(6), trainer: { id: data.trainerId, name: 'Тренер', commissionPercent: 30 }, service: { id: id(3), name: 'Тренировка', price: 1500 }, arena: null,
        bookings: data.bookings.create.map(b => ({ ...b, id: id(7), client: { id: b.clientId, name: 'Новый клиент', medicalNotes: 'secret' }, horse: null, membership: membership, payments: [{ amount: 1500 }] })) };
    } },
    cashAuditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit unavailable'); audits.push(data); } },
  };
  const prisma = { roleAccess: tx.roleAccess, $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const before = writes.length;
    try { return await run(tx); } catch (error) { writes.splice(before); throw error; }
  } };
  const lessons = new LessonsService(prisma, {}, { validate: async () => {} });
  return { lessons, audits, writes, setPolicy: value => { policy = value; }, setMembership: value => { membership = value; }, membership: () => membership, share: () => { shared = true; }, failAudit: () => { failAudit = true; } };
}

test('trainer booking HTTP: ownership, safe responses, quick client, finance and module RBAC', async t => {
  const state = setup();
  let user = actor, level = 'FULL';
  const module = await Test.createTestingModule({ controllers: [LessonsController, ClientsController], providers: [
    { provide: LessonsService, useValue: state.lessons },
    { provide: ClientsService, useValue: { bookingMemberships: async () => [{ id: id(5), title: 'Активный абонемент' }], quickCreate: async data => ({ id: id(4), name: data.name, phone: data.phone, clientType: 'ONE_TIME', medicalNotes: 'private', payments: [{ amount: 42 }], balance: 42 }) } },
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'SCHEDULE', isEnabled: true, accessLevel: level }] } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => { context.switchToHttp().getRequest().user = user; return true; } }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  t.after(() => app.close());
  const api = request(app.getHttpServer());
  const client = await api.post('/clients/quick').send({ name: 'Новый клиент', phone: '+79001234567', isOneTime: true }).expect(201);
  assert.deepEqual(client.body, { id: id(4), name: 'Новый клиент', clientType: 'ONE_TIME' });
  const result = await api.post('/lessons').send({ ...dto, clientId: client.body.id }).expect(201);
  assert.equal(result.body.isOwn, true);
  assert.deepEqual(result.body.bookings[0].client, { id: id(4), name: 'Новый клиент' });
  for (const field of ['cost', 'prepaymentAmount', 'paymentStatus']) assert.equal(field in result.body, false);
  for (const field of ['membership', 'payments', 'costAmount']) assert.equal(field in result.body.bookings[0], false);
  assert.equal(state.audits[0].action, 'LESSON_CREATED_BY_TRAINER');
  assert.deepEqual(state.audits[0].details, { lessonId: id(6), trainerId: id(2) });
  assert.equal(state.audits[0].actorId, actor.id); assert.equal(state.audits[0].actorName, actor.email);
  assert.equal(state.writes[0].cost.toNumber(), 1500);
  await api.post('/lessons').send({ ...dto, trainerId: id(99) }).expect(403);
  await api.post('/lessons').send({ ...dto, trainerId: undefined }).expect(201);
  for (const extra of [{ cost: 0 }, { pricePerPerson: 1 }, { prepaymentAmount: 0 }, { prepaymentMethod: 'CASH' }, { cost: null }]) {
    const response = await api.post('/lessons').send({ ...dto, ...extra }).expect(403);
    assert.equal(response.body.message, 'Тренер не может указывать финансовые параметры оплаты при записи');
  }
  user = { ...actor, trainerId: null };
  const unlinked = await api.post('/lessons').send(dto).expect(403);
  assert.equal(unlinked.body.message, 'Профиль пользователя не привязан к тренеру');
  user = actor;
  const catalogPath = `/clients/${id(4)}/booking-memberships?serviceId=${id(3)}&from=${dto.startTime}&to=2026-11-24T11:00:00Z`;
  const catalog = await api.get(catalogPath).expect(200);
  assert.deepEqual(catalog.body, [{ id: id(5), title: 'Активный абонемент' }]);
  await api.get(catalogPath.replace(id(3), 'invalid')).expect(400);
  for (const access of ['READ_ONLY', 'HIDDEN']) {
    level = access;
    await api.get(catalogPath).expect(access === 'HIDDEN' ? 403 : 200);
    await api.post('/lessons').send(dto).expect(403);
    await api.post('/clients/quick').send({ name: 'Гость' }).expect(403);
  }
  assert.equal(state.writes.length, 2);
  level = 'FULL';
  state.setPolicy({ lessonCreateOwn: true, lessonCreateAny: true });
  const foreign = await api.post('/lessons').send({ ...dto, trainerId: id(99) }).expect(201);
  assert.equal(foreign.body.isOwn, false);
  assert.equal(foreign.body.trainerId, id(99));
  assert.equal(foreign.body.bookings[0].client, null);
  for (const field of ['cost', 'pricePerPerson', 'prepaymentAmount', 'paymentStatus']) assert.equal(field in foreign.body, false);
  assert.equal(state.writes.at(-1).status, 'SCHEDULED');
  assert.equal(state.writes.at(-1).paymentStatus, 'UNPAID');
  assert.equal(state.audits.at(-1).actorId, actor.id);
  assert.equal(state.audits.at(-1).actorName, actor.email);
  assert.equal(state.audits.at(-1).details.trainerId, id(99));
  user = { ...actor, trainerId: null };
  await api.post('/lessons').send({ ...dto, trainerId: id(99) }).expect(201);
  await api.post('/lessons').send({ ...dto, trainerId: undefined }).expect(400);
  user = actor;
  await api.post('/lessons').send({ ...dto, trainerId: undefined }).expect(201);
  state.setPolicy({ lessonCreateOwn: false, lessonCreateAny: false });
  const denied = await api.post('/lessons').send(dto).expect(403);
  assert.equal(denied.body.message, 'Создание записей в расписании запрещено настройками роли');
});

test('trainer memberships: owner/family, active interval, service, type and atomic audit', async () => {
  const state = setup();
  const withMembership = { ...dto, membershipId: id(5) };
  await state.lessons.createLesson(withMembership, undefined, actor);
  const original = state.membership();
  for (const change of [{ clientId: id(90) }, { status: 'frozen' }, { remainedLessons: 0 }, { deletedAt: new Date() }, { validUntil: new Date('2026-11-24T10:30Z') }, { validFrom: new Date('2026-11-25') }, { serviceId: id(99) }, { type: 'deposit' }]) {
    state.setMembership({ ...original, ...change });
    await assert.rejects(state.lessons.createLesson(withMembership, undefined, actor), error => error.getStatus() === 400);
  }
  state.setMembership({ ...original, clientId: id(90) }); state.share();
  await state.lessons.createLesson({ ...dto, clientId: undefined, participants: [{ clientId: id(4), membershipId: id(5) }] }, undefined, actor);
  await assert.rejects(state.lessons.createLesson({ ...dto, trainerId: id(99) }, undefined, actor), error => error.getStatus() === 403);
  state.failAudit();
  const before = state.writes.length;
  await assert.rejects(state.lessons.createLesson(dto, undefined, actor), /audit unavailable/);
  assert.equal(state.writes.length, before);
});

test('booking membership catalog selects only safe fields and scopes owner/family, service and full interval', async () => {
  let query;
  const service = new ClientsService({ service: { findUnique: async () => ({ allowMembership: true }) }, membership: { findMany: async args => { query = args; return [{ id: id(5), title: 'Активный абонемент' }]; } } });
  const interval = { serviceId: id(3), from: dto.startTime, to: '2026-11-24T11:00:00Z' };
  assert.deepEqual(await service.bookingMemberships(id(4), interval), [{ id: id(5), title: 'Активный абонемент' }]);
  assert.deepEqual(query.select, { id: true, title: true });
  assert.deepEqual(query.where.AND[0], membershipAccessWhere(id(4)));
  assert.equal(query.where.status, 'active'); assert.equal(query.where.type, 'fixed_lessons');
  assert.equal(query.where.validTo.gte.toISOString(), new Date(interval.to).toISOString());
  assert.equal(query.where.cancelledAt, null);
  assert.equal(query.where.deletedAt, null);
  assert.deepEqual(query.where.remainingUnits, { gt: 0 });
  assert.ok(query.where.AND[2].validFrom.lte instanceof Date);
  assert.ok(query.where.AND[2].validTo.gte instanceof Date);
  await assert.rejects(service.bookingMemberships(id(4), { ...interval, to: interval.from }), error => error.getStatus() === 400);
});

test('trainer can load booking dictionaries without financial fields', async t => {
  const pairs = [
    ['Services', 'services'], ['Arenas', 'arenas'], ['Horses', 'horses'], ['Trainers', 'trainers'],
  ].map(([name, path]) => ({ path,
    controller: require(`../dist/${path}/${path}.controller`)[`${name}Controller`],
    service: require(`../dist/${path}/${path}.service`)[`${name}Service`],
  }));
  const module = await Test.createTestingModule({ controllers: pairs.map(row => row.controller), providers: [
    { provide: require('../dist/vk-bot/vk-identity.service').VkIdentityService, useValue: {} },
    ...pairs.map(row => ({ provide: row.service, useValue: { findAll: async () => ({ total: 1, data: [{ id: id(9), name: 'Справочник', price: 1500, commissionPercent: 30, medicalNotes: 'private' }] }) } })),
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'SCHEDULE', isEnabled: true, accessLevel: 'FULL' }] } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => { context.switchToHttp().getRequest().user = actor; return true; } }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalInterceptors(new (require('../dist/common/interceptors/sanitize-rbac.interceptor').SanitizeRbacInterceptor)(new (require('@nestjs/core').Reflector)()));
  await app.init(); t.after(() => app.close());
  const api = request(app.getHttpServer());
  for (const row of pairs) {
    const response = await api.get(`/${row.path}`).expect(200);
    assert.equal(response.body[0].name, 'Справочник');
    if (row.path !== 'arenas') {
      assert.equal('medicalNotes' in response.body[0], false);
      assert.equal('price' in response.body[0], false);
    }
  }
});
