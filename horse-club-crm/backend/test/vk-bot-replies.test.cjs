const assert = require('node:assert/strict');
const { test, beforeEach, after } = require('node:test');
require('reflect-metadata');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');

const originalZone = process.env.CLUB_TIME_ZONE;
beforeEach(() => { process.env.CLUB_TIME_ZONE = 'Europe/Moscow'; });
after(() => {
  if (originalZone === undefined) delete process.env.CLUB_TIME_ZONE;
  else process.env.CLUB_TIME_ZONE = originalZone;
});
function harness(rows, resource) {
  const sent = [], queries = [];
  const service = new VkBotService({
    client: { findUnique: async () => ({ id: 'owner' }) }, trainer: { findUnique: async () => null },
    [resource]: { findMany: async query => { queries.push(query); return rows.slice(query.skip, query.skip + query.take); } },
  }, {}, {}, {});
  service.vk = { api: { messages: { send: async params => sent.push(params) } } };
  const send = async (text, payload) => service.handleMessage({ message: { from_id: 42, peer_id: 42, out: 0, text,
    ...(payload ? { payload: JSON.stringify(payload) } : {}),
  } }, `reply-${sent.length}`);
  return { send, sent, queries };
}
const membership = (patch = {}) => ({ id: 'b045eb7b-0b4e-4111-8111-111111111111', title: '', pricingPlan: null,
  remainedLessons: 7, validUntil: new Date('2026-10-13T22:00:00Z'), ...patch });
const booking = (patch = {}) => ({ id: 'booking-id', horse: { name: 'Гранит' }, lesson: {
  startTime: new Date('2026-10-17T08:00:00Z'), trainer: { name: 'Анна Сергеевна' }, arena: { name: 'Крытый манеж' },
}, ...patch });

test('balance shows plan names, custom titles and a clean fallback without UUIDs or expiry times', async () => {
  const { send, sent, queries } = harness([
    membership({ pricingPlan: { name: 'Индивидуальный (8 занятий)' } }),
    membership({ title: ' Разовый ', pricingPlan: { name: 'Название тарифа' }, remainedLessons: 5 }),
    membership({ title: ' ', pricingPlan: { name: ' ' }, remainedLessons: 1 }),
  ], 'membership');
  await send('Мой баланс');
  assert.equal(sent[0].message, '💳 Ваши абонементы:\n'
    + '• «Индивидуальный (8 занятий)»: осталось 7 занятий (до 14.10.2026)\n'
    + '• «Разовый»: осталось 5 занятий (до 14.10.2026)\n'
    + '• «Абонемент»: осталось 1 занятие (до 14.10.2026)');
  assert.doesNotMatch(sent[0].message, /b045eb7b|\d{2}:\d{2}/);
  assert.deepEqual(queries[0].include, { pricingPlan: { select: { name: true } } });
  assert.equal(queries[0].where.clientId, 'owner');
  assert.deepEqual(queries[0].where.remainedLessons, { gt: 0 });
  assert.ok(queries[0].where.validUntil.gte instanceof Date);
});

test('balance uses Russian lesson plurals and supports keyboard payloads', async () => {
  const { send, sent } = harness([1, 2, 4, 5, 11, 21, 22, 25].map(remainedLessons => membership({ remainedLessons })), 'membership');
  await send('', { command: 'balance' });
  const lines = sent[0].message.split('\n').slice(1);
  for (const [index, phrase] of ['1 занятие', '2 занятия', '4 занятия', '5 занятий', '11 занятий', '21 занятие', '22 занятия', '25 занятий'].entries()) {
    assert.ok(lines[index].includes(`осталось ${phrase} (`), lines[index]);
  }
});

test('no active memberships has a clear empty response and the main menu', async () => {
  const { send, sent } = harness([], 'membership');
  await send('Мой баланс');
  assert.equal(sent[0].message, 'У вас пока нет активных абонементов.');
  assert.match(String(sent[0].keyboard), /Мои тренировки/);
});

test('training card includes localized date, weekday, horse, trainer and arena', async () => {
  const { send, sent, queries } = harness([booking()], 'booking');
  await send('Мои тренировки');
  assert.equal(sent[0].message, '📅 Предстоящие тренировки:\n• 17 октября (сб) в 11:00\n  Лошадь: Гранит\n  Тренер: Анна Сергеевна\n  Манеж: Крытый манеж');
  assert.equal(queries[0].where.clientId, 'owner');
  assert.equal(queries[0].where.lesson.status, 'SCHEDULED');
  assert.ok(queries[0].where.lesson.startTime.gte instanceof Date);
  assert.deepEqual(queries[0].include, { horse: true, lesson: { include: { trainer: true, arena: true } } });
  assert.deepEqual(queries[0].orderBy, [{ lesson: { startTime: 'asc' } }, { id: 'asc' }]);
});

test('training cards handle an unassigned horse and missing arena', async () => {
  const row = booking({ horse: null }); row.lesson.arena = null;
  const { send, sent } = harness([row], 'booking');
  await send('', { command: 'bookings' });
  assert.match(sent[0].message, /Лошадь: пока не назначена/);
  assert.match(sent[0].message, /Тренер: Анна Сергеевна/);
  assert.doesNotMatch(sent[0].message, /Манеж:|null|undefined|booking-id/);
});

test('empty upcoming trainings has a clear response and the main menu', async () => {
  const { send, sent } = harness([], 'booking');
  await send('Мои тренировки');
  assert.equal(sent[0].message, 'Предстоящих тренировок пока нет.');
  assert.match(String(sent[0].keyboard), /Мой баланс/);
});

test('club timezone changes both the training calendar date and the expiry date', async () => {
  process.env.CLUB_TIME_ZONE = 'Asia/Vladivostok';
  const row = booking(); row.lesson.startTime = new Date('2026-10-17T20:30:00Z');
  const trainings = harness([row], 'booking');
  await trainings.send('Мои тренировки');
  assert.match(trainings.sent[0].message, /18 октября \(вс\) в 06:30/);
  const balance = harness([membership({ validUntil: new Date('2026-10-13T16:00:00Z') })], 'membership');
  await balance.send('Мой баланс');
  assert.match(balance.sent[0].message, /до 14\.10\.2026/);
});

for (const [resource, command, title] of [['membership', 'balance', 'Пакет'], ['booking', 'bookings', 'Лошадь']]) {
  test(`${command} keeps ten-item pagination and next-page keyboard`, async () => {
    const rows = Array.from({ length: 11 }, (_, i) => resource === 'membership'
      ? membership({ title: `${title} ${i + 1}` }) : booking({ horse: { name: `${title} ${i + 1}` } }));
    const { send, sent, queries } = harness(rows, resource);
    await send('', { command });
    assert.equal(sent[0].message.split('\n').filter(line => line.startsWith('•')).length, 10);
    assert.match(String(sent[0].keyboard), /Далее/);
    assert.doesNotMatch(sent[0].message, new RegExp(`${title} 11`));
    await send('Далее', { command, offset: 10 });
    assert.match(sent[1].message, new RegExp(`${title} 11`));
    assert.equal(queries[1].skip, 10); assert.equal(queries[1].take, 11);
    assert.doesNotMatch(String(sent[1].keyboard), /Далее/);
  });
}
