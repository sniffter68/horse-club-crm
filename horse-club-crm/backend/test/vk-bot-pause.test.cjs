const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { VkBotController } = require('../dist/vk-bot/vk-bot.controller');
const { mainMenu, welcomeMenu } = require('../dist/vk-bot/vk-bot.keyboard');

function harness(profile = { type: 'UNKNOWN' }) {
  const states = new Map(), sent = [], queued = [], identified = [];
  const prisma = {
    vkConversationState: {
      findUnique: async ({ where }) => states.get(where.peerId),
      upsert: async ({ where, create, update }) => {
        const row = states.has(where.peerId) ? { ...states.get(where.peerId), ...update } : create;
        states.set(where.peerId, row); return row;
      },
      updateMany: async ({ where, data }) => {
        const row = states.get(where.peerId);
        if (!row || (where.botPausedUntil && row.botPausedUntil > where.botPausedUntil.lte)) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
    },
    $transaction: async fn => fn({ vkNotification: { upsert: async args => queued.push(args) } }),
  };
  const bot = new VkBotService(prisma, {}, {}, {}, { identify: async id => { identified.push(id); return profile; } });
  bot.vk = { api: { messages: { send: async params => sent.push(params) } } };
  const send = (text, payload, peer = 42) => bot.handleMessage({ message: {
    from_id: peer, peer_id: peer, out: 0, text, ...(payload === undefined ? {} : { payload }),
  } }, 'incoming');
  const pause = (until = new Date(Date.now() + 3600000)) => states.set(42n, { peerId: 42n, isBotPaused: true, botPausedUntil: until });
  return { bot, states, sent, queued, identified, send, pause };
}

test('message_reply from a community manager persists a two-hour pause and callback acknowledges it', async () => {
  const h = harness();
  const oldSecret = process.env.VK_SECRET_KEY, oldGroup = process.env.VK_GROUP_ID;
  process.env.VK_SECRET_KEY = 'pause-test'; process.env.VK_GROUP_ID = '123';
  try {
    const controller = new VkBotController(h.bot);
    const now = Date.now();
    assert.equal(controller.callback({ secret: 'pause-test', group_id: 123, type: 'message_reply',
      object: { from_id: -123, peer_id: 42, out: 1, random_id: 0 } }), 'ok');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.states.get(42n).isBotPaused, true);
    assert.ok(h.states.get(42n).botPausedUntil.getTime() >= now + 7200000);
    assert.ok(h.states.get(42n).botPausedUntil.getTime() <= Date.now() + 7200000);
    assert.equal(h.sent.length, 0);
  } finally {
    for (const [key, value] of [['VK_SECRET_KEY', oldSecret], ['VK_GROUP_ID', oldGroup]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('API echoes, incoming messages and group chats do not pause the bot', async () => {
  const h = harness();
  for (const message of [
    { from_id: -123, peer_id: 42, out: 1, random_id: 12345 },
    { from_id: 42, peer_id: 42, out: 0 },
    { from_id: -123, peer_id: 2000000001, out: 1 },
    { from_id: -123, peer_id: '42', out: 1 },
  ]) await h.bot.handleReply(message);
  assert.equal(h.states.size, 0);
});

test('active pause ignores free text, attachments and old menu buttons before identity lookup', async () => {
  const h = harness(); h.pause();
  await h.send('Добрый вечер!'); await h.send('');
  await h.send('Мои тренировки', JSON.stringify({ command: 'bookings' }));
  await h.send('Позвать администратора');
  assert.equal(h.sent.length, 0); assert.equal(h.identified.length, 0);
  await h.send('Меню', undefined, 43);
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0].peer_id, 43);
});

for (const [text, payload] of [
  ['Меню'], [' /start '], ['', JSON.stringify({ command: 'RESET_BOT_PAUSE' })],
  ['', 'RESET_BOT_PAUSE'], ['', JSON.stringify({ action: 'RESET_BOT_PAUSE' })],
]) for (const profile of [{ type: 'UNKNOWN' }, { type: 'CLIENT', clientId: 'client', name: 'Анна' }]) {
  test(`reset ${JSON.stringify([text, payload])} restores ${profile.type} menu and subsequent replies`, async () => {
    const h = harness(profile); h.pause(); await h.send(text, payload);
    assert.equal(h.states.get(42n).isBotPaused, false);
    assert.equal(h.states.get(42n).botPausedUntil, null);
    assert.equal(String(h.sent[0].keyboard), String(profile.type === 'UNKNOWN' ? welcomeMenu() : mainMenu()));
    await h.send('Спасибо'); assert.equal(h.sent.length, 1);
    await h.send('О клубе'); assert.equal(h.sent.length, 2);
  });
}

test('expired pause resumes replies and clears the persisted flag', async () => {
  const h = harness(); h.pause(new Date(Date.now() - 1));
  await h.send('Здравствуйте'); assert.equal(h.sent.length, 0);
  await h.send('О клубе');
  assert.equal(h.sent.length, 1); assert.equal(h.states.get(42n).isBotPaused, false);
  assert.equal(h.states.get(42n).botPausedUntil, null);
});

for (const payload of [undefined, JSON.stringify({ command: 'help' })]) test(`administrator button pauses for four hours, queues a notification and offers inline reset: ${payload}`, async () => {
  const oldPeer = process.env.VK_ADMIN_PEER_ID; process.env.VK_ADMIN_PEER_ID = '77';
  try {
    const h = harness(); const now = Date.now(); await h.send(payload ? 'Кнопка' : 'Позвать администратора', payload);
    assert.equal(h.states.get(42n).isBotPaused, true);
    assert.ok(h.states.get(42n).botPausedUntil.getTime() >= now + 14400000);
    assert.equal(h.queued.length, 1); assert.equal(h.queued[0].create.peerId, 77n);
    assert.equal(h.sent[0].message, 'Переключаю на администратора, скоро вам ответят!');
    const keyboard = JSON.parse(String(h.sent[0].keyboard));
    assert.equal(keyboard.inline, true);
    assert.equal(keyboard.buttons[0][0].action.label, 'Вернуться в меню бота');
    await h.send('Тест');
    await h.send('Кнопка', JSON.stringify({ command: 'about' }));
    assert.equal(h.sent.length, 1);
    await h.send('Кнопка', keyboard.buttons[0][0].action.payload);
    assert.equal(h.states.get(42n).isBotPaused, false);
  } finally {
    if (oldPeer === undefined) delete process.env.VK_ADMIN_PEER_ID; else process.env.VK_ADMIN_PEER_ID = oldPeer;
  }
});
