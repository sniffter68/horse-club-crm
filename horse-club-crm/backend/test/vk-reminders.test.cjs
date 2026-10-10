const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { VkReminders, VkRemindersModule, REMINDER_INTERVAL_MS } = require('../dist/vk-bot/vk-reminders.module');
const { VkBotModule } = require('../dist/vk-bot/vk-bot.module');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');

const now = new Date('2026-10-16T08:00:00Z');
const start = new Date('2026-10-17T08:00:00Z');
const at = minutes => new Date(+start + minutes * 60000);
const booking = (patch = {}) => ({
  id: 'booking-1', clientId: 'client-1', lessonId: null, lesson: null,
  status: 'scheduled', attendanceStatus: 'PENDING', startTime: start,
  client: { firstName: 'Анна', name: 'Анна Орлова', vkUserId: 42n },
  trainer: { name: 'Иван Сергеевич' }, horse: { name: 'Гранит' }, arena: { name: 'Плац' },
  ...patch,
});

function harness(bookings = [booking()]) {
  const rows = new Map(), queries = [], warnings = [], logs = [], upserts = [];
  const inRange = (date, range) => date >= range.gte && date <= range.lte;
  const prisma = {
    booking: { findUnique: async ({ where }) => bookings.find(row => row.id === where.id) || null,
      findMany: async query => {
      queries.push(query);
      const [legacy, standalone] = query.where.OR;
      return bookings.filter(row => row.status === query.where.status && row.attendanceStatus === query.where.attendanceStatus
        && (row.lesson
          ? row.lesson.status === legacy.lesson.is.status && inRange(row.lesson.startTime, legacy.lesson.is.startTime)
          : inRange(row.startTime, standalone.startTime)));
    } },
    vkNotification: {
      findMany: async ({ where }) => [...rows.values()].filter(row => where.key.in.includes(row.key)),
      upsert: async args => {
        upserts.push(args);
        if (!rows.has(args.where.key)) rows.set(args.where.key, { id: args.where.key, attemptCount: 0, sentAt: null, ...args.create });
      },
    },
  };
  const service = new VkReminders(prisma);
  service.logger.warn = entry => warnings.push(entry);
  service.logger.log = entry => logs.push(entry);
  return { service, prisma, rows, queries, warnings, logs, upserts };
}

test('24-hour window includes both boundaries and excludes cancelled, completed and attended bookings', async () => {
  const h = harness([
    booking({ id: 'early', startTime: at(-15) }),
    booking({ id: 'late', startTime: at(15) }),
    booking({ id: 'too-early', startTime: new Date(+at(-15) - 1) }),
    booking({ id: 'too-late', startTime: new Date(+at(15) + 1) }),
    ...['completed', 'no_show', 'cancelled_client', 'cancelled_club', 'penalty_cancellation']
      .map(status => booking({ id: status, status })),
    booking({ id: 'attended', attendanceStatus: 'ATTENDED' }),
    booking({ id: 'cancelled-lesson', lessonId: 'lesson', lesson: { status: 'CANCELLED', startTime: start } }),
  ]);
  await h.service.tick(now);
  assert.equal(h.rows.size, 2);
  assert.deepEqual([...h.rows.keys()], [
    `reminder24h:early:${at(-15).toISOString()}:42`, `reminder24h:late:${at(15).toISOString()}:42`,
  ]);
  assert.equal(h.queries[0].where.status, 'scheduled');
  const window = h.queries[0].where.OR[0].lesson.is.startTime;
  assert.equal(+window.gte - +now, (23 * 60 + 45) * 60000);
  assert.equal(+window.lte - +now, (24 * 60 + 15) * 60000);
});

test('group lesson uses its current time, trainer and location and sends private client reminders only', async () => {
  const lesson = { status: 'SCHEDULED', startTime: start, trainer: { name: 'Тренер группы' }, arena: { name: 'Манеж' } };
  const h = harness([
    booking({ lessonId: 'lesson', lesson, startTime: new Date('2020-01-01'), trainer: { name: 'Старый тренер' } }),
    booking({ id: 'booking-2', lessonId: 'lesson', lesson,
      client: { firstName: 'Мария', name: 'Мария', vkUserId: 43n }, horse: { name: 'Искра' } }),
    booking({ id: 'moved-out', lessonId: 'other', lesson: { ...lesson, startTime: at(16) } }),
  ]);
  await h.service.tick(now);
  assert.equal(h.rows.size, 2);
  const [first, second] = [...h.rows.values()];
  assert.equal(first.peerId, 42n); assert.equal(second.peerId, 43n);
  assert.match(first.message, /Здравствуйте, Анна!/);
  assert.match(first.message, /Тренер: Тренер группы\nЛошадь: Гранит\nЛокация: Манеж/);
  assert.doesNotMatch(first.message, /Мария|Искра|Старый тренер/);
  assert.doesNotMatch(second.message, /Анна|Гранит/);
});

test('message uses club timezone, personal first name and readable missing resource fallbacks', async () => {
  const original = process.env.CLUB_TIME_ZONE;
  process.env.CLUB_TIME_ZONE = 'Asia/Vladivostok';
  try {
    const h = harness([booking({ startTime: new Date('2026-10-17T18:00:00Z'),
      client: { firstName: '', name: ' Анна Орлова ', vkUserId: 42n },
      trainer: { name: '' }, horse: null, arena: null })]);
    await h.service.tick(new Date('2026-10-16T18:00:00Z'));
    assert.equal([...h.rows.values()][0].message,
      'Напоминание о тренировке 🐴\nЗдравствуйте, Анна!\n'
      + 'Завтра (18.10.2026) в 04:00 у вас запланировано занятие.\n'
      + 'Тренер: пока не назначен\nЛошадь: пока не назначена\nЛокация: уточните у администратора\n\n'
      + 'Пожалуйста, приезжайте за 10–15 минут до начала. Если ваши планы изменились, предупредите клуб заранее.\n'
      + 'Связаться с администратором: отправьте «Позвать администратора» в этом диалоге.');
  } finally {
    if (original === undefined) delete process.env.CLUB_TIME_ZONE; else process.env.CLUB_TIME_ZONE = original;
  }
});

test('queued and sent reminders survive repeated ticks and worker restarts without duplicate sends', async () => {
  const h = harness();
  await h.service.tick(now);
  await h.service.tick(new Date(+now + 10 * 60000));
  assert.equal(h.rows.size, 1); assert.equal(h.upserts.length, 1);
  const row = [...h.rows.values()][0]; row.sentAt = new Date();
  const restarted = new VkReminders(h.prisma);
  await restarted.tick(now);
  assert.equal(h.upserts.length, 1);
  assert.deepEqual(h.upserts[0].update, {});
  assert.equal(h.upserts[0].where.key, row.key);
});

test('rescheduled booking receives a new reminder for its new start time', async () => {
  const value = booking();
  const h = harness([value]);
  await h.service.tick(now);
  value.startTime = new Date(+start + 86400000);
  await h.service.tick(now);
  assert.equal(h.rows.size, 1);
  await h.service.tick(new Date(+now + 86400000));
  assert.equal(h.rows.size, 2);
  assert.ok([...h.rows.keys()].some(key => key.includes('2026-10-18T08:00:00.000Z')));
});

test('missing or invalid VK recipients log warnings while other clients are queued', async () => {
  const h = harness([booking(), ...[null, 0n, -42n, 9007199254740992n].map((vkUserId, i) =>
    booking({ id: `unlinked-${i}`, client: { firstName: 'Гость', name: '', vkUserId } }))]);
  await assert.doesNotReject(h.service.tick(now));
  assert.equal(h.rows.size, 1);
  assert.equal(h.warnings.filter(entry => entry.event === 'vk_reminder_no_recipient').length, 4);
});

test('one queue failure does not prevent the other client reminder and can be retried', async () => {
  const h = harness([booking(), booking({ id: 'booking-2' })]);
  const upsert = h.prisma.vkNotification.upsert;
  h.prisma.vkNotification.upsert = async args => {
    if (args.create.key.includes(':booking-1:')) throw new Error('DB unavailable');
    return upsert(args);
  };
  await assert.doesNotReject(h.service.tick(now));
  assert.equal(h.rows.size, 1);
  assert.equal(h.warnings[0].event, 'vk_reminder_queue_failed');
  h.prisma.vkNotification.upsert = upsert;
  await h.service.tick(now);
  assert.equal(h.rows.size, 2);
});

test('database outage is contained and the running guard is released for the next tick', async () => {
  const h = harness();
  const find = h.prisma.booking.findMany;
  h.prisma.booking.findMany = async () => { throw new Error('DB unavailable'); };
  await assert.doesNotReject(h.service.tick(now));
  assert.equal(h.warnings[0].event, 'vk_reminders_unavailable');
  h.prisma.booking.findMany = find;
  await h.service.tick(now);
  assert.equal(h.rows.size, 1);
});

test('overlapping checks do not start a second database scan', async () => {
  const h = harness();
  let finish, scans = 0;
  h.prisma.booking.findMany = () => { scans++; return new Promise(resolve => { finish = resolve; }); };
  const first = h.service.tick(now);
  await h.service.tick(now);
  assert.equal(scans, 1);
  finish([]); await first;
});

test('blocked VK delivery logs a warning, leaves the reminder unsent and sends the other reminder', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: +now });
  const h = harness([booking(), booking({ id: 'booking-2', client: { firstName: 'Мария', name: '', vkUserId: 43n } })]);
  await h.service.tick(now);
  const warnings = [], sent = [];
  const delivery = new VkNotifications({ booking: h.prisma.booking, vkNotification: {
    findMany: async () => [...h.rows.values()],
    update: async ({ where, data }) => Object.assign(h.rows.get(where.id), data),
  } });
  delivery.logger.warn = entry => warnings.push(entry);
  delivery.logger.log = () => {};
  delivery.vk = { api: { messages: { send: async params => {
    if (params.peer_id === 42) throw Object.assign(new Error('Cannot send messages'), { code: 901 });
    sent.push(params);
  } } } };
  await assert.doesNotReject(delivery.flush());
  const [first, second] = [...h.rows.values()];
  assert.equal(first.sentAt, null); assert.ok(first.nextAttemptAt instanceof Date);
  assert.ok(second.sentAt instanceof Date);
  assert.deepEqual(sent.map(row => row.peer_id), [43]);
  assert.equal(warnings[0].errorCode, 901);
  await h.service.tick(now);
  assert.equal(h.upserts.length, 2);
});

for (const change of ['cancelled', 'rescheduled', 'unlinked', 'started', 'deleted']) {
  test(`pending reminder is discarded without sending when training is ${change}`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: +now });
    const value = booking();
    const bookings = [value];
    const h = harness(bookings);
    await h.service.tick(now);
    if (change === 'cancelled') value.status = 'cancelled_club';
    if (change === 'rescheduled') value.startTime = at(60);
    if (change === 'unlinked') value.client.vkUserId = null;
    if (change === 'started') t.mock.timers.setTime(+start);
    if (change === 'deleted') bookings.length = 0;
    const sent = [], warnings = [], updates = [];
    const delivery = new VkNotifications({ booking: h.prisma.booking, vkNotification: {
      findMany: async () => [...h.rows.values()],
      deleteMany: async ({ where }) => { assert.equal(where.sentAt, null); h.rows.delete(where.id); },
      update: async args => updates.push(args),
    } });
    delivery.logger.warn = entry => warnings.push(entry);
    delivery.vk = { api: { messages: { send: async params => sent.push(params) } } };
    await delivery.flush();
    assert.deepEqual(sent, []); assert.deepEqual(updates, []);
    assert.equal(h.rows.size, 0);
    assert.equal(warnings[0].event, 'vk_reminder_discarded');
  });
}

test('reminders module is wired into the bot and schedules immediate and ten-minute checks with cleanup', t => {
  assert.ok(Reflect.getMetadata('imports', VkBotModule).includes(VkRemindersModule));
  const h = harness();
  let callback, delay, unref = false, cleared;
  const timer = { unref: () => { unref = true; } };
  t.mock.method(global, 'setInterval', (fn, ms) => { callback = fn; delay = ms; return timer; });
  t.mock.method(global, 'clearInterval', value => { cleared = value; });
  const tick = t.mock.method(h.service, 'tick', async () => {});
  h.service.onModuleInit();
  assert.equal(tick.mock.callCount(), 1);
  assert.equal(delay, 10 * 60000); assert.equal(delay, REMINDER_INTERVAL_MS); assert.equal(unref, true);
  callback(); assert.equal(tick.mock.callCount(), 2);
  h.service.onModuleDestroy(); assert.equal(cleared, timer);
});
