require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { VetRecordService, nextVetDate, vetDueStatus } = require('../dist/boarding/vet-record.service');
const { CreateVetRecordDto, BatchVetRecordDto, VetRecordQueryDto } = require('../dist/boarding/vet-record.dto');
const { VetRecordController } = require('../dist/boarding/vet-record.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { RoleAccessGuard } = require('../dist/auth/role-access.guard');
const id = '00000000-0000-4000-8000-000000000001';
const dto = { horseId: id, type: 'FARRIER', title: 'Плановая расчистка', performedAt: '2026-01-01', specialist: 'Коваль' };

test('vet DTO validates every procedure, rejects invalid values and normalizes blank query parameters', async () => {
  for (const type of ['VACCINATION', 'DEWORMING', 'BLOOD_TEST', 'FARRIER', 'EXAMINATION', 'TREATMENT', 'DENTAL']) assert.equal((await validate(plainToInstance(CreateVetRecordDto, { ...dto, type }))).length, 0);
  for (const patch of [{ title: ' ' }, { specialist: '' }, { horseId: 'x' }, { performedAt: 'x' }, { performedAt: '2026-02-30' }, { cost: -1 }, { cost: 1.001 }, { documentUrl: 'javascript:alert(1)' }, { type: 'shoeing' }]) assert.ok((await validate(plainToInstance(CreateVetRecordDto, { ...dto, ...patch }))).length);
  const query = plainToInstance(VetRecordQueryDto, { horseId: '', type: '', from: '', to: '', offset: '', limit: '' });
  assert.equal((await validate(query)).length, 0);
  assert.equal(query.horseId, undefined); assert.equal(query.limit, undefined);
  const numeric = plainToInstance(VetRecordQueryDto, { offset: '20', limit: '10' });
  assert.equal(numeric.offset, 20); assert.equal(numeric.limit, 10);
  assert.equal((await validate(plainToInstance(BatchVetRecordDto, { ...dto, horseId: undefined, horseIds: [id] }))).length, 0);
  assert.ok((await validate(plainToInstance(BatchVetRecordDto, { ...dto, horseIds: [id, id] }))).length);
});

test('due dates use Moscow calendar days at the UTC boundary and default intervals preserve local time', () => {
  const now = new Date('2026-10-17T21:00:00Z'); // 18 October in Moscow
  assert.equal(vetDueStatus(new Date('2026-10-17T20:59:59Z'), now), 'overdue');
  assert.equal(vetDueStatus(new Date('2026-10-17T21:00:00Z'), now), 'soon');
  assert.equal(vetDueStatus(new Date('2026-11-17T21:00:00Z'), now), 'current');
  assert.equal(vetDueStatus(null, now), 'none');
  assert.equal(nextVetDate('DEWORMING', new Date('2026-01-01T09:00Z')).toISOString(), '2026-04-01T09:00:00.000Z');
  assert.equal(nextVetDate('FARRIER', new Date('2026-01-01T09:00Z')).toISOString(), '2026-02-15T09:00:00.000Z');
  assert.equal(nextVetDate('EXAMINATION', new Date()), null);
});

function fixture() {
  const writes = []; const tx = { $queryRaw: async () => [], horse: { findUnique: async () => ({ id }), update: async ({ data }) => data },
    vetRecord: { create: async ({ data }) => { writes.push(data); return { id: 'record', ...data }; }, findUnique: async () => ({ ...dto, performedAt: new Date('2025-12-31T21:00Z'), nextDueDate: new Date('2026-02-14T21:00Z') }), update: async ({ data }) => data } };
  return { service: new VetRecordService({ $transaction: async work => work(tx) }), writes, tx };
}
test('create stores author and Moscow dates; explicit null disables reminders; edit preserves or recalculates deadlines', async () => {
  const { service, writes } = fixture();
  await service.create(dto, id);
  assert.equal(writes[0].createdById, id); assert.equal(writes[0].performedAt.toISOString(), '2025-12-31T21:00:00.000Z');
  assert.equal(writes[0].nextDueDate.toISOString(), '2026-02-14T21:00:00.000Z');
  await service.create({ ...dto, nextDueDate: null }, id); assert.equal(writes[1].nextDueDate, null);
  assert.equal((await service.update(id, { notes: 'Новая заметка' })).nextDueDate.toISOString(), '2026-02-14T21:00:00.000Z');
  assert.equal((await service.update(id, { type: 'DEWORMING' })).nextDueDate.toISOString(), '2026-03-31T21:00:00.000Z');
  await assert.rejects(service.create({ ...dto, nextDueDate: '2025-12-31' }, id), e => e.getStatus() === 400);
  await assert.rejects(service.create({ ...dto, performedAt: '2099-01-01' }, id), e => e.getStatus() === 400);
});
test('batch locks all horses before writes and rejects unsupported procedures; health updates synchronize availability', async () => {
  const { service, writes, tx } = fixture();
  await service.batch({ ...dto, type: 'VACCINATION', horseIds: [id, '00000000-0000-4000-8000-000000000002'] }, id); assert.equal(writes.length, 2);
  assert.throws(() => service.batch({ ...dto, horseIds: [id] }, id), e => e.getStatus() === 400);
  tx.horse.findUnique = async () => null;
  await assert.rejects(service.create(dto, id), e => e.getStatus() === 404);
  tx.horse.findUnique = async () => ({ id });
  for (const healthStatus of ['QUARANTINE', 'TREATMENT', 'RETIRED']) assert.equal((await service.health(id, { healthStatus })).isUnavailable, true);
  const healthy = await service.health(id, { healthStatus: 'HEALTHY' }); assert.equal(healthy.status, 'active'); assert.equal(healthy.quarantineUntil, null);
});
test('HTTP RBAC allows trainer reads but prevents trainer writes and manager deletion, even with healthWrite enabled', async () => {
  const service = { list: async () => ({ data: [], total: 0 }), summary: async () => ({}), passport: async () => ({}), create: async d => d, update: async () => ({}), remove: async () => ({}), health: async () => ({}) };
  const module = await Test.createTestingModule({ controllers: [VetRecordController], providers: [RolesGuard, { provide: VetRecordService, useValue: service }] })
    .overrideGuard(require('../dist/auth/module-access.guard').ModuleAccessGuard).useValue({ canActivate: () => true })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: c => { const req = c.switchToHttp().getRequest(); req.user = { id, role: req.headers['x-role'] }; return true; } })
    .overrideGuard(RoleAccessGuard).useValue({ canActivate: () => true }).compile();
  const app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  const call = (path, method, role, body) => fetch(base + path, { method, headers: { 'x-role': role, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  try {
    assert.equal((await call('/vet/records?limit=&type=', 'GET', 'TRAINER')).status, 200);
    assert.equal((await call(`/vet/horses/${id}/passport`, 'GET', 'TRAINER')).status, 200);
    assert.equal((await call('/vet/records', 'POST', 'TRAINER', dto)).status, 403);
    assert.equal((await call(`/vet/records/${id}`, 'PATCH', 'TRAINER', { notes: 'x' })).status, 403);
    assert.equal((await call(`/vet/records/${id}`, 'DELETE', 'MANAGER')).status, 403);
    assert.equal((await call(`/vet/records/${id}`, 'DELETE', 'ADMIN')).status, 200);
    assert.equal((await call('/vet/records', 'POST', 'MANAGER', dto)).status, 201);
    assert.equal((await call('/vet/records', 'POST', 'ADMIN', { ...dto, createdById: id })).status, 400);
  } finally { await app.close(); }
});
