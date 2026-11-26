require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { StaffService } = require('../dist/staff/staff.service');
const { CreateShiftDto } = require('../dist/staff/staff.dto');
const staffId = '11111111-1111-4111-8111-111111111111';
const user = { id: staffId, role: 'MANAGER' };
const days = [{ date: '2026-11-23', kind: 'WORK', startTime: '09:00', endTime: '18:00' }, { date: '2026-11-24', kind: 'VACATION', startTime: '09:00', endTime: '18:00' }];

test('weekly DTO accepts heterogeneous days and rejects invalid nested values and batch size', async () => {
  assert.equal((await validate(plainToInstance(CreateShiftDto, { staffId, days }))).length, 0);
  for (const invalid of [[{ ...days[0], kind: 'WRONG' }], [{ ...days[0], startTime: '24:00' }], Array(8).fill(days[0]), []]) assert.ok((await validate(plainToInstance(CreateShiftDto, { staffId, days: invalid }))).length);
});

function fixture(existing = null, paid = false, trainerPaid = false) {
  let writes = [];
  const tx = { staffProfile: { findUnique: async () => ({ isActive: true }) }, payrollCalculation: { findMany: async () => paid ? [{}] : [] }, trainerPayout: { findFirst: async () => trainerPaid ? {} : null }, workShift: { findUnique: async () => existing, upsert: async args => { writes.push(args); } } };
  const service = new StaffService({ $transaction: async work => { try { return await work(tx); } catch (error) { writes = []; throw error; } } });
  return { service, writes: () => writes };
}

test('weekly plan commits work and leave together using existing payroll-safe status', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.createShifts({ staffId, days }, user), { count: 2 });
  assert.equal(f.writes()[0].create.status, 'SCHEDULED');
  assert.equal(f.writes()[1].create.status, 'ABSENT');
  assert.equal(f.writes()[1].create.notes, '[plan:VACATION]');
  assert.equal(f.writes()[1].create.createdById, user.id);
});

test('weekly changes reject paid, started, completed, sick and unplanned absence records', async () => {
  for (const existing of [{ startedAt: new Date() }, { status: 'COMPLETED' }, { status: 'SICK' }, { status: 'ABSENT' }]) {
    const f = fixture(existing);
    await assert.rejects(() => f.service.createShifts({ staffId, days }, user), error => error.status === 409);
    assert.equal(f.writes().length, 0);
  }
  for (const f of [fixture(null, true), fixture(null, false, true)]) await assert.rejects(() => f.service.createShifts({ staffId, days }, user), error => error.status === 409);
  const f = fixture();
  assert.throws(() => f.service.createShifts({ staffId, days: [days[0], days[0]] }, user), error => error.status === 400);
  assert.throws(() => f.service.createShifts({ staffId, days }, { ...user, role: 'TRAINER' }), error => error.status === 403);
});

test('applying leave and restoring work retains the employee comment', async () => {
  const leave = fixture({ status: 'SCHEDULED', notes: 'Передать ключи' });
  await leave.service.createShifts({ staffId, days: [days[1]] }, user);
  assert.equal(leave.writes()[0].update.notes, '[plan:VACATION]\nПередать ключи');
  const work = fixture({ status: 'ABSENT', notes: '[plan:VACATION]\nПередать ключи' });
  await work.service.createShifts({ staffId, days: [days[0]] }, user);
  assert.equal(work.writes()[0].update.notes, 'Передать ключи');
});
