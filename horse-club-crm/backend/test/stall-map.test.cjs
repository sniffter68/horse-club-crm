require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Prisma } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { StallsService } = require('../dist/stalls/stalls.service');
const { StallsController } = require('../dist/stalls/stalls.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { RoleAccessGuard } = require('../dist/auth/role-access.guard');
const { neighborhoodWarnings } = require('../dist/stalls/neighborhood');
const sid = '00000000-0000-4000-8000-000000000001';
const hid = '00000000-0000-4000-8000-000000000002';
function fixture() {
  const stalls = [1, 2, 3].map((n, i) => ({ id: i ? `s${n}` : sid, name: `Денник ${n}`, number: String(n), zone: 'MAIN', side: 'LEFT',
    position: n, status: 'AVAILABLE', horseId: null, isUnavailable: false }));
  const horses = [{ id: hid, name: 'Буран', sex: 'STALLION', stallNumber: null }, { id: 'mare', name: 'Искра', sex: 'MARE' }];
  const hydrate = stall => stall && { ...stall, horse: horses.find(h => h.id === stall.horseId) ?? null };
  const prisma = {
    stall: {
      findUnique: async ({ where }) => hydrate(stalls.find(s => s.id === where.id)),
      findMany: async () => stalls.map(hydrate),
      update: async ({ where, data }) => Object.assign(stalls.find(s => s.id === where.id), data),
      updateMany: async ({ where, data }) => { stalls.filter(s => s.horseId === where.horseId && s.id !== where.id.not).forEach(s => Object.assign(s, data)); },
    },
    horse: {
      findMany: async () => horses.map(({ id, name }) => ({ id, name })),
      findUnique: async ({ where }) => horses.find(h => h.id === where.id),
      update: async ({ where, data }) => Object.assign(horses.find(h => h.id === where.id), data),
    },
    $transaction: async (operation, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      const snapshot = structuredClone({ stalls, horses });
      try { return await operation(prisma); }
      catch (error) { stalls.splice(0, stalls.length, ...snapshot.stalls); horses.splice(0, horses.length, ...snapshot.horses); throw error; }
    },
  };
  return { stalls, horses, prisma, service: new StallsService(prisma) };
}
test('assignment, relocation and eviction keep one physical placement', async () => {
  const { service, stalls, horses } = fixture();
  await service.assign(sid, hid);
  assert.equal(stalls[0].status, 'OCCUPIED');
  await service.assign('s2', hid);
  assert.equal(stalls[0].horseId, null); assert.equal(stalls[0].status, 'AVAILABLE');
  assert.equal(stalls[1].horseId, hid); assert.equal(horses[0].stallNumber, '2');
  await service.assign('s2', null);
  assert.equal(stalls[1].status, 'AVAILABLE'); assert.equal(horses[0].stallNumber, null);
});
test('assignment returns symmetric stallion/mare warnings without blocking', async () => {
  const { service, stalls } = fixture();
  stalls[1].horseId = 'mare'; stalls[1].status = 'OCCUPIED';
  const result = await service.assign(sid, hid);
  assert.equal(result.warnings.length, 1); assert.match(result.warnings[0].message, /кобылой/);
  assert.equal((await service.map())[1].warnings[0].neighborId, sid);
});
test('neighbors include opposite stall, exclude diagonal, other buildings, geldings and unknown sex', () => {
  const base = { id: 'a', name: '1', number: '1', zone: 'MAIN', side: 'LEFT', position: 2, horse: { sex: 'STALLION' } };
  const candidates = [
    { ...base, id: 'opposite', side: 'RIGHT' }, { ...base, id: 'next', position: 3, horse: { sex: 'MARE' } },
    { ...base, id: 'diagonal', side: 'RIGHT', position: 3 }, { ...base, id: 'summer', zone: 'SUMMER' },
    { ...base, id: 'gelding', position: 1, horse: { sex: 'GELDING' } }, { ...base, id: 'unknown', position: 1, horse: { sex: null } },
  ];
  assert.deepEqual(neighborhoodWarnings(base, candidates).map(w => w.neighborId), ['opposite', 'next']);
  assert.deepEqual(neighborhoodWarnings({ ...base, position: null }, candidates), []);
});
test('occupied, unavailable and missing destinations preserve the old placement', async () => {
  const { service, stalls } = fixture();
  await service.assign(sid, hid);
  for (const status of ['MAINTENANCE', 'QUARANTINE']) {
    stalls[1].status = status;
    await assert.rejects(service.assign('s2', hid), e => e.getStatus() === 409);
    assert.equal(stalls[0].horseId, hid);
  }
  stalls[1].status = 'OCCUPIED'; stalls[1].horseId = 'mare';
  await assert.rejects(service.assign('s2', hid), e => e.getStatus() === 409);
  await assert.rejects(service.assign('missing', hid), e => e.getStatus() === 404);
  await assert.rejects(service.assign('s3', 'missing'), e => e.getStatus() === 404);
  await assert.rejects(service.update(sid, { status: 'MAINTENANCE' }), e => e.getStatus() === 409);
});
test('failed final write rolls relocation back; serialization conflicts retry', async () => {
  const { service, prisma, stalls } = fixture();
  await service.assign(sid, hid);
  const update = prisma.stall.update;
  prisma.stall.update = async () => { throw new Error('database failure'); };
  await assert.rejects(service.assign('s2', hid), /database failure/);
  assert.equal(stalls[0].horseId, hid); assert.equal(stalls[1].horseId, null);
  prisma.stall.update = update;
  const transaction = prisma.$transaction; let attempts = 0;
  prisma.$transaction = async (...args) => { if (++attempts === 1) throw new Prisma.PrismaClientKnownRequestError('race', { code: 'P2034', clientVersion: '6' }); return transaction(...args); };
  await service.assign('s2', hid); assert.equal(attempts, 2);
});
test('stall HTTP API validates assignment and restricts mutations to ADMIN/MANAGER', async () => {
  const { service } = fixture();
  const module = await Test.createTestingModule({ controllers: [StallsController], providers: [RolesGuard, { provide: StallsService, useValue: service }] })
    .overrideGuard(require('../dist/auth/module-access.guard').ModuleAccessGuard).useValue({ canActivate: () => true })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) { const req = context.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] }; return true; } })
    .overrideGuard(RoleAccessGuard).useValue({ canActivate: () => true }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  try {
    const server = app.getHttpServer(), path = `/stalls/${sid}/assign`;
    await request(server).get('/stalls/map').set('x-role', 'TRAINER').expect(200);
    await request(server).get('/stalls/assignment-horses').set('x-role', 'TRAINER').expect(403);
    await request(server).get('/stalls/assignment-horses').set('x-role', 'MANAGER').expect(200);
    await request(server).patch(path).set('x-role', 'TRAINER').send({ horseId: hid }).expect(403);
    for (const body of [{}, { horseId: 'bad' }, { horseId: 12 }, { horseId: hid, status: 'OCCUPIED' }])
      await request(server).patch(path).set('x-role', 'ADMIN').send(body).expect(400);
    for (const body of [{ status: null }, { zone: null }, { number: null }, { name: null }, { position: 0 }, { side: 'UP' }])
      await request(server).patch(`/stalls/${sid}`).set('x-role', 'ADMIN').send(body).expect(400);
    await request(server).patch(path).set('x-role', 'MANAGER').send({ horseId: hid }).expect(200);
    await request(server).patch(path).set('x-role', 'ADMIN').send({ horseId: null }).expect(200);
    await request(server).patch(`/stalls/${sid}`).set('x-role', 'TRAINER').send({ notes: 'x' }).expect(403);
    await request(server).post('/stalls').set('x-role', 'TRAINER').send({ number: '5' }).expect(403);
  } finally { await app.close(); }
});
