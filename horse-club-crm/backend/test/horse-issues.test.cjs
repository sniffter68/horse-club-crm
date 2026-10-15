require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { BookingValidationError } = require('../dist/bookings/booking-validation.error');
const actor = { id: 'admin', email: 'admin@test.local', role: 'ADMIN' };

function harness({ group = false, status = 'scheduled' } = {}) {
  const updates = [], inputs = [];
  const booking = { id: 'b1', clientId: 'c1', horseId: 'old', trainerId: 't1', arenaId: 'a1', status,
    startTime: new Date('2030-10-09T07:00:00Z'), endTime: new Date('2030-10-09T08:00:00Z'), lesson: null };
  if (group) booking.lesson = { id: 'l1', trainerId: 't1', arenaId: 'a1', status: 'SCHEDULED',
    startTime: booking.startTime, endTime: booking.endTime, bookings: [{ id: 'b1', horseId: 'old', clientId: 'c1' }, { id: 'b2', horseId: 'sick', clientId: 'c2' }] };
  const tx = { bookingHorseChange: { create: async () => ({}) }, booking: { findUnique: async () => booking, update: async args => { updates.push(args); return args.data; } },
    horse: { findMany: async () => [{ id: 'free' }, { id: 'busy' }, { id: 'heavy' }] } };
  const service = new BookingsService({ $transaction: async fn => fn(tx) }, { validate: async (_tx, input) => {
    inputs.push(input);
    const id = input.participants[0].horseId;
    if (id === 'busy') throw new BookingValidationError('HORSE_REST_VIOLATION', 'rest');
    if (id === 'heavy') throw new BookingValidationError('RIDER_WEIGHT_EXCEEDED', 'weight');
  } });
  return { service, booking, updates, inputs };
}
test('replacement preview excludes rest and weight conflicts and performs no writes', async () => {
  const h = harness();
  assert.deepEqual(await h.service.availableHorses('b1', actor), [{ id: 'free' }]);
  assert.equal(h.updates.length, 0);
  assert.ok(h.inputs.every(i => i.lockResources === false && i.excludeBookingId === 'b1'));
});
test('group replacement repairs one rider even if another horse is sick, preserving capacity', async () => {
  const h = harness({ group: true });
  await h.service.replaceHorse('b1', 'free', '  replacement  ', actor);
  assert.deepEqual(h.inputs[0].participants, [{ clientId: 'c1', horseId: 'free' }]);
  assert.equal(h.inputs[0].existingRiders, 1);
  assert.equal(h.inputs[0].excludeLessonId, 'l1');
  assert.notEqual(h.inputs[0].lockResources, false);
  assert.deepEqual(h.updates, [{ where: { id: 'b1' }, data: { horseId: 'free', horseChangeReason: 'replacement' } }]);
});
test('group replacement rejects a horse already assigned to another rider', async () => {
  const h = harness({ group: true });
  await assert.rejects(h.service.replaceHorse('b1', 'sick', undefined, actor), e => e.getResponse().code === 'HORSE_REST_VIOLATION');
  assert.equal(h.updates.length, 0);
});
test('preview and replacement reject terminal bookings', async () => {
  const h = harness({ status: 'completed' });
  for (const action of [() => h.service.availableHorses('b1', actor), () => h.service.replaceHorse('b1', 'free', undefined, actor)]) {
    await assert.rejects(action(), e => e.getResponse().code === 'BOOKING_NOT_UPCOMING');
  }
});
test('problem feed filters future scheduled records of both sources, includes unavailable status and paginates', async () => {
  let where;
  const service = new BookingsService({ booking: {
    count: async args => { where = args.where; return 11; },
    findMany: async args => {
      assert.equal(args.skip, 10); assert.equal(args.take, 10);
      return [{ id: 'b1', horseId: 'h1', horse: { name: 'Horse' }, client: { id: 'c1' }, startTime: 'old', endTime: 'old', lesson: { startTime: 'future', endTime: 'end' } }];
    },
  }, $transaction: async queries => Promise.all(queries) }, {});
  const result = await service.horseIssues({ _start: 10, _end: 20 });
  assert.equal(result.total, 11); assert.equal(result.data[0].startTime, 'future');
  assert.deepEqual(where.horse.OR, [{ status: { not: 'active' } }, { isUnavailable: true }]);
  assert.equal(where.OR[0].status, 'scheduled'); assert.equal(where.OR[1].lesson.status, 'SCHEDULED');
  assert.ok(where.OR[0].startTime.gt instanceof Date);
  await service.horseIssues({ horseId: 'h1', _start: 10, _end: 20 });
  assert.equal(where.horseId, 'h1'); assert.equal(where.horse, undefined);
});
