const assert = require('node:assert/strict');
const { beforeEach, after, test } = require('node:test');
require('reflect-metadata');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');
const confirmation = '💬 Мы передали ваш запрос администратору клуба!\nСпециалист свяжется с вами в этом диалоге в ближайшее время. 🐎';
const { mainMenu, welcomeMenu } = require('../dist/vk-bot/vk-bot.keyboard');
const { clubCard, riderGuide } = require('../dist/vk-bot/vk-bot.config');

const envKeys = ['VK_ADMIN_PEER_ID', 'VK_CLUB_NAME', 'VK_CLUB_ADDRESS', 'VK_CLUB_HOURS', 'VK_CLUB_PHONE', 'VK_CLUB_MAP_URL', 'VK_RIDER_GUIDE'];
const original = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
beforeEach(() => { for (const key of envKeys) delete process.env[key]; });
after(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const keyboard = value => JSON.parse(String(value));
function harness({ client = null, trainer = null, admins = [], fail = false, profileFail = false } = {}) {
  const sent = [], logs = [], queries = [], queued = new Map();
  let transactions = 0;
  const tx = {
    user: { findMany: async query => { queries.push(query); return admins; } },
    vkNotification: { upsert: async ({ where, create }) => {
      if (fail) throw new Error('DB unavailable');
      if (!queued.has(where.key)) queued.set(where.key, create);
    } },
  };
  const bot = new VkBotService({
    client: { findUnique: async () => { if (profileFail) throw new Error('DB unavailable'); return client; } }, trainer: { findUnique: async () => trainer },
    membership: { findMany: async () => [] }, booking: { findMany: async () => [] },
    $transaction: async fn => { transactions++; return fn(tx); },
  }, {}, {}, {});
  bot.vk = { api: { messages: { send: async params => sent.push(params) } } };
  for (const level of ['log', 'warn', 'error']) bot.logger[level] = value => logs.push({ level, value });
  const send = async (text, payload, eventId = `menu-${sent.length}`) => bot.handleMessage({ message: {
    from_id: 42, peer_id: 42, text, out: 0, ...(payload ? { payload: JSON.stringify(payload) } : {}),
  } }, eventId);
  return { send, sent, logs, queries, queued, transactions: () => transactions };
}

test('main reply keyboard has the requested three rows and stable payloads', () => {
  const result = keyboard(mainMenu());
  assert.equal(result.one_time, false); assert.notEqual(result.inline, true);
  assert.deepEqual(result.buttons.map(row => row.map(button => button.action.label)), [
    ['📅 Мои тренировки', '💳 Мой баланс'], ['ℹ️ О клубе', '📖 Памятка всадника'], ['💬 Связаться с администратором'],
  ]);
  assert.deepEqual(result.buttons.flat().map(button => JSON.parse(button.action.payload).command), ['bookings', 'balance', 'about', 'guide', 'help']);
  const guest = keyboard(welcomeMenu());
  assert.deepEqual(guest.buttons.slice(0, 3), result.buttons);
  assert.deepEqual(guest.buttons[3].map(button => button.action.label), ['Привязать профиль', 'Первичная заявка']);
  assert.equal(keyboard(mainMenu(true)).buttons[0][0].action.label, 'Расписание на сегодня');
});

for (const text of ['ℹ️ О клубе', 'О клубе', '  КОНТАКТЫ  ']) test(`club card accepts ${text} for unlinked guests`, async () => {
  const { send, sent } = harness();
  await send(text);
  assert.equal(sent[0].message, clubCard());
  assert.match(sent[0].message, /Союз любителей конного спорта/);
  assert.match(sent[0].message, /ежедневно с 09:00 до 21:00/);
  assert.match(String(sent[0].keyboard), /Привязать профиль/);
});

for (const text of ['📖 Памятка всадника', 'Памятка всадника', 'памятка']) test(`guide accepts ${text} for unlinked guests`, async () => {
  const { send, sent } = harness();
  await send(text);
  assert.equal(sent[0].message, riderGuide());
  assert.match(sent[0].message, /1–2 см/); assert.match(sent[0].message, /Шлем предоставляется клубом/);
  assert.match(sent[0].message, /10–15 минут/); assert.match(sent[0].message, /с разрешения тренера/);
});

test('club details and guide can be changed through environment without editing command handlers', async () => {
  Object.assign(process.env, { VK_CLUB_NAME: 'Другой клуб', VK_CLUB_ADDRESS: 'Город, улица, дом',
    VK_CLUB_HOURS: 'вт–вс 10:00–20:00', VK_CLUB_PHONE: '+7 (999) 123-45-67',
    VK_CLUB_MAP_URL: 'https://maps.example/club', VK_RIDER_GUIDE: 'Новая памятка\\nПриезжайте заранее' });
  const { send, sent } = harness({ trainer: { name: 'Тренер' } });
  await send('', { command: 'about' }); await send('', { command: 'guide' });
  assert.equal(sent[0].message, '🐴 Конный клуб «Другой клуб»\n📍 Адрес: Город, улица, дом\n⏰ Режим работы: вт–вс 10:00–20:00\n📞 Телефон / WhatsApp: +7 (999) 123-45-67\n🗺️ Карта: https://maps.example/club');
  assert.equal(sent[1].message, 'Новая памятка\nПриезжайте заранее');
  assert.match(String(sent[0].keyboard), /Расписание на сегодня/);
});

for (const text of ['💬 Связаться с администратором', 'Связаться с администратором', 'администратор', 'позвать администратора', 'помощь']) {
  test(`administrator request accepts ${text}, records it and sends confirmation`, async () => {
    process.env.VK_ADMIN_PEER_ID = '77';
    const h = harness({ admins: [{ vkUserId: 42n }, { vkUserId: 78n }] });
    await h.send(text);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].peer_id, 42);
    assert.equal(h.sent[0].message, confirmation);
    assert.doesNotMatch(h.sent[0].message, /vk.com|Откройте диалог/);
    assert.equal(h.transactions(), 1); assert.equal(h.queued.size, 1);
    assert.equal(h.queries.length, 0);
    assert.equal([...h.queued.values()][0].peerId, 77n);
    assert.match([...h.queued.values()][0].message, /https:\/\/vk.com\/id42/);
    assert.match([...h.queued.values()][0].message, /Время: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/);
    assert.ok(h.logs.some(({ value }) => value.event === 'vk_help_requested' && value.vkUserId === 42));
    const adminSent = [];
    const row = [...h.queued.values()][0];
    const delivery = new VkNotifications({ vkNotification: {
      findMany: async () => [{ ...row, id: 'notification-id' }], update: async () => {},
    } });
    delivery.vk = { api: { messages: { send: async params => adminSent.push(params) } } };
    await delivery.flush();
    assert.equal(adminSent.length, 1);
    assert.equal(adminSent[0].peer_id, 77);
    assert.equal(adminSent[0].message, row.message);
  });
}

test('help payload uses only the configured recipient and deduplicates repeated callback delivery', async () => {
  process.env.VK_ADMIN_PEER_ID = '77';
  const h = harness({ client: { name: 'Анна Орлова' }, admins: [{ vkUserId: 77n }, { vkUserId: 78n }, { vkUserId: 77n }] });
  await h.send('', { command: 'help' }, 'same-event');
  await h.send('', { command: 'help' }, 'same-event');
  assert.equal(h.queued.size, 1);
  assert.match([...h.queued.values()][0].message, /Анна Орлова/);
  await h.send('', { command: 'help' }, 'another-event');
  assert.equal(h.queued.size, 2);
});

test('help can use the configured fallback recipient without an ADMIN VK account', async () => {
  process.env.VK_ADMIN_PEER_ID = '2000000001';
  const h = harness(); await h.send('администратор');
  assert.equal([...h.queued.values()][0].peerId, 2000000001n);
  assert.match(h.sent[0].message, /Мы передали/);
});

for (const recipient of [undefined, '42', 'invalid', '-1']) {
  test(`help confirms without service card for admin peer ${recipient}`, async () => {
    if (recipient !== undefined) process.env.VK_ADMIN_PEER_ID = recipient;
    const h = harness({ admins: [{ vkUserId: 42n }, { vkUserId: 77n }] });
    await h.send('помощь');
    assert.equal(h.queued.size, 0); assert.equal(h.transactions(), 0);
    assert.equal(h.sent.length, 1); assert.equal(h.sent[0].peer_id, 42);
    assert.equal(h.sent[0].message, confirmation);
    assert.ok(h.logs.some(({ value }) => value.event === 'vk_help_requested'));
    assert.ok(h.logs.some(({ value }) => value.event === 'vk_help_not_queued'));
  });
}

for (const options of [{ fail: true }, { fail: true, profileFail: true }]) {
  test(`help confirms even with database failure (${JSON.stringify(options)})`, async () => {
    process.env.VK_ADMIN_PEER_ID = '77';
    const h = harness(options); await h.send('помощь');
    assert.equal(h.queued.size, 0); assert.equal(h.sent[0].message, confirmation);
    assert.ok(h.logs.some(({ value }) => value.event === 'vk_help_not_queued'));
  });
}

for (const text of ['📅 Мои тренировки', '💳 Мой баланс']) test(`existing client commands accept emoji button labels: ${text}`, async () => {
  const h = harness({ client: { name: 'Анна' } }); await h.send(text);
  assert.match(h.sent[0].message, /пока нет/);
  assert.deepEqual(keyboard(h.sent[0].keyboard), keyboard(mainMenu()));
});

test('greeting includes the expanded guest keyboard', async () => {
  const h = harness(); await h.send('Начать');
  assert.deepEqual(keyboard(h.sent[0].keyboard), keyboard(welcomeMenu()));
});
