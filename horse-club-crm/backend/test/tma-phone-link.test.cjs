const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { TmaBookingService } = require('../dist/modules/telegram-bot/tma-booking.service');
const { DEFAULT_LEAD_CONSENT_VERSION } = require('../dist/common/lead-consent');

function fixture(owner) {
  const writes = [];
  const client = { id: 'telegram-profile', telegramUserId: '123', telegramUsername: 'anna', deletedAt: null };
  const start = DateTime.now().setZone('Europe/Moscow').plus({ days: 2 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  const tx = {
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

test('TMA normalizes phone, releases unique Telegram ID and books with existing unlinked CRM card', async () => {
  const f = fixture({ id: 'crm-client', telegramUserId: null });
  await f.service.create(f.client.id, f.dto);
  assert.deepEqual(f.writes[0], { where: { id: f.client.id }, data: { telegramUserId: null, telegramUsername: null } });
  assert.deepEqual(f.writes[1], { where: { id: 'crm-client' }, data: { telegramUserId: '123', telegramUsername: 'anna' } });
  assert.deepEqual(f.writes[2].participants, [{ clientId: 'crm-client' }]);
});

test('TMA accepts own phone and fills the Telegram profile when phone has no owner', async () => {
  for (const owner of [null, { id: 'telegram-profile', telegramUserId: '123' }]) {
    const f = fixture(owner); await f.service.create(f.client.id, f.dto);
    assert.deepEqual(f.writes[0], { where: { id: f.client.id }, data: { phone: '+79991234567' } });
    assert.deepEqual(f.writes[1].participants, [{ clientId: f.client.id }]);
  }
});

test('TMA rejects another Telegram account on active and archived CRM cards without mutations', async () => {
  for (const deletedAt of [null, new Date()]) {
    const owner = { id: 'crm-client', telegramUserId: '456', deletedAt };
    const f = fixture(owner);
    await assert.rejects(f.service.create(f.client.id, f.dto), error => error.getStatus() === 400 && /Обратитесь в клуб/.test(error.message));
    assert.equal(f.writes.length, 0);
  }
});

test('TMA restores an unlinked archived phone owner and creates a booking in the same transaction', async () => {
  for (const name of [undefined, '   ', '  Новое имя  ']) {
    const f = fixture({ id: 'crm-client', telegramUserId: null, deletedAt: new Date(), name: 'Прежнее имя' });
    const result = await f.service.create(f.client.id, { ...f.dto, name });
    assert.deepEqual(f.writes[0], { where: { id: f.client.id }, data: { telegramUserId: null, telegramUsername: null } });
    assert.deepEqual(f.writes[1], { where: { id: 'crm-client' }, data: {
      telegramUserId: '123', telegramUsername: 'anna', deletedAt: null, name: name?.trim() || 'Прежнее имя',
    } });
    assert.deepEqual(f.writes[2].participants, [{ clientId: 'crm-client' }]);
    assert.equal(result.where.id, 'booking');
    assert.equal(result.data.telegramRequestId, f.dto.requestId);
  }
});

test('TMA restores its own archived Telegram profile only when the normalized phone matches', async () => {
  const f = fixture({ id: 'telegram-profile', telegramUserId: '123', deletedAt: new Date(), name: 'Анна' });
  f.client.deletedAt = new Date();
  await f.service.create(f.client.id, f.dto);
  assert.deepEqual(f.writes[0], { where: { id: f.client.id }, data: {
    phone: '+79991234567', deletedAt: null, telegramUserId: '123', name: 'Анна',
  } });
  assert.deepEqual(f.writes[1].participants, [{ clientId: f.client.id }]);
  const mismatch = fixture(null); mismatch.client.deletedAt = new Date();
  await assert.rejects(mismatch.service.create(mismatch.client.id, mismatch.dto), error => error.getStatus() === 400);
  assert.equal(mismatch.writes.length, 0);
});

test('TMA logs restoration only after the booking transaction succeeds', async t => {
  const f = fixture({ id: 'crm-client', telegramUserId: null, deletedAt: new Date(), name: 'Анна' });
  const log = t.mock.method(f.service.logger, 'log', () => {});
  f.tx.booking.update = async () => { throw new Error('booking write failed'); };
  await assert.rejects(f.service.create(f.client.id, f.dto), /booking write failed/);
  assert.equal(log.mock.calls.length, 0);
  f.tx.booking.update = async input => input;
  await f.service.create(f.client.id, f.dto);
  assert.equal(log.mock.calls.length, 1);
  assert.equal(log.mock.calls[0].arguments[0], '[TMA Booking] Client crm-client automatically restored from archive');
});
