const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { ValidationPipe } = require('@nestjs/common');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { CreateLessonDto } = require('../dist/lessons/dto/create-lesson.dto');
const { CompleteLessonDto } = require('../dist/lessons/dto/lesson-payment.dto');
const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'ADMIN', email: 'admin@test.local' };
const decimal = value => new Prisma.Decimal(value ?? 0);

function harness({ enabled = true, failLedger = false, role = 'ADMIN', cost = 1500, isPerPerson = false } = {}) {
  let state = { lesson: null, payments: [], ledger: [] };
  let serial = Promise.resolve();
  const prisma = { $transaction: (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const operation = serial.then(async () => {
      // Keep real Decimal values and isolate every mutable row until commit.
      const draft = { ...state, lesson: state.lesson && { ...state.lesson, bookings: state.lesson.bookings.map(b => ({ ...b })) }, payments: [...state.payments], ledger: [...state.ledger] };
      const details = () => ({ ...draft.lesson, bookings: draft.lesson.bookings.map(b => ({ ...b, payments: draft.payments.filter(p => p.bookingId === b.id && p.status === 'PAID') })) });
      const tx = {
        service: { findUnique: async () => ({ id: 'service', isPerPerson, durationMinutes: 60, price: cost, maxCapacity: 1, allowMembership: true, name: 'Тренировка' }) },
        clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
        clubModuleSettings: { findUnique: async () => ({ isEnabled: enabled }) },
        roleModulePermission: { findUnique: async () => ({ accessLevel: 'READ_ONLY' }) },
        cashShift: { findFirst: async () => ({ id: 'shift' }) },
        lesson: {
          findFirst: async () => null, findMany: async () => [],
          findUnique: async () => draft.lesson && details(), findUniqueOrThrow: async () => details(),
          create: async ({ data }) => {
            draft.lesson = { ...data, id: 'lesson', finalPaymentAmount: decimal(0), operations: [], service: { allowMembership: true }, trainer: {},
              bookings: data.bookings.create.map((b, i) => ({ ...b, id: `booking-${i}`, membershipId: null, costAmount: decimal(b.costAmount),
                prepaymentAmount: decimal(b.prepaymentAmount), finalPaymentAmount: decimal(0), client: { name: 'Анна' }, isPaid: false })) };
            return details();
          },
          update: async ({ data }) => { Object.assign(draft.lesson, data); return details(); },
        },
        booking: { update: async ({ where, data }) => Object.assign(draft.lesson.bookings.find(b => b.id === where.id), data) },
        payment: { create: async ({ data }) => { const row = { ...data, id: `receipt-${draft.payments.length}` }; draft.payments.push(row); return row; }, updateMany: async () => ({ count: 1 }) },
        ledgerTransaction: { create: async ({ data }) => { if (failLedger) throw new Error('ledger failed'); draft.ledger.push(data); return data; } },
      };
      const result = await work(tx); state = draft; return result;
    });
    serial = operation.catch(() => {}); return operation;
  } };
  const service = new LessonsService(prisma, {}, { validate: async () => {} });
  const create = (prepaymentAmount = 500, extra = {}) => service.createLesson({ trainerId: 'trainer', serviceId: 'service', clientId: 'client',
    startTime: '2026-10-20T10:00:00Z', cost, prepaymentAmount, prepaymentMethod: 'CASH', ...extra }, undefined, { ...actor, role });
  const complete = (payment = { payRemaining: true, paymentMethod: 'CARD' }) => service.updateLessonStatus('lesson', 'COMPLETED', payment, { ...actor, role });
  return { create, complete, state: () => state };
}

test('prepayment and final payment create two audited receipts and ledger entries', async () => {
  const h = harness();
  const created = await h.create();
  assert.equal(created.paymentStatus, 'PARTIALLY_PAID');
  assert.equal(h.state().payments[0].amount.toString(), '500');
  assert.equal(h.state().payments[0].serviceType, 'LESSON_PREPAYMENT');
  assert.equal(h.state().payments[0].cashierId, actor.id);
  assert.match(h.state().payments[0].description, /Анна/);
  const completed = await h.complete();
  assert.equal(completed.paymentStatus, 'PAID');
  assert.equal(completed.finalPaymentAmount.toString(), '1000');
  assert.equal(h.state().payments[1].method, 'CARD');
  assert.equal(h.state().ledger.length, 2);
  await Promise.all([h.complete(), h.complete()]);
  assert.equal(h.state().payments.length, 2);
});

test('fully prepaid lesson completes without another receipt', async () => {
  const h = harness(); await h.create(1500); await h.complete({ payRemaining: true });
  assert.equal(h.state().payments.length, 1);
  assert.equal(h.state().lesson.paymentStatus, 'PAID');
  assert.equal(h.state().lesson.finalPaymentAmount.toString(), '0');
});

test('group completion collects each participant balance without charging a fully prepaid rider', async () => {
  const h = harness(); await h.create();
  const lesson = h.state().lesson;
  lesson.cost = decimal(3000); lesson.prepaymentAmount = decimal(2000);
  lesson.bookings.push({ ...lesson.bookings[0], id: 'booking-2', clientId: 'other-client', prepaymentAmount: decimal(1500), isPaid: true });
  await h.complete();
  assert.equal(h.state().payments.length, 2);
  assert.equal(h.state().payments[1].bookingId, 'booking-0');
  assert.equal(h.state().payments[1].amount.toString(), '1000');
  assert.equal(h.state().lesson.paymentStatus, 'PAID');
});

test('debt and custom partial payment retain accurate payment status', async () => {
  const debt = harness(); await debt.create(0); await debt.complete({ payRemaining: false, paymentMethod: 'CARD' });
  assert.equal(debt.state().lesson.paymentStatus, 'UNPAID'); assert.equal(debt.state().payments.length, 0);
  const partial = harness(); await partial.create(); await partial.complete({ payRemaining: true, paymentMethod: 'CARD', customAmount: 250 });
  assert.equal(partial.state().lesson.paymentStatus, 'PARTIALLY_PAID');
  assert.equal(partial.state().lesson.finalPaymentAmount.toString(), '250');
});

test('disabled cashbox preserves financial state without receipts', async () => {
  const h = harness({ enabled: false }); await h.create(); await h.complete();
  assert.equal(h.state().lesson.paymentStatus, 'PAID'); assert.equal(h.state().payments.length, 0);
  assert.equal(h.state().ledger.length, 0);
});

test('invalid amounts and read-only cashbox cannot mutate financial state', async () => {
  const h = harness(); await assert.rejects(h.create(1501), /Предоплата/);
  assert.equal(h.state().lesson, null);
  await h.create(); await assert.rejects(h.complete({ paymentMethod: 'CARD', customAmount: 1001 }), /остаток/);
  assert.equal(h.state().lesson.status, 'SCHEDULED'); assert.equal(h.state().payments.length, 1);
  const readonly = harness({ role: 'MANAGER' }); await assert.rejects(readonly.create(), /доступ к кассе/);
  assert.equal(readonly.state().lesson, null);
});

test('cash ledger failure rolls back the lesson and its receipt', async () => {
  const h = harness({ failLedger: true }); await assert.rejects(h.create(), /ledger failed/);
  assert.equal(h.state().lesson, null); assert.equal(h.state().payments.length, 0);
});

test('decimal kopecks and zero cost are handled exactly', async () => {
  const h = harness({ cost: 100.30 }); await h.create(50.10); await h.complete();
  assert.equal(h.state().payments[1].amount.toString(), '50.2');
  const free = harness({ cost: 0 }); await free.create(0); await free.complete({});
  assert.equal(free.state().lesson.paymentStatus, 'PAID'); assert.equal(free.state().payments.length, 0);
});

test('DTOs transform amounts and empty optional UUID/enums, reject invalid precision/method/boolean', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const id = actor.id;
  const dto = await pipe.transform({ trainerId: id, serviceId: id, clientId: id, membershipId: '', arenaId: '', startTime: '2026-10-20T10:00:00Z', cost: '1500', prepaymentAmount: '500', prepaymentMethod: 'CASH' }, { type: 'body', metatype: CreateLessonDto });
  assert.equal(dto.cost, 1500); assert.equal(dto.membershipId, undefined);
  for (const body of [{ customAmount: -1 }, { customAmount: 0.001 }, { payRemaining: 'false' }, { paymentMethod: 'TRANSFER' }]) {
    await assert.rejects(pipe.transform(body, { type: 'body', metatype: CompleteLessonDto }), error => error.getStatus() === 400);
  }
});


test('excursion without horse snapshots 25 guests at 500 and collects 3000 + 9500', async () => {
  const h = harness();
  const lesson = await h.create(3000, { cost: undefined, participantsCount: 25, pricePerPerson: 500 });
  assert.equal(lesson.bookings[0].horseId ?? null, null);
  assert.equal(lesson.participantsCount, 25);
  assert.equal(lesson.pricePerPerson.toString(), '500');
  assert.equal(lesson.cost.toString(), '12500');
  assert.equal(lesson.bookings[0].costAmount.toString(), '12500');
  assert.equal(h.state().payments[0].amount.toString(), '3000');
  await h.complete();
  assert.equal(h.state().payments[1].amount.toString(), '9500');
  assert.equal(h.state().lesson.paymentStatus, 'PAID');
  assert.equal(h.state().ledger.length, 2);
});

test('group manual cost override and a single guest preserve the per-person rate', async () => {
  const h = harness();
  const lesson = await h.create(0, { cost: 12000, participantsCount: 25, pricePerPerson: 500 });
  assert.equal(lesson.cost.toString(), '12000');
  const single = harness();
  assert.equal((await single.create(0, { cost: undefined, participantsCount: 1, pricePerPerson: 500 })).cost.toString(), '500');
});

test('group DTO transforms numeric strings and rejects out-of-range counts and rates', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const body = { trainerId: actor.id, serviceId: actor.id, clientId: actor.id, horseId: '', startTime: '2026-10-20T10:00:00Z', participantsCount: '25', pricePerPerson: '500' };
  const result = await pipe.transform(body, { type: 'body', metatype: CreateLessonDto });
  assert.equal(result.participantsCount, 25); assert.equal(result.pricePerPerson, 500);
  for (const patch of [{ participantsCount: 0 }, { participantsCount: 101 }, { participantsCount: 1.5 }, { pricePerPerson: -1 }, { pricePerPerson: 0.001 }]) {
    await assert.rejects(pipe.transform({ ...body, ...patch }, { type: 'body', metatype: CreateLessonDto }));
  }
});

test('per-person catalog price is used without a submitted rate and keeps the full pending debt', async () => {
  const h = harness({ cost: 500, isPerPerson: true });
  const lesson = await h.create(0, { cost: undefined, participantsCount: 100 });
  assert.equal(lesson.cost.toString(), '50000');
  assert.equal(lesson.pricePerPerson.toString(), '500');
  assert.equal(lesson.bookings[0].costAmount.toString(), '50000');
  assert.equal(h.state().payments.length, 0);
  await h.complete();
  assert.equal(h.state().payments[0].amount.toString(), '50000');
});
test('excursions cannot charge an organizer membership or accept multiple payers', async () => {
  const h = harness({ isPerPerson: true });
  await assert.rejects(h.create(0, { cost: undefined, membershipId: 'membership' }));
  await assert.rejects(h.create(0, { cost: undefined, clientId: undefined, participants: [{ clientId: 'a' }, { clientId: 'b' }] }));
  assert.equal(h.state().lesson, null);
});
