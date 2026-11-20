const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { validateGridBlock } = require('../dist/stalls/grid');
const { StableBuildingsService } = require('../dist/stable-buildings/stable-buildings.service');
const { StallsService } = require('../dist/stalls/stalls.service');
const { neighborhoodWarnings } = require('../dist/stalls/neighborhood');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CreateBuildingDto, UpdateBuildingDto } = require('../dist/stable-buildings/building.dto');
const { CreateStallDto } = require('../dist/stalls/dto/create-stall.dto');
const building = { id: 'b1', name: 'Конюшня', gridRows: 10, gridCols: 4, aisleCols: [2, 3], order: 0 };
const block = (id, row, col, extra = {}) => ({ id, buildingId: 'b1', row, col, rowSpan: 1, colSpan: 1, ...extra });
function database(stalls = []) {
  const state = { buildings: [{ ...building }], stalls: structuredClone(stalls) };
  const tx = {
    cashAuditLog: { create: async () => ({}) },
    stableBuilding: {
      findMany: async () => state.buildings.map(b => ({ ...b, stalls: state.stalls.filter(s => s.buildingId === b.id) })),
      findUnique: async ({ where }) => state.buildings.find(b => b.id === where.id) ?? null,
      create: async ({ data }) => { const b = { id: 'b2', ...data }; state.buildings.push(b); return b; },
      update: async ({ where, data }) => { const b = state.buildings.find(b => b.id === where.id); Object.assign(b, data); return b; },
      delete: async ({ where }) => { state.buildings = state.buildings.filter(b => b.id !== where.id); return { id: where.id }; },
    },
    stall: {
      findMany: async ({ where } = {}) => state.stalls.filter(s => !where?.buildingId || s.buildingId === where.buildingId),
      findUnique: async ({ where }) => state.stalls.find(s => s.id === where.id),
      count: async ({ where }) => state.stalls.filter(s => s.buildingId === where.buildingId).length,
      create: async ({ data }) => { const s = { id: 'new', ...data }; state.stalls.push(s); return s; },
      update: async ({ where, data }) => { const s = state.stalls.find(s => s.id === where.id); Object.assign(s, data); return s; },
    },
  };
  return { state, ...tx, $transaction: async (operation, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const previous = structuredClone(state);
    try { return await operation(tx); } catch (e) { Object.assign(state, previous); throw e; }
  } };
}
test('grid accepts an aisle pen, touching edges and blocks in different buildings', () => {
  validateGridBlock(block('pony', 1, 2), building, [block('stall', 1, 1), block('other', 1, 2, { buildingId: 'b2' })]);
  validateGridBlock(block('a', 1, 1, { rowSpan: 3, colSpan: 2 }), building, [block('b', 4, 1)]);
});
test('grid rejects any overlapping cell, nonpositive coordinates and overflow', () => {
  for (const candidate of [block('a', 0, 1), block('a', 10, 1, { rowSpan: 2 }), block('a', 1, 4, { colSpan: 2 }), block('a', 2, 2)])
    assert.throws(() => validateGridBlock(candidate, building, [block('b', 1, 1, { rowSpan: 3, colSpan: 2 })]), /границы|пересекается/);
});
test('buildings CRUD, service-free counts, occupied deletion and shrink protection', async () => {
  const db = database([block('a', 10, 4, { type: 'STALL', status: 'OCCUPIED', horseId: 'h' }), block('s', 1, 1, { type: 'SERVICE', status: 'AVAILABLE' })]);
  const service = new StableBuildingsService(db);
  const list = await service.findAll();
  assert.equal(list[0].total, 1); assert.equal(list[0].occupied, 1); assert.equal(list[0].available, 0); assert.equal(list[0].roomCount, 2);
  await assert.rejects(service.remove('b1'), /Сначала/);
  await assert.rejects(service.update('b1', { gridRows: 9 }), /границы/);
  await assert.rejects(service.create({ name: 'bad', gridCols: 1 }), /колонки/);
  await assert.rejects(service.update('missing', { name: 'x' }), /не найден/);
  const created = await service.create({ name: 'Летники', gridCols: 2, aisleCols: [] });
  assert.equal(created.gridRows, 10);
  await service.update(created.id, { name: 'Новый корпус', order: 3 });
  assert.equal(db.state.buildings[1].name, 'Новый корпус');
  await service.remove(created.id); assert.equal(db.state.buildings.length, 1);
});
test('batch layout validates final state, swaps coordinates and never partly saves invalid changes', async () => {
  const db = database([block('a', 1, 1), block('b', 1, 4), block('untouched', 3, 1)]);
  const service = new StallsService(db);
  await service.saveLayout([block('a', 1, 4), block('b', 1, 1)], { id: 'actor', email: 'qa@test' });
  assert.equal(db.state.stalls[0].col, 4);
  const before = structuredClone(db.state.stalls);
  await assert.rejects(service.saveLayout([block('a', 2, 1), block('b', 3, 1)], { id: 'actor', email: 'qa@test' }), /пересекается/);
  assert.deepEqual(db.state.stalls, before);
  await assert.rejects(service.saveLayout([block('a', 2, 1), block('a', 3, 1)], { id: 'actor', email: 'qa@test' }), /повторений/);
  await assert.rejects(service.saveLayout([block('missing', 2, 1)], { id: 'actor', email: 'qa@test' }), /не найдено/);
  await assert.rejects(service.saveLayout([block('a', 2, 1, { buildingId: 'missing' })], { id: 'actor', email: 'qa@test' }), /не найден/);
});
test('individual stall create and update validate bounds and collisions inside transactions', async () => {
  const db = database([block('a', 1, 1, { type: 'STALL', number: '1', status: 'AVAILABLE', horseId: null })]);
  const service = new StallsService(db);
  await assert.rejects(service.create({ number: '2', ...block('ignored', 1, 1) }), /пересекается/);
  await assert.rejects(service.update('a', { col: 4, colSpan: 2 }), /границы/);
  await service.create({ number: '2', buildingId: 'b1', row: 1, col: 2 });
  assert.equal(db.state.stalls.length, 2);
});
test('DTOs reject null/invalid layouts, normalize empty UUID and numeric inputs', async () => {
  for (const [Dto, data] of [[CreateBuildingDto, { name: ' ' }], [CreateBuildingDto, { name: 'x', aisleCols: [2, 2] }], [UpdateBuildingDto, { gridRows: null }], [CreateStallDto, { buildingId: 'bad', row: 0 }]])
    assert.ok((await validate(plainToInstance(Dto, data))).length);
  const dto = plainToInstance(CreateStallDto, { buildingId: '', row: '2' });
  assert.equal(dto.buildingId, undefined); assert.equal(dto.row, 2); assert.equal((await validate(dto)).length, 0);
});
test('neighborhood follows grid coordinates including aisle pens and excludes other buildings', () => {
  const stall = block('a', 1, 1, { horse: { name: 'Буран', sex: 'STALLION' }, position: null });
  const pen = block('b', 1, 2, { horse: { name: 'Искра', sex: 'MARE' }, position: null });
  assert.equal(neighborhoodWarnings(stall, [stall, pen]).length, 1);
  assert.equal(neighborhoodWarnings(stall, [stall, { ...pen, buildingId: 'other' }]).length, 0);
});

test('building and layout HTTP APIs enforce UUID/DTO validation and FULL, READ_ONLY, HIDDEN permissions', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const { RoleAccessGuard } = require('../dist/auth/role-access.guard');
  const { ModuleAccessService } = require('../dist/settings/module-access.service');
  const { StableBuildingsController } = require('../dist/stable-buildings/stable-buildings.controller');
  const { StallsController } = require('../dist/stalls/stalls.controller');
  const request = require('supertest');
  const id = '00000000-0000-4000-8000-000000000101';
  const sid = '00000000-0000-4000-8000-000000000001';
  const db = database([block(sid, 1, 1, { buildingId: id })]); db.state.buildings[0].id = id;
  const module = await Test.createTestingModule({ controllers: [StableBuildingsController, StallsController], providers: [
    RolesGuard, { provide: StableBuildingsService, useValue: new StableBuildingsService(db) },
    { provide: StallsService, useValue: new StallsService(db) },
    { provide: ModuleAccessService, useValue: { forRole: async role => [{ module: 'STABLES', isEnabled: true, accessLevel: role === 'MANAGER' ? 'READ_ONLY' : role === 'STABLE_WORKER' ? 'HIDDEN' : 'FULL' }] } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) { const req = context.switchToHttp().getRequest(); req.user = { id: sid, role: req.headers['x-role'] }; return true; } })
    .overrideGuard(RoleAccessGuard).useValue({ canActivate: () => true }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  try {
    const server = app.getHttpServer();
    await request(server).get('/stable-buildings').set('x-role', 'MANAGER').expect(200);
    await request(server).get('/stable-buildings').set('x-role', 'STABLE_WORKER').expect(403);
    for (const method of ['post', 'patch', 'delete']) {
      await request(server)[method](method === 'post' ? '/stable-buildings' : `/stable-buildings/${id}`).set('x-role', 'MANAGER').send({ name: 'x' }).expect(403);
    }
    await request(server).post('/stable-buildings').set('x-role', 'ADMIN').send({ name: 'Пони', gridRows: '4', gridCols: 2, aisleCols: [] }).expect(201);
    await request(server).patch('/stable-buildings/bad').set('x-role', 'ADMIN').send({ name: 'x' }).expect(400);
    await request(server).patch(`/stable-buildings/${id}`).set('x-role', 'ADMIN').send({ gridRows: 0 }).expect(400);
    const layout = [{ id: sid, buildingId: id, row: 1, col: 2, rowSpan: 1, colSpan: 1 }];
    await request(server).patch('/stalls/layout').set('x-role', 'MANAGER').send(layout).expect(403);
    for (const body of [[], [{ ...layout[0], id: 'bad' }], [{ ...layout[0], row: 0 }], [{ ...layout[0], row: null }], [{ ...layout[0], unexpected: true }]])
      await request(server).patch('/stalls/layout').set('x-role', 'ADMIN').send(body).expect(400);
    await request(server).patch('/stalls/layout').set('x-role', 'ADMIN').send(layout).expect(200);
    await request(server).delete(`/stable-buildings/${id}`).set('x-role', 'ADMIN').expect(400);
    await request(server).get('/stalls?buildingId=bad').set('x-role', 'ADMIN').expect(400);
  } finally { await app.close(); }
});
