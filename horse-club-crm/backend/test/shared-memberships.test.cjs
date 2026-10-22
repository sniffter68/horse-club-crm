const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { MembershipsService } = require('../dist/memberships/memberships.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { BookingLifecycleService } = require('../dist/bookings/booking-lifecycle.service');
const { ClientsService } = require('../dist/clients/clients.service');

function fixture() {
  let state = {
    membership: { id: 'membership', clientId: 'mother', type: 'fixed_lessons', status: 'active',
      remainedLessons: 8, remainingUnits: new Prisma.Decimal(8), validFrom: new Date('2020-01-01'),
      validTo: new Date('2099-01-01'), validUntil: new Date('2099-01-01'), allowedDisciplines: [] },
    members: [], ops: [], ledger: [],
    booking: { id: 'booking', clientId: 'daughter', membershipId: 'membership', status: 'scheduled',
      lessonId: null, trainerId: 'trainer', serviceType: 'dressage', costAmount: new Prisma.Decimal(2000) },
  };
  const tx = {
    $queryRaw: async () => [{ now: new Date('2026-10-23') }],
    client: { findUnique: async ({ where }) => ({ id: where.id }) },
    membership: {
      findUnique: async () => state.membership,
      updateMany: async () => { state.membership.remainedLessons--; return { count: 1 }; },
      update: async ({ data }) => {
        if (data.remainingUnits) state.membership.remainingUnits = state.membership.remainingUnits.minus(data.remainingUnits.decrement);
        if (data.remainedLessons) state.membership.remainedLessons += data.remainedLessons.increment;
        return state.membership;
      },
    },
    membershipMember: {
      findUnique: async ({ where }) => state.members.find(m => m.clientId === where.membershipId_clientId.clientId) ?? null,
      create: async ({ data }) => { const member = { ...data, client: { id: data.clientId, name: data.clientId } }; state.members.push(member); return member; },
      deleteMany: async ({ where }) => { state.members = state.members.filter(m => m.clientId !== where.clientId); return { count: 1 }; },
    },
    membershipOp: {
      findFirst: async ({ where }) => state.ops.find(op => Object.entries(where).every(([key, value]) => (op[key] ?? null) === value)),
      create: async ({ data }) => { state.ops.push(data); return data; },
    },
    booking: {
      findUnique: async () => state.booking,
      update: async ({ data }) => Object.assign(state.booking, data),
    },
    payment: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
    ledgerTransaction: { create: async ({ data }) => { state.ledger.push(data); return data; } },
  };
  const prisma = { $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const before = { ...state, membership: { ...state.membership }, booking: { ...state.booking }, members: [...state.members], ops: [...state.ops], ledger: [...state.ledger] };
    try { return await fn(tx); } catch (error) { state = before; throw error; }
  } };
  const service = new MembershipsService(prisma);
  return { service, prisma, tx, get state() { return state; } };
}
const actor = { id: 'admin', role: 'ADMIN' };

test('adds beneficiary with actor, rejects owner and duplicate, revokes idempotently', async () => {
  const f = fixture();
  await f.service.addMember('membership', 'daughter', actor);
  assert.equal(f.state.members[0].createdById, 'admin');
  assert.equal(f.state.membership.clientId, 'mother');
  await assert.rejects(f.service.addMember('membership', 'mother', actor), { status: 400 });
  await assert.rejects(f.service.addMember('membership', 'daughter', actor), { status: 409 });
  await f.service.removeMember('membership', 'daughter');
  await f.service.removeMember('membership', 'daughter');
  assert.equal(f.state.members.length, 0);
});

test('inactive, exhausted, archived, future and expired memberships cannot gain members', async () => {
  for (const patch of [{ status: 'frozen' }, { remainingUnits: new Prisma.Decimal(0) }, { deletedAt: new Date() }, { validFrom: new Date('2099-01-01') }, { validTo: new Date('2000-01-01') }]) {
    const f = fixture(); Object.assign(f.state.membership, patch);
    await assert.rejects(f.service.addMember('membership', 'daughter', actor), { status: 409 });
    assert.equal(f.state.members.length, 0);
  }
  const f = fixture(); f.tx.client.findUnique = async () => ({ deletedAt: new Date() });
  await assert.rejects(f.service.addMember('membership', 'daughter', actor), { status: 400 });
});

test('legacy family attendance charges both riders once, audits attendee and purchaser, refunds separately', async () => {
  const f = fixture(); await f.service.addMember('membership', 'daughter', actor);
  const ledger = new MembershipLedgerService(f.prisma);
  await ledger.debitLesson('membership', 'lesson', 'Mother attendance', undefined, 'mother');
  await ledger.debitLesson('membership', 'lesson', 'Daughter attendance', undefined, 'daughter');
  assert.equal(f.state.membership.remainedLessons, 6);
  assert.deepEqual(f.state.ops.map(op => [op.attendeeClientId, op.ownerClientId]), [['mother', 'mother'], ['daughter', 'mother']]);
  await assert.rejects(ledger.debitLesson('membership', 'lesson', 'Duplicate', undefined, 'daughter'), { status: 409 });
  await ledger.refundLesson('membership', 'lesson', 'Cancel daughter', undefined, 'daughter');
  assert.equal(f.state.membership.remainedLessons, 7);
  await assert.rejects(ledger.refundLesson('membership', 'lesson', 'Duplicate refund', undefined, 'daughter'), { status: 409 });
});

test('legacy ledger refuses strangers and revoked beneficiaries without balance or journal writes', async () => {
  const f = fixture(); const ledger = new MembershipLedgerService(f.prisma);
  await assert.rejects(ledger.debitLesson('membership', 'lesson', 'Stranger', undefined, 'stranger'), { status: 403 });
  await f.service.addMember('membership', 'daughter', actor);
  await f.service.removeMember('membership', 'daughter');
  await assert.rejects(ledger.debitLesson('membership', 'lesson', 'Revoked', undefined, 'daughter'), { status: 403 });
  assert.equal(f.state.membership.remainedLessons, 8); assert.equal(f.state.ops.length, 0);
});

test('standalone booking charges a beneficiary and records owner, attendee and booking atomically and once', async () => {
  const f = fixture(); await f.service.addMember('membership', 'daughter', actor);
  const lifecycle = new BookingLifecycleService(f.prisma);
  await lifecycle.transition('booking', 'complete');
  await lifecycle.transition('booking', 'complete');
  assert.equal(f.state.membership.remainingUnits.toString(), '7');
  assert.equal(f.state.ledger.length, 1);
  assert.equal(f.state.ledger[0].clientId, 'daughter');
  assert.equal(f.state.ledger[0].ownerClientId, 'mother');
  assert.equal(f.state.ledger[0].bookingId, 'booking');
});

test('standalone booking refuses a stranger and rolls back a failed audit', async () => {
  const f = fixture();
  await assert.rejects(new BookingLifecycleService(f.prisma).transition('booking', 'complete'), e => e.response.code === 'MEMBERSHIP_INVALID');
  await f.service.addMember('membership', 'daughter', actor);
  f.tx.ledgerTransaction.create = async () => { throw new Error('Audit failed'); };
  await assert.rejects(new BookingLifecycleService(f.prisma).transition('booking', 'complete'), /Audit failed/);
  assert.equal(f.state.membership.remainingUnits.toString(), '8');
  assert.equal(f.state.booking.status, 'scheduled');
});

test('client details combine owned and active shared memberships with owner labels', async () => {
  const active = { id: 'family', clientId: 'mother', client: { name: 'Елена Смирнова' }, status: 'active', remainingUnits: new Prisma.Decimal(4), remainedLessons: 4,
    validFrom: new Date('2020-01-01'), validTo: new Date('2099-01-01'), validUntil: new Date('2099-01-01') };
  const prisma = { client: { findUnique: async () => ({ id: 'daughter', memberships: [], sharedMemberships: [
    { membership: active }, { membership: { ...active, id: 'expired', validTo: new Date('2000-01-01') } },
  ] }) } };
  const result = await new ClientsService(prisma).findOne('daughter');
  assert.equal(result.memberships.length, 1);
  assert.equal(result.memberships[0].isShared, true);
  assert.equal(result.memberships[0].ownerName, 'Елена Смирнова');
});
