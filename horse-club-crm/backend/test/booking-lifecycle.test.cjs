const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { cancellationStatus, bookingCharge } = require('../dist/bookings/booking-lifecycle.service');

test('cancellation boundary is inclusive at exactly 12 hours, with no rounding', () => {
  const now = new Date('2026-10-09T00:00:00Z');
  assert.equal(cancellationStatus(new Date(+now + 12 * 3600000), now), 'cancelled_client');
  assert.equal(cancellationStatus(new Date(+now + 12 * 3600000 - 1), now), 'penalty_cancellation');
  assert.equal(cancellationStatus(new Date(+now - 1), now), 'penalty_cancellation');
});
test('fixed units and decimal deposits have separate billing denominations', () => {
  assert.equal(bookingCharge('fixed_lessons', new Prisma.Decimal('1500.75')).toString(), '1');
  assert.equal(bookingCharge('deposit', new Prisma.Decimal('1500.75')).negated().toString(), '-1500.75');
});
