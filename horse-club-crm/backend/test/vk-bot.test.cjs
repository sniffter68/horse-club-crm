const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { VkBotController } = require('../dist/vk-bot/vk-bot.controller');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { VkLinkService } = require('../dist/vk-bot/vk-link.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { LeadsService } = require('../dist/leads/leads.service');
let app, bot, lookup, sent;
const original = Object.fromEntries(['VK_SECRET_KEY', 'VK_GROUP_ID', 'VK_CONFIRMATION_CODE', 'VK_BOT_TOKEN'].map(key => [key, process.env[key]]));
before(async () => {
  process.env.VK_SECRET_KEY = 'test-secret'; process.env.VK_GROUP_ID = '123'; process.env.VK_CONFIRMATION_CODE = 'confirmation-code'; delete process.env.VK_BOT_TOKEN;
  const module = await Test.createTestingModule({ controllers: [VkBotController], providers: [VkBotService,
    { provide: VkLinkService, useValue: {} }, { provide: MembershipLedgerService, useValue: {} }, { provide: LeadsService, useValue: {} },
    { provide: PrismaService, useValue: { trainer: { findUnique: async () => null }, client: { findUnique: async args => { lookup.push(args); return { id: 'client', firstName: 'Анна' }; } } } }] }).compile();
  bot = module.get(VkBotService);
  bot.vk = { api: { messages: { send: async params => { sent.push(params); return 1; } } } };
  app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
});
beforeEach(() => { lookup = []; sent = []; });
after(async () => { await app?.close(); for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
const event = { type: 'confirmation', group_id: 123, secret: 'test-secret' };
test('confirmation returns plain confirmation code without Bearer', async () => {
  const response = await request(app.getHttpServer()).post('/api/vk/callback').send(event).expect(200);
  assert.equal(response.text, 'confirmation-code'); assert.match(response.headers['content-type'], /text\/plain/);
});
test('header secret is accepted', async () => {
  const response = await request(app.getHttpServer()).post('/api/vk/callback').set('x-vk-secret', 'test-secret').send({ type: 'confirmation', group_id: 123 }).expect(200);
  assert.equal(response.text, 'confirmation-code');
});
for (const patch of [{ secret: 'wrong' }, { secret: null }, { group_id: 456 }]) test(`rejects invalid callback ${JSON.stringify(patch)}`, async () => {
  await request(app.getHttpServer()).post('/api/vk/callback').send({ ...event, ...patch }).expect(403);
  assert.equal(lookup.length, 0);
});
const message = { ...event, type: 'message_new', event_id: 'event-1', object: { message: { from_id: 42, peer_id: 42, text: 'начать', out: 0 } } };
test('message routes by BigInt vkUserId and repeats use stable random_id', async () => {
  for (let i = 0; i < 2; i++) assert.equal((await request(app.getHttpServer()).post('/api/vk/callback').send(message).expect(200)).text, 'ok');
  assert.equal(lookup[0].where.vkUserId, 42n);
  assert.match(sent[0].message, /Анна/); assert.equal(sent[0].peer_id, 42);
  assert.equal(sent[0].random_id, sent[1].random_id);
});
test('group chat does not disclose client identity', async () => {
  await request(app.getHttpServer()).post('/api/vk/callback').send({ ...message, object: { message: { ...message.object.message, peer_id: 2000000001 } } }).expect(200);
  assert.equal(lookup.length, 0); assert.equal(sent.length, 0);
});
test('malformed message is rejected', async () => {
  await request(app.getHttpServer()).post('/api/vk/callback').send({ ...message, object: {} }).expect(400);
});
test('missing secret configuration fails closed', async () => {
  delete process.env.VK_SECRET_KEY;
  try { await request(app.getHttpServer()).post('/api/vk/callback').send(event).expect(503); }
  finally { process.env.VK_SECRET_KEY = 'test-secret'; }
});
