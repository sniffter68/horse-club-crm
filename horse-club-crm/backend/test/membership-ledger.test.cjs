const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { Prisma } = require('@prisma/client');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');

function createPrisma({
  balance = 2,
  validUntil = new Date('2030-01-01T00:00:00.000Z'),
  lessonStatus = 'COMPLETED',
  membershipId = 'membership-1',
  initialOps = [],
} = {}) {
  const state = {
    membership: { id: membershipId, remainedLessons: balance, validUntil },
    booking: { id: 'booking-1', membershipId, lessonId: 'lesson-1', attended: false,
      lesson: { status: lessonStatus } },
    ops: [...initialOps],
    transactionOptions: [],
  };
  const tx = {
    $queryRaw: async (strings) => strings.join(' ').includes('CURRENT_TIMESTAMP')
      ? [{ now: new Date('2027-01-01T00:00:00.000Z') }]
      : [{ lock: null }],
    membership: {
      findUnique: async ({ where }) => where.id === state.membership?.id
        ? { ...state.membership }
        : null,
      updateMany: async ({ where }) => {
        const eligible = state.membership?.id === where.id &&
          state.membership.remainedLessons > where.remainedLessons.gt &&
          state.membership.validUntil >= where.validUntil.gte;
        if (eligible) state.membership.remainedLessons -= 1;
        return { count: eligible ? 1 : 0 };
      },
      update: async ({ where, data }) => {
        if (where.id !== state.membership?.id) throw new Error('missing membership');
        state.membership.remainedLessons += data.remainedLessons.increment;
        return { ...state.membership };
      },
    },
    membershipOp: {
      findFirst: async ({ where }) => state.ops.find((op) =>
        op.membershipId === where.membershipId && op.lessonId === where.lessonId &&
        op.type === where.type) ?? null,
      create: async ({ data }) => {
        const op = { id: `op-${state.ops.length + 1}`, ...data };
        state.ops.push(op);
        return op;
      },
    },
    booking: {
      findUnique: async ({ where }) => where.id === state.booking?.id
        ? { id: state.booking.id, membershipId: state.booking.membershipId,
          lessonId: state.booking.lessonId, lesson: { ...state.booking.lesson } }
        : null,
      update: async ({ where, data }) => {
        if (where.id !== state.booking?.id) throw new Error('missing booking');
        state.booking.attended = data.attended;
        return { ...state.booking };
      },
    },
  };
  const prisma = {
    $transaction: async (operation, options) => {
      state.transactionOptions.push(options);
      return operation(tx);
    },
  };
  return { prisma, state };
}

const isStatus = (status, message) => (error) =>
  error.getStatus() === status && (!message || error.message === message);

test('debit atomically decrements once and writes one DEBIT', async () => {
  const { prisma, state } = createPrisma({ balance: 1 });
  const ledger = new MembershipLedgerService(prisma);
  await ledger.debitLesson('membership-1', 'lesson-1', '  attendance  ');
  assert.equal(state.membership.remainedLessons, 0);
  assert.deepEqual(state.ops.map(({ type, amount, reason }) => ({ type, amount, reason })), [
    { type: 'DEBIT', amount: 1, reason: 'attendance' },
  ]);
  assert.equal(state.transactionOptions[0].isolationLevel, 'Serializable');
  await assert.rejects(
    ledger.debitLesson('membership-1', 'lesson-1', 'again'),
    isStatus(409, 'Занятие уже списано с абонемента'),
  );
  assert.equal(state.membership.remainedLessons, 0);
  assert.equal(state.ops.length, 1);
});

test('debit rejects empty, exhausted and expired memberships', async () => {
  const empty = createPrisma({ balance: 0 });
  await assert.rejects(
    new MembershipLedgerService(empty.prisma).debitLesson('membership-1', 'lesson-1', 'visit'),
    isStatus(409, 'На абонементе не осталось занятий'),
  );
  const expired = createPrisma({ validUntil: new Date('2026-12-31T23:59:59.999Z') });
  await assert.rejects(
    new MembershipLedgerService(expired.prisma).debitLesson('membership-1', 'lesson-1', 'visit'),
    isStatus(409, 'Срок действия абонемента истёк'),
  );
  await assert.rejects(
    new MembershipLedgerService(empty.prisma).debitLesson('membership-1', 'lesson-2', '   '),
    isStatus(400, 'Причина операции обязательна'),
  );
});

test('refund requires a DEBIT and cannot be applied twice', async () => {
  const noDebit = createPrisma({ balance: 1 });
  await assert.rejects(
    new MembershipLedgerService(noDebit.prisma).refundLesson('membership-1', 'lesson-1', 'cancel'),
    isStatus(409, 'Нельзя вернуть занятие без предыдущего списания'),
  );

  const { prisma, state } = createPrisma({ balance: 0, initialOps: [
    { id: 'op-1', membershipId: 'membership-1', lessonId: 'lesson-1', type: 'DEBIT', amount: 1 },
  ] });
  const ledger = new MembershipLedgerService(prisma);
  await ledger.refundLesson('membership-1', 'lesson-1', 'club cancellation');
  assert.equal(state.membership.remainedLessons, 1);
  assert.equal(state.ops.filter((op) => op.type === 'REFUND').length, 1);
  await assert.rejects(
    ledger.refundLesson('membership-1', 'lesson-1', 'again'),
    isStatus(409, 'Занятие уже возвращено на абонемент'),
  );
  assert.equal(state.membership.remainedLessons, 1);
});

test('markAttendance is idempotent for attended, NO_SHOW and CANCELLED outcomes', async () => {
  const attended = createPrisma({ balance: 2 });
  const attendedLedger = new MembershipLedgerService(attended.prisma);
  await attendedLedger.markAttendance('booking-1', true);
  await attendedLedger.markAttendance('booking-1', true);
  assert.equal(attended.state.booking.attended, true);
  assert.equal(attended.state.membership.remainedLessons, 1);
  assert.equal(attended.state.ops.filter((op) => op.type === 'DEBIT').length, 1);

  const noShow = createPrisma({ balance: 2, lessonStatus: 'NO_SHOW' });
  await new MembershipLedgerService(noShow.prisma).markAttendance('booking-1', false);
  assert.equal(noShow.state.membership.remainedLessons, 1);
  assert.equal(noShow.state.ops[0].reason, 'Неявка на занятие');

  const cancelled = createPrisma({ balance: 0, lessonStatus: 'CANCELLED', initialOps: [
    { id: 'op-1', membershipId: 'membership-1', lessonId: 'lesson-1', type: 'DEBIT', amount: 1 },
  ] });
  const cancelledLedger = new MembershipLedgerService(cancelled.prisma);
  await cancelledLedger.markAttendance('booking-1', false);
  await cancelledLedger.markAttendance('booking-1', false);
  assert.equal(cancelled.state.membership.remainedLessons, 1);
  assert.equal(cancelled.state.ops.filter((op) => op.type === 'REFUND').length, 1);
});

test('composite P2002 becomes 409 and is never retried as P2034', async () => {
  let attempts = 0;
  const duplicate = new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    {
      code: 'P2002',
      clientVersion: Prisma.prismaVersion.client,
      meta: { target: ['membershipId', 'lessonId', 'type'] },
    },
  );
  const prisma = {
    $transaction: async () => {
      attempts += 1;
      throw duplicate;
    },
  };
  const ledger = new MembershipLedgerService(prisma);

  await assert.rejects(
    ledger.debitLesson('membership-1', 'lesson-1', 'attendance'),
    isStatus(
      409,
      'Операция данного типа для этого занятия уже зафиксирована в абонементе',
    ),
  );
  assert.equal(attempts, 1);
});
