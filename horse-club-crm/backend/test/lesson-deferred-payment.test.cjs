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

function harness({ status = 'SCHEDULED', membership = {}, lesson = {}, failRevenue = false, shared = false, additionalMemberships = [] } = {}) {
  let state = {
    lesson: { id: id(2), trainerId: id(5), serviceId: id(6), startTime: new Date('2026-11-02T09:00:00Z'), endTime: new Date('2026-11-02T10:00:00Z'),
      status, paymentStatus: 'UNPAID', cost: '1500', prepaymentAmount: '0', finalPaymentAmount: '0', service: { allowMembership: true }, trainer: {},
      bookings: [{ id: id(3), clientId: id(4), client: { id: id(4), name: 'Client' }, membershipId: null, membership: null,
        horseId: null, horse: null, isPaid: false, costAmount: '1500', prepaymentAmount: '0', finalPaymentAmount: '0', payments: [] }], ...lesson },
    membership: { id: id(7), clientId: id(4), type: 'fixed_lessons', status: 'active', deletedAt: null, remainedLessons: 4, validFrom: new Date('2020-01-01'), validUntil: new Date('2099-01-01'), ...membership },
    additionalMemberships, operations: [], revenueCalls: 0, pendingCancelled: false, audit: [],
    payments: [{ bookingId: id(3), status: 'PENDING' }, { bookingId: id(3), status: 'PENDING' }, { bookingId: id(99), status: 'PENDING' }],
  };
  let serial = Promise.resolve();
  const prisma = { $transaction: (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const result = serial.then(async () => {
      const draft = structuredClone(state);
      const details = () => ({ ...draft.lesson, operations: draft.operations, bookings: draft.lesson.bookings.map(b => ({ ...b, membership: b.membershipId ? draft.membership : null })) });
      const tx = { cashAuditLog: { create: async ({ data }) => { draft.audit.push(data); return data; } },
        user: { findMany: async () => [] },
        clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
        membershipMember: { findUnique: async () => shared ? { client: { deletedAt: null } } : null },
        $queryRaw: async (sql, ...values) => {
          const query = sql.join('');
          if (query.includes('CURRENT_TIMESTAMP')) return [{ now: new Date() }];
          if (query.includes('post_late_membership_revenue')) {
            if (failRevenue) throw new Error('recognition failed');
            assert.deepEqual(values, [draft.lesson.bookings[0].id, draft.lesson.startTime, draft.lesson.bookings[0].membershipId, actor.id]);
            draft.revenueCalls++;
          }
          return [];
        },
        lesson: { findMany: async () => [], findUnique: async () => details(), findUniqueOrThrow: async () => details(), update: async ({ data }) => { Object.assign(draft.lesson, data); return details(); } },
        booking: { count: async () => draft.lesson.bookings.filter(b => b.isPaid).length,
          updateMany: async ({ data }) => { draft.lesson.bookings.forEach(b => Object.assign(b, data)); return { count: 1 }; },
          update: async ({ data }) => Object.assign(draft.lesson.bookings[0], data) },
        membership: { findUnique: async ({ where }) => [draft.membership, ...draft.additionalMemberships].find(row => row.id === where.id),
          updateMany: async ({ where }) => {
            const row = [draft.membership, ...draft.additionalMemberships].find(row => row.id === where.id);
            assert.ok(row.validFrom <= where.validFrom.lte && row.validUntil >= where.validUntil.gte);
            row.remainedLessons--; return { count: 1 };
          } },
        membershipOp: { findFirst: async () => draft.operations.find(o => o.type === 'DEBIT'), create: async ({ data }) => { draft.operations.push(data); return data; } },
        payment: { updateMany: async ({ where, data }) => {
          assert.deepEqual(where, { bookingId: id(3), status: 'PENDING' });
          assert.deepEqual(data, { status: 'CANCELLED' });
          const rows = draft.payments.filter(row => row.bookingId === where.bookingId && row.status === where.status);
          rows.forEach(row => Object.assign(row, data));
          draft.pendingCancelled = true; return { count: rows.length };
        } },
      };
      const output = await work(tx); state = draft; return output;
    });
    serial = result.catch(() => {}); return result;
  } };
  return { service: new LessonsService(prisma, new MembershipLedgerService(prisma), { validate: async () => {} }), state: () => state };
}

test('replacement before membership debit uses current trainer and locks replacement after debit', async () => {
  const h = harness();
  await h.service.changeTrainer(id(2), id(9), actor);
  const paid = await h.service.payWithMembership(id(2), id(7), actor);
  assert.equal(paid.trainerId, id(9));
  assert.equal(paid.bookings[0].trainerId, id(9));
  assert.equal(h.state().operations.length, 1);
  assert.equal(h.state().audit.at(-1).action, 'LESSON_PAID_BY_MEMBERSHIP');
  await assert.rejects(h.service.changeTrainer(id(2), id(5), actor), error => error.getStatus() === 400);
});

test('a reserved membership with zero lesson cost does not lock trainer before debit', async () => {
  const h = harness({ lesson: { paymentStatus: 'PAID', cost: '0' } });
  h.state().lesson.bookings[0].membershipId = id(7);
  const moved = await h.service.changeTrainer(id(2), id(9), actor);
  assert.equal(moved.trainerId, id(9));
  assert.equal(h.state().operations.length, 0);
});

for (const shared of [false, true]) test(`yesterday's completed debt accepts today's ${shared ? 'family' : 'owned'} membership`, async () => {
  const now = Date.now();
  const h = harness({ status: 'COMPLETED', shared,
    lesson: { startTime: new Date(now - 86400000), endTime: new Date(now - 82800000) },
    membership: { validFrom: new Date(now - 60000), clientId: shared ? id(99) : id(4), serviceId: id(6) } });
  const result = await h.service.payWithMembership(id(2), id(7), actor);
  assert.equal(result.paymentStatus, 'PAID_BY_MEMBERSHIP');
  assert.equal(result.bookings[0].isPaid, true);
  assert.equal(h.state().membership.remainedLessons, 3);
  assert.equal(h.state().operations.length, 1);
  assert.equal(h.state().pendingCancelled, true);
  assert.deepEqual(h.state().payments.map(row => row.status), ['CANCELLED', 'CANCELLED', 'PENDING']);
  assert.equal(h.state().revenueCalls, 1);
  assert.equal(h.state().audit[0].actorId, actor.id);
  assert.equal(h.state().audit[0].details.deferredPayment, true);
  assert.match(h.state().audit[0].details.reason, /Отложенная оплата/);
});

test('manual selection debits the requested membership when several are available', async () => {
  const h = harness({ status: 'COMPLETED', additionalMemberships: [{ id: id(8), clientId: id(4), type: 'fixed_lessons', status: 'active',
    deletedAt: null, remainedLessons: 8, validFrom: new Date(Date.now() - 60000), validUntil: new Date('2099-01-01') }] });
  const result = await h.service.payWithMembership(id(2), id(8), actor);
  assert.equal(result.bookings[0].membershipId, id(8));
  assert.equal(h.state().membership.remainedLessons, 4);
  assert.equal(h.state().additionalMemberships[0].remainedLessons, 7);
  assert.equal(h.state().operations[0].membershipId, id(8));
});

test('future lesson still requires membership coverage through its end', async () => {
  const now = Date.now();
  const h = harness({ lesson: { startTime: new Date(now + 86400000), endTime: new Date(now + 90000000) },
    membership: { validUntil: new Date(now + 3600000) } });
  await assert.rejects(h.service.payWithMembership(id(2), id(7), actor), /Абонемент недоступен/);
  assert.equal(h.state().operations.length, 0);
});

test('past no-show debt accepts a later membership without completed-lesson revenue', async () => {
  const h = harness({ status: 'NO_SHOW', membership: { validFrom: new Date(Date.now() - 60000) } });
  await h.service.payWithMembership(id(2), id(7), actor);
  assert.equal(h.state().membership.remainedLessons, 3);
  assert.equal(h.state().revenueCalls, 0);
});

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

for (const membership of [{ clientId: id(99) }, { status: 'frozen' }, { remainedLessons: 0 }, { type: 'deposit' }, { deletedAt: new Date() }, { validFrom: new Date('2099-01-01') }, { validUntil: new Date('2020-01-01') }, { serviceId: id(99) }]) {
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
  const tx = { cashAuditLog: { create: async ({ data }) => data },
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
  const tx = { cashAuditLog: { create: async ({ data }) => data },
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
