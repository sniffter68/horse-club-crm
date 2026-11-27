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
  let bound = 0;
  const service = new VkMiniAppService({ user: { findFirst: async () => null }, client: { findFirst: async () => client } },
    { signAsync: async (payload, options) => { assert.equal(payload.tokenType, 'vk-client-tma'); assert.equal(options.audience, 'client-tma'); return 'token'; } },
    { bind: async () => { bound++; } });
  const controller = new VkMiniAppController(service);
  assert.deepEqual(await controller.login({ launchParams: launch() }), { status: 'UNLINKED', vkUserId: '123' });
  client = { id: 'client', deletedAt: null };
  assert.equal((await controller.login({ launchParams: launch() })).access_token, 'token');
  await assert.rejects(controller.link({ launchParams: 'sign=x', phone: '+79991234567', code: '1234' }));
  assert.equal(bound, 0);
  await controller.link({ launchParams: launch(), phone: '+79991234567', code: '1234' });
  assert.equal(bound, 1);
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
  } finally { await app.close(); }
});
