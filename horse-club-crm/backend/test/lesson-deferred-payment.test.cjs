const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { LessonsController } = require('../dist/lessons/lessons.controller');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { BookingRulesService } = require('../dist/bookings/booking-rules.service');
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const actor = { id: id(1), role: 'ADMIN', email: 'qa@test.local' };

function harness({ status = 'SCHEDULED', membership = {}, lesson = {}, failRevenue = false } = {}) {
  let state = {
    lesson: { id: id(2), trainerId: id(5), serviceId: id(6), startTime: new Date('2026-11-02T09:00:00Z'), endTime: new Date('2026-11-02T10:00:00Z'),
      status, paymentStatus: 'UNPAID', cost: '1500', prepaymentAmount: '0', finalPaymentAmount: '0', service: { allowMembership: true }, trainer: {},
      bookings: [{ id: id(3), clientId: id(4), client: { id: id(4), name: 'Client' }, membershipId: null, membership: null,
        horseId: null, horse: null, isPaid: false, costAmount: '1500', prepaymentAmount: '0', finalPaymentAmount: '0', payments: [] }], ...lesson },
    membership: { id: id(7), clientId: id(4), type: 'fixed_lessons', status: 'active', remainedLessons: 4, validUntil: new Date('2099-01-01'), ...membership },
    operations: [], revenueCalls: 0, pendingCancelled: false,
  };
  let serial = Promise.resolve();
  const prisma = { $transaction: (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const result = serial.then(async () => {
      const draft = structuredClone(state);
      const details = () => ({ ...draft.lesson, operations: draft.operations, bookings: draft.lesson.bookings.map(b => ({ ...b, membership: b.membershipId ? draft.membership : null })) });
      const tx = {
        $queryRaw: async sql => {
          const query = sql.join('');
          if (query.includes('CURRENT_TIMESTAMP')) return [{ now: new Date() }];
          if (query.includes('post_late_membership_revenue')) {
            if (failRevenue) throw new Error('recognition failed');
            draft.revenueCalls++;
          }
          return [];
        },
        lesson: { findUnique: async () => details(), findUniqueOrThrow: async () => details(), update: async ({ data }) => { Object.assign(draft.lesson, data); return details(); } },
        booking: { update: async ({ data }) => Object.assign(draft.lesson.bookings[0], data) },
        membership: { findUnique: async () => draft.membership, updateMany: async () => { draft.membership.remainedLessons--; return { count: 1 }; } },
        membershipOp: { findFirst: async () => draft.operations.find(o => o.type === 'DEBIT'), create: async ({ data }) => { draft.operations.push(data); return data; } },
        payment: { updateMany: async () => { draft.pendingCancelled = true; return { count: 1 }; } },
      };
      const output = await work(tx); state = draft; return output;
    });
    serial = result.catch(() => {}); return result;
  } };
  return { service: new LessonsService(prisma, new MembershipLedgerService(prisma)), state: () => state };
}

for (const status of ['SCHEDULED', 'COMPLETED']) test(`membership settles ${status} lesson atomically and consumes exactly one visit`, async () => {
  const h = harness({ status });
  const result = await h.service.payWithMembership(id(2), id(7), actor);
  assert.equal(result.paymentStatus, 'PAID_BY_MEMBERSHIP');
  assert.equal(result.bookings[0].membershipId, id(7));
  assert.equal(result.bookings[0].isPaid, true);
  assert.equal(h.state().membership.remainedLessons, 3);
  assert.equal(h.state().operations.length, 1);
  assert.equal(h.state().operations[0].attendeeClientId, id(4));
  assert.equal(h.state().pendingCancelled, true);
  assert.equal(h.state().revenueCalls, status === 'COMPLETED' ? 1 : 0);
  if (status === 'SCHEDULED') {
    const completed = await h.service.updateLessonStatus(id(2), 'COMPLETED', {}, actor);
    assert.equal(completed.paymentStatus, 'PAID_BY_MEMBERSHIP');
    assert.equal(h.state().membership.remainedLessons, 3);
    assert.equal(h.state().operations.length, 1);
  }
});

test('concurrent membership payment consumes one visit; repeat is rejected', async () => {
  const h = harness();
  const results = await Promise.allSettled([h.service.payWithMembership(id(2), id(7), actor), h.service.payWithMembership(id(2), id(7), actor)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(h.state().membership.remainedLessons, 3);
});

for (const membership of [{ clientId: id(99) }, { status: 'frozen' }, { remainedLessons: 0 }, { type: 'deposit' }, { deletedAt: new Date() }, { validUntil: new Date('2020-01-01') }, { serviceId: id(99) }]) {
  test(`unavailable membership ${JSON.stringify(membership)} leaves lesson and balance intact`, async () => {
    const h = harness({ membership });
    await assert.rejects(h.service.payWithMembership(id(2), id(7), actor));
    assert.equal(h.state().lesson.paymentStatus, 'UNPAID');
    assert.equal(h.state().operations.length, 0);
  });
}

for (const lesson of [{ paymentStatus: 'PAID' }, { paymentStatus: 'PARTIALLY_PAID' }, { status: 'CANCELLED' }, { deletedAt: new Date() }]) {
  test(`ineligible lesson ${JSON.stringify(lesson)} rejects membership payment`, async () => {
    const h = harness({ lesson });
    await assert.rejects(h.service.payWithMembership(id(2), id(7), actor));
    assert.equal(h.state().membership.remainedLessons, 4);
  });
}

test('revenue failure rolls back debit, booking linkage and pending cancellation', async () => {
  const h = harness({ status: 'COMPLETED', failRevenue: true });
  await assert.rejects(h.service.payWithMembership(id(2), id(7), actor), /recognition failed/);
  assert.equal(h.state().membership.remainedLessons, 4);
  assert.equal(h.state().lesson.bookings[0].membershipId, null);
  assert.equal(h.state().pendingCancelled, false);
  assert.equal(h.state().operations.length, 0);
});

test('shared lesson rules check trainer occupancy even without a horse', async () => {
  const rules = new BookingRulesService();
  const tx = {
    $queryRaw: async () => [], trainer: { findUnique: async () => ({ isActive: true, maxParallelLessons: 1 }) },
    horse: { findMany: async ({ where }) => { assert.deepEqual(where.id.in, []); return []; } },
    client: { findMany: async () => [{ id: id(4) }] },
    booking: { findMany: async () => [{ trainerId: id(5), clientId: id(99), startTime: new Date('2026-11-02T09:00Z'), endTime: new Date('2026-11-02T10:00Z') }] },
    lesson: { findMany: async () => [] },
  };
  await assert.rejects(rules.validate(tx, { trainerId: id(5), participants: [{ clientId: id(4) }],
    start: new Date('2026-11-02T09:30Z'), end: new Date('2026-11-02T10:30Z') }), error => error.getResponse().code === 'TRAINER_BUSY');
});

test('HTTP creates individual lessons without horse, accepts empty/null horse and validates membership UUID', async () => {
  let created;
  const tx = {
    service: { findUnique: async () => ({ price: 1500, durationMinutes: 60, maxCapacity: 1, name: 'Training' }) },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
    lesson: { findMany: async () => [], create: async ({ data }) => { created = data; return { ...data, id: id(2), trainer: {}, bookings: [] }; } },
  };
  const service = new LessonsService({ $transaction: async work => work(tx) }, {}, { validate: async input => input });
  const module = await Test.createTestingModule({ controllers: [LessonsController], providers: [{ provide: LessonsService, useValue: service }] })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: context => { context.switchToHttp().getRequest().user = actor; return true; } })
    .overrideGuard(RolesGuard).useValue({ canActivate: () => true }).overrideGuard(ModuleAccessGuard).useValue({ canActivate: () => true }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    for (const horseId of [undefined, '', null]) {
      await request(app.getHttpServer()).post('/api/lessons').send({ trainerId: id(5), serviceId: id(6), clientId: id(4), horseId, startTime: '2026-11-02T09:00Z' }).expect(201);
      assert.equal(created.bookings.create[0].horseId, undefined);
      assert.equal(created.paymentStatus, 'UNPAID');
    }
    await request(app.getHttpServer()).post(`/api/lessons/${id(2)}/pay-with-membership`).send({ membershipId: '' }).expect(400);
  } finally { await app.close(); }
});
