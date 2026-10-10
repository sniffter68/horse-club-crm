const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { setImmediate: nextTurn } = require('node:timers/promises');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { VkBotController } = require('../dist/vk-bot/vk-bot.controller');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');

const keys = ['VK_COMMUNITY_TOKEN', 'VK_BOT_TOKEN', 'VK_SECRET_KEY', 'VK_CONFIRMATION_CODE', 'VK_GROUP_ID'];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let app, bot, controller, sent, failures;
const path = '/api/vk-bot/callback';
const greeting = 'Здравствуйте! Вы подключены к боту конного клуба. Здесь будут приходить напоминания о тренировках и статус бронирований.';
const event = (text = 'Начать') => ({ type: 'message_new', secret: 'test-secret', event_id: 'new-1',
  object: { message: { from_id: 42, peer_id: 42, text, out: 0 } } });

before(async () => {
  delete process.env.VK_COMMUNITY_TOKEN; delete process.env.VK_BOT_TOKEN;
  bot = new VkBotService({}, {}, {}, {});
  const module = await Test.createTestingModule({ controllers: [VkBotController],
    providers: [{ provide: VkBotService, useValue: bot }] }).compile();
  controller = module.get(VkBotController);
  controller.logger.error = message => failures.push(message);
  app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
});
beforeEach(() => {
  process.env.VK_SECRET_KEY = 'test-secret'; process.env.VK_CONFIRMATION_CODE = 'plain-code';
  delete process.env.VK_GROUP_ID; delete process.env.VK_COMMUNITY_TOKEN; delete process.env.VK_BOT_TOKEN;
  sent = []; failures = [];
  bot.vk = { api: { messages: { send: async params => { sent.push(params); return 1; } } } };
});
after(async () => {
  await app?.close();
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('confirmation is plain text without group, token or matching secret', async () => {
  const response = await request(app.getHttpServer()).post(path).send({ type: 'confirmation', secret: 'wrong' }).expect(200);
  assert.equal(response.text, 'plain-code'); assert.match(response.headers['content-type'], /text\/plain/);
  delete process.env.VK_SECRET_KEY;
  assert.equal((await request(app.getHttpServer()).post(path).send({ type: 'confirmation' }).expect(200)).text, 'plain-code');
});

test('missing confirmation code reports configuration failure', async () => {
  delete process.env.VK_CONFIRMATION_CODE;
  await request(app.getHttpServer()).post(path).send({ type: 'confirmation' }).expect(503);
});

for (const secret of [undefined, null, '', 'wrong', 123]) test(`rejects non-confirmation secret ${JSON.stringify(secret)}`, async () => {
  await request(app.getHttpServer()).post(path).set('x-vk-secret', 'test-secret').send({ ...event(), secret }).expect(403);
  assert.equal(sent.length, 0);
});

test('unknown events return ok with valid secret and with optional secret unset', async () => {
  assert.equal((await request(app.getHttpServer()).post(path).send({ type: 'unknown', secret: 'test-secret' }).expect(200)).text, 'ok');
  delete process.env.VK_SECRET_KEY;
  const message = event(); delete message.secret;
  assert.equal((await request(app.getHttpServer()).post(path).send(message).expect(200)).text, 'ok');
  assert.equal(sent[0].message, greeting);
});

for (const text of ['Начать', 'start']) test(`${text} greets directly without a database lookup`, async () => {
  const response = await request(app.getHttpServer()).post(path).send(event(text)).expect(200);
  assert.equal(response.text, 'ok'); assert.equal(sent.length, 1);
  assert.equal(sent[0].message, greeting); assert.equal(sent[0].peer_id, 42);
  assert.ok(Number.isInteger(sent[0].random_id)); assert.notEqual(sent[0].random_id, 0);
});

test('ordinary messages are acknowledged without replying or failing', async () => {
  for (const text of ['Добрый вечер! Все в силе?', 'Привет', '1234']) {
    const response = await request(app.getHttpServer()).post(path).send(event(text)).expect(200);
    assert.equal(response.text, 'ok');
  }
  await nextTurn();
  assert.deepEqual(sent, []);
  assert.deepEqual(failures, []);
});

test('acknowledges message while processing is still pending', async () => {
  let finish, completed = false;
  const handle = bot.handleMessage;
  bot.handleMessage = () => new Promise(resolve => { finish = () => { completed = true; resolve(); }; });
  try {
    const response = await request(app.getHttpServer()).post(path).send(event()).timeout(1000).expect(200);
    assert.equal(response.text, 'ok'); assert.equal(completed, false);
  } finally { finish?.(); bot.handleMessage = handle; }
});

test('VK transport failure is caught and later callbacks still work', async () => {
  bot.vk.api.messages.send = async () => { throw new Error('VK unavailable'); };
  assert.equal((await request(app.getHttpServer()).post(path).send(event()).expect(200)).text, 'ok');
  await nextTurn(); assert.equal(failures.length, 1);
  bot.vk.api.messages.send = async params => sent.push(params);
  await request(app.getHttpServer()).post(path).send(event()).expect(200);
  assert.equal(sent[0].message, greeting);
});

test('malformed messages are contained after acknowledgement', async () => {
  await request(app.getHttpServer()).post(path).send({ ...event(), object: {} }).expect(200);
  await nextTurn(); assert.equal(failures.length, 1);
});

test('messages without event_id work and use the message id for repeat protection', async () => {
  const message = event(); delete message.event_id; message.object.message.id = 17;
  for (let i = 0; i < 2; i++) await request(app.getHttpServer()).post(path).send(message).expect(200);
  assert.equal(sent.length, 2); assert.equal(sent[0].random_id, sent[1].random_id);
  delete message.object.message.id;
  await request(app.getHttpServer()).post(path).send(message).expect(200);
  assert.equal(sent.length, 3);
});

test('community token configures bot and notification transport with API 5.199', () => {
  process.env.VK_COMMUNITY_TOKEN = ' community-test-token ';
  process.env.VK_BOT_TOKEN = 'legacy-test-token';
  for (const transport of [new VkBotService({}, {}, {}, {}), new VkNotifications({})]) {
    assert.equal(transport.vk.api.options.token, 'community-test-token');
    assert.equal(transport.vk.api.options.apiVersion, '5.199');
  }
  delete process.env.VK_COMMUNITY_TOKEN;
  assert.equal(new VkBotService({}, {}, {}, {}).vk.api.options.token, 'legacy-test-token');
});
