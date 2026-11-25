const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { ValidationPipe } = require('@nestjs/common');
const { SettingsService } = require('../dist/settings/settings.service');
const { UpdateClubScheduleDto } = require('../dist/settings/dto/update-club-schedule.dto');
const { UpdateNotificationsDto } = require('../dist/settings/dto/update-notifications.dto');
const { scheduleWeekDays, assertScheduleInterval } = require('../dist/settings/club-schedule');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { NotificationDigestService } = require('../dist/settings/notification-digest.service');
const { TmaBookingService } = require('../dist/modules/telegram-bot/tma-booking.service');
const { TelegramDelivery } = require('../dist/modules/telegram-bot/telegram-delivery');
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (value, metatype = UpdateClubScheduleDto) => pipe.transform(value, { type: 'body', metatype });
const legacy = () => ({ id: 1, openTime: '08:15', closeTime: '22:30', daysOfWeekOff: [0, 1] });
function harness() {
  let schedule = legacy();
  let notifications = { id: 1, adminDigest: false, adminRecipientIds: [], adminDigestTime: '20:00', clientReminder24h: true, clientReminder2h: true };
  const prisma = {
    clubSchedule: { upsert: async () => schedule, update: async ({ data }) => (schedule = { ...schedule, ...data }) },
    clubNotificationSettings: { upsert: async () => notifications, update: async ({ data }) => (notifications = { ...notifications, ...data }) },
    user: { count: async ({ where }) => where.id.in.filter(id => id === '00000000-0000-4000-8000-000000000001').length },
  };
  return { service: new SettingsService(prisma) };
}
test('legacy schedule expands Monday through Sunday without losing clocks or holidays', async () => {
  const { service } = harness();
  const result = await service.getSchedule();
  assert.deepEqual(result.weekDays.map(row => row.dayOfWeek), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(result.weekDays.filter(row => !row.isWorkingDay).map(row => row.dayOfWeek), [1, 7]);
  assert.ok(result.weekDays.every(row => row.openTime === '08:15' && row.closeTime === '22:30'));
});
test('seven-day save preserves individual clocks and projects the legacy envelope; legacy PATCH remains supported', async () => {
  const { service } = harness();
  const days = scheduleWeekDays(legacy());
  days[1] = { ...days[1], openTime: '10:00', closeTime: '18:00' };
  days[5] = { ...days[5], isWorkingDay: false };
  const saved = await service.updateSchedule(await validate({ weekDays: days }));
  assert.deepEqual(saved.weekDays, days);
  assert.deepEqual(saved.daysOfWeekOff, [0, 1, 6]);
  assert.equal(saved.openTime, '08:15');
  assert.equal(saved.closeTime, '22:30');
  const old = await service.updateSchedule({ openTime: '07:00', closeTime: '23:00', daysOfWeekOff: [] });
  assert.ok(old.weekDays.every(row => row.isWorkingDay && row.openTime === '07:00' && row.closeTime === '23:00'));
});
test('invalid, incomplete, duplicate, inverted and mixed schedules are rejected', async () => {
  const { service } = harness();
  const days = scheduleWeekDays(legacy());
  for (const weekDays of [days.slice(1), days.map(row => ({ ...row, dayOfWeek: 0 })), days.map(row => ({ ...row, openTime: '25:00' }))])
    await assert.rejects(() => validate({ weekDays }));
  await assert.rejects(() => service.updateSchedule({ weekDays: days.map(row => ({ ...row, dayOfWeek: 1 })) }));
  await assert.rejects(() => service.updateSchedule({ weekDays: days.map(row => ({ ...row, closeTime: row.openTime })) }));
  await assert.rejects(() => service.updateSchedule({ weekDays: days, openTime: '09:00' }));
});
test('booking rules and legacy lessons reject holidays, use per-day clocks and allow exact boundaries in Moscow', async () => {
  const schedule = { ...legacy(), weekDays: scheduleWeekDays(legacy()) };
  schedule.weekDays[1] = { dayOfWeek: 2, isWorkingDay: true, openTime: '10:30', closeTime: '17:15' };
  const at = value => new Date(value);
  const open = at('2026-11-24T07:30:00Z'), close = at('2026-11-24T14:15:00Z');
  assert.doesNotThrow(() => assertScheduleInterval(schedule, open, close));
  const lessons = new LessonsService({});
  assert.doesNotThrow(() => lessons.assertClubWorkingHours(open, close, schedule));
  for (const [start, end] of [
    [at('2026-11-24T07:29:00Z'), close], [open, at('2026-11-24T14:15:00.001Z')],
    [at('2026-11-23T08:00:00Z'), at('2026-11-23T09:00:00Z')],
    [at('2026-11-22T21:30:00Z'), at('2026-11-22T22:00:00Z')],
  ]) {
    assert.throws(() => assertScheduleInterval(schedule, start, end), /Клуб закрыт/);
    assert.throws(() => lessons.assertClubWorkingHours(start, end, schedule), /Клуб закрыт/);
    const bookings = new BookingsService({ $transaction: async work => work({ clubSchedule: { findUnique: async () => schedule } }) }, {});
    await assert.rejects(() => bookings.createBooking({ startTime: start.toISOString(), endTime: end.toISOString(), serviceType: 'dressage', costAmount: 0 }), /Клуб закрыт/);
  }
});
test('notifications preserve false and require valid admin recipients and time', async () => {
  const { service } = harness();
  assert.equal((await service.updateNotifications({ clientReminder24h: false })).clientReminder24h, false);
  await assert.rejects(() => service.updateNotifications({ adminDigest: true }), /получателей/);
  await assert.rejects(() => service.updateNotifications({ adminDigest: true, adminRecipientIds: ['unknown'] }), /администраторы/);
  for (const body of [{ adminDigestTime: '24:00' }, { adminRecipientIds: ['bad'] }, { clientReminder2h: 'false' }])
    await assert.rejects(() => validate(body, UpdateNotificationsDto));
});

test('client slots are empty on holidays and bounded by the individual working day', async context => {
  context.mock.method(Date, 'now', () => +new Date('2026-11-22T09:00:00Z'));
  const schedule = { ...legacy(), weekDays: scheduleWeekDays(legacy()) };
  schedule.weekDays[1] = { dayOfWeek: 2, isWorkingDay: true, openTime: '10:30', closeTime: '12:00' };
  const tx = {
    clubSchedule: { findUnique: async () => schedule }, client: { findUnique: async () => ({ id: 'client' }) },
    service: { findFirst: async () => ({ durationMinutes: 60 }) }, trainer: { findMany: async () => [{ id: 'trainer', name: 'Тренер' }] },
  };
  const service = new TmaBookingService({ $transaction: async operation => operation(tx) }, {}, {});
  service.availableHorse = async () => 'horse';
  assert.deepEqual(await service.slots('client', { date: '2026-11-23' }), { slots: [] });
  const { slots } = await service.slots('client', { date: '2026-11-24' });
  assert.deepEqual(slots.map(slot => slot.startTime.slice(11, 16)), ['10:30', '11:00']);
  assert.deepEqual(slots.map(slot => slot.endTime.slice(11, 16)), ['11:30', '12:00']);
  const lessons = new LessonsService({});
  assert.deepEqual(await lessons.lessonMoveSlots(tx, { startTime: new Date('2026-11-24T07:30Z'), endTime: new Date('2026-11-24T08:30Z') }, { date: '2026-11-23' }), { slots: [] });
});
test('digest queues once per day and recipient in Moscow; disabled digest does nothing', async () => {
  const rows = new Map();
  let enabled = true;
  const tx = {
    clubNotificationSettings: { findUnique: async () => ({ adminDigest: enabled, adminDigestTime: '20:00', adminRecipientIds: ['admin'] }) },
    lesson: { findMany: async () => [{ status: 'SCHEDULED' }, { status: 'CANCELLED' }] },
    booking: { findMany: async () => [] }, user: { findMany: async () => [{ telegramUserId: '42' }] },
    telegramNotification: { upsert: async ({ create }) => rows.set(create.key, create) },
  };
  const service = new NotificationDigestService({ $transaction: async callback => callback(tx) });
  await service.tick(new Date('2026-11-25T16:59:00Z'));
  assert.equal(rows.size, 0);
  await service.tick(new Date('2026-11-25T17:00:00Z'));
  await service.tick(new Date('2026-11-25T17:01:00Z'));
  assert.equal(rows.size, 1);
  assert.match([...rows.values()][0].message, /Занятий: 2\nИз них отменено: 1/);
  enabled = false;
  await service.tick(new Date('2026-11-26T17:00:00Z'));
  assert.equal(rows.size, 1);
});

test('digest delivery rechecks disabled settings and revoked recipients before contacting Telegram', async () => {
  for (const [enabled, recipient, expected] of [[false, true, 0], [true, false, 0], [true, true, 1]]) {
    let sent = 0;
    const row = { key: 'admin:digest:2026-11-25:42', peerId: '42', message: 'Сводка', attempts: 0 };
    const prisma = {
      clubNotificationSettings: { findUnique: async () => ({ adminDigest: enabled, adminRecipientIds: recipient ? ['admin'] : [] }) },
      client: { findUnique: async () => null },
      user: { findUnique: async () => ({ id: 'admin', role: 'ADMIN', crmAccess: true }) },
      telegramNotification: { findMany: async () => [row], update: async () => ({}), updateMany: async () => ({ count: 1 }) },
    };
    const delivery = new TelegramDelivery(prisma);
    delivery.api = { sendMessage: async () => { sent++; } };
    await delivery.flush();
    assert.equal(sent, expected);
  }
});
