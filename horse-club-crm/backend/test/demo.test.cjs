require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, UnauthorizedException } = require('@nestjs/common');
const request = require('supertest');
const { DemoService } = require('../dist/demo/demo.service');
const { DemoController } = require('../dist/demo/demo.controller');
const { seedDemo } = require('../dist/demo/demo-seed');
const { demoAccounts, requireDemo } = require('../dist/demo/demo.config');
const { AuthService } = require('../dist/auth/auth.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

function fixture() {
  let state = Object.fromEntries(Prisma.dmmf.datamodel.models.map(model => [model.name[0].toLowerCase() + model.name.slice(1), []]));
  const calls = [];
  let fail = false;
  const tx = {
    $queryRaw: async query => {
      if (Array.isArray(query)) { calls.push('lock'); return []; }
      return [{ records: [{ id: 'snapshot', amount: '18000.00' }] }];
    },
    $executeRaw: async query => {
      if (Array.isArray(query)) { calls.push('lock'); return 0; }
      if (query.sql.startsWith('LOCK TABLE')) { calls.push('tables-locked'); return 0; }
      assert.match(query.sql, /^TRUNCATE TABLE/);
      assert.ok(!query.sql.includes('"CashAuditLog"'));
      calls.push('truncate');
      for (const key of Object.keys(state)) if (key !== 'cashAuditLog') state[key] = [];
      return 0;
    },
  };
  for (const model of Object.keys(state)) tx[model] = {
    count: async () => state[model].length,
    deleteMany: async () => { state[model] = []; return { count: 0 }; },
    findUnique: async ({ where }) => state[model].find(row => row.requestId === where.requestId),
    create: async ({ data }) => { calls.push(model); state[model].push(data); return data; },
    upsert: async ({ where, create }) => {
      if (fail && model === 'horse') throw new Error('seed failure');
      const existing = state[model].find(row => Object.entries(where).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value)));
      if (existing) return existing;
      const row = { ...where, ...create };
      state[model].push(row);
      return row;
    },
  };
  const prisma = { $transaction: async callback => {
    const before = structuredClone(state);
    try { return await callback(tx); } catch (error) { state = before; throw error; }
  } };
  return { prisma, tx, calls, state: () => state, fail: () => { fail = true; } };
}

test('demo safety, seed and HTTP contracts', async t => {
  const previous = { mode: process.env.DEMO_MODE, url: process.env.DATABASE_URL };
  t.after(() => {
    if (previous.mode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = previous.mode;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
  });
  process.env.DATABASE_URL = 'postgresql://local:local@localhost/horse_demo';
  await t.test('disabled and production database guards execute before database access', async () => {
    for (const mode of [undefined, 'false', 'TRUE', '1']) {
      if (mode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = mode;
      await assert.rejects(new DemoService({}).reset(demoAccounts.OWNER), { status: 404 });
    }
    process.env.DEMO_MODE = 'true';
    process.env.DATABASE_URL = 'postgresql://local:local@localhost/horse_production';
    assert.throws(requireDemo, { status: 403 });
    process.env.DATABASE_URL = 'postgresql://local:local@localhost/horse_demo';
  });
  await t.test('seed is idempotent and consistent with Moscow week, occupancy and cashboxes', async () => {
    const f = fixture();
    const now = new Date('2026-11-29T22:30:00Z'); // Monday in Moscow, Sunday in UTC.
    await seedDemo(f.tx, 'hash', now);
    await seedDemo(f.tx, 'hash', now);
    const rows = f.state();
    for (const [model, count] of Object.entries({ horse: 10, stall: 10, trainer: 3, client: 12, membership: 8, boardingContract: 4, lesson: 14, booking: 14, payment: 12 })) {
      assert.equal(rows[model].length, count, model);
    }
    assert.equal(rows.lesson[0].startTime.toISOString(), '2026-11-30T07:00:00.000Z');
    assert.deepEqual(rows.expense.map(row => row.cashboxType), ['MAIN', 'BOARDING']);
    assert.ok(rows.payment.every(row => row.cashierId));
    assert.ok(rows.expense.every(row => row.createdById));
    assert.ok(rows.stall.every(row => rows.horse.some(horse => horse.id === row.horseId)));
    assert.equal(rows.user.filter(row => row.role === 'TRAINER' && row.staffProfile).length, 3);
  });
  await t.test('demo authentication signs only the exact enabled account and enforces the environment', async () => {
    const account = demoAccounts.TRAINER;
    let row = { ...account, crmAccess: true, tokenVersion: 5 };
    let payload;
    const auth = new AuthService({ user: { findUnique: async ({ where }) => {
      assert.equal(where.id, account.id); return row;
    } } }, { signAsync: async data => { payload = data; return 'signed-demo'; } }, {});
    const result = await auth.loginDemo('TRAINER');
    assert.equal(result.access_token, 'signed-demo');
    assert.deepEqual(payload, { sub: account.id, email: account.email, role: 'TRAINER', authVersion: '5' });
    row = { ...row, email: 'different@example.com' };
    await assert.rejects(auth.loginDemo('TRAINER'), { status: 401 });
    row = { ...row, email: account.email, crmAccess: false };
    await assert.rejects(auth.loginDemo('TRAINER'), { status: 401 });
    process.env.DEMO_MODE = 'false';
    await assert.rejects(auth.loginDemo('TRAINER'), { status: 404 });
    process.env.DEMO_MODE = 'true';
  });
  await t.test('initialization refuses existing data; reset audits before truncation and rolls back failures', async () => {
    const occupied = fixture();
    occupied.state().client.push({ id: 'real' });
    await assert.rejects(new DemoService(occupied.prisma).initialize(), { status: 403 });
    const f = fixture();
    const service = new DemoService(f.prisma);
    await assert.rejects(service.reset(demoAccounts.OWNER), { status: 403 });
    await service.initialize();
    await service.initialize();
    assert.equal(f.state().cashAuditLog.length, 1);
    await service.reset(demoAccounts.OWNER);
    assert.ok(f.calls.indexOf('truncate') > f.calls.indexOf('cashAuditLog'));
    assert.ok(f.calls.indexOf('tables-locked') < f.calls.indexOf('truncate'));
    assert.equal(f.state().cashAuditLog[1].action, 'DEMO_RESET');
    assert.equal(f.state().cashAuditLog[1].details.createdById, demoAccounts.OWNER.id);
    assert.equal(f.state().cashAuditLog[1].details.snapshots.Payment[0].amount, '18000.00');
    await service.reset(demoAccounts.OWNER);
    assert.equal(f.state().client.length, 12);
    const before = structuredClone(f.state());
    f.fail();
    await assert.rejects(service.reset(demoAccounts.OWNER), /seed failure/);
    assert.deepEqual(f.state(), before);
  });
  await t.test('HTTP: public status, validated demo login, auth and role/module protected reset', async () => {
    let role = 'ADMIN';
    let level = 'FULL';
    let authenticated = true;
    const f = fixture();
    const module = await Test.createTestingModule({ controllers: [DemoController], providers: [DemoService,
      { provide: PrismaService, useValue: f.prisma }, { provide: AuthService, useValue: {
        loginDemo: async key => ({ access_token: 'test-token', user: demoAccounts[key] }), createRefreshToken: async () => 'refresh' } },
      { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'CASHBOX', isEnabled: true, accessLevel: level }] } },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => {
      if (!authenticated) throw new UnauthorizedException();
      context.switchToHttp().getRequest().user = { ...demoAccounts.OWNER, role }; return true;
    } }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    try {
      const http = request(app.getHttpServer());
      await http.get('/api/demo/status').expect(200, { isDemo: true });
      await http.post('/api/demo/login').send({ role: 'ROOT' }).expect(400);
      for (const demoRole of ['OWNER', 'ADMIN', 'TRAINER']) {
        const result = await http.post('/api/demo/login').send({ role: demoRole }).expect(200);
        assert.equal(result.body.access_token, 'cookie-session');
        assert.ok(result.headers['set-cookie'].some(cookie => cookie.includes('HttpOnly')));
      }
      authenticated = false;
      await http.post('/api/demo/reset').expect(401);
      authenticated = true; role = 'TRAINER';
      await http.post('/api/demo/reset').expect(403);
      role = 'MANAGER'; level = 'READ_ONLY';
      await http.post('/api/demo/reset').expect(403);
      level = 'FULL';
      await http.post('/api/demo/reset').expect(200, { success: true });
      process.env.DEMO_MODE = 'false';
      await http.get('/api/demo/status').expect(200, { isDemo: false });
      await http.post('/api/demo/reset').expect(404);
      await http.post('/api/demo/login').send({ role: 'OWNER' }).expect(404);
      process.env.DEMO_MODE = 'true';
    } finally { await app.close(); }
  });
});
