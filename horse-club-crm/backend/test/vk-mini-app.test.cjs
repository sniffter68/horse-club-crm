const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('reflect-metadata');
const { verifyVkLaunchParams, VkMiniAppService } = require('../dist/auth/vk-mini-app.service');
const { VkMiniAppController } = require('../dist/auth/vk-mini-app.controller');
const secret = 'test-mini-app-secret';
function launch(extra = {}) {
  const params = new URLSearchParams({ vk_user_id: '123', vk_ts: String(Math.floor(Date.now()/1000)), vk_app_id: '6781503', ...extra });
  const sorted = new URLSearchParams([...params.entries()].sort(([a], [b]) => a < b ? -1 : 1));
  params.set('sign', crypto.createHmac('sha256', secret).update(sorted.toString()).digest('base64url'));
  return params.toString();
}
test('VK signature sorts keys, encodes values, ignores unsigned values and compares timing-safely', () => {
  const original = crypto.timingSafeEqual;
  let calls = 0;
  crypto.timingSafeEqual = (...args) => { calls++; return original(...args); };
  try {
    assert.equal(verifyVkLaunchParams(launch({ vk_extra: 'a b+/=' }) + '&ref=ignored', secret, '6781503'), '123');
    assert.equal(calls, 1);
    assert.throws(() => verifyVkLaunchParams(launch().replace('vk_user_id=123', 'vk_user_id=124'), secret));
    assert.equal(calls, 2);
  } finally { crypto.timingSafeEqual = original; }
});
test('VK rejects malformed signatures, duplicates, wrong app and stale launches', () => {
  assert.throws(() => verifyVkLaunchParams('sign=x', secret));
  assert.throws(() => verifyVkLaunchParams(launch() + '&vk_user_id=123', secret));
  assert.throws(() => verifyVkLaunchParams(launch(), secret, '1'));
  assert.throws(() => verifyVkLaunchParams(launch({ vk_ts: '1' }), secret));
});
test('POST vk-mini-app returns unlinked or client JWT and re-verifies link', async () => {
  process.env.VK_MINI_APP_SECRET = secret;
  process.env.VK_MINI_APP_ID = '6781503';
  let client = null;
  const service = new VkMiniAppService({ user: { findFirst: async () => null }, client: { findFirst: async () => client } },
    { signAsync: async (payload, options) => { assert.equal(payload.tokenType, 'vk-client-tma'); assert.equal(options.audience, 'client-tma'); return 'token'; } });
  const controller = new VkMiniAppController(service);
  assert.deepEqual(await controller.login({ launchParams: launch() }), { status: 'UNLINKED', vkUserId: '123' });
  client = { id: 'client', deletedAt: null };
  assert.equal((await controller.login({ launchParams: launch() })).access_token, 'token');
  await assert.rejects(controller.linkByVk({ launchParams: 'sign=x', phone: '+79991234567', phoneToken: 'x' }));
});

function phoneToken(phone, userId = '123') {
  return crypto.createHash('sha256').update(`6781503${secret}${userId}phone_number${phone}`).digest('base64url');
}

function linkingFixture({ matches = [{ kind: 'CLIENT', id: 'client' }], clientOverrides = {}, userOverrides = {}, occupied = false } = {}) {
  process.env.VK_MINI_APP_SECRET = secret;
  process.env.VK_MINI_APP_ID = '6781503';
  const client = { id: 'client', phone: '+79991234567', deletedAt: null, vkId: null, vkUserId: null, ...clientOverrides };
  const user = { id: 'user', email: 'staff@test.local', role: 'MANAGER', crmAccess: true, tokenVersion: 2,
    staffProfile: { isActive: true }, trainer: null, trainerId: null, vkId: null, vkUserId: null, ...userOverrides };
  let writes = 0;
  let query;
  const tx = {
    $queryRaw: async sql => { query = sql; return matches; },
    client: { findUnique: async () => client, findFirst: async () => occupied ? { id: 'other' } : null,
      update: async ({ data }) => { writes++; Object.assign(client, data); } },
    user: { findUnique: async () => user, findFirst: async () => null,
      update: async ({ data }) => { writes++; Object.assign(user, data); } },
    trainer: { findUnique: async () => null, update: async () => { writes++; } },
  };
  const prisma = { ...tx, $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); return work(tx);
  }, client: { ...tx.client, findFirst: async () => client.vkUserId === 123n ? client : null },
  user: { ...tx.user, findFirst: async () => user.vkUserId === 123n ? user : null } };
  const service = new VkMiniAppService(prisma, { signAsync: async () => 'token' });
  return { service, get writes() { return writes; }, get query() { return query; }, client, user };
}

test('native signed phone links a client without a code, normalizes RU variants and preserves bot fields', async () => {
  for (const phone of ['+79991234567', '79991234567', '89991234567']) {
    const fixture = linkingFixture();
    const result = await fixture.service.linkByVk(launch(), phone, phoneToken(phone));
    assert.equal(result.access_token, 'token');
    assert.equal(result.role, 'CLIENT');
    assert.equal(fixture.writes, 1);
    assert.equal(fixture.client.vkId, '123');
    assert.equal(fixture.client.vkUserId, 123n);
    assert.deepEqual(fixture.query.values, ['79991234567', '89991234567', '79991234567', '89991234567', '79991234567', '89991234567']);
  }
});

test('unsigned, forged and different-account phone proofs are rejected before querying the CRM', async () => {
  const fixture = linkingFixture();
  for (const [phone, sign] of [[undefined, undefined], ['+79991234567', undefined], ['+79991234567', 'x'],
    ['+79991234567', phoneToken('+79991234567', '124')], ['+79991234568', phoneToken('+79991234567')]]) {
    await assert.rejects(fixture.service.linkByVk(launch(), phone, sign));
  }
  assert.equal(fixture.query, undefined);
  assert.equal(fixture.writes, 0);
});

test('missing, ambiguous, archived, already bound and conflicting profiles cannot be linked', async () => {
  for (const options of [
    { matches: [] }, { matches: [{ kind: 'CLIENT', id: 'client' }, { kind: 'STAFF', id: 'user' }] },
    { clientOverrides: { deletedAt: new Date() } }, { clientOverrides: { vkId: '456' } },
    { clientOverrides: { vkUserId: 456n } }, { occupied: true },
    { matches: [{ kind: 'STAFF', id: 'user' }], userOverrides: { crmAccess: false } },
    { matches: [{ kind: 'STAFF', id: 'user' }], userOverrides: { staffProfile: { isActive: false } } },
    { matches: [{ kind: 'STAFF', id: 'user' }], userOverrides: { vkId: '456' } },
  ]) {
    const fixture = linkingFixture(options);
    await assert.rejects(fixture.service.linkByVk(launch(), '+79991234567', phoneToken('+79991234567')));
    assert.equal(fixture.writes, 0);
  }
});

test('native phone signs in staff, sets the CRM session cookie and synchronizes trainer identity', async () => {
  for (const userOverrides of [{}, { role: 'TRAINER', trainerId: 'trainer', trainer: { vkId: null, isActive: true } }]) {
    const fixture = linkingFixture({ matches: [{ kind: 'STAFF', id: 'user' }], userOverrides });
    let cookie;
    const result = await new VkMiniAppController(fixture.service).linkByVk({ launchParams: launch(), phone: '+79991234567', phoneToken: phoneToken('+79991234567') },
      { headers: {} }, { cookie: (...args) => { cookie = args; }, setHeader: () => {} });
    assert.equal(result.status, 'LINKED');
    assert.equal(result.role, userOverrides.role ?? 'MANAGER');
    assert.equal(cookie[1], 'token');
    assert.equal(fixture.user.vkUserId, 123n);
    assert.equal(fixture.writes, userOverrides.trainerId ? 2 : 1);
  }
});

test('login finds legacy bot and CRM identities using both normalized VK fields', async () => {
  for (const staff of [false, true]) {
    const service = new VkMiniAppService({
      user: { findFirst: async ({ where }) => {
        assert.deepEqual(where.OR, [{ vkUserId: 123n }, { vkId: '123' }, { trainer: { vkId: 123n } }]);
        return staff ? { id: 'staff', role: 'MANAGER', crmAccess: true, tokenVersion: 1 } : null;
      } },
      client: { findFirst: async ({ where }) => { assert.deepEqual(where.OR, [{ vkUserId: 123n }, { vkId: '123' }]); return { id: 'client' }; } },
    }, { signAsync: async () => 'token' });
    assert.equal((await service.login(launch())).status, 'LINKED');
  }
});
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
test('HTTP POST /api/auth/vk-mini-app validates DTO and rejects tampered signatures', async () => {
  process.env.VK_MINI_APP_SECRET = secret;
  process.env.VK_MINI_APP_ID = '6781503';
  const service = new VkMiniAppService({ user: { findFirst: async () => null }, client: { findFirst: async () => null } }, {}, {});
  const module = await Test.createTestingModule({ controllers: [VkMiniAppController], providers: [{ provide: VkMiniAppService, useValue: service }] }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    await request(app.getHttpServer()).post('/api/auth/vk-mini-app').send({ launchParams: launch() }).expect(200, { status: 'UNLINKED', vkUserId: '123' });
    await request(app.getHttpServer()).post('/api/auth/vk-mini-app').send({ launchParams: launch().replace('vk_user_id=123', 'vk_user_id=124') }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/vk-mini-app').send({ launchParams: 123 }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/vk-mini-app/link-by-vk').send({ launchParams: launch(), phone: '+79991234567' }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/vk-mini-app/link-by-vk').send({ launchParams: launch(), phone: '+79991234567', phoneToken: 'fake' }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/vk-mini-app/link-by-vk').send({ launchParams: launch(), phone: 123, code: '1234' }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/vk-mini-app/link').send({ launchParams: launch(), phone: '+79991234567', code: '1234' }).expect(404);
  } finally { await app.close(); }
});

test('HTTP native phone link returns an immediate session without a code', async () => {
  const fixture = linkingFixture();
  const module = await Test.createTestingModule({ controllers: [VkMiniAppController], providers: [{ provide: VkMiniAppService, useValue: fixture.service }] }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    const result = await request(app.getHttpServer()).post('/api/auth/vk-mini-app/link-by-vk')
      .send({ launchParams: launch(), phone: '+79991234567', phoneToken: phoneToken('+79991234567') }).expect(200);
    assert.equal(result.body.access_token, 'token');
    assert.equal(result.body.role, 'CLIENT');
    assert.equal(result.headers['cache-control'], 'no-store');
  } finally { await app.close(); }
});
