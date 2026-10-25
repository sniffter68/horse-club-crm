const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { mainMenu, welcomeMenu, normalizeVkCommand } = require('../dist/vk-bot/vk-bot.keyboard');
const { vkGroupToken, validateVkConfig } = require('../dist/vk-bot/vk-bot.config');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { Test } = require('@nestjs/testing');
const { VkBotController } = require('../dist/vk-bot/vk-bot.controller');
const request = require('supertest');

for (const [input, command] of [
  ['🎫 Мой абонемент', 'membership'], ['  МОЙ АБОНЕМЕНТ  ', 'membership'], ['💳 Мой баланс', 'membership'], ['balance', 'membership'],
  ['📅 Мои тренировки', 'bookings'], ['bookings', 'bookings'], ['💬 Администратор', 'help'], ['Связаться', 'help'],
  ['📋 Расписание на сегодня', 'today'], ['👥 Мои всадники', 'riders'], ['Список всадников', 'riders'],
  ['О клубе', 'about'], ['Услуги и цены', 'prices'], ['Как доехать', 'directions'], ['/start', 'начать'], ['  start  ', 'начать'],
]) test(`command parser: ${input}`, () => assert.equal(normalizeVkCommand(input), command));

test('client, trainer and guest keyboards have exact labels and executable payloads', () => {
  const expected = [
    [mainMenu(), ['🎫 Мой абонемент', '📅 Мои тренировки', '💬 Администратор'], ['membership', 'bookings', 'help']],
    [mainMenu(true), ['📋 Расписание на сегодня', '👥 Мои всадники'], ['today', 'riders']],
    [welcomeMenu(), ['О клубе', 'Услуги и цены', 'Как доехать', 'Связаться'], ['about', 'prices', 'directions', 'help']],
  ];
  for (const [keyboard, labels, commands] of expected) {
    const value = JSON.parse(String(keyboard));
    const actions = value.buttons.flat().map(button => button.action);
    assert.equal(value.one_time, false); assert.notEqual(value.inline, true);
    assert.deepEqual(actions.map(action => action.label), labels);
    assert.deepEqual(actions.map(action => JSON.parse(action.payload).command), commands);
  }
});

test('VK configuration supports new and legacy token names and rejects partial configuration', () => {
  assert.equal(vkGroupToken({ VK_GROUP_TOKEN: ' new ', VK_COMMUNITY_TOKEN: 'old', VK_BOT_TOKEN: 'legacy' }), 'new');
  assert.equal(vkGroupToken({ VK_COMMUNITY_TOKEN: 'old' }), 'old');
  assert.equal(vkGroupToken({ VK_BOT_TOKEN: 'legacy' }), 'legacy');
  assert.doesNotThrow(() => validateVkConfig({}));
  assert.doesNotThrow(() => validateVkConfig({ VK_GROUP_TOKEN: 'token', VK_CONFIRMATION_CODE: 'code', VK_SECRET_KEY: 'secret' }));
  for (const env of [{ VK_GROUP_TOKEN: 'token' }, { VK_GROUP_TOKEN: 'token', VK_CONFIRMATION_CODE: 'code' }, { VK_CONFIRMATION_CODE: 'code', VK_SECRET_KEY: 'secret' },
    { VK_GROUP_TOKEN: 'token', VK_CONFIRMATION_CODE: 'code', VK_SECRET_KEY: 'secret', VK_GROUP_ID: 'not-a-group' }]) assert.throws(() => validateVkConfig(env));
});

function harness(prisma, profile) {
  const sent = [], identities = [];
  const bot = new VkBotService(prisma, {}, {}, {}, { identify: async id => { identities.push(id); return profile; } });
  bot.vk = { api: { messages: { send: async value => sent.push(value) } } };
  return { sent, identities, send: (text, payload) => bot.handleMessage({ message: { from_id: 42, peer_id: 42, text, out: 0,
    ...(payload ? { payload: JSON.stringify(payload) } : {}),
  } }, `message-${sent.length}`) };
}
const client = { type: 'CLIENT', clientId: 'child', name: 'Анна' };
const trainer = { type: 'STAFF', role: 'TRAINER', staffId: 'account', trainerId: 'trainer', name: 'Иван' };

test('family membership reply queries active shared lesson packages and shows their common balance', async () => {
  let query;
  const h = harness({ membership: { findMany: async value => {
    query = value;
    return [{ id: 'family', clientId: 'parent', type: 'fixed_lessons', title: 'Семейный', remainingUnits: 6, validTo: new Date('2030-07-30T21:00:00Z'), pricingPlan: null }];
  } } }, client);
  await h.send('🎫 Мой абонемент');
  assert.deepEqual(h.identities, ['42']);
  assert.equal(query.where.status, 'active'); assert.equal(query.where.deletedAt, null);
  assert.deepEqual(query.where.remainingUnits, { gt: 0 });
  assert.equal(query.where.type, 'fixed_lessons');
  assert.deepEqual(query.where.OR, [{ clientId: 'child' }, { members: { some: { clientId: 'child', client: { deletedAt: null } } } }]);
  assert.match(h.sent[0].message, /Семейный.*осталось 6 занятий.*семейный абонемент.*31\.07\.2030/);
  assert.doesNotMatch(h.sent[0].message, /family|parent/);
});

test('client receives only upcoming scheduled bookings with readable trainer and horse names', async () => {
  let query;
  const h = harness({ booking: { findMany: async value => {
    query = value; return [{ id: 'booking', startTime: new Date('2030-08-01T08:00:00Z'), trainer: { name: 'Иван' }, horse: { name: 'Буран' }, arena: null, lesson: null }];
  } } }, client);
  await h.send('', { command: 'bookings' });
  assert.equal(query.where.clientId, 'child'); assert.equal(query.where.status, 'scheduled');
  assert.ok(query.where.startTime.gte instanceof Date);
  assert.match(h.sent[0].message, /11:00/); assert.match(h.sent[0].message, /Иван/); assert.match(h.sent[0].message, /Буран/);
});

test('trainer schedule and riders include standalone bookings within Moscow day bounds', async () => {
  const queries = [];
  const h = harness({ lesson: { findMany: async query => { queries.push(query); return []; } }, booking: { findMany: async query => {
    queries.push(query); return [{ id: 'standalone', client: { id: 'rider', name: 'Анна' }, horse: { name: 'Буран' }, attendanceStatus: 'PENDING', startTime: new Date() }];
  } } }, trainer);
  await h.send('📋 Расписание на сегодня');
  assert.ok(h.sent.some(row => /Анна/.test(row.message)));
  assert.ok(h.sent.every(row => !/callback/.test(String(row.keyboard))));
  h.sent.length = 0;
  await h.send('👥 Мои всадники');
  assert.ok(h.sent.some(row => /Анна/.test(row.message)));
  assert.ok(h.sent.every(row => !/callback/.test(String(row.keyboard))));
  for (const query of queries) {
    assert.equal(query.where.trainerId, 'trainer');
    assert.equal(query.where.startTime.gte.getUTCHours(), 21);
    assert.equal(query.where.startTime.lt - query.where.startTime.gte, 86_400_000);
  }
});

test('long VK replies split at safe boundaries and keep stable distinct random IDs per chunk', async () => {
  const { splitVkText } = require('../dist/vk-bot/vk-message-text');
  const text = '🐎'.repeat(4000);
  const chunks = splitVkText(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(chunk => chunk.length <= 3500 && !/^[\udc00-\udfff]/u.test(chunk)));
  const h = harness({}, client);
  // Exercise the actual sender with a long response and deterministic callback identity.
  const bot = new VkBotService({}, {}, {}, {}, {});
  bot.vk = { api: { messages: { send: async value => h.sent.push(value) } } };
  await bot.send(42, 'long-response', text, mainMenu());
  const first = h.sent.slice();
  await bot.send(42, 'long-response', text, mainMenu());
  assert.deepEqual(h.sent.slice(first.length).map(row => row.random_id), first.map(row => row.random_id));
  assert.equal(new Set(first.map(row => row.random_id)).size, chunks.length);
  assert.equal(first[0].keyboard, undefined); assert.ok(first.at(-1).keyboard);
});

test('guest prices use only public CRM services; directions and explanation remain available', async () => {
  const h = harness({ service: { findMany: async query => {
    assert.equal(query.where.isPublic, true); return [{ name: 'Занятие', title: 'Индивидуальная тренировка', price: 1500, durationMinutes: 45 }];
  } } }, { type: 'UNKNOWN' });
  await h.send('Услуги и цены'); assert.match(h.sent[0].message, /Индивидуальная тренировка/); assert.match(h.sent[0].message, /1.500 ₽.*45 мин/);
  await h.send('Как доехать'); assert.match(h.sent[1].message, /Адрес/);
  await h.send('Здравствуйте'); assert.match(h.sent[2].message, /попросите администратора привязать ваш VK к профилю в CRM/);
});

test('webhook confirmation, secret headers/body, missing configuration and group checks', async () => {
  const keys = ['VK_CONFIRMATION_CODE', 'VK_SECRET_KEY', 'VK_GROUP_ID'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { VK_CONFIRMATION_CODE: 'confirm-code', VK_SECRET_KEY: 'secret', VK_GROUP_ID: '123' });
  const calls = [];
  const module = await Test.createTestingModule({ controllers: [VkBotController], providers: [{ provide: VkBotService, useValue: { handleMessage: async (...args) => calls.push(args) } }] }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
  const event = { type: 'confirmation', group_id: 123, secret: 'secret' };
  const post = body => request(app.getHttpServer()).post('/api/vk/webhook').send(body);
  try {
    const response = await post(event).expect(200); assert.equal(response.text, 'confirm-code'); assert.match(response.headers['content-type'], /text\/plain/);
    await post({ ...event, secret: 'bad' }).expect(403);
    await post({ ...event, group_id: 124 }).expect(403);
    await post({ ...event, secret: undefined }).set('x-vk-secret', 'secret').expect(200);
    await post({ ...event, secret: undefined }).set('secret', 'secret').expect(200);
    await post({ ...event, type: 'message_new', object: { message: { from_id: 42 } }, event_id: 'new' }).expect(200);
    assert.equal(calls.length, 1);
    delete process.env.VK_CONFIRMATION_CODE; await post(event).expect(503);
    delete process.env.VK_SECRET_KEY; await post(event).expect(503);
  } finally { await app.close(); for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } }
});
