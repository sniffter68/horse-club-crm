const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');

function harness(role) {
  const sent = [], queries = [];
  const bot = new VkBotService({
    client: { findUnique: async () => { queries.push('client'); return role === 'client' ? { id: 'client', firstName: 'Анна' } : null; } },
    trainer: { findUnique: async () => { queries.push('trainer'); return role === 'trainer' ? { id: 'trainer', name: 'Иван' } : null; } },
    membership: { findMany: async () => [] }, booking: { findMany: async () => [] },
    lesson: { findMany: async () => [] },
  }, {}, {}, {});
  bot.vk = { api: {
    users: { get: async () => { queries.push('VK profile'); return [{ first_name: 'Анна' }]; } },
    messages: { send: async params => sent.push(params) },
  } };
  const send = (text, payload) => bot.handleMessage({ message: {
    from_id: 42, peer_id: 42, out: 0, text,
    ...(payload !== undefined ? { payload } : {}),
  } }, 'incoming');
  return { send, sent, queries };
}

for (const role of ['guest', 'client', 'trainer']) {
  test(`ordinary messages from ${role} produce no automatic replies or profile lookups`, async () => {
    const h = harness(role);
    for (const text of [
      'Добрый вечер! Все в силе?', 'Привет', 'Здравствуйте!', 'Спасибо!', 'Да',
      'Можно записаться завтра?', '1234', '', '   ', '🐎',
      'Расскажите о клубе', 'Нужна помощь',
      'привязаться', '/starter', 'help me',
    ]) await h.send(text);
    await h.send('Добрый вечер!', '{invalid');
    await h.send('Добрый вечер!', JSON.stringify({ command: 'unknown' }));
    await h.send('Добрый вечер!', JSON.stringify({ offset: 10 }));
    assert.deepEqual(h.sent, []);
    assert.deepEqual(h.queries, []);
  });
}

for (const [role, text, payload, expected] of [
  ['guest', 'Начать', undefined, /Здравствуйте, Анна!/],
  ['guest', '', { command: 'start' }, /Здравствуйте, Анна!/],
  ['guest', '', { command: 'about' }, /Конный клуб/],
  ['guest', '', { command: 'guide' }, /Шлем/],
  ['guest', '', { command: 'первичная заявка' }, /Ознакомьтесь с согласием/],
  ['guest', 'Первичная заявка', undefined, /Ознакомьтесь с согласием/],
  ['guest', 'Привязать профиль', undefined, /привязать/],
  ['guest', '/start 1234', undefined, /привязать ВАШ_ТЕЛЕФОН 1234/],
  ['client', '', { command: 'balance' }, /нет активных абонементов/],
  ['client', '', { command: 'bookings' }, /тренировок пока нет/],
  ['trainer', '', { command: 'today' }, /занятий нет/],
]) test(`explicit command still replies: ${JSON.stringify([role, text, payload])}`, async () => {
  const h = harness(role);
  await h.send(text, payload && JSON.stringify(payload));
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].peer_id, 42);
  assert.match(h.sent[0].message, expected);
});
