const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { welcomeMenu } = require('../dist/vk-bot/vk-bot.keyboard');

const body = 'Вы подключены к боту конного клуба. Здесь будут приходить напоминания о тренировках и статус бронирований.';
function harness(get = async () => [{ id: 42, first_name: ' Анна ', last_name: 'Орлова' }]) {
  const sent = [], queries = [], warnings = [];
  // Greeting must work for new users without consulting CRM profiles.
  const bot = new VkBotService({}, {}, {}, {});
  bot.vk = { api: {
    users: { get: async params => { queries.push(params); return get(params); } },
    messages: { send: async params => sent.push(params) },
  } };
  bot.logger.warn = message => warnings.push(message);
  const send = (text, payload, sender = 42, peer = sender) => bot.handleMessage({ message: {
    from_id: sender, peer_id: peer, out: 0, text,
    ...(payload !== undefined ? { payload } : {}),
  } }, `welcome-${sent.length}`);
  return { bot, send, sent, queries, warnings };
}

for (const [text, payload] of [
  ['Начать'], ['  НАЧАТЬ  '], ['', JSON.stringify({ command: 'начать' })],
  ['Кнопка', JSON.stringify({ command: 'Начать' })], ['Начать', '{invalid'],
  ['Начать', JSON.stringify({ command: 'start' })],
]) test(`personalized welcome handles text and button payload: ${JSON.stringify([text, payload])}`, async () => {
  const h = harness();
  await h.send(text, payload);
  assert.deepEqual(h.queries, [{ user_ids: [42] }]);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].peer_id, 42);
  assert.equal(h.sent[0].message, `Здравствуйте, Анна! ${body}`);
  assert.deepEqual(JSON.parse(String(h.sent[0].keyboard)), JSON.parse(String(welcomeMenu())));
});

for (const profiles of [[], undefined, [{}], [{ first_name: '' }], [{ first_name: '  ' }], [{ first_name: null }]]) {
  test(`welcome falls back without a usable VK name: ${JSON.stringify(profiles)}`, async () => {
    const h = harness(async () => profiles);
    await h.send('Начать');
    assert.equal(h.sent[0].message, `Здравствуйте! ${body}`);
    assert.equal(String(h.sent[0].keyboard), String(welcomeMenu()));
  });
}

test('VK failure is logged and does not prevent the welcome reply', async () => {
  const h = harness(async () => { throw new Error('VK unavailable'); });
  await h.send('Начать');
  await h.send('Начать');
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[0].message, `Здравствуйте! ${body}`);
  assert.equal(String(h.sent[0].keyboard), String(welcomeMenu()));
  assert.equal(h.queries.length, 1);
  assert.equal(h.warnings.length, 1);
});

test('cache shares concurrent lookups, expires and isolates users', async () => {
  const h = harness(async ({ user_ids }) => [{ first_name: user_ids[0] === 42 ? 'Анна' : 'Иван' }]);
  await Promise.all([h.send('Начать'), h.send('Начать')]);
  assert.equal(h.queries.length, 1);
  await h.send('Начать', undefined, 43);
  assert.equal(h.sent[2].message, `Здравствуйте, Иван! ${body}`);
  h.bot.firstNames.get(42).expiresAt = 0;
  await h.send('Начать');
  assert.equal(h.queries.length, 3);
});

test('cache evicts older entries at its size limit', async () => {
  const h = harness();
  for (let sender = 1; sender <= 1001; sender++) await h.send('Начать', undefined, sender);
  assert.equal(h.bot.firstNames.size, 1000);
  assert.equal(h.bot.firstNames.has(1), false);
  assert.equal(h.bot.firstNames.has(1001), true);
});

test('group messages are ignored before fetching a VK profile', async () => {
  const h = harness();
  await h.send('Начать', undefined, 42, 2000000001);
  assert.equal(h.queries.length, 0);
  assert.equal(h.sent.length, 0);
});
