const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { parseBookingResponse, reminderKeyboard } = require('../dist/vk-bot/vk-booking-response');
const { VkBookingResponseService, bookingResponseText: text } = require('../dist/vk-bot/vk-booking-response.service');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');

const id = '11111111-1111-4111-8111-111111111111';
const payload = action => ({ action, bookingId: id });
function harness(patch = {}) {
  const start = new Date(Date.now() + 86400000);
  const booking = { id, updatedAt: new Date(), clientId: 'client', client: { name: 'Анна', vkUserId: 42n },
    status: 'scheduled', attendanceStatus: 'PENDING', clientConfirmed: false, clientCancellationRequested: false,
    startTime: start, lessonId: null, lesson: null, ...patch };
  const notifications = new Map(), updates = [], transactions = [];
  const prisma = {
    booking: { findUnique: async () => booking,
      updateMany: async args => { updates.push(args); Object.assign(booking, args.data); return { count: 1 }; } },
    user: { findMany: async () => [{ vkUserId: 99n }] },
    vkNotification: { upsert: async args => notifications.set(args.where.key, args.create) },
    $transaction: async (fn, options) => {
      transactions.push(options);
      const snapshot = { ...booking };
      try { return await fn(prisma); }
      catch (error) { Object.assign(booking, snapshot); notifications.clear(); throw error; }
    },
  };
  const responses = new VkBookingResponseService(prisma);
  const bot = new VkBotService(prisma, {}, {}, {}, {}, responses);
  const sent = [], answers = [];
  bot.vk = { api: { messages: { send: async args => sent.push(args), sendMessageEventAnswer: async args => answers.push(args) } } };
  return { booking, prisma, responses, bot, notifications, updates, transactions, sent, answers };
}

test('keyboard has two colored inline callbacks and exact JSON payloads', () => {
  const keyboard = JSON.parse(reminderKeyboard(id));
  assert.equal(keyboard.inline, true); assert.equal(keyboard.one_time, false);
  assert.equal(keyboard.buttons.length, 1); assert.equal(keyboard.buttons[0].length, 2);
  for (const [index, action] of ['confirm_booking', 'cancel_booking'].entries()) {
    const button = keyboard.buttons[0][index];
    assert.equal(button.color, index ? 'negative' : 'positive');
    assert.equal(button.action.type, 'callback');
    assert.equal(button.action.label, index ? '❌ Не смогу прийти' : '✅ Подтверждаю');
    assert.equal(button.action.payload, JSON.stringify(payload(action)));
  }
});

test('payload accepts string or object, rejects malformed JSON and UUID, and ignores other commands', () => {
  for (const action of ['confirm_booking', 'cancel_booking']) {
    assert.deepEqual(parseBookingResponse(payload(action)), payload(action));
    assert.deepEqual(parseBookingResponse(JSON.stringify(payload(action))), payload(action));
    for (const bookingId of ['', 'not-uuid', null, 1, undefined]) {
      assert.throws(() => parseBookingResponse({ action, bookingId }), /номер записи/);
    }
  }
  assert.throws(() => parseBookingResponse('{broken'), /данные кнопки/);
  for (const value of [null, [], 42, {}, { command: 'bookings' }, { action: 'attendance', bookingId: id }]) {
    assert.equal(parseBookingResponse(value), undefined);
  }
});

test('confirmation persists once and does not alter scheduling or attendance', async () => {
  const h = harness();
  for (let i = 0; i < 2; i++) assert.equal(await h.responses.respond(42, payload('confirm_booking')), text.confirmed);
  assert.equal(h.updates.length, 1);
  assert.equal(h.booking.clientConfirmed, true);
  assert.equal(h.booking.status, 'scheduled'); assert.equal(h.booking.attendanceStatus, 'PENDING');
  assert.equal(h.notifications.size, 0);
  assert.equal(h.transactions[0].isolationLevel, 'Serializable');
  assert.equal(h.updates[0].where.client.vkUserId, 42n);
});

test('cancellation request is durable, idempotent and queues an administrator alert in Moscow time', async () => {
  const h = harness({ startTime: new Date('2099-01-01T21:30:00Z'), clientConfirmed: true });
  for (const action of ['cancel_booking', 'cancel_booking', 'confirm_booking']) {
    assert.equal(await h.responses.respond(42, payload(action)), text.cancellationRequested);
  }
  assert.equal(h.updates.length, 1); assert.equal(h.notifications.size, 1);
  assert.equal(h.booking.clientCancellationRequested, true); assert.equal(h.booking.clientConfirmed, false);
  // The existing cancellation/refund workflow remains an administrator action.
  assert.equal(h.booking.status, 'scheduled');
  const notification = [...h.notifications.values()][0];
  assert.equal(notification.peerId, 99n);
  assert.match(notification.message, /Анна.*11111111.*02.01.2099 00:30/);
  assert.match(notification.message, /Подтвердите отмену в CRM/);
});

for (const patch of [
  { startTime: new Date(0) }, { status: 'cancelled_client' }, { status: 'completed' },
  { status: 'no_show' }, { status: 'penalty_cancellation' }, { attendanceStatus: 'ATTENDED' },
  { lesson: { status: 'CANCELLED', startTime: new Date('2099-01-01') } },
  { lesson: { status: 'SCHEDULED', deletedAt: new Date(), startTime: new Date('2099-01-01') } },
  { lesson: { status: 'SCHEDULED', startTime: new Date(0) } },
]) test(`expired/terminal booking is not mutated: ${JSON.stringify(patch)}`, async () => {
  const h = harness(patch);
  for (const action of ['confirm_booking', 'cancel_booking']) assert.equal(await h.responses.respond(42, payload(action)), text.stale);
  assert.equal(h.updates.length, 0); assert.equal(h.notifications.size, 0);
});

test('lesson time is authoritative and cancellation applies only to this rider', async () => {
  const h = harness({ startTime: new Date(0), lessonId: 'lesson', lesson: { status: 'SCHEDULED', startTime: new Date('2099-01-01') } });
  assert.equal(await h.responses.respond(42, payload('confirm_booking')), text.confirmed);
  assert.equal(h.updates[0].where.id, id);
});

test('missing and foreign bookings do not disclose status or mutate data', async () => {
  const h = harness();
  assert.equal(await h.responses.respond(43, payload('cancel_booking')), text.unavailable);
  h.prisma.booking.findUnique = async () => null;
  assert.equal(await h.responses.respond(42, payload('confirm_booking')), text.unavailable);
  assert.equal(h.updates.length, 0);
});

test('notification failure rolls back the request and a retry succeeds', async () => {
  const h = harness();
  const upsert = h.prisma.vkNotification.upsert;
  h.prisma.vkNotification.upsert = async () => { throw new Error('database offline'); };
  await assert.rejects(h.responses.respond(42, payload('cancel_booking')), /Не удалось сохранить ответ/);
  assert.equal(h.booking.clientCancellationRequested, false);
  h.prisma.vkNotification.upsert = upsert;
  assert.equal(await h.responses.respond(42, payload('cancel_booking')), text.cancellationRequested);
});

test('missing VK administrator rolls back request instead of claiming it was delivered', async () => {
  const original = process.env.VK_ADMIN_PEER_ID;
  delete process.env.VK_ADMIN_PEER_ID;
  try {
    const h = harness(); h.prisma.user.findMany = async () => [];
    await assert.rejects(h.responses.respond(42, payload('cancel_booking')), /администратор VK не настроен/);
    assert.equal(h.booking.clientCancellationRequested, false);
  } finally {
    if (original === undefined) delete process.env.VK_ADMIN_PEER_ID; else process.env.VK_ADMIN_PEER_ID = original;
  }
});

test('serialization conflict retries transaction and persistent errors return a friendly failure', async () => {
  const h = harness(), transaction = h.prisma.$transaction;
  let attempts = 0;
  h.prisma.$transaction = (...args) => {
    if (++attempts < 3) throw { code: 'P2034' };
    return transaction(...args);
  };
  assert.equal(await h.responses.respond(42, payload('confirm_booking')), text.confirmed);
  assert.equal(attempts, 3);
  h.prisma.$transaction = async () => { throw { code: 'P2034' }; };
  await assert.rejects(h.responses.respond(42, payload('cancel_booking')), /Не удалось сохранить ответ/);
});

test('optimistic update prevents mutation if booking changed concurrently', async () => {
  const h = harness(); h.prisma.booking.updateMany = async () => ({ count: 0 });
  assert.equal(await h.responses.respond(42, payload('cancel_booking')), text.stale);
  assert.equal(h.notifications.size, 0);
});

for (const action of ['confirm_booking', 'cancel_booking']) for (const type of ['message_new', 'message_event']) {
  test(`${type} routes ${action}, bypasses bot pause and sends a full reply`, async () => {
    const h = harness();
    if (type === 'message_new') {
      await h.bot.handleMessage({ message: { from_id: 42, peer_id: 42, text: '', payload: JSON.stringify(payload(action)) } }, 'event-1');
      assert.equal(h.answers.length, 0);
    } else {
      await h.bot.handleEvent({ user_id: 42, peer_id: 42, event_id: 'event-1', payload: payload(action) });
      assert.equal(h.answers.length, 1);
      assert.equal(JSON.parse(h.answers[0].event_data).type, 'show_snackbar');
    }
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].message, action === 'confirm_booking' ? text.confirmed : text.cancellationRequested);
  });
}

test('malformed payload and database failure produce a reply and acknowledge callback', async () => {
  const h = harness();
  await h.bot.handleEvent({ user_id: 42, peer_id: 42, event_id: 'bad', payload: '{bad' });
  assert.match(h.sent[0].message, /данные кнопки/); assert.equal(h.answers.length, 1);
  h.prisma.$transaction = async () => { throw new Error('offline'); };
  await h.bot.handleEvent({ user_id: 42, peer_id: 42, event_id: 'offline', payload: JSON.stringify(payload('confirm_booking')) });
  assert.match(h.sent[1].message, /Не удалось сохранить ответ/); assert.equal(h.answers.length, 2);
});

test('forwarded messages and group callbacks cannot act on a booking', async () => {
  const h = harness();
  await h.bot.handleMessage({ message: { from_id: 42, peer_id: 2000000001, text: '', payload: JSON.stringify(payload('cancel_booking')) } }, 'group');
  await assert.rejects(h.bot.handleEvent({ user_id: 42, peer_id: 2000000001, event_id: 'group', payload: payload('cancel_booking') }));
  assert.equal(h.updates.length, 0); assert.equal(h.sent.length, 0);
});

for (const kind of ['24h', '2h']) test(`${kind} outbox delivery attaches the inline keyboard`, async () => {
  const h = harness();
  const sent = [];
  const row = { id: 'notification', key: `reminder${kind}:${id}:${h.booking.startTime.toISOString()}:42`, peerId: 42n, message: 'Напоминание', attemptCount: 0 };
  const delivery = new VkNotifications({ booking: h.prisma.booking, vkNotification: {
    findMany: async () => [row], updateMany: async () => ({ count: 1 }), update: async () => {},
  } });
  delivery.vk = { api: { messages: { send: async args => sent.push(args) } } };
  await delivery.flush();
  assert.equal(sent.length, 1); assert.equal(sent[0].keyboard, reminderKeyboard(id));
});
