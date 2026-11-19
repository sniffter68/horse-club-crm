require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compare } = require('bcrypt');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { TrainersService } = require('../dist/trainers/trainers.service');
const { TrainersController } = require('../dist/trainers/trainers.controller');
const { VkIdentityService } = require('../dist/vk-bot/vk-identity.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');
const { WorkspaceService } = require('../dist/workspace/workspace.service');
const id = '11111111-1111-4111-8111-111111111111';
const actor = { id, email: 'admin@test.local', role: 'ADMIN' };

function fixture() {
  const state = { trainer: { id, name: 'Same Name', isActive: true, user: null }, account: null, audits: [] };
  const tx = {
    trainer: { findUnique: async () => state.trainer },
    user: {
      findUnique: async () => state.account,
      create: async ({ data, select }) => { state.account = { id: 'account', ...data }; state.trainer.user = { id: 'account' }; return Object.fromEntries(Object.keys(select).map(key => [key, state.account[key]])); },
      update: async ({ data }) => { Object.assign(state.account, data); state.trainer.user = { id: state.account.id }; return state.account; },
    },
    cashAuditLog: { create: async ({ data }) => { state.audits.push(data); } },
  };
  return { state, service: new TrainersService({ $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(tx); } }) };
}

test('issue login on an existing Trainer: no trainer/staff creation, password hash and safe projection', async () => {
  const { service, state } = fixture();
  const account = await service.setAccount(id, { email: 'New@club.test', password: 'temporary-password-123' }, actor);
  assert.equal(account.email, 'new@club.test'); assert.equal(account.crmAccess, true);
  assert.equal(state.account.trainerId, id); assert.equal(state.account.role, 'TRAINER');
  assert.equal(await compare('temporary-password-123', state.account.passwordHash), true);
  assert.equal(account.passwordHash, undefined); assert.equal(state.audits.length, 1);
  assert.equal(JSON.stringify(state.audits).includes('password'), false);
  await assert.rejects(service.setAccount(id, { userId: 'other' }, actor), e => e.status === 409);
});

test('bind existing trainer account without changing its login/access, and revoke previous session', async () => {
  const { service, state } = fixture();
  state.account = { id: 'existing', role: 'TRAINER', trainerId: null, crmAccess: false };
  await service.setAccount(id, { userId: 'existing' }, actor);
  assert.equal(state.account.trainerId, id); assert.equal(state.account.crmAccess, false);
  assert.deepEqual(state.account.tokenVersion, { increment: 1 });
  for (const account of [{ role: 'MANAGER' }, { role: 'TRAINER', trainerId: 'another-trainer' }]) {
    const f = fixture(); f.state.account = account;
    await assert.rejects(f.service.setAccount(id, { userId: 'existing' }, actor));
    assert.equal(f.state.audits.length, 0);
  }
});

test('issue access to a linked disabled account in place, preserving user and trainer IDs', async () => {
  const { service, state } = fixture();
  state.account = { id: 'placeholder', role: 'TRAINER', trainerId: id, email: 'placeholder@staff.invalid', crmAccess: false };
  state.trainer.user = { id: 'placeholder', role: 'TRAINER', crmAccess: false };
  await service.setAccount(id, { email: 'enabled@club.test', password: 'temporary-password-123' }, actor);
  assert.equal(state.account.id, 'placeholder'); assert.equal(state.account.trainerId, id);
  assert.equal(state.account.crmAccess, true); assert.equal(state.account.email, 'enabled@club.test');
  assert.equal(await compare('temporary-password-123', state.account.passwordHash), true);
});

test('same names never confer ownership; active club columns include trainers without logins', async () => {
  const own = { id, name: 'Same Name' }, other = { id: 'other-trainer', name: 'Same Name' };
  const tx = { trainer: { findMany: async ({ where }) => { assert.deepEqual(where, { isActive: true }); return [own, other]; } },
    clubSchedule: { findUnique: async () => null },
    lesson: { findMany: async () => [own, other].map((trainer, index) => ({ id: `lesson-${index}`, trainerId: trainer.id, trainerNote: 'private', bookings: [], status: 'COMPLETED' })) },
  };
  const service = new WorkspaceService({ $transaction: work => work(tx) }, {}, {});
  const board = await service.trainerBoard({ ...actor, role: 'TRAINER', trainerId: id }, '2026-11-19');
  assert.equal(board.trainers.length, 2); assert.deepEqual(board.lessons.map(row => row.isOwn), [true, false]);
  assert.equal(board.lessons[1].trainerNote, null);
});

test('HTTP account issuance enforces ADMIN, UUID and DTO validation before invoking service', async () => {
  let calls = 0;
  const module = await Test.createTestingModule({ controllers: [TrainersController], providers: [
    { provide: TrainersService, useValue: { setAccount: async () => { calls++; return { id }; } } },
    { provide: VkIdentityService, useValue: {} },
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'STAFF_PAYROLL', isEnabled: true, accessLevel: 'FULL' }] } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) { ctx.switchToHttp().getRequest().user = { ...actor, role: ctx.switchToHttp().getRequest().headers['x-role'] || 'ADMIN' }; return true; } }).compile();
  const app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  try {
    const api = request(app.getHttpServer());
    await api.post(`/trainers/${id}/account`).set('x-role', 'MANAGER').send({ userId: id }).expect(403);
    await api.post('/trainers/bad/account').send({ userId: id }).expect(400);
    await api.post(`/trainers/${id}/account`).send({ email: 'invalid', password: 'short' }).expect(400);
    await api.post(`/trainers/${id}/account`).send({ userId: id, role: 'ADMIN' }).expect(400);
    assert.equal(calls, 0);
    await api.post(`/trainers/${id}/account`).send({ userId: id }).expect(201); assert.equal(calls, 1);
  } finally { await app.close(); }
});
