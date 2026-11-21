const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { TelegramLinkService } = require('../dist/modules/telegram-bot/telegram-link.service');
const { TmaBookingService } = require('../dist/modules/telegram-bot/tma-booking.service');
const { DEFAULT_LEAD_CONSENT_VERSION } = require('../dist/common/lead-consent');

function fixture(owner) {
  const writes = [];
  const client = { id: 'telegram-profile', telegramUserId: '123', telegramUsername: 'anna', deletedAt: null };
  const start = DateTime.now().setZone('Europe/Moscow').plus({ days: 2 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  const tx = {
    user: { findMany: async () => [] },
    client: { findUnique: async ({ where }) => {
      if (where.phone) { assert.equal(where.phone, '+79991234567'); return owner; }
      return client;
    },
      update: async input => { writes.push(input); return input.data; } },
    service: { findFirst: async () => ({ id: 'service', durationMinutes: 60 }) },
    trainer: { findFirst: async () => ({ id: 'trainer' }) },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
    booking: { findUnique: async () => null, update: async input => input },
  };
  const service = new TmaBookingService({ $transaction: async callback => callback(tx) }, {}, {
    createLesson: async (input, transaction) => {
      assert.equal(transaction, tx); writes.push(input); return { bookings: [{ id: 'booking' }] };
    },
  });
  const dto = { phone: '8 (999) 123-45-67', startTime: start.toISO(), serviceId: 'service', trainerId: 'trainer',
    requestId: 'request', consentAccepted: true, consentVersion: DEFAULT_LEAD_CONSENT_VERSION };
  return { service, client, dto, writes, tx };
}

test('typed phone cannot take over an existing CRM card, including unlinked or archived cards', async () => {
  for (const owner of [{ id: 'crm-client', telegramUserId: null }, { id: 'crm-client', telegramUserId: '456' },
    { id: 'crm-client', telegramUserId: null, deletedAt: new Date() }]) {
    const f = fixture(owner);
    await assert.rejects(f.service.create(f.client.id, f.dto), error => error.getStatus() === 400);
    assert.equal(f.writes.length, 0);
  }
});

test('verified own Telegram contact links the normalized phone in one audited transaction', async () => {
  const changes = [];
  const target = { id: 'target', telegramUserId: null, deletedAt: null };
  const tx = { client: {
    findUnique: async ({ where }) => { if (where.phone) { assert.equal(where.phone, '+79991234567'); return target; } return { id: 'temporary', phone: null }; },
    update: async input => changes.push(input),
  }, cashAuditLog: { create: async input => changes.push(input) } };
  const service = new TelegramLinkService({ $transaction: async (cb, options) => { assert.equal(options.isolationLevel, 'Serializable'); return cb(tx); } });
  assert.deepEqual(await service.bindOwnContact('123', '123', '8 (999) 123-45-67'), { linked: true });
  assert.equal(changes[0].data.telegramUserId, null);
  assert.equal(changes[1].where.id, 'target');
  assert.equal(changes[1].data.telegramUserId, '123');
  assert.equal(changes[2].data.action, 'CLIENT_TELEGRAM_PHONE_LINK');
  assert.equal(changes[2].data.actorId, 'target');
});

test('foreign contact and an already linked phone never change identity', async () => {
  let writes = 0;
  const tx = { client: { findUnique: async () => ({ id: 'target', telegramUserId: '456' }), update: async () => writes++ } };
  const service = new TelegramLinkService({ $transaction: cb => cb(tx) });
  await assert.rejects(service.bindOwnContact('123', '456', '+79991234567'), e => e.getStatus() === 403);
  await assert.rejects(service.bindOwnContact('123', '123', '+79991234567'), e => e.getStatus() === 409);
  assert.equal(writes, 0);
});
