const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { DateTime } = require('luxon');
const { TelegramScheduleService, splitScheduleText, SCHEDULE_ACCESS_DENIED } = require('../dist/modules/telegram-bot/telegram-schedule.service');
const day = new Date('2026-11-09T21:30:00Z'); // Already November 10 in Moscow.
const trainer = { name: 'Анна', fullName: '' };
const client = { name: 'Всадник', firstName: '', lastName: '' };
function fixture() {
  const queries = [];
  const lessons = [{ startTime: new Date('2026-11-10T09:00:00Z'), endTime: new Date('2026-11-10T10:00:00Z'),
    trainerId: 'own', trainer, service: { title: 'Конкур', name: 'jumping' }, status: 'SCHEDULED',
    bookings: [{ client, horse: { name: 'Буран' } }, { client: { ...client, name: 'Второй' }, horse: null }] }];
  const standalone = [{ startTime: new Date('2026-11-09T21:00:00Z'), endTime: new Date('2026-11-09T22:00:00Z'),
    trainerId: 'other', trainer: { name: 'Коллега', fullName: '' }, client, horse: null, membership: null, serviceType: 'walks', status: 'completed' }];
  const user = { id: 'user', role: 'TRAINER', trainerId: 'own', trainer: { isActive: true }, staffProfile: null };
  let permission = { module: 'SCHEDULE', isEnabled: true, accessLevel: 'READ_ONLY' };
  const prisma = {
    lesson: { findMany: async query => { queries.push(query); return lessons; } },
    booking: { findMany: async query => { queries.push(query); return standalone; } },
    user: { findUnique: async () => user.role ? user : null },
  };
  return { service: new TelegramScheduleService(prisma, { forRole: async () => [permission] }), queries, lessons, standalone, user, permission };
}

test('club schedule queries all trainers within Moscow midnight boundaries and excludes cancellations', async () => {
  const f = fixture();
  const text = (await f.service.getDaySchedule(day, 'user')).join('');
  for (const query of f.queries) {
    assert.equal(query.where.startTime.gte.toISOString(), '2026-11-09T21:00:00.000Z');
    assert.equal(query.where.startTime.lt.toISOString(), '2026-11-10T21:00:00.000Z');
    assert.deepEqual(query.orderBy, { startTime: 'asc' });
    assert.equal(query.where.trainerId, undefined);
    assert.equal(query.take, undefined);
  }
  assert.deepEqual(f.queries[0].where.status, { not: 'CANCELLED' });
  assert.equal(f.queries[0].where.deletedAt, null);
  assert.equal(f.queries[0].include.bookings.include.horse, true);
  assert.deepEqual(f.queries[0].include.bookings.where.status.notIn, ['cancelled_client', 'cancelled_club', 'penalty_cancellation']);
  assert.equal(f.queries[1].where.lessonId, null);
  assert.match(text, /10\.11\.2026 \(Вторник\)/);
  assert.match(text, /Всего занятий: 2 шт\./);
  assert.match(text, /00:00 – 01:00\n▫️ Коллега: Прогулка/);
  assert.match(text, /12:00 – 13:00\n🔹 Вы: Конкур/);
  assert.match(text, /Всадник · Лошадь: Буран/);
  assert.match(text, /Клиент: Второй\nСтатус: Запланировано/);
  assert.ok(text.indexOf('Коллега') < text.indexOf('🔹 Вы:'));
});

test('optional cancelled flag, absent requester, empty schedule and invalid dates', async () => {
  const f = fixture();
  assert.match((await f.service.getDaySchedule(day, undefined, true)).join(''), /▫️ Анна:/);
  assert.equal(f.queries[0].where.status, undefined);
  assert.deepEqual(f.queries[0].include.bookings.where, {});
  assert.equal(f.queries[1].where.status, undefined);
  f.lessons.length = 0; f.standalone.length = 0;
  assert.match((await f.service.getDaySchedule(day)).join(''), /Всего занятий: 0 шт\.\n\nНа этот день тренировок не запланировано\./);
  await assert.rejects(f.service.getDaySchedule(new Date('invalid')), error => error.getStatus() === 400);
});

test('READ_ONLY trainers and admins can read; clients, unlinked, inactive and hidden users cannot', async () => {
  const f = fixture();
  assert.equal((await f.service.authorize('42')).id, 'user');
  for (const role of ['CLIENT', 'MANAGER', 'STABLE_WORKER', null]) {
    f.user.role = role;
    await assert.rejects(f.service.authorize('42'), error => error.getStatus() === 403 && error.message === SCHEDULE_ACCESS_DENIED);
  }
  f.user.role = 'TRAINER'; f.user.trainer.isActive = false;
  await assert.rejects(f.service.authorize('42'));
  f.user.trainer.isActive = true; f.user.staffProfile = { isActive: false };
  await assert.rejects(f.service.authorize('42'));
  f.user.staffProfile = null; f.permission.accessLevel = 'HIDDEN';
  await assert.rejects(f.service.authorize('42'));
  f.permission.accessLevel = 'READ_ONLY'; f.permission.isEnabled = false;
  await assert.rejects(f.service.authorize('42'));
  f.user.role = 'ADMIN'; await assert.rejects(f.service.authorize('42'));
  f.permission.isEnabled = true; f.permission.accessLevel = 'HIDDEN';
  assert.equal((await f.service.authorize('42')).id, 'user');
});

test('over 30 lessons and oversized paragraphs are delivered losslessly within 4096 UTF-16 units', async () => {
  const f = fixture();
  const row = f.lessons[0];
  f.lessons.splice(0, 1, ...Array.from({ length: 60 }, (_, i) => ({ ...row, service: { title: `Занятие ${i} ${'🐎'.repeat(60)}` } })));
  const chunks = await f.service.getDaySchedule(day);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 4096));
  assert.match(chunks.join(''), /Всего занятий: 61 шт\./);
  assert.match(chunks.join(''), /Занятие 59/);
  for (const text of ['x'.repeat(10000), 'x'.repeat(4095) + '🐎'.repeat(3000), 'a\n\n'.repeat(5000)]) {
    const parts = splitScheduleText(text);
    assert.equal(parts.join(''), text);
    assert.ok(parts.every(part => part.length <= 4096 && !/[\uD800-\uDBFF]$/.test(part)));
  }
});

test('real bot dispatch covers schedule commands, menus, refresh, relative navigation and denied access', async t => {
  const { Bot } = require('grammy');
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
  const service = new TelegramBotService({ bindUsername: async () => {} }, { identity: async sender => sender === '1' ? 'client' : sender === '2' ? 'trainer' : 'admin' }, {
    authorize: async sender => { f.user.role = sender === '1' ? null : sender === '2' ? 'TRAINER' : 'ADMIN'; return f.service.authorize(sender); },
    getDaySchedule: async (date, id) => { viewed.push([DateTime.fromJSDate(date, { zone: 'Europe/Moscow' }).toISODate(), id]); return ['first', 'last']; },
  });
  const from = sender => ({ id: sender, is_bot: false, first_name: 'Test' });
  const message = (sender, text) => bot.handleUpdate({ update_id: updateId++, message: { message_id: 1, date: 0, chat: { id: sender, type: 'private' }, from: from(sender), text,
    ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}) } });
  const callback = (sender, data) => bot.handleUpdate({ update_id: updateId++, callback_query: { id: 'callback', from: from(sender), chat_instance: 'private', data,
    message: { message_id: 1, date: 0, chat: { id: sender, type: 'private' }, text: 'Menu' } } });
  try {
    process.env.TELEGRAM_BOT_TOKEN = '123:test'; service.onModuleInit();
    for (const sender of [2, 3]) {
      await message(sender, '/start');
      assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().some(button => button.text === '📅 Расписание на сегодня'));
      assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().some(button => button.text === '🗓 Расписание на завтра'));
    }
    const today = DateTime.now().setZone('Europe/Moscow').startOf('day');
    await message(2, '/schedule'); assert.deepEqual(viewed.at(-1), [today.toISODate(), 'user']);
    assert.equal(sent.at(-2).reply_markup, undefined);
    assert.equal(sent.at(-1).reply_markup.inline_keyboard[0].length, 3);
    await message(3, '/schedule tomorrow'); assert.equal(viewed.at(-1)[0], today.plus({ days: 1 }).toISODate());
    await message(2, '📅 Расписание на сегодня'); assert.equal(viewed.at(-1)[0], today.toISODate());
    await message(2, '🗓 Расписание на завтра'); assert.equal(viewed.at(-1)[0], today.plus({ days: 1 }).toISODate());
    await callback(2, 'club_schedule:today'); assert.equal(viewed.at(-1)[0], today.toISODate());
    await callback(2, 'club_schedule:tomorrow'); assert.equal(viewed.at(-1)[0], today.plus({ days: 1 }).toISODate());
    await callback(2, 'club_schedule:2026-12-31');
    const buttons = sent.at(-1).reply_markup.inline_keyboard[0];
    assert.equal(buttons[0].callback_data, 'club_schedule:2026-12-30');
    assert.equal(buttons[1].callback_data, 'club_schedule:2026-12-31');
    assert.equal(buttons[2].callback_data, 'club_schedule:2027-01-01');
    for (const button of buttons) await callback(2, button.callback_data);
    assert.equal(viewed.at(-1)[0], '2027-01-01');
    const count = viewed.length;
    await callback(2, 'club_schedule:2026-02-30'); assert.match(sent.at(-1).text, /Некорректная дата/);
    await message(1, '/schedule'); assert.equal(sent.at(-1).text, SCHEDULE_ACCESS_DENIED);
    await callback(1, 'club_schedule:today'); assert.equal(sent.at(-1).text, SCHEDULE_ACCESS_DENIED);
    assert.equal(viewed.length, count);
  } finally {
    await service.onModuleDestroy();
    if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous;
  }
});
