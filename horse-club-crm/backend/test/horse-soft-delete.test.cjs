const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { ValidationPipe } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { HorsesService } = require('../dist/horses/horses.service');
const { HorsesController } = require('../dist/horses/horses.controller');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');

const id = '00000000-0000-4000-8000-000000000091';
const counts = { bookings: 0, boardingContracts: 0, vetRecords: 0, vetEvents: 0, healthLogs: 0, dailyLogs: 0 };

function fixture(history = {}, blocking = '') {
  let horse = { id, name: 'Валдай', deletedAt: null, isPublic: true, isUnavailable: false, stallNumber: '1',
    _count: { ...counts, ...history }, boardingContracts: [], bookings: history.bookings ? [{ id: 'past', horseId: id, lesson: { status: 'COMPLETED' } }] : [] };
  const writes = [];
  const client = { preferredHorseId: id };
  const stall = { horseId: id, status: 'OCCUPIED' };
  const tx = {
    $queryRaw: async () => [],
    horse: {
      findUnique: async () => horse,
      count: async ({ where }) => horse && (where.deletedAt === undefined || !horse.deletedAt) ? 1 : 0,
      findMany: async ({ where }) => horse && (where.deletedAt === undefined || !horse.deletedAt) ? [horse] : [],
      update: async ({ data }) => { writes.push('update'); horse = { ...horse, ...data }; return horse; },
      delete: async () => { writes.push('delete'); const result = horse; horse = null; return result; },
    },
    booking: { findFirst: async ({ where }) => {
      assert.equal(where.horseId, id);
      assert.equal(where.OR[0].status, 'scheduled');
      assert.equal(where.OR[1].lesson.is.status, 'SCHEDULED');
      assert.ok(where.OR[0].endTime.gt instanceof Date);
      assert.ok(where.OR[1].lesson.is.endTime.gt instanceof Date);
      return blocking === 'booking' ? { id: 'future' } : null;
    } },
    boardingContract: { findFirst: async ({ where }) => {
      if (where.status === 'ACTIVE') return blocking === 'boarding' ? { id: 'active' } : null;
      return null;
    } },
    client: { updateMany: async ({ data }) => { writes.push('client'); Object.assign(client, data); return { count: 1 }; } },
    stall: { updateMany: async ({ where, data }) => {
      if (stall.horseId === where.horseId && (!where.status || where.status === stall.status)) Object.assign(stall, data);
      writes.push('stall'); return { count: 1 };
    } },
  };
  const prisma = { ...tx, $transaction: async (operation, options) => {
    if (typeof operation !== 'function') return Promise.all(operation);
    assert.equal(options.isolationLevel, 'Serializable');
    return operation(tx);
  } };
  return { service: new HorsesService(prisma), prisma, writes, client, stall };
}

test('horse without history is physically deleted and releases preferences and stall', async () => {
  const f = fixture();
  await f.service.remove(id);
  assert.ok(f.writes.includes('delete'));
  assert.ok(!f.writes.includes('update'));
  assert.equal(f.client.preferredHorseId, null);
  assert.deepEqual(f.stall, { horseId: null, status: 'AVAILABLE' });
});

for (const relation of Object.keys(counts)) test(`horse with ${relation} history is archived without deleting history`, async () => {
  const f = fixture({ [relation]: 1 });
  const result = await f.service.remove(id);
  assert.ok(result.deletedAt instanceof Date);
  assert.equal(result.isUnavailable, true);
  assert.equal(result.isPublic, false);
  assert.equal(result.stallNumber, null);
  assert.equal(f.client.preferredHorseId, null);
  assert.deepEqual(f.stall, { horseId: null, status: 'AVAILABLE' });
  assert.ok(!f.writes.includes('delete'));
  assert.equal((await f.service.findAll({})).total, 0);
  assert.equal((await f.service.findAll({ includeArchived: 'true' })).total, 1);
  const card = await f.service.findOne(id);
  assert.ok(card.deletedAt);
  if (relation === 'bookings') assert.deepEqual(card.bookings, [{ id: 'past', horseId: id, lesson: { status: 'COMPLETED' } }]);
  await assert.rejects(f.service.remove(id), error => error.getStatus() === 404 && error.message === 'Лошадь не найдена');
});

test('missing horse returns 404', async () => {
  const f = fixture();
  await f.service.remove(id);
  await assert.rejects(f.service.remove(id), error => error.getStatus() === 404);
});

for (const blocking of ['booking', 'boarding']) test(`${blocking} blocks DELETE with a readable 409 and no mutations`, async () => {
  const f = fixture({ bookings: 1 }, blocking);
  const moduleRef = await Test.createTestingModule({ controllers: [HorsesController], providers: [
    HorsesService, { provide: PrismaService, useValue: f.prisma },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
    .overrideGuard(ModuleAccessGuard).useValue({ canActivate: () => true }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    const response = await request(app.getHttpServer()).delete(`/horses/${id}`).expect(409);
    assert.equal(response.body.message, blocking === 'booking'
      ? 'У лошади есть запланированные занятия. Сначала снимите её с расписания или замените лошадь.'
      : 'У лошади есть активный договор постоя. Сначала завершите договор постоя.');
    assert.deepEqual(f.writes, []);
    await request(app.getHttpServer()).get('/horses?includeArchived=true').expect(200);
    await request(app.getHttpServer()).get('/horses?includeArchived=invalid').expect(400);
  } finally { await app.close(); }
});

test('HTTP DELETE archives completed history; GET list hides it, direct GET retains it', async () => {
  const f = fixture({ bookings: 1 });
  const moduleRef = await Test.createTestingModule({ controllers: [HorsesController], providers: [
    HorsesService, { provide: PrismaService, useValue: f.prisma },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
    .overrideGuard(ModuleAccessGuard).useValue({ canActivate: () => true }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    await request(app.getHttpServer()).delete(`/horses/${id}`).expect(200);
    const list = await request(app.getHttpServer()).get('/horses').expect(200);
    assert.deepEqual(list.body, []);
    assert.equal(list.headers['x-total-count'], '0');
    const all = await request(app.getHttpServer()).get('/horses?includeArchived=true').expect(200);
    assert.equal(all.body[0].id, id);
    const card = await request(app.getHttpServer()).get(`/horses/${id}`).expect(200);
    assert.ok(card.body.deletedAt);
    assert.equal(card.body.bookings[0].horseId, id);
    assert.equal(card.body.bookings[0].lesson.status, 'COMPLETED');
  } finally { await app.close(); }
});
