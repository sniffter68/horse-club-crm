require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { compare } = require('bcrypt');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { StaffService } = require('../dist/staff/staff.service');
const { StaffController, ShiftsController } = require('../dist/staff/staff.controller');
const { StaffProfileDto, StaffQueryDto } = require('../dist/staff/staff.dto');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { AuthService } = require('../dist/auth/auth.service');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { JwtService } = require('@nestjs/jwt');
const admin = { id: randomUUID(), role: 'ADMIN' };

function store() {
  const state = { account: null, profile: null, trainer: null, shift: null, trainerCreates: 0, transactions: 0 };
  const tx = {
    user: { findUnique: async () => state.account, create: async ({ data }) => state.account = { id: randomUUID(), trainerId: null, ...data }, update: async ({ data }) => state.account = { ...state.account, ...data } },
    trainer: { create: async ({ data }) => { state.trainerCreates++; return state.trainer = { id: randomUUID(), ...data }; }, update: async ({ data }) => state.trainer = { ...state.trainer, ...data } },
    staffProfile: { findUnique: async ({ where }) => where.userId && where.userId !== state.account?.id ? null : state.profile, create: async ({ data }) => state.profile = { id: randomUUID(), isActive: true, ...data }, update: async ({ data }) => state.profile = { ...state.profile, ...data }, findMany: async args => { state.query = args; return []; }, count: async () => 0 },
    workShift: { findUnique: async () => state.shift, create: async ({ data }) => state.shift = { id: randomUUID(), status: 'SCHEDULED', endedAt: null, ...data }, update: async ({ data }) => state.shift = { ...state.shift, ...data }, updateMany: async args => { state.archiveShifts = args; return { count: 0 }; }, findMany: async args => { state.dutyQuery = args; return []; } },
    payrollCalculation: { findFirst: async () => state.paid ? {} : null },
  };
  const prisma = { $transaction: async (work, options) => { state.transactions++; state.isolation = options?.isolationLevel; return work(tx); } };
  const identity = { normalize: async input => ({ vkId: input.replace(/\D/g, '') }), applyStaff: async (_tx, id, vkId) => { state.vk = { id, vkId }; } };
  return { state, service: new StaffService(prisma, identity) };
}

test('employee creation atomically creates linked trainer, normalizes VK and hashes password', async () => {
  const { service, state } = store();
  const row = await service.saveProfile({ fullName: 'Анна Иванова', role: 'TRAINER', position: 'Тренер по выездке', phone: '+79991234567', email: 'TRAINER@example.com', temporaryPassword: 'temporary-123', createCrmAccess: true, vkId: 'id12345' }, admin);
  assert.equal(state.isolation, 'Serializable'); assert.equal(state.transactions, 1);
  assert.equal(state.account.email, 'trainer@example.com'); assert.equal(state.account.trainerId, state.trainer.id);
  assert.equal(state.trainer.name, row.fullName); assert.equal(state.trainer.isActive, true);
  assert.equal(row.roleTitle, 'Тренер по выездке'); assert.equal(row.userId, state.account.id);
  assert.equal(await compare('temporary-123', state.account.passwordHash), true);
  assert.equal(row.passwordHash, undefined); assert.equal(row.temporaryPassword, undefined);
  assert.deepEqual(state.vk, { id: state.account.id, vkId: '12345' });
  await service.saveProfile({ fullName: 'Анна Петрова' }, admin, row.id);
  assert.equal(state.trainerCreates, 1); assert.equal(state.trainer.fullName, 'Анна Петрова');
});

test('employee without CRM access remains a linked trainer; archiving disables account and trainer, preserving IDs', async () => {
  const { service, state } = store();
  const row = await service.saveProfile({ fullName: 'Тренер', role: 'TRAINER' }, admin);
  assert.equal(state.account.crmAccess, false); assert.ok(state.account.email.endsWith('@staff.invalid'));
  const trainerId = state.trainer.id;
  await service.archive(row.id, admin);
  assert.equal(state.profile.isActive, false); assert.equal(state.trainer.isActive, false);
  assert.equal(state.account.trainerId, trainerId); assert.equal(state.account.crmAccess, false);
  assert.equal(state.archiveShifts.where.staffId, row.id);
  await assert.rejects(service.duty('start', row.id, admin), e => e.status === 400);
});

test('role transitions retain trainer history and reuse the same trainer on return', async () => {
  const { service, state } = store();
  const row = await service.saveProfile({ fullName: 'Сотрудник', role: 'OTHER' }, admin);
  assert.equal(state.trainer, null);
  await service.saveProfile({ role: 'TRAINER' }, admin, row.id);
  await service.saveProfile({ role: 'GROOM' }, admin, row.id);
  assert.equal(state.trainer.isActive, false);
  await service.saveProfile({ role: 'TRAINER' }, admin, row.id);
  assert.equal(state.trainer.isActive, true); assert.equal(state.trainerCreates, 1);
});

test('employee creation protects administrator privileges, self-access and password requirements', async () => {
  const { service, state } = store();
  const manager = { id: randomUUID(), role: 'MANAGER' };
  await assert.rejects(service.saveProfile({ fullName: 'Admin', role: 'ADMIN' }, manager), e => e.status === 403);
  await assert.rejects(service.saveProfile({ fullName: 'Trainer', role: 'TRAINER', createCrmAccess: true }, admin), e => e.status === 400);
  await assert.rejects(service.saveProfile({ fullName: 'Trainer', role: 'TRAINER', email: null }, admin), e => e.status === 400);
  await assert.rejects(service.saveProfile({ fullName: 'Trainer', role: 'TRAINER', temporaryPassword: 'я'.repeat(40) }, admin), e => e.status === 400);
  const row = await service.saveProfile({ fullName: 'Admin', role: 'ADMIN' }, admin);
  await assert.rejects(service.archive(row.id, manager), e => e.status === 403);
  await assert.rejects(service.archive(row.id, { id: state.account.id, role: 'ADMIN' }), e => e.status === 400);
});

test('start/end shifts are idempotent, Moscow-dated, scoped and protected from paid period changes', async () => {
  const { service, state } = store();
  const row = await service.saveProfile({ fullName: 'Тренер', role: 'TRAINER' }, admin);
  const employee = { id: state.account.id, role: 'TRAINER' };
  const start = new Date('2026-10-25T22:00:00Z'), end = new Date('2026-10-26T05:00:00Z');
  await assert.rejects(service.duty('end', undefined, employee, start), e => e.status === 409);
  await service.duty('start', undefined, employee, start);
  assert.equal(state.shift.date.toISOString(), '2026-10-26T00:00:00.000Z'); assert.equal(state.shift.startTime, '01:00');
  const id = state.shift.id;
  await service.duty('start', row.id, admin, start); assert.equal(state.shift.id, id);
  await assert.rejects(service.duty('end', randomUUID(), employee, end), e => e.status === 403);
  await assert.rejects(service.duty('end', row.id, { id: randomUUID(), role: 'MANAGER' }, end), e => e.status === 403);
  state.paid = true; await assert.rejects(service.duty('end', row.id, admin, end), e => e.status === 409); state.paid = false;
  await service.duty('end', undefined, employee, end);
  assert.equal(state.shift.status, 'COMPLETED'); assert.equal(state.shift.endTime, '08:00'); assert.equal(state.shift.endedById, employee.id);
  await service.duty('end', undefined, employee, end); assert.equal(state.shift.id, id);
  await assert.rejects(service.duty('start', row.id, admin, end), e => e.status === 409);
});

test('staff filters and duty query share actual presence criteria; DTO handles empty filters', async () => {
  const { service, state } = store();
  const query = plainToInstance(StaffQueryDto, { page: '2', pageSize: '10', role: '', duty: '', activity: '' });
  assert.equal((await validate(query)).length, 0); assert.equal(query.role, undefined); assert.equal(query.page, 2);
  await service.profiles(admin, { role: 'TRAINER', activity: 'active', duty: 'on' });
  assert.equal(state.query.where.user.role, 'TRAINER'); assert.equal(state.query.where.isActive, true);
  assert.equal(state.query.where.shifts.some.endedAt, null); assert.equal(state.query.where.shifts.some.status, 'SCHEDULED');
  await service.today(admin); assert.equal(state.dutyQuery.where.endedAt, null);
  const dto = plainToInstance(StaffProfileDto, { fullName: 'Тренер', role: 'TRAINER', position: 'Тренер' });
  assert.equal((await validate(dto)).length, 0);
});

test('disabled staff cannot login or reuse access/refresh tokens; new employee roles validate', async () => {
  const secret = 'staff-lifecycle-test-secret-at-least-32-characters';
  const jwt = new JwtService({ secret });
  const account = { id: randomUUID(), email: 'employee@test.local', role: 'GROOM', tokenVersion: 1, crmAccess: false, passwordHash: await require('bcrypt').hash('test-password', 4) };
  const prisma = { user: { findUnique: async () => account } };
  const auth = new AuthService(prisma, jwt, { secret });
  const strategy = new JwtStrategy({ secret }, prisma);
  await assert.rejects(auth.validateUser(account.email, 'test-password'), e => e.status === 401);
  const payload = { sub: account.id, email: account.email, role: account.role, authVersion: '1', exp: Math.floor(Date.now() / 1000) + 60 };
  await assert.rejects(strategy.validate(payload), e => e.status === 401);
  const refresh = await jwt.signAsync({ ...payload, tokenType: 'refresh' });
  await assert.rejects(auth.refresh(refresh), e => e.status === 401);
  account.crmAccess = true;
  for (const role of ['GROOM', 'VET', 'OTHER']) { account.role = role; assert.equal((await strategy.validate({ ...payload, role })).role, role); }
});

test('HTTP module permissions block READ_ONLY mutations and HIDDEN reads; full employees can open own shift', async () => {
  let accessLevel = 'READ_ONLY', role = 'TRAINER', starts = 0;
  const module = await Test.createTestingModule({ controllers: [StaffController, ShiftsController], providers: [RolesGuard, ModuleAccessGuard,
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'STAFF_PAYROLL', accessLevel, isEnabled: true }] } },
    { provide: StaffService, useValue: { profiles: () => ({ data: [], total: 0 }), today: () => [], duty: () => { starts++; return {}; } } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: ctx => { ctx.switchToHttp().getRequest().user = { ...admin, role }; return true; } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  try {
    const server = app.getHttpServer();
    await request(server).get('/api/staff').expect(200);
    await request(server).post('/api/shifts/start').send({}).expect(403);
    accessLevel = 'HIDDEN'; await request(server).get('/api/shifts/today').expect(403);
    accessLevel = 'FULL'; role = 'GROOM'; await request(server).post('/api/shifts/start').send({}).expect(201);
    await request(server).post('/api/shifts/end').send({ staffId: 'invalid' }).expect(400);
    await request(server).post('/api/staff').send({}).expect(403);
    assert.equal(starts, 1);
  } finally { await app.close(); }
});
