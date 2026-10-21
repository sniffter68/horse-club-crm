require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { BookingsService } = require('../dist/bookings/bookings.service');
const actor = { id: 'admin-id', role: 'ADMIN', email: 'admin@test.local' };

function fixture({ debited = false, refunded = false, paid = false, failDelete = false, membership = debited } = {}) {
  let state = {
    lesson: { id: 'lesson-1' },
    memberships: { 'membership-1': { id: 'membership-1', totalLessons: 8, remainedLessons: refunded || !debited ? 8 : 7 } },
    bookings: [{ id: 'booking-1', lessonId: 'lesson-1', membershipId: membership ? 'membership-1' : null,
      client: { id: 'client-1', name: 'Анна' }, legacyLessonBinding: true, status: 'scheduled' }],
    operations: [
      ...(debited ? [{ id: 'debit', membershipId: 'membership-1', lessonId: 'lesson-1', type: 'DEBIT', reason: 'Посещение' }] : []),
      ...(refunded ? [{ id: 'refund', membershipId: 'membership-1', lessonId: 'lesson-1', type: 'REFUND', reason: 'Отмена' }] : []),
    ],
    payments: [
      { id: 'pending', bookingId: 'booking-1', status: 'PENDING', amount: 1000 },
      ...(paid ? [{ id: 'receipt', bookingId: 'booking-1', status: 'PAID', amount: 500, cashierId: 'cashier', paidAt: '2026-10-21T09:00:00Z' }] : []),
    ],
    ledger: paid ? [{ id: 'purchase', bookingId: 'booking-1', cashDeskPaymentId: 'receipt', amount: 500, transactionType: 'purchase' }] : [],
    horseChanges: [{ bookingId: 'booking-1', reason: 'Замена лошади', actorId: 'trainer' }],
  };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const tx = {
    $queryRaw: async () => [],
    lesson: {
      findUnique: async ({ where }) => state.lesson?.id === where.id ? { ...state.lesson, bookings: state.bookings,
        operations: state.operations.filter(op => op.lessonId === where.id) } : null,
      delete: async () => {
        if (failDelete) throw new Error('Delete failed');
        assert.ok(state.bookings.every(b => b.lessonId === null));
        assert.ok(state.operations.every(op => op.lessonId === null));
        state.lesson = null;
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
    payment: { updateMany: async ({ where, data }) => {
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
    const before = structuredClone(state);
    try { return await operation(tx); } catch (error) { state = before; throw error; }
  } };
  const service = new LessonsService(prisma, new MembershipLedgerService(prisma));
  return { service, get state() { return state; } };
}

test('deletes a one-off lesson, cancels pending debt and preserves booking audit', async () => {
  const f = fixture();
  f.state.bookings[0].cancellationReason = 'Ранее согласованная отмена';
  const result = await f.service.deleteLesson('lesson-1', actor);
  assert.deepEqual(result, { success: true, message: 'Занятие успешно удалено' });
  assert.equal(f.state.lesson, null);
  assert.equal(f.state.payments[0].status, 'CANCELLED');
  assert.equal(f.state.bookings[0].lessonId, null);
  assert.equal(f.state.bookings[0].status, 'cancelled_club');
  assert.match(f.state.bookings[0].cancellationReason, /lesson-1.*admin-id/);
  assert.match(f.state.bookings[0].cancellationReason, /^Ранее согласованная отмена\n/);
  assert.equal(f.state.horseChanges[0].reason, 'Замена лошади');
});

test('refunds a debited membership using the real ledger and preserves DEBIT/REFUND audit', async () => {
  const f = fixture({ debited: true });
  // A group may contain the same membership more than once.
  f.state.bookings.push({ ...f.state.bookings[0], id: 'booking-2' });
  await f.service.deleteLesson('lesson-1', actor);
  assert.equal(f.state.memberships['membership-1'].remainedLessons, 8);
  assert.equal(f.state.operations.filter(op => op.type === 'REFUND').length, 1);
  assert.ok(f.state.operations.every(op => op.lessonId === null && /lesson-1.*admin-id/.test(op.reason)));
});

test('does not credit an unused membership or repeat an earlier refund', async () => {
  for (const options of [{ membership: true }, { debited: true, refunded: true }]) {
    const f = fixture(options);
    await f.service.deleteLesson('lesson-1', actor);
    assert.equal(f.state.memberships['membership-1'].remainedLessons, 8);
    assert.equal(f.state.operations.filter(op => op.type === 'REFUND').length, options.refunded ? 1 : 0);
  }
});

test('preserves paid receipts, cash ledger amounts, actor and timestamps', async () => {
  const f = fixture({ paid: true });
  const receipt = structuredClone(f.state.payments.find(p => p.status === 'PAID'));
  const ledger = structuredClone(f.state.ledger);
  await f.service.deleteLesson('lesson-1', actor);
  assert.deepEqual(f.state.payments.find(p => p.status === 'PAID'), receipt);
  assert.deepEqual(f.state.ledger, ledger);
  assert.equal(f.state.ledger[0].bookingId, f.state.bookings[0].id);
});

test('failure rolls back refund, pending debt, audit and booking detachment together', async () => {
  const f = fixture({ debited: true, paid: true, failDelete: true });
  const before = structuredClone(f.state);
  await assert.rejects(f.service.deleteLesson('lesson-1', actor), /Delete failed/);
  assert.deepEqual(f.state, before);
});

test('missing or repeatedly deleted lesson returns 404 without another refund', async () => {
  const f = fixture({ debited: true });
  await assert.rejects(f.service.deleteLesson('missing', actor), error => error.getStatus() === 404);
  await f.service.deleteLesson('lesson-1', actor);
  await assert.rejects(f.service.deleteLesson('lesson-1', actor), error => error.getStatus() === 404);
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
