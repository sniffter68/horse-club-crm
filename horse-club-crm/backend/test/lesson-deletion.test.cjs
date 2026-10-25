require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { Prisma } = require('@prisma/client');
const actor = { id: 'admin-id', role: 'ADMIN', email: 'admin@test.local' };

function clone(value) {
  if (value instanceof Prisma.Decimal) return new Prisma.Decimal(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}
function fixture({ debited = false, refunded = false, paid = false, failDelete = false, membership = debited } = {}) {
  let state = {
    lesson: { id: 'lesson-1', status: 'SCHEDULED', startTime: new Date(), service: { allowMembership: false } },
    memberships: { 'membership-1': { id: 'membership-1', totalLessons: 8, remainedLessons: refunded || !debited ? 8 : 7 } },
    bookings: [{ id: 'booking-1', lessonId: 'lesson-1', membershipId: membership ? 'membership-1' : null,
      clientId: 'client-1', membership: membership ? { clientId: 'client-1' } : null, client: { id: 'client-1', name: 'Анна' }, legacyLessonBinding: true, status: 'scheduled' }],
    operations: [
      ...(debited ? [{ id: 'debit', membershipId: 'membership-1', lessonId: 'lesson-1', type: 'DEBIT', reason: 'Посещение' }] : []),
      ...(refunded ? [{ id: 'refund', membershipId: 'membership-1', lessonId: 'lesson-1', type: 'REFUND', reason: 'Отмена' }] : []),
    ],
    payments: [
      { id: 'pending', bookingId: 'booking-1', status: 'PENDING', amount: 1000 },
      ...(paid ? [{ id: 'receipt', bookingId: 'booking-1', status: 'PAID', method: 'CASH', amount: new Prisma.Decimal(500), cashierId: 'cashier', paidAt: '2026-10-21T09:00:00Z' }] : []),
    ],
    expenses: [], audits: [],
    ledger: paid ? [{ id: 'purchase', bookingId: 'booking-1', cashDeskPaymentId: 'receipt', amount: 500, transactionType: 'purchase' }] : [],
    horseChanges: [{ bookingId: 'booking-1', reason: 'Замена лошади', actorId: 'trainer' }],
  };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => (row[key] ?? null) === value);
  const tx = {
    $queryRaw: async () => [],
    lesson: {
      findUnique: async ({ where }) => state.lesson?.id === where.id ? { ...state.lesson, bookings: state.bookings,
        operations: state.operations.filter(op => op.lessonId === where.id) } : null,
      findUniqueOrThrow: async () => ({ ...state.lesson, bookings: state.bookings }),
      update: async ({ data }) => {
        if (failDelete) throw new Error('Delete failed');
        const { bookings, ...fields } = data;
        Object.assign(state.lesson, fields);
        if (bookings) for (const booking of state.bookings) Object.assign(booking, bookings.updateMany.data);
        return { ...state.lesson, bookings: state.bookings };
      },
    },
    membership: {
      findUnique: async ({ where }) => state.memberships[where.id],
      update: async ({ where, data }) => { state.memberships[where.id].remainedLessons += data.remainedLessons.increment; },
    },
    membershipOp: {
      findFirst: async ({ where }) => state.operations.find(op => matches(op, where)),
      findMany: async ({ where }) => state.operations.filter(op => matches(op, where)),
      create: async ({ data }) => { state.operations.push({ id: `op-${state.operations.length}`, ...data }); },
      update: async ({ where, data }) => { Object.assign(state.operations.find(op => op.id === where.id), data); },
    },
    cashShift: { findFirst: async () => null },
    expense: { create: async ({ data }) => { state.expenses.push(data); } },
    cashAuditLog: { create: async ({ data }) => { state.audits.push(data); } },
    payment: { findMany: async () => state.payments.filter(p => p.status === 'PAID' && !state.expenses.some(e => e.refundPaymentId === p.id)), updateMany: async ({ where, data }) => {
      for (const payment of state.payments) {
        const booking = state.bookings.find(b => b.id === payment.bookingId);
        if (payment.status === where.status && booking?.lessonId === where.booking.lessonId) Object.assign(payment, data);
      }
    } },
    booking: { updateMany: async ({ where, data }) => {
      for (const booking of state.bookings.filter(b => matches(b, where))) Object.assign(booking, data);
    } },
  };
  const prisma = { $transaction: async (operation, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const before = clone(state);
    try { return await operation(tx); } catch (error) { state = before; throw error; }
  } };
  const service = new LessonsService(prisma, new MembershipLedgerService(prisma));
  return { service, get state() { return state; } };
}

test('deletes a one-off lesson, cancels pending debt and soft-deletes and preserves booking audit', async () => {
  const f = fixture();
  f.state.bookings[0].cancellationReason = 'Ранее согласованная отмена';
  const result = await f.service.deleteLesson('lesson-1', actor, { refund: false });
  assert.deepEqual(result, { success: true, message: 'Занятие успешно удалено' });
  assert.equal(f.state.lesson.status, 'CANCELLED');
  assert.ok(f.state.lesson.deletedAt instanceof Date);
  assert.equal(f.state.payments[0].status, 'CANCELLED');
  assert.equal(f.state.bookings[0].lessonId, 'lesson-1');
  assert.equal(f.state.bookings[0].status, 'cancelled_club');
  assert.equal(f.state.audits.length, 1);
  assert.equal(f.state.horseChanges[0].reason, 'Замена лошади');
});

test('refunds a debited membership using the real ledger and preserves DEBIT/REFUND audit', async () => {
  const f = fixture({ debited: true });
  // A group may contain the same membership more than once.
  f.state.bookings.push({ ...f.state.bookings[0], id: 'booking-2' });
  await f.service.deleteLesson('lesson-1', actor, { refund: false });
  assert.equal(f.state.memberships['membership-1'].remainedLessons, 8);
  assert.equal(f.state.operations.filter(op => op.type === 'REFUND').length, 1);
  assert.ok(f.state.operations.every(op => op.lessonId === 'lesson-1'));
});

test('does not credit an unused membership or repeat an earlier refund', async () => {
  for (const options of [{ membership: true }, { debited: true, refunded: true }]) {
    const f = fixture(options);
    await f.service.deleteLesson('lesson-1', actor, { refund: false });
    assert.equal(f.state.memberships['membership-1'].remainedLessons, 8);
    assert.equal(f.state.operations.filter(op => op.type === 'REFUND').length, options.refunded ? 1 : 0);
  }
});

test('preserves paid receipts, cash ledger amounts, actor and timestamps', async () => {
  const f = fixture({ paid: true });
  const receipt = clone(f.state.payments.find(p => p.status === 'PAID'));
  const ledger = clone(f.state.ledger);
  await f.service.deleteLesson('lesson-1', actor, { refund: false });
  assert.deepEqual(f.state.payments.find(p => p.status === 'PAID'), receipt);
  assert.deepEqual(f.state.ledger, ledger);
  assert.equal(f.state.ledger[0].bookingId, f.state.bookings[0].id);
});

test('failure rolls back refund, pending debt, audit and booking detachment together', async () => {
  const f = fixture({ debited: true, paid: true, failDelete: true });
  const before = clone(f.state);
  await assert.rejects(f.service.deleteLesson('lesson-1', actor, { refund: false }), /Delete failed/);
  assert.deepEqual(f.state, before);
});

test('missing or repeatedly deleted lesson returns 404 without another refund', async () => {
  const f = fixture({ debited: true });
  await assert.rejects(f.service.deleteLesson('missing', actor), error => error.getStatus() === 404);
  await f.service.deleteLesson('lesson-1', actor, { refund: false });
  await f.service.deleteLesson('lesson-1', actor, { refund: false });
  assert.equal(f.state.audits.length, 1);
  assert.equal(f.state.memberships['membership-1'].remainedLessons, 8);
});

test('resource calendar excludes detached legacy bookings in count and data queries', async () => {
  const queries = [];
  const prisma = { booking: {
    count: async args => { queries.push(args); return 0; },
    findMany: async args => { queries.push(args); return []; },
  }, $transaction: async operations => Promise.all(operations) };
  const result = await new BookingsService(prisma).findAll({ from: '2026-10-21T00:00:00Z', to: '2026-10-22T00:00:00Z' });
  assert.equal(result.total, 0);
  assert.ok(queries.every(q => q.where.lessonId === null && q.where.legacyLessonBinding === false));
});

test('cash refund decreases club balance exactly once and preserves original receipt', async () => {
  const f = fixture({ paid: true });
  await f.service.deleteLesson('lesson-1', actor, { refund: true, reason: 'Client request' });
  assert.equal(f.state.expenses.length, 1);
  assert.equal(f.state.expenses[0].amount.toString(), '500');
  assert.equal(f.state.expenses[0].paymentMethod, 'CASH');
  assert.equal(f.state.expenses[0].refundPaymentId, 'receipt');
  assert.equal(f.state.payments[1].status, 'PAID');
  assert.equal(f.state.payments[1].amount.minus(f.state.expenses[0].amount).toString(), '0');
  await f.service.deleteLesson('lesson-1', actor, { refund: true });
  assert.equal(f.state.expenses.length, 1);
});
test('refund and financial audit roll back when cancellation fails', async () => {
  const f = fixture({ paid: true, failDelete: true });
  await assert.rejects(f.service.deleteLesson('lesson-1', actor, { refund: true }), /Delete failed/);
  assert.equal(f.state.expenses.length, 0);
  assert.equal(f.state.audits.length, 0);
  assert.equal(f.state.lesson.status, 'SCHEDULED');
  assert.equal(f.state.payments[0].status, 'PENDING');
});
test('paid cancellation requires an explicit financial decision', async () => {
  const f = fixture({ paid: true });
  await assert.rejects(f.service.deleteLesson('lesson-1', actor), e => e.getStatus() === 400);
  assert.equal(f.state.lesson.status, 'SCHEDULED');
});

test('cancellation restores a debited visit for a former participant too', async () => {
  const f = fixture({ debited: true });
  f.state.bookings[0].membershipId = null;
  f.state.bookings[0].membership = null;
  await f.service.deleteLesson('lesson-1', actor, { refund: false });
  assert.equal(f.state.memberships['membership-1'].remainedLessons, 8);
  assert.equal(f.state.operations.filter(op => op.type === 'REFUND').length, 1);
});
