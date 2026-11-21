const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { DateTime } = require('luxon');
const { TrainerScheduleBotService, splitScheduleText, SCHEDULE_ACCESS_DENIED, scheduleDay, scheduleNavigation } = require('../dist/common/bot-schedule/trainer-schedule-bot.service');
const client = { name: 'Всадник', firstName: '', lastName: '' };
function fixture() {
  const queries = [], identities = [];
  const lessons = [{ id: 'lesson', startTime: new Date('2026-11-10T09:00:00Z'), endTime: new Date('2026-11-10T10:00:00Z'),
    trainerId: 'own', trainer: { name: 'Анна', fullName: 'Анна Тренер' }, arena: { name: 'Крытый' }, service: { title: 'Конкур', name: 'jumping' }, status: 'SCHEDULED',
    bookings: [{ client, horse: { name: 'Буран' }, arena: null, status: 'scheduled', clientConfirmed: true },
      { client: { ...client, name: 'Второй' }, horse: null, arena: null, status: 'scheduled', clientConfirmed: false }] }];
  const standalone = [{ id: 'booking', startTime: new Date('2026-11-09T21:00:00Z'), endTime: new Date('2026-11-09T22:00:00Z'),
    trainerId: 'other', trainer: { name: 'Коллега', fullName: '' }, client, horse: null, arena: null, membership: null, serviceType: 'walks', status: 'completed' }];
  const user = { id: 'user', role: 'TRAINER', trainerId: 'own', trainer: { isActive: true }, staffProfile: null };
  const permission = { module: 'SCHEDULE', isEnabled: true, accessLevel: 'READ_ONLY' };
  let directTrainer = null;
  const queryRows = rows => async query => {
    queries.push(query);
    return rows.filter(row => (!query.where.trainerId || row.trainerId === query.where.trainerId)
      && row.startTime >= query.where.startTime.gte && row.startTime < query.where.startTime.lt
      && (query.where.status.not ? row.status !== query.where.status.not : !query.where.status.notIn.includes(row.status)));
  };
  const findUser = async query => { identities.push(query); return user.role ? user : null; };
  const prisma = {
    lesson: { findMany: queryRows(lessons) }, booking: { findMany: queryRows(standalone) },
    user: { findUnique: findUser, findFirst: findUser }, trainer: { findUnique: async () => directTrainer },
  };
  const service = new TrainerScheduleBotService(prisma, { forRole: async () => [permission] });
  const text = async (mode = 'club', date = '2026-11-10', channel = 'telegram') => (await service.getSchedule(channel, '42', mode, date)).chunks.join('');
  return { service, text, queries, identities, lessons, standalone, user, permission, direct: value => { directTrainer = value; } };
}

test('club includes multiple trainers, groups and legacy bookings in Moscow chronological order', async () => {
  const f = fixture();
  const text = await f.text();
  for (const query of f.queries) {
    assert.equal(query.where.startTime.gte.toISOString(), '2026-11-09T21:00:00.000Z');
    assert.equal(query.where.startTime.lt.toISOString(), '2026-11-10T21:00:00.000Z');
    assert.equal(query.where.trainerId, undefined);
    assert.equal(query.take, undefined);
    assert.deepEqual(query.orderBy, [{ startTime: 'asc' }, { trainerId: 'asc' }, { id: 'asc' }]);
  }
  assert.equal(f.queries[0].where.status.not, 'CANCELLED');
  assert.equal(f.queries[0].where.deletedAt, null);
  assert.deepEqual(f.queries[0].include.bookings.where.status.notIn, ['cancelled_client', 'cancelled_club', 'penalty_cancellation']);
  assert.equal(f.queries[1].where.lessonId, null);
  assert.match(text, /10\.11\.2026/);
  assert.match(text, /00:00–01:00 · Прогулка/);
  assert.match(text, /12:00–13:00 · Конкур/);
  for (const line of ['Тренер: Анна Тренер', 'Манеж: Крытый', 'Всадник: Всадник', 'Лошадь: Буран', 'Лошадь: пока не назначена', 'Статус: Подтверждено', 'Статус: Ожидает', 'Статус: Проведено']) assert.ok(text.includes(line), line);
  assert.ok(text.indexOf('Коллега') < text.indexOf('Анна Тренер'));
  assert.ok(text.endsWith('Всего по клубу: 2 шт.'));
});

test('personal strictly filters both sources by the authenticated trainerId', async () => {
  const f = fixture();
  const text = await f.text('personal');
  assert.ok(f.queries.every(query => query.where.trainerId === 'own'));
  assert.doesNotMatch(text, /Коллега|Прогулка/);
  assert.ok(text.endsWith('Итого занятий: 1 шт.'));
});

test('cancelled lessons and standalone bookings excluded; empty dates and missing trainer are clear', async () => {
  const f = fixture(); f.lessons[0].status = 'CANCELLED'; f.standalone[0].status = 'cancelled_client';
  for (const mode of ['personal', 'club']) {
    const text = await f.text(mode);
    assert.match(text, /тренировок не запланировано/);
    assert.ok(text.endsWith(`${mode === 'personal' ? 'Итого занятий' : 'Всего по клубу'}: 0 шт.`));
  }
  f.user.trainerId = null;
  assert.match(await f.text('personal'), /не привязан профиль тренера/);
  await assert.rejects(f.text('club', '2026-02-30'), error => error.getStatus() === 400);
});

test('today and tomorrow use Moscow midnight across month/year boundaries; navigation preserves mode/date', () => {
  const now = new Date('2026-12-31T21:30:00Z');
  assert.equal(scheduleDay('today', now).toISODate(), '2027-01-01');
  assert.equal(scheduleDay('tomorrow', now).toISODate(), '2027-01-02');
  const rows = scheduleNavigation('personal', scheduleDay('2026-12-31'));
  assert.deepEqual(rows[0].map(button => button.date), ['2026-12-31', '2026-12-31']);
  assert.deepEqual(rows[2].map(button => button.date), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.ok(rows[1].concat(rows[2]).every(button => button.mode === 'personal'));
  for (const value of ['bad', '2026-02-30', '2026-11-10T10:00:00Z']) assert.throws(() => scheduleDay(value));
});

test('query day actually changes; sorting equal starts uses trainer name', async () => {
  const f = fixture();
  f.standalone[0].startTime = f.lessons[0].startTime;
  f.standalone[0].trainer.name = 'Аарон';
  const text = await f.text();
  assert.ok(text.indexOf('Аарон') < text.indexOf('Анна Тренер'));
  assert.match(await f.text('club', '2026-11-11'), /Всего по клубу: 0 шт\./);
});

test('unlinked, invalid, inactive and HIDDEN users cannot query either mode in either transport', async () => {
  for (const channel of ['telegram', 'vk']) for (const mode of ['personal', 'club']) {
    const f = fixture();
    for (const change of [() => { f.user.role = null; }, () => { f.user.role = 'CLIENT'; },
      () => { f.user.role = 'TRAINER'; f.user.trainer.isActive = false; },
      () => { f.user.trainer.isActive = true; f.user.staffProfile = { isActive: false }; },
      () => { f.user.staffProfile = null; f.permission.accessLevel = 'HIDDEN'; },
      () => { f.permission.accessLevel = 'READ_ONLY'; f.permission.isEnabled = false; }]) {
      change(); await assert.rejects(f.text(mode, '2026-11-10', channel), error => error.getStatus() === 403);
      assert.equal(f.queries.length, 0);
    }
    await assert.rejects(f.service.authorize('not-an-id', channel));
  }
});

test('READ_ONLY staff and trainers can read, ADMIN always has FULL; VK direct trainer binding is supported', async () => {
  const f = fixture();
  for (const role of ['TRAINER', 'MANAGER', 'STABLE_WORKER', 'GROOM', 'VET', 'OTHER']) {
    f.user.role = role;
    assert.match(await f.text('club', '2026-11-10', 'vk'), /Всего по клубу: 2 шт\./);
  }
  assert.deepEqual(f.identities[0].where, { OR: [{ vkId: '42' }, { vkUserId: 42n }] });
  f.user.role = 'ADMIN'; f.permission.isEnabled = false; f.permission.accessLevel = 'HIDDEN';
  assert.match(await f.text(), /Всего по клубу: 2 шт\./);
  f.user.role = null; f.permission.isEnabled = true; f.permission.accessLevel = 'READ_ONLY';
  f.direct({ id: 'own', isActive: true, user: null });
  assert.match(await f.text('personal', '2026-11-10', 'vk'), /Итого занятий: 1 шт\./);
  f.direct({ id: 'own', isActive: false, user: null });
  await assert.rejects(f.text('personal', '2026-11-10', 'vk'));
});

test('large schedules preserve every line and totals within the 4096-character limit', async () => {
  const f = fixture(); const row = f.lessons[0];
  f.lessons.splice(0, 1, ...Array.from({ length: 60 }, (_, i) => ({ ...row, id: String(i), service: { title: `Занятие ${i} ${'🐎'.repeat(60)}` } })));
  const { chunks } = await f.service.getSchedule('telegram', '42', 'club', '2026-11-10');
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 4096));
  assert.match(chunks.join(''), /Всего по клубу: 61 шт\./);
  assert.match(chunks.join(''), /Занятие 59/);
  for (const text of ['x'.repeat(10000), 'x'.repeat(4095) + '🐎'.repeat(3000), 'a\n\n'.repeat(5000)]) {
    const parts = splitScheduleText(text);
    assert.equal(parts.join(''), text);
    assert.ok(parts.every(part => part.length <= 4096 && !/[\uD800-\uDBFF]$/.test(part)));
  }
  const lines = Array.from({ length: 100 }, (_, i) => `${i} ${'я'.repeat(120)}`);
  const parts = splitScheduleText(lines.join('\n'));
  assert.deepEqual(parts.flatMap(part => part.split('\n')).filter(Boolean), lines);
});

test('real bot dispatch covers schedule commands, menus, refresh, relative navigation and denied access', async t => {
  const { Api, Bot } = require('grammy');
  t.mock.method(Api.prototype, 'setChatMenuButton', async () => true);
  t.mock.method(Api.prototype, 'deleteWebhook', async () => true);
  t.mock.method(Bot.prototype, 'init', async () => {});
  const { TelegramBotService } = require('../dist/modules/telegram-bot/telegram-bot.service');
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  const sent = [], viewed = [];
  let bot, updateId = 1;
  t.mock.method(Bot.prototype, 'start', function () {
    bot = this;
    this.botInfo = { id: 999, is_bot: true, first_name: 'Test', username: 'horseclub68_bot' };
    this.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage') sent.push(payload);
      return { ok: true, result: method === 'sendMessage' ? { message_id: 1, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } : true };
    });
    return Promise.resolve();
  });
  const f = fixture();
  const service = new TelegramBotService({ bindUsername: async () => {} }, { identity: async sender => sender === '1' ? 'client' : sender === '2' ? 'trainer' : sender === '4' ? 'staff' : 'admin' }, {
    getSchedule: async (channel, sender, mode, date) => { await f.service.authorize(sender); const day = scheduleDay(date); viewed.push([day.toISODate(), mode, channel]); return { day, chunks: ['first', 'last'] }; },
  });
  const from = sender => ({ id: sender, is_bot: false, first_name: 'Test' });
  const message = (sender, text) => bot.handleUpdate({ update_id: updateId++, message: { message_id: 1, date: 0, chat: { id: sender, type: 'private' }, from: from(sender), text,
    ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}) } });
  const callback = (sender, data) => bot.handleUpdate({ update_id: updateId++, callback_query: { id: 'callback', from: from(sender), chat_instance: 'private', data,
    message: { message_id: 1, date: 0, chat: { id: sender, type: 'private' }, text: 'Menu' } } });
  try {
    process.env.TELEGRAM_BOT_TOKEN = '123:test'; service.onModuleInit();
    await new Promise(resolve => setImmediate(resolve));
    for (const sender of [2, 3, 4]) {
      await message(sender, '/start');
      assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().some(button => button.text === '📅 Моё расписание'));
      assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().some(button => button.text === '🗓 Общее расписание'));
    }
    const today = DateTime.now().setZone('Europe/Moscow').startOf('day');
    await message(2, '/schedule'); assert.deepEqual(viewed.at(-1), [today.toISODate(), 'personal', 'telegram']);
    assert.equal(sent.at(-2).reply_markup, undefined);
    assert.equal(sent.at(-1).reply_markup.inline_keyboard[2].length, 3);
    await message(3, '/schedule tomorrow'); assert.equal(viewed.at(-1)[0], today.plus({ days: 1 }).toISODate());
    await message(2, '📅 Моё расписание'); assert.equal(viewed.at(-1)[0], today.toISODate());
    await message(2, '🗓 Общее расписание'); assert.equal(viewed.at(-1)[1], 'club');
    await callback(2, 'club_schedule:today'); assert.equal(viewed.at(-1)[0], today.toISODate());
    await callback(2, 'club_schedule:tomorrow'); assert.equal(viewed.at(-1)[0], today.plus({ days: 1 }).toISODate());
    await callback(2, 'schedule:club:2026-12-31');
    const buttons = sent.at(-1).reply_markup.inline_keyboard[2];
    assert.equal(buttons[0].callback_data, 'schedule:club:2026-12-30');
    assert.equal(buttons[1].callback_data, 'schedule:club:2026-12-31');
    assert.equal(buttons[2].callback_data, 'schedule:club:2027-01-01');
    for (const button of buttons) await callback(2, button.callback_data);
    assert.equal(viewed.at(-1)[0], '2027-01-01');
    await callback(2, 'schedule:personal:2027-01-01');
    assert.deepEqual(viewed.at(-1), ['2027-01-01', 'personal', 'telegram']);
    const toggle = sent.at(-1).reply_markup.inline_keyboard[0][1];
    await callback(2, toggle.callback_data);
    assert.deepEqual(viewed.at(-1), ['2027-01-01', 'club', 'telegram']);
    const count = viewed.length;
    await callback(2, 'club_schedule:2026-02-30'); assert.match(sent.at(-1).text, /Некорректная дата/);
    f.user.role = null;
    await message(1, '/schedule'); assert.equal(sent.at(-1).text, SCHEDULE_ACCESS_DENIED);
    await callback(1, 'club_schedule:today'); assert.equal(sent.at(-1).text, SCHEDULE_ACCESS_DENIED);
    assert.equal(viewed.length, count);
  } finally {
    await service.onModuleDestroy();
    if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous;
  }
});
