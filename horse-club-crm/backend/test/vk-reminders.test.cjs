const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { VkReminders, VkRemindersModule } = require('../dist/vk-bot/vk-reminders.module');
const { reminderMessage, reminderWindow } = require('../dist/vk-bot/vk-reminder-message');
const { CronExpression } = require('@nestjs/schedule');
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
      return bookings.filter(row => row.client.vkUserId !== null && row.status === query.where.status && row.attendanceStatus === query.where.attendanceStatus
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
    booking({ id: 'early', startTime: at(-30) }),
    booking({ id: 'late', startTime: at(30) }),
    booking({ id: 'too-early', startTime: new Date(+at(-30) - 1) }),
    booking({ id: 'too-late', startTime: new Date(+at(30) + 1) }),
    ...['completed', 'no_show', 'cancelled_client', 'cancelled_club', 'penalty_cancellation']
      .map(status => booking({ id: status, status })),
    booking({ id: 'attended', attendanceStatus: 'ATTENDED' }),
    booking({ id: 'cancelled-lesson', lessonId: 'lesson', lesson: { status: 'CANCELLED', startTime: start } }),
  ]);
  await h.service.tick(now);
  assert.equal(h.rows.size, 2);
  assert.deepEqual([...h.rows.keys()], [
    `reminder24h:early:${at(-30).toISOString()}:42`, `reminder24h:late:${at(30).toISOString()}:42`,
  ]);
  assert.equal(h.queries[0].where.status, 'scheduled');
  const window = h.queries[0].where.OR[0].lesson.is.startTime;
  assert.equal(+window.gte - +now, (23 * 60 + 30) * 60000);
  assert.equal(+window.lte - +now, (24 * 60 + 30) * 60000);
});

test('group lesson uses its current time and trainer and sends private client reminders only', async () => {
  const lesson = { status: 'SCHEDULED', startTime: start, trainer: { name: 'Тренер группы' }, arena: { name: 'Манеж' } };
  const h = harness([
    booking({ lessonId: 'lesson', lesson, startTime: new Date('2020-01-01'), trainer: { name: 'Старый тренер' } }),
    booking({ id: 'booking-2', lessonId: 'lesson', lesson,
      client: { firstName: 'Мария', name: 'Мария', vkUserId: 43n }, horse: { name: 'Искра' } }),
    booking({ id: 'moved-out', lessonId: 'other', lesson: { ...lesson, startTime: at(31) } }),
  ]);
  await h.service.tick(now);
  assert.equal(h.rows.size, 2);
  const [first, second] = [...h.rows.values()];
  assert.equal(first.peerId, 42n); assert.equal(second.peerId, 43n);
  assert.match(first.message, /Здравствуйте, Анна!/);
  assert.match(first.message, /Тренер: Тренер группы\nЛошадь: Гранит/);
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
      'Здравствуйте, Анна! Напоминаем о записи на тренировку завтра в 21:00.\n'
      + 'Тренер: пока не назначен\nЛошадь: пока не назначена\n'
      + 'Ждем вас в КСК «СЛКС» (Тамбов, ул. Бастионная, 22АС2). Пожалуйста, возьмите с собой удобную спортивную одежду. '
      + 'Если планы изменятся — предупредите нас заранее.');
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
  assert.equal(h.warnings.filter(entry => entry.event === 'vk_reminder_no_recipient').length, 3);
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
  h.prisma.booking.findMany = () => {
    scans++;
    return scans === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve([]);
  };
  const first = h.service.tick(now);
  await h.service.tick(now);
  assert.equal(scans, 1);
  finish([]); await first;
});

test('blocked VK delivery records a single attempt, logs a warning and sends the other reminder', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: +now });
  const h = harness([booking(), booking({ id: 'booking-2', client: { firstName: 'Мария', name: '', vkUserId: 43n } })]);
  await h.service.tick(now);
  const warnings = [], sent = [];
  const delivery = new VkNotifications({ booking: h.prisma.booking, vkNotification: {
    findMany: async () => [...h.rows.values()].filter(row => !row.sentAt && row.attemptCount === 0),
    updateMany: async ({ where }) => {
      const row = h.rows.get(where.id);
      if (row.attemptCount !== 0) return { count: 0 };
      row.attemptCount++; return { count: 1 };
    },
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
  assert.equal(first.sentAt, null); assert.equal(first.attemptCount, 1);
  assert.ok(second.sentAt instanceof Date);
  assert.deepEqual(sent.map(row => row.peer_id), [43]);
  assert.equal(warnings[0].errorCode, 901);
  await h.service.tick(now);
  await delivery.flush();
  assert.deepEqual(sent.map(row => row.peer_id), [43]);
  assert.equal(warnings.length, 1);
  assert.equal(h.upserts.length, 2);
});

for (const kind of ['24h', '2h']) for (const change of ['cancelled', 'rescheduled', 'unlinked', 'started', 'deleted']) {
  test(`pending ${kind} reminder is discarded without sending when training is ${change}`, async t => {
    const checkTime = kind === '24h' ? now : new Date(+start - 2 * 3600000);
    t.mock.timers.enable({ apis: ['Date'], now: +checkTime });
    const value = booking();
    const bookings = [value];
    const h = harness(bookings);
    await h.service.tick(checkTime);
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

test('reminders module is wired into the bot and schedules immediate and ten-minute checks', t => {
  assert.ok(Reflect.getMetadata('imports', VkBotModule).includes(VkRemindersModule));
  const h = harness();
  const tick = t.mock.method(h.service, 'tick', async () => {});
  h.service.onModuleInit();
  assert.equal(tick.mock.callCount(), 1);
  const options = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', VkReminders.prototype.tick);
  assert.equal(options.cronTime, CronExpression.EVERY_10_MINUTES);
  assert.equal(options.timeZone, 'Europe/Moscow');
  assert.equal(options.waitForCompletion, true);
});

for (const kind of ['24h', '2h']) {
  test(`${kind} window includes half-hour boundaries and excludes adjacent milliseconds`, async () => {
    const range = reminderWindow(now, kind);
    const h = harness([
      booking({ id: 'lower', startTime: range.gte }),
      booking({ id: 'upper', startTime: range.lte }),
      booking({ id: 'outside-lower', startTime: new Date(+range.gte - 1) }),
      booking({ id: 'outside-upper', startTime: new Date(+range.lte + 1) }),
    ]);
    await h.service.tick(now);
    assert.equal(h.rows.size, 2);
    assert.ok([...h.rows.keys()].every(key => key.startsWith(`reminder${kind}:`)));
    assert.equal(+range.lte - +range.gte, 3600000);
    assert.equal((+range.gte + +range.lte) / 2 - +now, (kind === '24h' ? 24 : 2) * 3600000);
  });
}

test('two-hour message uses Moscow time across UTC midnight', () => {
  assert.equal(reminderMessage('2h', new Date('2026-11-08T21:05:00Z'), 'Анна', 'Иван'),
    'Ждем вас на занятие через 2 часа (00:05)!\n'
    + 'Адрес: ул. Бастионная, 22АС2.\n'
    + 'Телефон для связи: +7 (915) 672-00-30. До встречи!');
});

test('24h and 2h reminders have independent durable keys for the same booking', async () => {
  const h = harness();
  await h.service.tick(now);
  await h.service.tick(new Date(+start - 2 * 3600000));
  await new VkReminders(h.prisma).tick(new Date(+start - 2 * 3600000));
  assert.equal(h.rows.size, 2);
  assert.deepEqual([...h.rows.keys()].map(key => key.split(':')[0]), ['reminder24h', 'reminder2h']);
});

for (const kind of ['24h', '2h']) {
  test(`${kind} reminder is attempted once across concurrent workers and restart even when VK blocks it`, async t => {
    const checkTime = kind === '24h' ? now : new Date(+start - 2 * 3600000);
    t.mock.timers.enable({ apis: ['Date'], now: +checkTime });
    const h = harness();
    await h.service.tick(checkTime);
    let sends = 0;
    const prisma = { booking: h.prisma.booking, vkNotification: {
      findMany: async query => {
        assert.equal(query.where.OR[1].attemptCount, 0);
        return [...h.rows.values()].filter(row => !row.sentAt && row.attemptCount === 0);
      },
      updateMany: async ({ where }) => {
        const row = h.rows.get(where.id);
        if (row.attemptCount !== 0) return { count: 0 };
        row.attemptCount++; return { count: 1 };
      },
    } };
    const worker = () => {
      const delivery = new VkNotifications(prisma);
      delivery.logger.warn = () => {};
      delivery.vk = { api: { messages: { send: async () => {
        sends++; throw Object.assign(new Error('Blocked'), { code: 901 });
      } } } };
      return delivery;
    };
    await Promise.all([worker().flush(), worker().flush()]);
    await worker().flush();
    await new VkReminders(h.prisma).tick(checkTime);
    assert.equal(sends, 1);
    assert.equal(h.rows.size, 1);
    assert.equal([...h.rows.values()][0].attemptCount, 1);
    assert.equal([...h.rows.values()][0].sentAt, null);
  });
}
