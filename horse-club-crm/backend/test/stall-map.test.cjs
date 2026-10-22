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
const { neighborhoodWarnings, stallRowPosition } = require('../dist/stalls/neighborhood');
const sid = '00000000-0000-4000-8000-000000000001';
const hid = '00000000-0000-4000-8000-000000000002';
function fixture() {
  const stalls = [1, 2, 3].map((n, i) => ({ id: i ? `s${n}` : sid, name: `Денник ${n}`, number: String(n), zone: 'MAIN', side: 'LEFT',
    position: n, status: 'AVAILABLE', horseId: null, isUnavailable: false }));
  const horses = [{ id: hid, name: 'Буран', sex: 'STALLION', stallNumber: null }, { id: 'mare', name: 'Искра', sex: 'MARE' }];
  const hydrate = stall => stall && { ...stall, horse: horses.find(h => h.id === stall.horseId) ?? null };
  const audit = [];
  const prisma = {
    stallTransferLog: { create: async ({ data }) => { audit.push(data); return data; } },
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
      const snapshot = structuredClone({ stalls, horses, audit });
      try { return await operation(prisma); }
      catch (error) { stalls.splice(0, stalls.length, ...snapshot.stalls); horses.splice(0, horses.length, ...snapshot.horses); audit.splice(0, audit.length, ...snapshot.audit); throw error; }
    },
  };
  return { stalls, horses, prisma, audit, service: new StallsService(prisma) };
}
test('numbered rows warn both adjacent stallions and preserve opposite pairs', () => {
  const make = (n, sex = 'STALLION') => ({ id: `s${n}`, number: String(n), name: String(n), zone: 'MAIN',
    side: n % 2 ? 'LEFT' : 'RIGHT', position: n, horse: { name: n === 1 ? 'Адмирал Ушаков' : n === 3 ? 'Кролик' : `Horse ${n}`, sex } });
  const stalls = [make(1), make(2), make(3), { ...make(5), horse: null }, make(7)];
  assert.deepEqual(stalls.map(stall => stallRowPosition(stall, stalls)), [1, 1, 2, 3, 4]);
  assert.deepEqual(neighborhoodWarnings(stalls[0], stalls).map(w => w.neighborId), ['s2', 's3']);
  assert.match(neighborhoodWarnings(stalls[2], stalls)[0].message, /рядом с жеребцом/);
  assert.equal(neighborhoodWarnings(stalls[2], stalls)[0].neighborId, 's1');
  assert.deepEqual(neighborhoodWarnings(stalls[4], stalls), []);
  assert.deepEqual(neighborhoodWarnings(stalls[1], stalls).map(w => w.neighborId), ['s1']);
});

test('transfer and swap update both legacy numbers and write audit atomically', async () => {
  const { service, stalls, horses, audit, prisma } = fixture();
  await service.assign(sid, hid);
  const dto = { sourceStallId: sid, targetStallId: 's2', horseId: hid, swapIfOccupied: false };
  await service.transfer(dto, 'actor');
  assert.equal(stalls[0].horseId, null); assert.equal(stalls[1].horseId, hid);
  assert.equal(audit[0].actorId, 'actor'); assert.equal(audit[0].swappedHorseId, null);
  stalls[0].horseId = 'mare'; stalls[0].status = 'OCCUPIED';
  const swap = { ...dto, sourceStallId: 's2', targetStallId: sid, swapIfOccupied: true };
  const before = structuredClone(stalls);
  const preview = await service.transferPreview(swap);
  assert.ok(preview.every(stall => stall.warnings.length === 1));
  assert.deepEqual(stalls, before);
  await service.transfer(swap, 'actor');
  assert.equal(stalls[0].horseId, hid); assert.equal(stalls[1].horseId, 'mare');
  assert.equal(horses[0].stallNumber, '1'); assert.equal(horses[1].stallNumber, '2');
  assert.equal(audit[1].swappedHorseId, 'mare');
  prisma.stallTransferLog.create = async () => { throw new Error('audit unavailable'); };
  const snapshot = structuredClone({ stalls, horses, audit });
  await assert.rejects(service.transfer({ ...dto, swapIfOccupied: true }, 'actor'), /audit unavailable/);
  assert.deepEqual({ stalls, horses, audit }, snapshot);
});

test('transfer rejects stale source/target, same stall, unavailable and unconfirmed swap', async () => {
  const { service, stalls } = fixture();
  await service.assign(sid, hid);
  const dto = { sourceStallId: sid, targetStallId: 's2', horseId: hid, swapIfOccupied: false };
  await assert.rejects(service.transfer({ ...dto, horseId: 'mare' }, 'actor'), e => e.getStatus() === 409);
  await assert.rejects(service.transfer({ ...dto, targetStallId: sid }, 'actor'), e => e.getStatus() === 400);
  await assert.rejects(service.transfer({ ...dto, targetStallId: 'missing' }, 'actor'), e => e.getStatus() === 404);
  for (const status of ['MAINTENANCE', 'QUARANTINE']) {
    stalls[1].status = status;
    await assert.rejects(service.transfer(dto, 'actor'), e => e.getStatus() === 409);
  }
  stalls[1].status = 'OCCUPIED'; stalls[1].horseId = 'mare';
  await assert.rejects(service.transfer(dto, 'actor'), e => e.getStatus() === 409);
  await assert.rejects(service.transfer({ ...dto, swapIfOccupied: true, expectedTargetHorseId: null }, 'actor'), e => e.getStatus() === 409);
  assert.equal(stalls[0].horseId, hid);
});

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
  const base = { id: 'a', name: '1', number: '1', zone: 'MAIN', side: 'LEFT', position: 2, horse: { name: 'Буран', sex: 'STALLION' } };
  const candidates = [
    { ...base, id: 'opposite', side: 'RIGHT' }, { ...base, id: 'next', position: 3, horse: { sex: 'MARE' } },
    { ...base, id: 'diagonal', side: 'RIGHT', position: 3 }, { ...base, id: 'summer', zone: 'SUMMER' },
    { ...base, id: 'gelding', position: 1, horse: { sex: 'GELDING' } }, { ...base, id: 'unknown', position: 1, horse: { sex: null } },
  ];
  assert.deepEqual(neighborhoodWarnings(base, candidates).map(w => w.neighborId), ['opposite', 'next']);
  assert.equal(neighborhoodWarnings(base, [{ ...base, id: 'opposite', side: 'RIGHT', horse: { name: 'Гром', sex: 'STALLION' } }])[0].message,
    'Нежелательное соседство: жеребец напротив жеребца (Буран и Гром)');
  assert.equal(neighborhoodWarnings(base, [{ ...base, id: 'next', position: 3, horse: { name: 'Искра', sex: 'MARE' } }])[0].message,
    'Жеребец рядом с кобылой (Буран и Искра)');
  assert.deepEqual(neighborhoodWarnings({ ...base, position: null }, candidates), []);
  assert.deepEqual(neighborhoodWarnings(base, [{ ...base, id: 'diagonal', side: 'RIGHT', position: 3 }]), []);
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
  const { service, stalls } = fixture();
  const targetId = '00000000-0000-4000-8000-000000000003';
  stalls[1].id = targetId;
  const module = await Test.createTestingModule({ controllers: [StallsController], providers: [RolesGuard, { provide: StallsService, useValue: service }] })
    .overrideGuard(require('../dist/auth/module-access.guard').ModuleAccessGuard).useValue({ canActivate: () => true })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) { const req = context.switchToHttp().getRequest(); req.user = { id: hid, role: req.headers['x-role'] }; return true; } })
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
    const dto = { sourceStallId: sid, targetStallId: targetId, horseId: hid, swapIfOccupied: false };
    for (const role of ['TRAINER', 'STABLE_WORKER']) {
      await request(server).post('/stalls/transfer').set('x-role', role).send(dto).expect(403);
      await request(server).post('/stalls/transfer/preview').set('x-role', role).send(dto).expect(403);
    }
    for (const body of [{}, { ...dto, horseId: '' }, { ...dto, sourceStallId: 'bad' }, { ...dto, targetStallId: null }, { ...dto, swapIfOccupied: 'true' }])
      await request(server).post('/stalls/transfer').set('x-role', 'ADMIN').send(body).expect(400);
    await request(server).post('/stalls/transfer/preview').set('x-role', 'MANAGER').send(dto).expect(201);
    await request(server).post('/stalls/transfer').set('x-role', 'ADMIN').send(dto).expect(201);
    await request(server).patch(path).set('x-role', 'ADMIN').send({ horseId: null }).expect(200);
    await request(server).patch(`/stalls/${sid}`).set('x-role', 'TRAINER').send({ notes: 'x' }).expect(403);
    await request(server).post('/stalls').set('x-role', 'TRAINER').send({ number: '5' }).expect(403);
  } finally { await app.close(); }
});
