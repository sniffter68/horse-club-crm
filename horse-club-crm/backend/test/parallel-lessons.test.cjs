const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { LessonsService } = require('../dist/lessons/lessons.service');

function fixture(maxCapacity = 1) {
  const rows = [];
  const horse = id => ({ id, name: id, status: 'active', healthStatus: 'HEALTHY', maxRiderWeight: 100,
    requiredRestMinutes: 45, maxDailyMinutes: 240, maxDailyWorkloadMinutes: 240 });
  const matches = (row, where) => (!where.trainerId || row.trainerId === where.trainerId)
    && (!where.bookings || row.bookings.some(b => b.horseId === where.bookings.some.horseId))
    && (!where.id || row.id !== where.id.not)
    && (!where.startTime || row.startTime < where.startTime.lt) && (!where.endTime || row.endTime > where.endTime.gt);
  const tx = {
    $queryRaw: async () => [],
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
    trainer: { findUnique: async () => ({ id: 'trainer', isActive: true }) },
    arena: { findUnique: async () => ({ id: 'arena', name: 'Манеж', isActive: true, capacity: 6, maxRidersCapacity: 6 }) },
    horse: { findMany: async ({ where }) => where.id.in.map(horse), findUnique: async ({ where }) => horse(where.id) },
    client: { findMany: async ({ where }) => where.id.in.map(id => ({ id, weightKg: null })) },
    booking: { findMany: async () => [] },
    service: { findUnique: async () => ({ durationMinutes: 60, maxCapacity, price: 1500, name: 'Индивидуальное', allowMembership: true }) },
    membership: { findUnique: async ({ where }) => ({ id: where.id, clientId: where.id === 'membership-1' ? 'client-1' : 'client-2',
      remainedLessons: 5, status: 'active', validUntil: new Date('2030-01-01') }) },
    lesson: {
      findFirst: async () => { throw new Error('Individual lessons must never merge'); },
      findMany: async ({ where }) => rows.filter(row => matches(row, where)),
      create: async ({ data }) => {
        const row = { ...data, id: `lesson-${rows.length}`, bookings: data.bookings.create };
        rows.push(row); return row;
      },
    },
  };
  return { rows, service: new LessonsService({ ...tx, $transaction: async work => work(tx) }, {}) };
}
const dto = { trainerId: 'trainer', arenaId: 'arena', serviceId: 'individual', startTime: '2026-10-27T07:00:00Z', clientId: 'client-1', horseId: 'horse-1' };

test('creates and lists two independent simultaneous lessons with separate prices', async () => {
  const { service, rows } = fixture();
  const first = await service.createLesson({ ...dto, cost: 1500 });
  const second = await service.createLesson({ ...dto, clientId: 'client-2', horseId: 'horse-2', cost: 2200 });
  assert.notEqual(first.id, second.id);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(l => l.bookings.length), [1, 1]);
  assert.deepEqual(rows.map(l => Number(l.cost)), [1500, 2200]);
  const listed = await service.findAll({ from: '2026-10-27T06:00:00Z', to: '2026-10-27T09:00:00Z' });
  assert.equal(listed.length, 2);
});

test('parallel riders retain their own memberships without merging bookings', async () => {
  const { service, rows } = fixture();
  await service.createLesson({ ...dto, membershipId: 'membership-1' });
  await service.createLesson({ ...dto, clientId: 'client-2', horseId: 'horse-2', membershipId: 'membership-2' });
  assert.deepEqual(rows.map(l => l.bookings.map(b => b.membershipId)), [['membership-1'], ['membership-2']]);
  assert.ok(rows.every(l => !l.bookings[0].payments));
});

for (const resource of ['horse', 'client']) test(`creating overlapping ${resource} is rejected without a second write`, async () => {
  const { service, rows } = fixture();
  await service.createLesson(dto);
  await assert.rejects(service.createLesson({ ...dto, horseId: resource === 'horse' ? 'horse-1' : 'horse-2',
    clientId: resource === 'client' ? 'client-1' : 'client-2' }), e => e.getStatus() === 409 && e.getResponse().code === (resource === 'horse' ? 'HORSE_BUSY' : 'CLIENT_BUSY'));
  assert.equal(rows.length, 1);
});

for (const capacity of [1, 3]) test(`three overlapping lessons remain independent with service capacity ${capacity}`, async () => {
  const { service, rows } = fixture(capacity);
  for (let i = 1; i <= 3; i++) {
    await service.createLesson({ ...dto, clientId: `client-${i}`, horseId: `horse-${i}`, cost: i * 1000 });
  }
  assert.equal(new Set(rows.map(row => row.id)).size, 3);
  assert.deepEqual(rows.map(row => row.bookings.map(b => b.clientId)), [['client-1'], ['client-2'], ['client-3']]);
  assert.deepEqual(rows.map(row => Number(row.cost)), [1000, 2000, 3000]);
  assert.ok(rows.every(row => row.status === 'SCHEDULED' && row.paymentStatus === 'UNPAID'));
  assert.deepEqual(rows.map(row => row.bookings[0].payments.create.clientId), ['client-1', 'client-2', 'client-3']);
});
