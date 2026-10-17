require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { BookingsController } = require('../dist/bookings/bookings.controller');
const { BookingLifecycleService } = require('../dist/bookings/booking-lifecycle.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { defaultRolePermissions, assertHorseReplacement } = require('../dist/auth/role-access');
const { RoleAccessService } = require('../dist/auth/role-access.service');
const ids = { booking: '00000000-0000-4000-8000-000000000001', own: '00000000-0000-4000-8000-000000000002', other: '00000000-0000-4000-8000-000000000003', horse: '00000000-0000-4000-8000-000000000004', old: '00000000-0000-4000-8000-000000000005', user: '00000000-0000-4000-8000-000000000006' };
const trainer = { id: ids.user, role: 'TRAINER', trainerId: ids.own, email: 'trainer@test.local' };
const admin = { ...trainer, role: 'ADMIN' };
const manager = { ...trainer, role: 'MANAGER' };
const forbidden = error => error.getStatus() === 403 && error.message === 'Вы можете заменять лошадей только в своих занятиях';

function fixture({ group = false, assigned = ids.own, ownAllowed = true, binding = ids.own, failAudit = false } = {}) {
  const state = { booking: { id: ids.booking, horseId: ids.old, trainerId: group ? ids.other : assigned, clientId: 'client', status: 'scheduled', arenaId: null,
    startTime: new Date('2030-10-15T10:00Z'), endTime: new Date('2030-10-15T11:00Z'),
    lesson: group ? { id: 'lesson', trainerId: assigned, status: 'SCHEDULED', startTime: new Date('2030-10-15T10:00Z'), endTime: new Date('2030-10-15T11:00Z'), bookings: [{ id: ids.booking, horseId: ids.old, clientId: 'client' }] } : null }, history: [] };
  const prisma = { $transaction: async work => {
    const draft = structuredClone(state);
    const tx = {
      booking: { findUnique: async () => draft.booking, update: async ({ data }) => Object.assign(draft.booking, data) },
      bookingHorseChange: { create: async ({ data }) => { if (failAudit) throw new Error('audit unavailable'); draft.history.push(data); return data; }, findMany: async () => draft.history },
      roleAccess: { findUnique: async () => ({ ...defaultRolePermissions('TRAINER'), horseReplaceOwn: ownAllowed }) },
      user: { findUnique: async () => ({ trainerId: binding }) }, horse: { findMany: async () => [{ id: ids.horse }] },
    };
    const result = await work(tx); Object.assign(state, draft); return result;
  } };
  return { state, service: new BookingsService(prisma, { validate: async () => {} }) };
}

for (const group of [false, true]) {
  test(`assigned TRAINER replaces a horse and records their account ID, group=${group}`, async () => {
    const f = fixture({ group });
    await f.service.replaceHorse(ids.booking, ids.horse, ' repair ', trainer);
    assert.equal(f.state.booking.horseId, ids.horse);
    assert.deepEqual(f.state.history, [{ bookingId: ids.booking, actorUserId: ids.user, oldHorseId: ids.old, newHorseId: ids.horse, reason: 'repair' }]);
  });
  test(`TRAINER is forbidden on a colleague's lesson including availability/history, group=${group}`, async () => {
    const f = fixture({ group, assigned: ids.other });
    await assert.rejects(f.service.replaceHorse(ids.booking, ids.horse, undefined, trainer), forbidden);
    await assert.rejects(f.service.availableHorses(ids.booking, trainer), forbidden);
    await assert.rejects(f.service.horseHistory(ids.booking, trainer), forbidden);
    assert.equal(f.state.booking.horseId, ids.old); assert.deepEqual(f.state.history, []);
  });
}
for (const actor of [admin, manager]) test(`${actor.role} replaces a horse in any lesson`, async () => {
  const f = fixture({ assigned: ids.other, ownAllowed: false });
  await f.service.replaceHorse(ids.booking, ids.horse, undefined, actor);
  assert.equal(f.state.history[0].actorUserId, actor.id);
});
test('revoking the own-lesson permission prevents replacement and writes no history', async () => {
  const f = fixture({ ownAllowed: false });
  await assert.rejects(f.service.replaceHorse(ids.booking, ids.horse, undefined, trainer), forbidden);
  assert.deepEqual(f.state.history, []);
});
test('current database binding overrides a stale trainerId from the session', async () => {
  const f = fixture({ binding: ids.other });
  await assert.rejects(f.service.replaceHorse(ids.booking, ids.horse, undefined, trainer), forbidden);
});
test('unbound trainer may match their account UUID, never another trainer', () => {
  assert.doesNotThrow(() => assertHorseReplacement({ ...trainer, trainerId: null }, trainer.id, defaultRolePermissions('TRAINER')));
  assert.throws(() => assertHorseReplacement({ ...trainer, trainerId: null }, ids.other, defaultRolePermissions('TRAINER')), forbidden);
});
test('audit failure rolls back the horse change', async () => {
  const f = fixture({ failAudit: true });
  await assert.rejects(f.service.replaceHorse(ids.booking, ids.horse, undefined, admin), /audit unavailable/);
  assert.equal(f.state.booking.horseId, ids.old); assert.deepEqual(f.state.history, []);
});
test('role configuration cannot grant TRAINER all-lesson access or editing without reading', async () => {
  const access = new RoleAccessService({ roleAccess: { upsert: async args => args.create } });
  await assert.rejects(access.update('TRAINER', { ...defaultRolePermissions('TRAINER'), horseReplaceAny: true }), e => e.getStatus() === 400);
  await assert.rejects(access.update('TRAINER', { ...defaultRolePermissions('TRAINER'), healthRead: false, healthWrite: true }), e => e.getStatus() === 400);
  await assert.rejects(access.update('ADMIN', defaultRolePermissions('ADMIN')), e => e.getStatus() === 400);
  assert.equal((await access.update('TRAINER', { ...defaultRolePermissions('TRAINER'), horseReplaceOwn: false })).horseReplaceOwn, false);
});

test('permission DTO rejects string booleans even with production implicit conversion enabled', async () => {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const { UpdateRoleAccessDto } = require('../dist/settings/dto/update-role-access.dto');
  for (const financeRead of ['false', 'true', 0, 1, null, undefined]) {
    const dto = plainToInstance(UpdateRoleAccessDto, { ...defaultRolePermissions('TRAINER'), financeRead }, { enableImplicitConversion: true });
    assert.ok((await validate(dto)).some(error => error.property === 'financeRead'));
  }
  assert.deepEqual(await validate(plainToInstance(UpdateRoleAccessDto, defaultRolePermissions('TRAINER'), { enableImplicitConversion: true })), []);
  const { HorseHealthLogsController } = require('../dist/horse-health-logs/horse-health-logs.controller');
  assert.deepEqual(Reflect.getMetadata('auth:roles', HorseHealthLogsController.prototype.remove), ['ADMIN', 'MANAGER']);
});

test('HTTP role settings enforce health, boarding and report permissions without granting financial writes', async () => {
  const { RoleAccessGuard } = require('../dist/auth/role-access.guard');
  const { VetCalendarController } = require('../dist/boarding/boarding.controller');
  const { VetCalendarService } = require('../dist/boarding/vet-calendar.service');
  const { VetRecordService } = require('../dist/boarding/vet-record.service');
  const { BoardingContractsController } = require('../dist/boarding-contracts/boarding-contracts.controller');
  const { BoardingContractsService } = require('../dist/boarding-contracts/boarding-contracts.service');
  const { SettingsController } = require('../dist/settings/settings.controller');
  const { SettingsService } = require('../dist/settings/settings.service');
  const { PaymentsController } = require('../dist/payments/payments.controller');
  const { PaymentsService } = require('../dist/payments/payments.service');
  const { CashDeskService } = require('../dist/payments/cash-desk.service');
  let policy = defaultRolePermissions('TRAINER');
  const access = new RoleAccessService({ roleAccess: {
    findUnique: async () => policy,
    upsert: async ({ update }) => { policy = { ...update }; return policy; },
  } });
  const module = await Test.createTestingModule({ controllers: [VetCalendarController, BoardingContractsController, SettingsController, PaymentsController], providers: [RolesGuard, RoleAccessGuard,
    { provide: RoleAccessService, useValue: access }, { provide: SettingsService, useValue: {} },
    { provide: VetCalendarService, useValue: { list: async () => ({ data: [], total: 0 }), create: async dto => dto } },
    { provide: VetRecordService, useValue: { summary: async () => ({ overdue: [], next14Days: [], next30Days: [] }) } },
    { provide: BoardingContractsService, useValue: { findAll: async () => ({ data: [], total: 0 }) } },
    { provide: PaymentsService, useValue: {} }, { provide: CashDeskService, useValue: { summary: async () => ({ totalRevenue: '100', operations: [] }) } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest(); req.user = req.headers['x-test-session'] === 'admin' ? admin : trainer; return true;
  } }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
  const request = (path, session = 'trainer', body) => fetch(`${base}${path}`, { method: body ? 'PATCH' : 'GET', headers: { 'x-test-session': session, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const update = patch => request('/settings/role-access/TRAINER', 'admin', { ...defaultRolePermissions('TRAINER'), ...patch });
  const report = '/payments/summary?from=2026-10-15T00:00:00Z&to=2026-10-16T00:00:00Z';
  try {
    assert.equal((await request('/settings/role-access')).status, 403);
    assert.equal((await request('/settings/role-access/TRAINER', 'trainer', policy)).status, 403);
    assert.equal((await update({ healthRead: false, boardingAccess: false })).status, 200);
    assert.equal((await request('/vet/events')).status, 403);
    assert.equal((await request('/boarding-contracts')).status, 403);
    assert.equal((await request(report)).status, 403);
    assert.equal((await update({ healthRead: true, healthWrite: true, financeRead: true, boardingAccess: true })).status, 200);
    assert.equal((await request('/vet/events')).status, 200);
    assert.equal((await request('/boarding-contracts')).status, 200);
    assert.equal((await request(report)).status, 200);
    assert.equal((await fetch(`${base}/vet/events`, { method: 'POST', headers: { 'x-test-session': 'trainer', 'content-type': 'application/json' }, body: JSON.stringify({ horseId: ids.horse, type: 'shoeing', eventDate: '2030-10-15T10:00:00Z' }) })).status, 201);
    assert.equal((await fetch(`${base}/payments/cash-desk`, { method: 'POST', headers: { 'x-test-session': 'trainer', 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await update({ horseReplaceAny: true })).status, 400);
  } finally { await app.close(); }
});

test('trainer response sanitization hides forbidden nested health/boarding records and keeps report data only when granted', async () => {
  const { firstValueFrom, of } = require('rxjs');
  const { Reflector } = require('@nestjs/core');
  const { SanitizeRbacInterceptor } = require('../dist/common/interceptors/sanitize-rbac.interceptor');
  const value = { healthLogs: [{ notes: 'health' }], boardingContracts: [{ monthlyRate: 100 }], currentBoardingContract: { id: 'private' }, operations: [{ amount: 50, email: 'private' }], phone: 'private' };
  const context = { getHandler: () => function handler() {}, getClass: () => function controller() {}, switchToHttp: () => ({ getRequest: () => ({ user: trainer }) }) };
  const interceptor = new SanitizeRbacInterceptor(new Reflector(), { permissions: async () => ({ ...defaultRolePermissions('TRAINER'), healthRead: false, boardingAccess: false }) });
  assert.deepEqual(await firstValueFrom(interceptor.intercept(context, { handle: () => of(value) })), { healthLogs: [], boardingContracts: [], currentBoardingContract: null, operations: [] });
  const reporting = new SanitizeRbacInterceptor(new Reflector(), { permissions: async () => ({ ...defaultRolePermissions('TRAINER'), financeRead: true }) });
  const result = await firstValueFrom(reporting.intercept(context, { handle: () => of(value) }));
  assert.deepEqual(result.operations, [{ amount: 50 }]); assert.equal(result.phone, undefined);
});

test('HTTP RBAC: own trainer succeeds, colleague is 403, administrator/manager succeed and impersonation is rejected', async () => {
  const f = fixture();
  const actors = { own: trainer, colleague: { ...trainer, id: ids.other }, admin, manager };
  // Test-only session adapter. Production uses the JWT strategy's database identity.
  const module = await Test.createTestingModule({ controllers: [BookingsController], providers: [RolesGuard,
    { provide: BookingsService, useValue: f.service }, { provide: BookingLifecycleService, useValue: {} }] })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
      const req = context.switchToHttp().getRequest(); req.user = actors[req.headers['x-test-session']];
      if (req.user?.id === ids.other) req.user = { ...req.user, trainerId: ids.other };
      return Boolean(req.user);
    } }).compile();
  // Bind the fixture database to the authenticated account, rather than trust request body.
  const original = f.service.prisma.$transaction;
  f.service.prisma.$transaction = (work, options) => original(async tx => {
    tx.user.findUnique = async ({ where }) => ({ trainerId: where.id === ids.other ? ids.other : ids.own });
    return work(tx);
  }, options);
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const change = (session, body = { horseId: ids.horse }) => fetch(`${base}/bookings/${ids.booking}/horse`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-test-session': session }, body: JSON.stringify(body) });
  try {
    const denied = await change('colleague'); assert.equal(denied.status, 403);
    assert.equal((await denied.json()).message, 'Вы можете заменять лошадей только в своих занятиях');
    assert.equal((await change('own')).status, 200);
    assert.equal((await change('admin')).status, 200);
    assert.equal((await change('manager')).status, 200);
    assert.equal((await change('colleague', { horseId: ids.horse, actorUserId: ids.user, trainerId: ids.own })).status, 400);
    assert.equal(f.state.history.length, 3);
    assert.equal((await fetch(`${base}/bookings/${ids.booking}/available-horses`, { headers: { 'x-test-session': 'colleague' } })).status, 403);
  } finally { await app.close(); }
});
