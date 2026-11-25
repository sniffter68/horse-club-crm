require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { BookingLifecycleService } = require('../dist/bookings/booking-lifecycle.service');
const { VetCalendarService, vetStatus } = require('../dist/boarding/vet-calendar.service');
const { VetQueryDto, CreateVetEventDto } = require('../dist/boarding/boarding.dto');
const { StallsService } = require('../dist/stalls/stalls.service');

test('future membership cannot be consumed even with positive balance and a future expiry', async () => {
  let writes = 0;
  const tx = { $queryRaw: async strings => strings.join('').includes('CURRENT_TIMESTAMP') ? [{ now: new Date('2026-11-21') }] : [],
    membership: { findUnique: async () => ({ id: 'm', type: 'fixed_lessons', status: 'active', remainedLessons: 2,
      validFrom: new Date('2026-12-01'), validUntil: new Date('2027-01-01') }), updateMany: async () => { writes++; } },
    membershipOp: { findFirst: async () => null } };
  await assert.rejects(new MembershipLedgerService({ $transaction: work => work(tx) }).debitLesson('m', 'l', 'test'), /ещё не начался/);
  assert.equal(writes, 0);
});

for (const failAudit of [false, true]) test(`unlink completed lesson refunds atomically and preserves revenue; audit failure=${failAudit}`, async () => {
  const actor = { id: 'actor', email: 'qa@example.test', role: 'ADMIN' };
  const state = { balance: 0, ops: [{ id: 'debit', type: 'DEBIT', attendeeClientId: 'c' }], revenue: [], audit: [], payments: [],
    lesson: { id: 'l', status: 'COMPLETED', service: { price: new Prisma.Decimal(1500) }, startTime: new Date('2026-11-21T09:00Z'), bookings: [{ id: 'b', clientId: 'c',
      membershipId: 'm', payments: [], costAmount: new Prisma.Decimal(1500), prepaymentAmount: new Prisma.Decimal(0), finalPaymentAmount: new Prisma.Decimal(0) }] } };
  const tx = { lesson: { findUnique: async () => state.lesson, findUniqueOrThrow: async () => state.lesson,
    update: async ({ data }) => { Object.assign(state.lesson, data); } },
    membershipOp: { findFirst: async ({ where }) => state.ops.find(op => op.type === where.type) },
    booking: { update: async ({ data }) => { Object.assign(state.lesson.bookings[0], data); } },
    revenueRecognition: { aggregate: async ({ where }) => ({ _sum: { amount: new Prisma.Decimal(where.membershipId ? 1000 : 0) } }),
      create: async ({ data }) => { state.revenue.push(data); } },
    payment: { create: async ({ data }) => { state.payments.push(data); } },
    cashAuditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit unavailable'); state.audit.push(data); } } };
  const prisma = { $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const before = { ...state, lesson: { ...state.lesson, bookings: state.lesson.bookings.map(b => ({ ...b })) },
      ops: [...state.ops], revenue: [], audit: [], payments: [] };
    try { return await work(tx); } catch (e) { Object.assign(state, before); throw e; }
  } };
  const ledger = { refundLesson: async (m, l, reason, transaction, client) => {
    assert.equal(transaction, tx); assert.equal(client, 'c'); assert.equal(reason, 'Ошибка оплаты');
    state.balance++; state.ops.push({ type: 'REFUND' });
  } };
  const service = new LessonsService(prisma, ledger);
  if (failAudit) {
    await assert.rejects(service.unlinkMembership('l', 'b', 'Ошибка оплаты', actor), /audit unavailable/);
    assert.equal(state.balance, 0); assert.equal(state.lesson.bookings[0].membershipId, 'm'); assert.equal(state.revenue.length, 0);
  } else {
    await service.unlinkMembership('l', 'b', 'Ошибка оплаты', actor);
    await service.unlinkMembership('l', 'b', 'Ошибка оплаты', actor);
    assert.equal(state.balance, 1); assert.equal(state.lesson.bookings[0].membershipId, null);
    assert.equal(state.audit.length, 1); assert.equal(state.payments.length, 1);
    assert.deepEqual(state.revenue.map(r => [r.type, r.amount.toNumber(), r.createdById]), [
      ['UNLINK_MEMBERSHIP_REVERSAL', -1000, 'actor'], ['UNLINK_ONE_OFF_RECOGNITION', 1500, 'actor'] ]);
  }
});

test('club cancellation of completed standalone booking restores exact units once', async () => {
  const state = { booking: { id: 'b', status: 'completed', lessonId: null, membershipId: 'm', clientId: 'c' }, balance: 0, refunds: 0, audits: 0 };
  const tx = { clubNotificationSettings: { findUnique: async () => ({ trainerCancellation: false }) }, $queryRaw: async () => [], booking: { findUnique: async () => state.booking,
    update: async ({ data }) => Object.assign(state.booking, data) },
    membership: { findUnique: async () => ({ id: 'm', clientId: 'c', status: 'exhausted', validTo: new Date('2099-01-01') }),
      update: async ({ data }) => { state.balance += Number(data.remainingUnits.increment); } },
    ledgerTransaction: { findFirst: async ({ where }) => where.transactionType === 'refund' ? null : { amount: new Prisma.Decimal(-1) },
      create: async () => { state.refunds++; } }, cashAuditLog: { create: async () => { state.audits++; } } };
  const service = new BookingLifecycleService({ $transaction: work => work(tx) });
  await service.transition('b', 'cancel', { cancelledBy: 'club', reason: 'Ошибка отметки' }, 'actor');
  await service.transition('b', 'cancel', { cancelledBy: 'club', reason: 'Повтор' }, 'actor');
  assert.equal(state.balance, 1); assert.equal(state.refunds, 1); assert.equal(state.audits, 1);
  assert.equal(state.booking.status, 'cancelled_club');
});

test('assignment releases previous stall before occupying a new one in Serializable transaction', async () => {
  const stalls = [{ id: 's1', horseId: 'h', status: 'OCCUPIED' }, { id: 's2', horseId: null, status: 'AVAILABLE' }];
  const tx = { horse: { findUnique: async () => ({ id: 'h' }), update: async () => ({}) },
    stall: { findUnique: async ({ where }) => stalls.find(s => s.id === where.id),
      updateMany: async () => { Object.assign(stalls[0], { horseId: null, status: 'AVAILABLE' }); },
      update: async ({ where, data }) => {
        assert.equal(stalls.filter(s => s.horseId === data.horseId).length, 0);
        Object.assign(stalls.find(s => s.id === where.id), data);
      } } };
  const service = new StallsService({ $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(tx); },
    stall: { findUnique: async () => stalls[1], findMany: async () => stalls } });
  await service.assign('s2', 'h');
  assert.equal(stalls.filter(s => s.horseId === 'h').length, 1);
  assert.equal(stalls[0].status, 'AVAILABLE'); assert.equal(stalls[1].status, 'OCCUPIED');
});

test('vet statuses use Moscow midnight and completion has priority', () => {
  const now = new Date('2026-11-21T21:01Z'); // already Nov 22 in Moscow
  assert.equal(vetStatus({ status: 'scheduled', eventDate: new Date('2026-11-21T20:59Z') }, now), 'overdue');
  assert.equal(vetStatus({ status: 'scheduled', eventDate: new Date('2026-11-21T21:00Z') }, now), 'scheduled');
  assert.equal(vetStatus({ status: 'completed', eventDate: new Date('2020-01-01') }, now), 'completed');
});

test('vet status filters apply before SQL pagination and count; DTO normalizes empty filters', async () => {
  for (const status of ['overdue', 'scheduled', 'completed']) {
    const args = [];
    const service = new VetCalendarService({ $transaction: ops => Promise.all(ops), vetEvent: {
      findMany: async a => { args.push(a); return []; }, count: async a => { args.push(a); return 0; } } });
    await service.list({ status, offset: 20, limit: 20 });
    assert.deepEqual(args[0].where, args[1].where);
    assert.equal(args[0].skip, 20); assert.equal(args[0].take, 20);
    if (status === 'completed') assert.equal(args[0].where.status, 'completed');
    else { assert.deepEqual(args[0].where.status, { not: 'completed' }); assert.ok(args[0].where.AND[0].eventDate); }
  }
  const dto = plainToInstance(VetQueryDto, { horseId: '', status: '', type: '', offset: '20', limit: '10' });
  assert.equal((await validate(dto)).length, 0); assert.equal(dto.horseId, undefined); assert.equal(dto.offset, 20);
  assert.ok((await validate(plainToInstance(VetQueryDto, { status: 'INVALID' }))).length);
  assert.equal((await validate(plainToInstance(CreateVetEventDto, { horseId: '00000000-0000-4000-8000-000000000021',
    type: 'vaccination', eventDate: '2026-11-21T09:00:00Z', status: '' }))).length, 0);
});
