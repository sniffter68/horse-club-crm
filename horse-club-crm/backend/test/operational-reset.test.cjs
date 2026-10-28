require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, UnauthorizedException } = require('@nestjs/common');
const request = require('supertest');
const { OperationalResetService } = require('../dist/settings/operational-reset.service');
const { OperationalResetController } = require('../dist/settings/operational-reset.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');
const { PrismaService } = require('../dist/prisma/prisma.service');
const user = { id: randomUUID(), email: 'admin@example.com', role: 'ADMIN' };
const dto = () => ({ confirmation: 'RESET_ALL_OPERATIONAL_DATA', requestId: randomUUID() });
const models = ['monthlyFinancialClosing', 'payrollCalculation', 'ledgerTransaction', 'revenueRecognition',
  'membershipOp', 'bookingHorseChange', 'booking', 'lesson', 'membershipMember', 'membership', 'expense', 'payment', 'cashShift'];

function fixture(failAt) {
  let state = Object.fromEntries(models.map(model => [model, [{ id: model, amount: '176450.00', archivedAt: new Date().toISOString() }]]));
  Object.assign(state, { client: [{ id: 'client', boardingBalance: '456.78' }], horse: [{ id: 'horse' }],
    user: [{ ...user, staffProfile: { fullName: 'Администратор' } }], service: [{ id: 'service' }],
    pricingPlan: [{ id: 'plan' }], trainer: [{ id: 'trainer' }], staffProfile: [{ id: 'staff' }], cashAuditLog: [] });
  // Apply actual schema FK restrictions, including nullable SetNull links.
  const schema = require('node:fs').readFileSync(require('node:path').join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const relations = [];
  for (const match of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
    const source = match[1][0].toLowerCase() + match[1].slice(1);
    if (!state[source]) continue;
    for (const rel of match[2].matchAll(/^\s+\w+\s+(\w+)\??\s+@relation\([^\n]*fields: \[(\w+)\], references: \[id\]([^\n]*)/gm)) {
      const target = rel[1][0].toLowerCase() + rel[1].slice(1);
      if (!state[target]) continue;
      const action = /onDelete: (\w+)/.exec(rel[3])?.[1] ?? (match[2].includes(`${rel[2]} String?`) ? 'SetNull' : 'Restrict');
      relations.push({ source, target, field: rel[2], action });
      state[source][0][rel[2]] = state[target][0]?.id;
    }
  }
  const calls = [];
  const tx = { $executeRaw: async () => { calls.push('lock'); return 0; }, $queryRaw: async () => [] };
  for (const model of Object.keys(state)) tx[model] = {
    findMany: async () => structuredClone(state[model]),
    deleteMany: async () => {
      if (failAt === model) throw new Error('injected failure');
      for (const { source, target, field, action } of relations.filter(rel => rel.target === model)) {
        const children = state[source].filter(row => state[target].some(parent => parent.id === row[field]));
        if (action === 'SetNull') children.forEach(row => { row[field] = null; });
        else if (action === 'Cascade') state[source] = state[source].filter(row => !children.includes(row));
        else assert.equal(children.length, 0, `${source}.${field} still references ${model}`);
      }
      calls.push(model); const count = state[model].length; state[model] = []; return { count };
    },
    updateMany: async ({ data }) => { if (failAt === 'balance') throw new Error('injected failure'); state[model].forEach(row => Object.assign(row, JSON.parse(JSON.stringify(data)))); return { count: state[model].length }; },
  };
  tx.user.findUniqueOrThrow = async () => state.user[0];
  tx.cashAuditLog.findUnique = async ({ where }) => state.cashAuditLog.find(row => row.requestId === where.requestId);
  tx.cashAuditLog.create = async ({ data }) => {
    if (failAt === 'audit') throw new Error('injected failure');
    const row = { id: randomUUID(), createdAt: new Date(), ...data }; state.cashAuditLog.push(row); return row;
  };
  const prisma = { $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    const before = structuredClone(state);
    try { return await work(tx); } catch (error) { state = before; throw error; }
  } };
  return { prisma, service: new OperationalResetService(prisma), state: () => state, calls };
}

test('hard reset clears active/archived operational rows respecting schema FKs and retains directories and financial audit', async () => {
  const f = fixture(); const before = structuredClone(f.state());
  const result = await f.service.reset(dto(), user);
  assert.equal(result.success, true);
  for (const model of models) assert.deepEqual(f.state()[model], [], model);
  assert.equal(Number(f.state().client[0].boardingBalance).toFixed(2), '0.00');
  for (const model of ['horse', 'user', 'service', 'pricingPlan', 'trainer', 'staffProfile']) assert.deepEqual(f.state()[model], before[model], model);
  assert.equal(f.state().client[0].id, before.client[0].id);
  const audit = f.state().cashAuditLog[0];
  assert.equal(audit.actorId, user.id); assert.equal(audit.details.createdById, user.id);
  assert.ok(audit.details.timestamp); assert.equal(audit.details.snapshot.payments[0].amount, '176450.00');
  assert.deepEqual(f.calls.filter(call => call !== 'lock'), [...models.slice(0, -1), 'ledgerTransaction', 'revenueRecognition', 'cashShift']);
  // Balances and monthly revenues derive from empty Payment/Expense/Ledger/Recognition tables.
  for (const model of ['payment', 'expense', 'ledgerTransaction', 'revenueRecognition'])
    assert.equal(f.state()[model].reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2), '0.00');
});

test('any delete, balance reset or audit failure rolls everything back', async () => {
  for (const failAt of [...models, 'balance', 'audit']) {
    const f = fixture(failAt); const before = structuredClone(f.state());
    await assert.rejects(f.service.reset(dto(), user));
    assert.deepEqual(f.state(), before, failAt);
  }
});

test('retries preserve newly entered data and reject reused keys from other actors/actions', async () => {
  const f = fixture(); const body = dto(); await f.service.reset(body, user);
  f.state().payment.push({ id: 'real-payment', amount: '100.00' });
  assert.equal((await f.service.reset(body, user)).alreadyCompleted, true);
  assert.equal(f.state().payment.length, 1); assert.equal(f.state().cashAuditLog.length, 1);
  await assert.rejects(f.service.reset(body, { ...user, id: randomUUID() }), { status: 409 });
});

test('service independently rejects non-admins and incorrect confirmation', async () => {
  const f = fixture();
  await assert.rejects(f.service.reset(dto(), { ...user, role: 'MANAGER' }), { status: 403 });
  await assert.rejects(f.service.reset({ confirmation: '' }, user), { status: 400 });
  assert.equal(f.calls.length, 0);
});

test('HTTP: authentication, real role/module guards and exact DTO validation protect reset', async () => {
  const f = fixture();
  const module = await Test.createTestingModule({ controllers: [OperationalResetController], providers: [
    OperationalResetService, RolesGuard, ModuleAccessGuard,
    { provide: PrismaService, useValue: f.prisma },
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'CASHBOX', isEnabled: true, accessLevel: 'FULL' }] } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest();
    if (!req.headers['x-role']) throw new UnauthorizedException();
    req.user = { ...user, role: req.headers['x-role'] }; return true;
  } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  try {
    const post = () => request(app.getHttpServer()).post('/api/admin/reset-operational-data');
    await post().send(dto()).expect(401);
    for (const role of ['MANAGER', 'TRAINER', 'STABLE_WORKER', 'GROOM', 'VET', 'OTHER']) await post().set('x-role', role).send(dto()).expect(403);
    for (const body of [{}, { confirmation: 'RESET_CASH' }, { ...dto(), requestId: '' }, { ...dto(), extra: true }])
      await post().set('x-role', 'ADMIN').send(body).expect(400);
    assert.equal(f.calls.length, 0);
    await post().set('x-role', 'ADMIN').send({ confirmation: 'RESET_ALL_OPERATIONAL_DATA' }).expect(200);
  } finally { await app.close(); }
});
