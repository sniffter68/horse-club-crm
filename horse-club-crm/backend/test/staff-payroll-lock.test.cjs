require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { StaffService, payrollDay } = require('../dist/staff/staff.service');
const admin = { id: randomUUID(), email: 'admin@test.local', role: 'ADMIN' };
const manager = { ...admin, role: 'MANAGER' };
const staffId = randomUUID();
const shift = date => ({ staffId, date, startTime: '08:00', endTime: '20:00' });

function store() {
  const state = { payrolls: [{ id: randomUUID(), staffId, isPaid: true, periodStart: payrollDay('2026-10-10'), periodEnd: payrollDay('2026-10-15'), expenseId: randomUUID(), totalAmount: '1000', createdAt: new Date() }], shifts: [], expenses: [], audit: [], fail: false };
  state.expenses.push({ id: state.payrolls[0].expenseId, category: 'SALARY', amount: '1000', createdById: admin.id, cancelledAt: null });
  const matching = where => state.payrolls.filter(row => (!where.staffId || row.staffId === where.staffId) && (where.isPaid === undefined || row.isPaid === where.isPaid) && (!where.periodStart || row.periodStart <= where.periodStart.lte) && (!where.periodEnd || row.periodEnd >= where.periodEnd.gte));
  const tx = {
    staffProfile: { findUnique: async () => ({ id: staffId, isActive: true }) },
    payrollCalculation: {
      findMany: async ({ where }) => matching(where), count: async ({ where }) => matching(where).length,
      findUnique: async ({ where }) => { const row = state.payrolls.find(row => row.id === where.id); return row && { ...row, expense: state.expenses.find(expense => expense.id === row.expenseId) }; },
      update: async ({ where, data }) => Object.assign(state.payrolls.find(row => row.id === where.id), data),
    },
    expense: { update: async ({ where, data }) => Object.assign(state.expenses.find(row => row.id === where.id), data) },
    cashAuditLog: { create: async ({ data }) => { state.audit.push({ ...data, createdAt: new Date() }); return data; } },
    workShift: {
      findUnique: async ({ where }) => state.shifts.find(row => row.id === where.id),
      createMany: async ({ data }) => { if (state.fail) throw new Error('write failed'); state.shifts.push(...data); },
      update: async ({ where, data }) => { assert.equal('force' in data, false); return Object.assign(state.shifts.find(row => row.id === where.id), data); },
    },
  };
  const service = new StaffService({ $transaction: async work => {
    const backup = structuredClone(state);
    try { return await work(tx); } catch (error) { Object.assign(state, backup); throw error; }
  } });
  return { service, state };
}

test('single and batch shifts outside a paid range succeed, including dates on either side and future dates', async () => {
  const { service, state } = store();
  await service.createShifts(shift('2026-10-09'), manager);
  await service.createShifts(shift('2026-10-16'), manager);
  await service.createShifts({ ...shift(undefined), dates: ['2026-10-08', '2026-10-17', '2099-01-01'] }, manager);
  assert.equal(state.shifts.length, 5);
});

test('both paid boundaries and interior dates block; foreign staff and drafts do not lock shifts', async () => {
  const { service, state } = store();
  for (const date of ['2026-10-10', '2026-10-12', '2026-10-15']) await assert.rejects(service.createShifts(shift(date), admin), error => error.status === 409);
  await assert.rejects(service.createShifts({ ...shift(undefined), dates: ['2026-10-09', '2026-10-12'] }, admin), error => error.status === 409);
  assert.equal(state.shifts.length, 0);
  await service.createShifts({ ...shift('2026-10-12'), staffId: randomUUID() }, manager);
  state.payrolls[0].isPaid = false;
  await service.createShifts(shift('2026-10-12'), manager);
  assert.equal(state.shifts.length, 2);
});

test('updates use their own shift date, irrespective of displayed month or current date', async () => {
  const { service, state } = store();
  for (const date of ['2026-10-09', '2026-10-10', '2026-10-15', '2026-10-16']) {
    state.shifts.push({ ...shift(payrollDay(date)), id: date });
    const operation = service.changeShift(date, { notes: 'edited' }, manager);
    if (['2026-10-10', '2026-10-15'].includes(date)) await assert.rejects(operation, error => error.status === 409);
    else assert.equal((await operation).notes, 'edited');
  }
});

test('ADMIN reopens payroll with financial audit; repeat is idempotent and dates unlock', async () => {
  const { service, state } = store();
  const id = state.payrolls[0].id;
  assert.throws(() => service.reopenPayroll(id, manager), error => error.status === 403);
  assert.equal((await service.payrolls({}, admin)).total, 1);
  assert.equal((await service.paidPeriods(staffId, admin)).length, 1);
  await service.reopenPayroll(id, admin);
  assert.equal(state.payrolls[0].isPaid, false); assert.equal(state.payrolls[0].expenseId, null);
  assert.equal(state.expenses.length, 1); assert.equal(state.expenses[0].cancelledById, admin.id);
  assert.ok(state.expenses[0].cancelledAt); assert.equal(state.audit[0].actorId, admin.id); assert.equal(state.audit[0].details.calculationId, id);
  await service.reopenPayroll(id, admin); assert.equal(state.audit.length, 1);
  assert.equal((await service.paidPeriods(staffId, admin)).length, 0);
  await service.createShifts(shift('2026-10-12'), manager);
  await assert.rejects(service.reopenPayroll(randomUUID(), admin), error => error.status === 404);
});

test('force is ADMIN-only and atomically reverses payroll; failed shift rolls back reversal and audit', async () => {
  const { service, state } = store();
  await assert.rejects(service.createShifts({ ...shift('2026-10-12'), force: true }, manager), error => error.status === 403);
  state.fail = true;
  await assert.rejects(service.createShifts({ ...shift('2026-10-12'), force: true }, admin), /write failed/);
  assert.equal(state.payrolls[0].isPaid, true); assert.equal(state.expenses[0].cancelledAt, null); assert.equal(state.audit.length, 0);
  state.fail = false;
  await service.createShifts({ ...shift('2026-10-12'), force: true }, admin);
  assert.equal(state.payrolls[0].isPaid, false); assert.equal(state.audit.length, 1);
  assert.equal('force' in state.shifts[0], false);
});

test('paid periods cannot be read for another employee', async () => {
  const { service } = store();
  await assert.rejects(service.paidPeriods(randomUUID(), { ...admin, role: 'TRAINER' }), error => error.status === 403);
});
