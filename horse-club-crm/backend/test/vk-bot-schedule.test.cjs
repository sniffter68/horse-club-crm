const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { TrainerScheduleBotService, SCHEDULE_ACCESS_DENIED } = require('../dist/common/bot-schedule/trainer-schedule-bot.service');

function harness() {
  const sent = [], queries = [], calls = [];
  let paused = false, role = 'TRAINER', active = true, many = false;
  const user = () => role ? { id: 'user', role, trainerId: role === 'TRAINER' ? 'own' : null, trainer: { isActive: active } } : null;
  const row = { id: 'lesson', trainerId: 'own', trainer: { name: 'Тренер', fullName: '' },
    startTime: new Date('2026-12-31T07:00:00Z'), endTime: new Date('2026-12-31T08:00:00Z'), status: 'SCHEDULED',
    service: { title: 'Конкур' }, arena: null, bookings: [{ client: { name: 'Анна' }, horse: { name: 'Буран' }, arena: null, status: 'scheduled', clientConfirmed: true }] };
  const prisma = {
    vkConversationState: { findUnique: async () => paused ? { botPausedUntil: new Date(Date.now() + 4 * 3600000), isBotPaused: true } : null,
      updateMany: async () => { paused = false; return { count: 1 }; } },
    user: { findFirst: async () => user() }, trainer: { findUnique: async () => null },
    lesson: { findMany: async query => { queries.push(query); return many ? Array.from({ length: 80 }, (_, i) => ({ ...row, id: String(i) })) : [row]; } },
    booking: { findMany: async query => { queries.push(query); return []; } },
  };
  const schedule = new TrainerScheduleBotService(prisma, { forRole: async () => [{ module: 'SCHEDULE', isEnabled: true, accessLevel: 'READ_ONLY' }] });
  const getSchedule = schedule.getSchedule.bind(schedule);
  schedule.getSchedule = async (...args) => { calls.push(args); return getSchedule(...args); };
  const bot = new VkBotService(prisma, {}, {}, {}, { identify: async () => role === 'TRAINER'
    ? { type: 'TRAINER', id: 'own', name: 'Тренер' } : role ? { type: 'STAFF', name: 'Сотрудник', role } : { type: 'UNKNOWN' } }, undefined, schedule);
  bot.vk = { api: { messages: { send: async params => { sent.push(params); return 1; } } } };
  const send = (text = '', command, peer = 42) => bot.handleMessage({ message: { from_id: 42, peer_id: peer, out: 0, text,
    ...(command ? { payload: JSON.stringify({ command }) } : {}) } }, `event-${sent.length}`);
  const buttons = () => JSON.parse(String(sent.at(-1).keyboard)).buttons.flat().map(button => ({ label: button.action.label, command: JSON.parse(button.action.payload).command }));
  return { send, sent, queries, calls, buttons, pause: () => { paused = true; }, role: value => { role = value; }, inactive: () => { active = false; }, many: () => { many = true; } };
}

test('VK menus expose both modes to trainers and staff; date, mode and refresh callbacks preserve context', async () => {
  const h = harness();
  for (const role of ['TRAINER', 'MANAGER', 'ADMIN']) {
    h.role(role); await h.send('Меню');
    assert.ok(h.buttons().some(button => button.label === '📅 Моё расписание'));
    assert.ok(h.buttons().some(button => button.label === '🗓 Общее расписание'));
  }
  h.role('TRAINER');
  await h.send('', 'schedule:personal:2026-12-31');
  assert.match(h.sent.at(-1).message, /Итого занятий: 1 шт\./);
  assert.ok(h.queries.every(query => query.where.trainerId === 'own'));
  assert.equal(JSON.parse(String(h.sent.at(-1).keyboard)).inline, true);
  await h.send('', h.buttons().find(button => button.label === '🗓 Общее расписание').command);
  assert.deepEqual(h.calls.at(-1), ['vk', '42', 'club', '2026-12-31']);
  assert.match(h.sent.at(-1).message, /Всего по клубу: 1 шт\./);
  assert.equal(h.queries.at(-1).where.trainerId, undefined);
  await h.send('', h.buttons().find(button => button.label === 'След. день ▶').command);
  assert.deepEqual(h.calls.at(-1), ['vk', '42', 'club', '2027-01-01']);
  await h.send('', h.buttons().find(button => button.label === 'Обновить').command);
  assert.deepEqual(h.calls.at(-1), ['vk', '42', 'club', '2027-01-01']);
  for (const [label, date] of [['Сегодня', 'today'], ['Завтра', 'tomorrow']]) {
    await h.send('', h.buttons().find(button => button.label === label).command);
    assert.deepEqual(h.calls.at(-1), ['vk', '42', 'club', date]);
  }
  await h.send('Расписание');
  assert.deepEqual(h.calls.at(-1), ['vk', '42', 'personal', 'today']);
});

test('VK stays silent on arbitrary text, group chats and schedule buttons during four-hour pause', async () => {
  const h = harness();
  await h.send('Добрый вечер!'); await h.send('Можно завтра?');
  await h.send('Расписание', undefined, 2000000001);
  await h.send('', 'schedule:club:today', 2000000001);
  assert.equal(h.sent.length, 0); assert.equal(h.calls.length, 0);
  h.pause();
  await h.send('', 'schedule:club:today'); await h.send('Расписание');
  assert.equal(h.sent.length, 0); assert.equal(h.calls.length, 0);
  await h.send('Меню');
  await h.send('', 'schedule:club:today');
  assert.equal(h.calls.length, 1);
});

test('VK rejects unlinked and inactive users and invalid dates without querying lessons', async () => {
  const h = harness(); h.role(null);
  await h.send('', 'schedule:club:today');
  assert.equal(h.sent.at(-1).message, SCHEDULE_ACCESS_DENIED);
  h.role('TRAINER'); h.inactive();
  await h.send('', 'schedule:personal:today');
  assert.equal(h.sent.at(-1).message, SCHEDULE_ACCESS_DENIED);
  assert.equal(h.queries.length, 0);
  const valid = harness();
  await valid.send('', 'schedule:club:2026-02-30');
  assert.match(valid.sent.at(-1).message, /Некорректная дата/);
  assert.equal(valid.queries.length, 0);
});

test('VK long schedules put controls on the final part and use distinct message deduplication keys', async () => {
  const h = harness(); h.many();
  await h.send('', 'schedule:club:2026-12-31');
  assert.ok(h.sent.length > 1);
  assert.ok(h.sent.every(part => part.message.length <= 4096));
  assert.ok(h.sent.slice(0, -1).every(part => part.keyboard === undefined));
  assert.ok(h.sent.at(-1).keyboard);
  assert.ok(h.sent.at(-1).message.endsWith('Всего по клубу: 80 шт.'));
  assert.equal(new Set(h.sent.map(part => part.random_id)).size, h.sent.length);
});
