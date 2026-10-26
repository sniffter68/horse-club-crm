require('reflect-metadata');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const { ModuleAccessGuard, RequireModule, PersonalModuleAccess } = require('../dist/auth/module-access.guard');
const { ModuleAccessService, defaultModuleAccess, systemModules } = require('../dist/settings/module-access.service');
const { SettingsController } = require('../dist/settings/settings.controller');
const { SettingsService } = require('../dist/settings/settings.service');
const { RoleAccessService } = require('../dist/auth/role-access.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { RoleAccessGuard } = require('../dist/auth/role-access.guard');
const { VetRecordController } = require('../dist/boarding/vet-record.controller');
const { VetRecordService } = require('../dist/boarding/vet-record.service');
let app, settings = [], saved = [];
const prisma = {
  clubModuleSettings: {
    findMany: async () => settings,
    upsert: async ({ create }) => { settings = [...settings.filter(r => r.module !== create.module), create]; return create; },
  },
  roleModulePermission: {
    findMany: async args => saved.filter(r => !args?.where || r.role === args.where.role),
    upsert: async ({ create }) => { saved = [...saved.filter(r => r.module !== create.module || r.role !== create.role), create]; return create; },
  },
  $transaction: async operations => Promise.all(operations),
};
const service = new ModuleAccessService(prisma);
before(async () => {
  const module = await Test.createTestingModule({ controllers: [SettingsController, VetRecordController], providers: [
    RolesGuard, ModuleAccessGuard, { provide: ModuleAccessService, useValue: service },
    { provide: SettingsService, useValue: {} }, { provide: RoleAccessService, useValue: {} },
    { provide: VetRecordService, useValue: { list: async () => ({ data: [] }), summary: async () => ({}) } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest();
    req.user = req.headers['x-role'] ? { id: 'actor', role: req.headers['x-role'] } : undefined;
    return Boolean(req.user);
  } }).overrideGuard(RoleAccessGuard).useValue({ canActivate: () => true }).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true }, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
});
after(async () => { await app?.close(); });
beforeEach(() => { settings = []; saved = []; });
const api = () => request(app.getHttpServer());

test('default matrix contains all seven roles and five enabled modules', async () => {
  const result = await api().get('/settings/modules').set('x-role', 'ADMIN').expect(200);
  assert.equal(result.body.modules.length, 5); assert.ok(result.body.modules.every(r => r.isEnabled));
  assert.equal(result.body.permissions.length, 35);
  for (const row of result.body.permissions) assert.equal(row.accessLevel, defaultModuleAccess(row.role, row.module));
  const worker = await api().get('/settings/my-permissions').set('x-role', 'STABLE_WORKER').expect(200);
  assert.equal(worker.body.modules.filter(r => r.accessLevel === 'READ_ONLY').length, 2);
  await api().get('/settings/my-permissions').expect(403);
});
test('only administrator can toggle or edit matrix; manager can inspect it', async () => {
  await api().get('/settings/modules').set('x-role', 'MANAGER').expect(200);
  for (const role of ['MANAGER', 'TRAINER', 'STABLE_WORKER']) {
    await api().patch('/settings/modules/toggle').set('x-role', role).send({ module: 'VETERINARY', isEnabled: false }).expect(403);
    await api().put('/settings/modules/permissions').set('x-role', role).send({ permissions: [] }).expect(403);
  }
});
test('disabled module blocks real API even for admin and reenabling restores it', async () => {
  await api().get('/vet/records').set('x-role', 'ADMIN').expect(200);
  await api().patch('/settings/modules/toggle').set('x-role', 'ADMIN').send({ module: 'VETERINARY', isEnabled: false }).expect(200);
  for (const role of ['ADMIN', 'MANAGER', 'TRAINER', 'STABLE_WORKER']) {
    const denied = await api().get('/vet/records').set('x-role', role).expect(403);
    assert.match(denied.body.message, /отключен/);
  }
  await api().patch('/settings/modules/toggle').set('x-role', 'ADMIN').send({ module: 'VETERINARY', isEnabled: true }).expect(200);
  await api().get('/vet/records').set('x-role', 'ADMIN').expect(200);
});
test('admin rights cannot be downgraded and invalid nested DTOs cannot write', async () => {
  for (const accessLevel of ['READ_ONLY', 'HIDDEN']) await api().put('/settings/modules/permissions').set('x-role', 'ADMIN')
    .send({ permissions: [{ role: 'ADMIN', module: 'SCHEDULE', accessLevel }] }).expect(400);
  for (const body of [{ permissions: [] }, { permissions: [{ role: 'INVALID_ROLE', module: 'SCHEDULE', accessLevel: 'FULL' }] },
    { permissions: [{ role: 'TRAINER', module: 'BAD', accessLevel: 'FULL' }] },
    { permissions: [{ role: 'TRAINER', module: 'SCHEDULE', accessLevel: 'bad' }] }])
    await api().put('/settings/modules/permissions').set('x-role', 'ADMIN').send(body).expect(400);
  for (const isEnabled of ['false', 0, null]) await api().patch('/settings/modules/toggle').set('x-role', 'ADMIN')
    .send({ module: 'VETERINARY', isEnabled }).expect(400);
  assert.equal(saved.length, 0); assert.equal(settings.length, 0);
});
test('saved hidden permission takes effect on the next request and survives service recreation', async () => {
  await api().put('/settings/modules/permissions').set('x-role', 'ADMIN')
    .send({ permissions: [{ role: 'MANAGER', module: 'VETERINARY', accessLevel: 'HIDDEN' }] }).expect(200);
  await api().get('/vet/records').set('x-role', 'MANAGER').expect(403);
  assert.equal((await new ModuleAccessService(prisma).forRole('MANAGER')).find(r => r.module === 'VETERINARY').accessLevel, 'HIDDEN');
});
test('guard allows safe methods, rejects all mutations for read-only and honors minimum FULL', async () => {
  const guard = new ModuleAccessGuard(new Reflector(), service);
  class Target {}
  const handler = () => {};
  RequireModule('STABLES')(Target);
  const context = method => ({ getHandler: () => handler, getClass: () => Target,
    switchToHttp: () => ({ getRequest: () => ({ method, user: { role: 'STABLE_WORKER' } }) }) });
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(await guard.canActivate(context(method)), true);
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) await assert.rejects(guard.canActivate(context(method)), e => e.getStatus() === 403);
  RequireModule('STABLES', 'FULL')(Target);
  await assert.rejects(guard.canActivate(context('GET')), e => e.getStatus() === 403);
});
test('personal payroll exception is read-only and still respects the global module flag', async () => {
  class Target {}
  const descriptor = { value: () => {} };
  RequireModule('STAFF_PAYROLL')(Target); PersonalModuleAccess()(Target.prototype, 'mine', descriptor);
  const context = method => ({ getHandler: () => descriptor.value, getClass: () => Target,
    switchToHttp: () => ({ getRequest: () => ({ method, user: { role: 'TRAINER' } }) }) });
  const guard = new ModuleAccessGuard(new Reflector(), service);
  assert.equal(await guard.canActivate(context('GET')), true);
  await assert.rejects(guard.canActivate(context('POST')), e => e.getStatus() === 403);
  settings = [{ module: 'STAFF_PAYROLL', isEnabled: false }];
  await assert.rejects(guard.canActivate(context('GET')), e => e.getStatus() === 403);
});

test('salary fields on trainer updates require payroll access without blocking ordinary profile edits', async () => {
  const { RequireModuleForFields } = require('../dist/auth/module-access.guard');
  class Target {}
  RequireModuleForFields('STAFF_PAYROLL', ['baseRate'])(Target);
  const guard = new ModuleAccessGuard(new Reflector(), service);
  const context = body => ({ getHandler: () => function update() {}, getClass: () => Target,
    switchToHttp: () => ({ getRequest: () => ({ method: 'PATCH', body, user: { role: 'MANAGER' } }) }) });
  settings = [{ module: 'STAFF_PAYROLL', isEnabled: false }];
  assert.equal(await guard.canActivate(context({ name: 'New name' })), true);
  await assert.rejects(guard.canActivate(context({ baseRate: 500 })), e => e.getStatus() === 403);
});

test('nested hidden module data and salary rates are sanitized even for managers', async () => {
  const { firstValueFrom, of } = require('rxjs');
  const { SanitizeRbacInterceptor } = require('../dist/common/interceptors/sanitize-rbac.interceptor');
  settings = systemModules.map(module => ({ module, isEnabled: false }));
  const interceptor = new SanitizeRbacInterceptor(new Reflector(), undefined, service);
  const context = { getHandler: () => function read() {}, getClass: () => class Target {},
    switchToHttp: () => ({ getRequest: () => ({ user: { role: 'MANAGER' } }) }) };
  const result = await firstValueFrom(interceptor.intercept(context, { handle: () => of({ name: 'Horse',
    healthLogs: [{ notes: 'secret' }], boardingContracts: [{ price: 100 }], bookings: [{ id: 'b' }], payments: [{ amount: 500 }], baseRate: 300 }) }));
  assert.deepEqual(result, { name: 'Horse', healthLogs: [], boardingContracts: [], bookings: [], payments: [] });
});
