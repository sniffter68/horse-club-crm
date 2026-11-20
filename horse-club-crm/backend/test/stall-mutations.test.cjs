require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { StallsService } = require('../dist/stalls/stalls.service');
const { StallsController } = require('../dist/stalls/stalls.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { RoleAccessGuard } = require('../dist/auth/role-access.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const id = '00000000-0000-4000-8000-000000000001';
const actor = { id, email: 'manager@example.test' };
function fixture(extra = {}, contracts = []) {
  const state = { stall: { id, name: 'Старый', number: '1', type: 'STALL', status: 'AVAILABLE', horseId: null,
    isUnavailable: false, buildingId: id, row: 1, col: 1, rowSpan: 1, colSpan: 1, ...extra }, contracts, audit: [], horse: {} };
  const db = {
    stall: {
      findUnique: async () => state.stall,
      findMany: async () => state.stall ? [state.stall] : [],
      update: async ({ data }) => (state.stall = { ...state.stall, ...data }),
      delete: async () => { assert.ok(state.contracts.every(c => c.stallId === null)); const result = state.stall; state.stall = null; return result; },
    },
    boardingContract: {
      count: async () => state.contracts.filter(c => ['ACTIVE', 'SUSPENDED'].includes(c.status)).length,
      updateMany: async () => { state.contracts.forEach(c => { c.stallId = null; }); },
    },
    stableBuilding: { findMany: async () => [{ id, gridRows: 10, gridCols: 10 }], findUnique: async () => ({ id, gridRows: 10, gridCols: 10 }) },
    horse: { update: async ({ data }) => Object.assign(state.horse, data) },
    cashAuditLog: { create: async ({ data }) => { state.audit.push(data); } },
    $transaction: async fn => {
      const before = structuredClone(state);
      try { return await fn(db); } catch (error) { Object.assign(state, before); throw error; }
    },
  };
  return { db, state, service: new StallsService(db) };
}
test('rename ignores unchanged legacy grid, normalizes labels, synchronizes occupied horse and audits', async () => {
  const { service, state } = fixture({ horseId: id, status: 'OCCUPIED' });
  await service.update(id, { name: '  Новый   денник ', number: ' 12 ', row: 1 }, actor);
  assert.equal(state.stall.name, 'Новый денник'); assert.equal(state.stall.number, '12');
  assert.equal(state.horse.stallNumber, '12');
  assert.equal(state.audit[0].action, 'STALL_UPDATED'); assert.equal(state.audit[0].actorId, id);
  assert.equal(state.audit[0].details.before.name, 'Старый'); assert.equal(state.audit[0].details.before.number, '1');
});
for (const contracts of [[], [{ stallId: id, status: 'EXPIRED', notes: 'История' }]]) {
  test(`free stall deletion retains history (${contracts.length} contracts) and audits`, async () => {
    const { service, state } = fixture({}, structuredClone(contracts));
    await service.remove(id, actor);
    assert.equal(state.stall, null); assert.equal(state.contracts.length, contracts.length);
    if (contracts.length) { assert.equal(state.contracts[0].stallId, null); assert.equal(state.contracts[0].notes, 'История'); }
    assert.equal(state.audit[0].action, 'STALL_DELETED'); assert.equal(state.audit[0].actorName, actor.email);
  });
}
for (const [extra, contracts] of [[{ horseId: id }, []], [{ status: 'OCCUPIED' }, []], [{}, [{ stallId: id, status: 'ACTIVE' }]], [{}, [{ stallId: id, status: 'SUSPENDED' }]]]) {
  test(`occupied deletion returns Russian 400: ${JSON.stringify([extra, contracts])}`, async () => {
    const { service, state } = fixture(extra, contracts);
    await assert.rejects(service.remove(id, actor), error => error.getStatus() === 400 && /Нельзя удалить занятый денник/.test(error.message));
    assert.ok(state.stall); assert.equal(state.audit.length, 0);
  });
}
test('audit failure rolls back rename and history detachment/deletion', async () => {
  for (const action of ['update', 'remove']) {
    const { service, db, state } = fixture({}, [{ stallId: id, status: 'EXPIRED' }]);
    db.cashAuditLog.create = async () => { throw new Error('audit failed'); };
    const before = structuredClone(state);
    await assert.rejects(action === 'update' ? service.update(id, { number: '2' }, actor) : service.remove(id, actor), /audit failed/);
    assert.deepEqual(state, before);
  }
});
test('HTTP PATCH validates DTO, accepts legacy null building, persists labels; DELETE enforces occupancy', async () => {
  const { service, state } = fixture({ buildingId: null });
  let builder = Test.createTestingModule({ controllers: [StallsController], providers: [{ provide: StallsService, useValue: service }] });
  builder = builder.overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) { ctx.switchToHttp().getRequest().user = { ...actor, role: 'ADMIN' }; return true; } });
  for (const guard of [RolesGuard, RoleAccessGuard, ModuleAccessGuard]) builder = builder.overrideGuard(guard).useValue({ canActivate: () => true });
  const app = (await builder.compile()).createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    const server = app.getHttpServer();
    await request(server).patch(`/stalls/${id}`).send({ name: 'Новый', number: '15', buildingId: null }).expect(200);
    assert.equal(state.stall.number, '15'); assert.equal(state.audit.length, 1);
    await request(server).get(`/stalls/${id}`).expect(200).expect(res => { assert.equal(res.body.name, 'Новый'); assert.equal(res.body.number, '15'); });
    await request(server).patch(`/stalls/${id}`).send({ type: 'SERVICE', name: 'Амуничник' }).expect(200);
    await request(server).get(`/stalls/${id}`).expect(200).expect(res => { assert.equal(res.body.type, 'SERVICE'); assert.equal(res.body.name, 'Амуничник'); assert.equal(res.body.number, ''); });
    await request(server).patch(`/stalls/${id}`).send({ type: 'STALL', number: '15' }).expect(200);
    for (const body of [{ number: '' }, { number: 123 }, { name: 'x'.repeat(151) }, { title: 'x' }])
      await request(server).patch(`/stalls/${id}`).send(body).expect(400);
    const layout = { id, buildingId: id, row: 2, col: 3, rowSpan: 2, colSpan: 2, type: 'SERVICE', name: '  Склад   кормов ' };
    await request(server).patch('/stalls/layout').send([layout]).expect(200);
    await request(server).get(`/stalls/${id}`).expect(200).expect(res => {
      assert.equal(res.body.name, 'Склад кормов'); assert.equal(res.body.number, ''); assert.equal(res.body.type, 'SERVICE');
      assert.equal(res.body.row, 2); assert.equal(res.body.col, 3); assert.equal(res.body.rowSpan, 2); assert.equal(res.body.colSpan, 2);
    });
    assert.equal(state.audit.at(-1).details.source, 'layout');
    assert.equal(state.audit.at(-1).details.before.row, 1);
    await request(server).patch('/stalls/layout').send([{ ...layout, type: 'DEN' }]).expect(400);
    state.stall.horseId = id;
    await request(server).delete(`/stalls/${id}`).expect(400).expect(res => assert.match(res.body.message, /Сначала освободите/));
    state.stall.horseId = null;
    await request(server).delete(`/stalls/${id}`).expect(200);
    await request(server).delete(`/stalls/${id}`).expect(404);
    await request(server).patch('/stalls/invalid').send({ number: '3' }).expect(400);
  } finally { await app.close(); }
});


test('layout audit failure rolls back room parameters and geometry; occupied rooms cannot become SERVICE', async () => {
  const { service, db, state } = fixture();
  const layout = [{ id, buildingId: id, row: 2, col: 2, rowSpan: 2, colSpan: 2, name: 'Склад', type: 'SERVICE' }];
  const before = structuredClone(state);
  db.cashAuditLog.create = async () => { throw new Error('audit failed'); };
  await assert.rejects(service.saveLayout(layout, actor), /audit failed/);
  assert.deepEqual(state, before);
  state.stall.horseId = id; state.stall.status = 'OCCUPIED';
  await assert.rejects(service.saveLayout(layout, actor), /Сначала освободите/);
  assert.equal(state.stall.type, 'STALL'); assert.equal(state.stall.row, 1);
});
