const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { TmaBookingService } = require('../dist/modules/telegram-bot/tma-booking.service');

test('dashboard distinguishes automatic Telegram cards from profiles, history and expired/shared packages', async () => {
  for (const fields of [{}, { phone: '+79991234567' }, { _count: { bookings: 1 } }, { _count: { memberships: 1 } }, { _count: { sharedMemberships: 1 } }]) {
    const service = new TmaBookingService({
      client: { findUniqueOrThrow: async args => { assert.deepEqual(args.where, { id: 'owner' }); return { _count: { bookings: 0 }, ...fields }; } },
      membership: { findFirst: async () => null },
      booking: { findFirst: async args => {
        assert.equal(args.where.clientId, 'owner');
        assert.equal(args.where.status, 'scheduled');
        assert.deepEqual(args.orderBy, [{ startTime: 'asc' }, { id: 'asc' }]);
        assert.equal(args.where.OR[1].lesson.deletedAt, null);
        assert.equal(args.where.OR[1].lesson.status, 'SCHEDULED');
        assert.ok(args.where.OR[1].lesson.startTime.gt instanceof Date);
        return null;
      } },
    }, {}, {});
    const result = await service.dashboard('owner');
    assert.equal(result.isEstablished, Object.keys(fields).length > 0);
    assert.equal(result.nextBooking, null);
    assert.equal(result.membership, null);
  }
});
