const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { BookingRulesService } = require('../dist/bookings/booking-rules.service');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { Prisma } = require('@prisma/client');
const rules = new BookingRulesService();
const at = time => new Date(`2026-10-09T${time}:00Z`);
function fixture({ horse = {}, client = {}, arena = {}, trainer = {}, bookings = [], lessons = [] } = {}) {
  const locks = [], writes = [];
  const tx = {
    $queryRaw: async sql => { locks.push({ query: sql.text, values: sql.values }); return []; },
    horse: { findMany: async () => [{ id: 'horse', status: 'active', isUnavailable: false, maxRiderWeight: 85, maxDailyWorkloadMinutes: 120, requiredRestMinutes: 45, ...horse }] },
    client: { findMany: async () => [{ id: 'client', weightKg: null, ...client }] },
    trainer: { findUnique: async () => ({ id: 'trainer', isActive: true, ...trainer }) },
    arena: { findUnique: async () => ({ id: 'arena', isActive: true, isUnavailable: false, maxRidersCapacity: 2, ...arena }) },
    booking: { findMany: async () => bookings, create: async ({ data }) => { writes.push(data); return { id: 'new', ...data }; } },
    lesson: { findMany: async () => lessons },
    membership: { findUnique: async () => ({ clientId: 'client' }) },
  };
  const input = { trainerId: 'trainer', arenaId: 'arena', participants: [{ clientId: 'client', horseId: 'horse' }], start: at('10:00'), end: at('10:30') };
  const booking = { horseId: 'horse', trainerId: 'other-trainer', arenaId: 'other-arena', startTime: at('08:00'), endTime: at('08:30') };
  return { tx, input, booking, locks, writes };
}
const failure = code => error => error.getStatus() === 409 && error.getResponse().code === code;

test('client DTO accepts nullable measured weight and rejects invalid measurements', async () => {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const { CreateClientDto } = require('../dist/clients/dto/create-client.dto');
  for (const weightKg of [null, 85.25]) assert.equal((await validate(plainToInstance(CreateClientDto, { name: 'QA', weightKg }))).length, 0);
  for (const weightKg of [0, -1, 1000, 85.001, 'bad', Infinity]) assert.ok((await validate(plainToInstance(CreateClientDto, { name: 'QA', weightKg }))).length > 0);
});

test('successful booking validates and inserts inside a serializable interactive transaction after row locks', async () => {
  const { tx, locks, writes } = fixture();
  const service = new BookingsService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    return work(tx);
  } }, rules);
  const result = await service.createBooking({ clientId: 'client', trainerId: 'trainer', horseId: 'horse', arenaId: 'arena', startTime: at('10:00').toISOString(), endTime: at('10:30').toISOString(), serviceType: 'dressage', costAmount: 1234.56 });
  assert.equal(result.status, 'scheduled'); assert.equal(writes.length, 1);
  assert.equal(String(result.costAmount), '1234.56');
  assert.equal(locks.length, 4);
  assert.deepEqual(locks.map(l => l.values[0]), ['arena', 'horse', 'trainer', 'client']);
  for (const lock of locks) assert.match(lock.query, /FOR UPDATE/);
});
test('rejects rider weight, but accepts the exact horse limit and unknown weight', async () => {
  for (const weightKg of [null, 85]) { const f = fixture({ client: { weightKg } }); await rules.validate(f.tx, f.input); }
  const f = fixture({ client: { weightKg: 85.01 } });
  await assert.rejects(rules.validate(f.tx, f.input), failure('RIDER_WEIGHT_EXCEEDED'));
});
test('rejects unavailable horses, trainers and arenas', async () => {
  for (const status of ['rest', 'sick', 'quarantine']) { const f = fixture({ horse: { status } }); await assert.rejects(rules.validate(f.tx, f.input), failure('HORSE_UNAVAILABLE')); }
  for (const [config, code] of [[{ trainer: { isActive: false } }, 'TRAINER_UNAVAILABLE'], [{ arena: { isActive: false } }, 'ARENA_UNAVAILABLE']]) {
    const f = fixture(config); await assert.rejects(rules.validate(f.tx, f.input), failure(code));
  }
});
test('daily workload accepts the exact limit and rejects one minute above it', async () => {
  const base = fixture().booking;
  for (const [minutes, rejects] of [[90, false], [91, true]]) {
    const f = fixture({ bookings: [{ ...base, startTime: at('07:00'), endTime: new Date(+at('07:00') + minutes * 60000) }] });
    if (rejects) await assert.rejects(rules.validate(f.tx, f.input), failure('HORSE_OVERLOADED'));
    else await rules.validate(f.tx, f.input);
  }
});
test('rest accepts exactly 45 minutes and rejects a one-second deficit on either side', async () => {
  const base = fixture().booking;
  for (const [startTime, endTime, rejects] of [[at('08:45'), at('09:15'), false], [at('08:45'), new Date(+at('09:15') + 1000), true], [new Date(+at('11:15') - 1000), at('11:45'), true]]) {
    const f = fixture({ bookings: [{ ...base, startTime, endTime }] });
    if (rejects) await assert.rejects(rules.validate(f.tx, f.input), failure('HORSE_REST_VIOLATION'));
    else await rules.validate(f.tx, f.input);
  }
});
test('trainer overlap rejects, adjacent intervals pass', async () => {
  const base = fixture().booking;
  for (const [startTime, rejects] of [[at('10:29'), true], [at('10:30'), false]]) {
    const f = fixture({ bookings: [{ ...base, trainerId: 'trainer', horseId: 'other', startTime, endTime: at('11:00') }] });
    if (rejects) await assert.rejects(rules.validate(f.tx, f.input), failure('TRAINER_BUSY'));
    else await rules.validate(f.tx, f.input);
  }
});
test('arena uses simultaneous peak occupancy, not the total number of intersecting records', async () => {
  const base = { ...fixture().booking, horseId: 'other', arenaId: 'arena' };
  const bookings = [{ ...base, startTime: at('10:00'), endTime: at('10:15') }, { ...base, startTime: at('10:15'), endTime: at('10:30') }];
  const f = fixture({ bookings }); await rules.validate(f.tx, f.input);
  const full = fixture({ bookings: [...bookings, { ...base, startTime: at('10:00'), endTime: at('10:30') }] });
  await assert.rejects(rules.validate(full.tx, full.input), failure('ARENA_FULL'));
});
test('club day clips cross-midnight workload, including the following day', async () => {
  const f = fixture({ horse: { maxDailyWorkloadMinutes: 60 }, bookings: [{ ...fixture().booking, startTime: new Date('2026-10-09T20:00Z'), endTime: new Date('2026-10-09T20:40Z') }] });
  f.input.start = new Date('2026-10-09T20:50Z'); f.input.end = new Date('2026-10-09T21:30Z');
  f.tx.horse.findMany = async () => [{ id: 'horse', status: 'active', maxRiderWeight: 85, maxDailyWorkloadMinutes: 60, requiredRestMinutes: 0 }];
  await rules.validate(f.tx, f.input); // 50 minutes before local midnight, 30 after.
  f.input.end = new Date('2026-10-09T22:10Z');
  await assert.rejects(rules.validate(f.tx, f.input), failure('HORSE_OVERLOADED'));
});
test('legacy lessons use current lesson times and group riders without counting copied bookings twice', async () => {
  const f = fixture({ lessons: [{ trainerId: 'other', arenaId: 'arena', startTime: at('10:00'), endTime: at('11:00'), bookings: [{ horseId: 'a' }, { horseId: 'b' }] }] });
  await assert.rejects(rules.validate(f.tx, f.input), failure('ARENA_FULL'));
});
test('serialization retry revalidates and returns a typed contention error after five attempts', async () => {
  let count = 0;
  const service = new BookingsService({ $transaction: async () => { count++; throw { code: 'P2034' }; } }, rules);
  await assert.rejects(service.createBooking({ ...fixture().booking, clientId: 'client', trainerId: 'trainer', arenaId: 'arena', startTime: at('10:00').toISOString(), endTime: at('10:30').toISOString(), serviceType: 'dressage', costAmount: 0 }), failure('BOOKING_CONTENTION'));
  assert.equal(count, 5);
});
test('invalid intervals and costs never start a transaction', async () => {
  const service = new BookingsService({ $transaction: () => { throw new Error('must not transact'); } }, rules);
  for (const patch of [{ endTime: at('09:00').toISOString() }, { costAmount: -1 }, { costAmount: 0.001 }, { startTime: '2026-10-09T10:00:00' }]) {
    await assert.rejects(service.createBooking({ clientId: 'client', trainerId: 'trainer', horseId: 'horse', arenaId: 'arena', startTime: at('10:00').toISOString(), endTime: at('10:30').toISOString(), serviceType: 'dressage', costAmount: 0, ...patch }), error => error.getStatus() === 400);
  }
});

test('horse replacement validates future scheduled booking and only writes horse and reason', async () => {
  const f = fixture({ client: { weightKg: 75 } });
  const startTime = new Date('2030-10-09T10:00:00Z'), endTime = new Date('2030-10-09T10:30:00Z');
  let saved;
  const current = { id: 'b', lesson: null, lessonId: null, status: 'scheduled', clientId: 'client', horseId: 'old', trainerId: 'trainer', arenaId: 'arena', startTime, endTime };
  f.tx.booking.findUnique = async () => current;
  f.tx.booking.update = async args => { saved = args; return { ...current, ...args.data }; };
  const service = new BookingsService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); return work(f.tx);
  } }, rules);
  await service.replaceHorse('b', 'horse', ' Хромота ');
  assert.deepEqual(saved, { where: { id: 'b' }, data: { horseId: 'horse', horseChangeReason: 'Хромота' } });
  saved = null; current.status = 'completed';
  await assert.rejects(service.replaceHorse('b', 'horse'), failure('BOOKING_NOT_UPCOMING'));
  assert.equal(saved, null);
  current.status = 'scheduled'; current.startTime = new Date(0);
  await assert.rejects(service.replaceHorse('b', 'horse'), failure('BOOKING_NOT_UPCOMING'));
});

test('horse replacement rejects unavailable horse and unknown rider weight without writes', async () => {
  for (const [config, code] of [[{ horse: { status: 'sick' }, client: { weightKg: 75 } }, 'HORSE_NOT_ACTIVE'], [{}, 'RIDER_WEIGHT_REQUIRED']]) {
    const f = fixture(config);
    f.tx.booking.findUnique = async () => ({ id: 'b', lesson: null, status: 'scheduled', clientId: 'client', trainerId: 'trainer', arenaId: 'arena', startTime: new Date('2030-10-09T10:00Z'), endTime: new Date('2030-10-09T10:30Z') });
    f.tx.booking.update = async () => assert.fail('invalid replacement was saved');
    await assert.rejects(new BookingsService({ $transaction: async work => work(f.tx) }, rules).replaceHorse('b', 'horse'), failure(code));
  }
});

test('legacy replacement excludes its lesson and validates all participants without duplicate horse assignments', async () => {
  let input, data;
  const lesson = { id: 'l', status: 'SCHEDULED', trainerId: 'trainer', arenaId: 'arena', startTime: new Date('2030-10-09T10:00Z'), endTime: new Date('2030-10-09T10:30Z'),
    bookings: [{ id: 'b', clientId: 'c1', horseId: 'old' }, { id: 'b2', clientId: 'c2', horseId: 'h2' }] };
  const tx = { booking: { findUnique: async () => ({ id: 'b', lesson }), update: async args => { data = args.data; } } };
  const service = new BookingsService({ $transaction: async work => work(tx) }, { validate: async (_tx, value) => { input = value; } });
  await service.replaceHorse('b', 'new');
  assert.equal(input.excludeLessonId, 'l');
  assert.equal(input.excludeBookingId, 'b');
  assert.deepEqual(input.participants, [{ clientId: 'c1', horseId: 'new' }, { clientId: 'c2', horseId: 'h2' }]);
  assert.deepEqual(data, { horseId: 'new', horseChangeReason: null });
  await assert.rejects(service.replaceHorse('b', 'h2'), failure('HORSE_REST_VIOLATION'));
});
