const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { DateTime } = require('luxon');
const { Prisma } = require('@prisma/client');
const { ConflictException } = require('@nestjs/common');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { ClientMiniappService } = require('../dist/modules/telegram-bot/client-miniapp.service');
const zone = 'Europe/Moscow';
const tomorrow = DateTime.now().setZone(zone).plus({ days: 3 }).toISODate();
const dto = { date: tomorrow, startTime: '12:00', reason: 'Просьба клиента' };
const actor = { id: 'user', trainerId: 'trainer', email: 'trainer@test', role: 'TRAINER' };
const { clientCanReschedule } = require('../dist/modules/telegram-bot/client-lesson-policy');

test('client UI capabilities honor exact service cutoff, terminal state and group participation', () => {
  const now = Date.now();
  const row = { status: 'scheduled', startTime: new Date(now + 12 * 3600000), lesson: { status: 'SCHEDULED', deletedAt: null,
    startTime: new Date(now + 12 * 3600000), service: { cancellationWindowHours: 12 }, _count: { bookings: 1 } } };
  assert.equal(clientCanReschedule(row, now), false);
  assert.equal(clientCanReschedule(row, now - 1), true);
  row.lesson._count.bookings = 2;
  assert.equal(clientCanReschedule(row, now - 1), false);
  row.lesson._count.bookings = 1; row.lesson.status = 'COMPLETED';
  assert.equal(clientCanReschedule(row, now - 1), false);
});

function harness() {
  const original = DateTime.fromISO(`${tomorrow}T10:00`, { zone }).toJSDate();
  const member = { id: 'membership', clientId: 'client', remainedLessons: 0, deletedAt: null, cancelledAt: null,
    validFrom: new Date('2020-01-01'), validUntil: new Date('2099-01-01') };
  let lesson = { id: 'lesson', trainerId: 'trainer', arenaId: 'arena', status: 'SCHEDULED', deletedAt: null,
    startTime: original, endTime: new Date(+original + 45 * 60000),
    trainer: { id: 'trainer', name: 'Тренер' }, arena: { id: 'arena', isUnavailable: false },
    service: { allowMembership: true, title: 'Выездка', cancellationWindowHours: 24 },
    operations: [{ type: 'DEBIT', membershipId: 'membership', attendeeClientId: 'client' }],
    bookings: [{ id: 'booking', lessonId: 'lesson', trainerId: 'trainer', clientId: 'client', horseId: 'horse', status: 'scheduled',
      membershipId: 'membership', membership: member, isPaid: true, clientConfirmed: true,
      client: { id: 'client', name: 'Анна', firstName: 'Анна', lastName: '', telegramUserId: '123', vkUserId: 55n }, horse: { name: 'Гром' }, payments: [] }] };
  let policy = { lessonCreateOwn: true, lessonCreateAny: false, horseReplaceOwn: true, horseReplaceAny: false };
  let conflict, refunds = 0, paid = false, level = 'FULL', auditFailure = false;
  const calls = [], messages = [], audits = [], changes = [];
  const tx = {
    clubModuleSettings: { findUnique: async () => null },
    roleModulePermission: { findUnique: async () => ({ accessLevel: level }) },
    roleAccess: { findUnique: async () => policy },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
    user: { findMany: async () => [{ telegramUserId: 'admin' }] },
    horse: { findUnique: async () => ({ name: 'Гром', maxDailyMinutes: 180, healthStatus: 'HEALTHY' }) },
    lesson: {
      findUnique: async () => lesson, findUniqueOrThrow: async () => lesson,
      findMany: async () => [],
      update: async ({ data }) => {
        const { bookings, ...fields } = data;
        lesson = { ...lesson, ...fields };
        if (bookings?.updateMany) lesson.bookings.forEach(b => Object.assign(b, bookings.updateMany.data));
        return lesson;
      },
    },
    booking: {
      findFirst: async ({ where }) => where.clientId === 'client' && where.OR.some(x => x.id === 'booking' || x.lessonId === 'lesson')
        ? { ...lesson.bookings[0], startTime: lesson.startTime, endTime: lesson.endTime, lesson } : null,
      updateMany: async ({ data }) => { lesson.bookings.forEach(b => Object.assign(b, data)); return { count: 1 }; },
      update: async ({ data }) => Object.assign(lesson.bookings[0], data),
    },
    payment: { findMany: async () => paid ? [{ amount: new Prisma.Decimal(100), method: 'CASH' }] : [], updateMany: async () => ({ count: 0 }) },
    cashAuditLog: { create: async ({ data }) => { if (auditFailure) throw new Error('audit unavailable'); audits.push(data); } },
    bookingHorseChange: { create: async ({ data }) => changes.push(data) },
    telegramNotification: { upsert: async ({ create }) => messages.push(create) },
    vkNotification: { upsert: async ({ create }) => messages.push(create) },
  };
  const prisma = { ...tx, $transaction: async (fn, options) => {
    assert.ok(['Serializable', 'RepeatableRead'].includes(options?.isolationLevel));
    const snapshot = structuredClone(lesson), sizes = [messages.length, audits.length, changes.length], beforeRefund = refunds;
    try { return await fn(tx); }
    catch (error) { lesson = snapshot; [messages.length, audits.length, changes.length] = sizes; refunds = beforeRefund; throw error; }
  } };
  const rules = { validate: async (_tx, input) => { calls.push(input); if (conflict) throw new ConflictException(conflict); } };
  const ledger = { debitLesson: async () => { throw new Error('must never charge on move'); }, refundLesson: async () => { refunds++; } };
  const service = new LessonsService(prisma, ledger, rules);
  return { tx, service, client: new ClientMiniappService(prisma, ledger, service, rules), calls, messages, audits, changes,
    get lesson() { return lesson; }, get refunds() { return refunds; },
    set policy(value) { policy = { ...policy, ...value }; }, set conflict(value) { conflict = value; },
    set level(value) { level = value; }, set paid(value) { paid = value; }, set auditFailure(value) { auditFailure = value; } };
}

test('staff move preserves 45 minutes, membership/debit/payment and synchronizes all booking fields; queues old/new times', async () => {
  const h = harness();
  await h.service.moveScheduledLesson('lesson', dto, actor);
  assert.equal(+h.lesson.endTime - +h.lesson.startTime, 45 * 60000);
  assert.equal(h.lesson.bookings[0].membershipId, 'membership');
  assert.equal(h.lesson.bookings[0].isPaid, true);
  assert.equal(h.lesson.bookings[0].membership.remainedLessons, 0); // A previously debited last visit remains valid.
  assert.equal(h.lesson.operations.length, 1);
  assert.equal(h.lesson.bookings[0].clientConfirmed, false);
  assert.equal(+h.lesson.bookings[0].startTime, +h.lesson.startTime);
  assert.equal(h.calls[0].excludeLessonId, 'lesson');
  assert.equal(h.calls[0].arenaId, 'arena');
  assert.ok(h.messages.some(m => /Ранее:/.test(m.message) && /12:00/.test(m.message)));
  assert.ok(h.messages.some(m => m.key.startsWith('admin:reschedule:')));
});

for (const conflict of ['Лошадь занята', 'Тренер занят', 'Манеж переполнен', 'Лошади требуется отдых', 'Превышен лимит минут'])
  test(`move rejects ${conflict}, preserves the old slot and creates no notifications`, async () => {
    const h = harness(); h.conflict = conflict;
    const before = +h.lesson.startTime;
    await assert.rejects(h.service.moveScheduledLesson('lesson', dto, actor), { status: 409, message: conflict });
    assert.equal(+h.lesson.startTime, before); assert.equal(h.messages.length, 0);
  });

test('role policy protects both original and destination trainer; ADMIN and staff FULL can manage club lessons', async () => {
  const h = harness(); h.lesson.trainerId = 'other';
  await assert.rejects(h.service.moveScheduledLesson('lesson', dto, actor), { status: 403 });
  h.policy = { lessonCreateAny: true };
  await h.service.moveScheduledLesson('lesson', dto, actor);
  h.level = 'READ_ONLY';
  await assert.rejects(h.service.moveScheduledLesson('lesson', dto, { ...actor, role: 'MANAGER' }), { status: 403 });
  h.level = 'FULL'; await h.service.moveScheduledLesson('lesson', dto, { ...actor, role: 'MANAGER', trainerId: null });
  h.level = 'HIDDEN'; await h.service.moveScheduledLesson('lesson', dto, { ...actor, role: 'ADMIN', trainerId: null });
  const own = harness();
  await assert.rejects(own.service.moveScheduledLesson('lesson', { ...dto, trainerId: 'other' }, actor), { status: 403 });
});

for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW']) test(`final status ${status} blocks move and scheduled cancellation`, async () => {
  const h = harness(); h.lesson.status = status;
  await assert.rejects(h.service.moveScheduledLesson('lesson', dto, actor), { status: 409 });
  await assert.rejects(h.service.updateLessonStatus('lesson', 'CANCELLED', {}, actor, { reason: 'Погода' }, undefined, undefined, true), { status: 409 });
});

test('scheduled cancellation requires a reason, returns the debited visit and sends reason; cash cancellation directs to CRM', async () => {
  const h = harness();
  const cancel = reason => h.service.updateLessonStatus('lesson', 'CANCELLED', {}, actor, { reason }, undefined, undefined, true);
  await assert.rejects(cancel('  '), { status: 400 });
  h.paid = true;
  await assert.rejects(cancel('Болезнь клиента'), { status: 409, message: 'Для возврата оплаты откройте полную CRM' });
  assert.equal(h.refunds, 0); h.paid = false;
  await cancel('Болезнь клиента');
  assert.equal(h.refunds, 1); assert.equal(h.lesson.status, 'CANCELLED');
  assert.equal(h.lesson.bookings[0].status, 'cancelled_club');
  assert.ok(h.messages.some(m => m.key.startsWith('client:') && /Болезнь клиента/.test(m.message)));
});

test('audit failure rolls back time, confirmation and notification changes', async () => {
  const h = harness(); h.auditFailure = true; const before = +h.lesson.startTime;
  await assert.rejects(h.service.moveScheduledLesson('lesson', dto, actor), /audit unavailable/);
  assert.equal(+h.lesson.startTime, before); assert.equal(h.lesson.bookings[0].clientConfirmed, true); assert.equal(h.messages.length, 0);
});

test('unpaid reservation cannot be transferred against an empty membership', async () => {
  const h = harness(); h.lesson.bookings[0].isPaid = false;
  await assert.rejects(h.service.moveScheduledLesson('lesson', dto, actor), { status: 409 });
  assert.equal(h.messages.length, 0);
});

test('client move scopes ownership, honors cancellation window and preserves the membership without a debit', async () => {
  const h = harness();
  await assert.rejects(h.client.reschedule('stranger', 'booking', dto), { status: 404 });
  await h.client.reschedule('client', 'booking', dto);
  assert.equal(h.lesson.bookings[0].clientConfirmed, false); assert.equal(h.lesson.operations.length, 1);
  const late = harness(); late.lesson.startTime = new Date(Date.now() + 3600000);
  await assert.rejects(late.client.reschedule('client', 'booking', dto), { status: 409 });
});

test('availability excludes current lesson and reports specific conflicts, infrastructure errors propagate', async () => {
  const h = harness(); h.conflict = 'Лошадь занята';
  const result = await h.service.rescheduleSlots('lesson', { date: tomorrow }, actor);
  assert.ok(result.slots.length); assert.ok(result.slots.every(slot => !slot.available && slot.reason === 'Лошадь занята'));
  assert.ok(h.calls.every(call => call.lockResources === false && call.excludeLessonId === 'lesson'));
  assert.equal(h.messages.length, 0);
  h.conflict = undefined;
  assert.ok((await h.client.rescheduleSlots('client', 'booking', { date: tomorrow })).slots.every(slot => slot.available));
});

test('staff group transfer preserves every participant and its payment and resets every confirmation', async () => {
  const h = harness();
  h.lesson.bookings.push({ ...h.lesson.bookings[0], id: 'booking-2', clientId: 'client-2', horseId: 'horse-2' });
  await h.service.moveScheduledLesson('lesson', dto, actor);
  assert.equal(h.lesson.bookings.length, 2);
  assert.ok(h.lesson.bookings.every(b => b.isPaid && b.membershipId === 'membership' && !b.clientConfirmed && +b.startTime === +h.lesson.startTime));
  assert.equal(h.calls[0].participants.length, 2);
  const group = harness(); group.lesson.bookings.push({ ...group.lesson.bookings[0], id: 'group-2' });
  await assert.rejects(group.client.reschedule('client', 'booking', dto), { status: 409 });
});

test('horse change during transfer uses its own permission and records actor, old/new horse and reason', async () => {
  const h = harness();
  await h.service.moveScheduledLesson('lesson', { ...dto, horseId: 'new-horse' }, actor);
  assert.equal(h.lesson.bookings[0].horseId, 'new-horse');
  assert.deepEqual(h.changes[0], { bookingId: 'booking', actorUserId: actor.id, oldHorseId: 'horse', newHorseId: 'new-horse', reason: dto.reason });
  const denied = harness(); denied.policy = { horseReplaceOwn: false };
  await assert.rejects(denied.service.moveScheduledLesson('lesson', { ...dto, horseId: 'new-horse' }, actor), { status: 403 });
  assert.equal(denied.changes.length, 0);
});

test('transfer rechecks Telegram account binding inside its transaction', async () => {
  const h = harness();
  h.tx.user.findUnique = async () => ({ id: actor.id, role: 'TRAINER', crmAccess: false });
  await assert.rejects(h.service.moveScheduledLesson('lesson', dto, { ...actor, telegramUserId: '123' }), { status: 403 });
  assert.equal(h.messages.length, 0);
});

test('standalone client transfer keeps payment/membership and queues deliverable client and administrator notifications', async () => {
  const h = harness(); const row = { ...h.lesson.bookings[0], lessonId: null, lesson: null,
    startTime: h.lesson.startTime, endTime: h.lesson.endTime, arenaId: 'arena' };
  h.tx.booking.findFirst = async () => row;
  h.tx.booking.update = async ({ data }) => Object.assign(row, data);
  await h.client.reschedule('client', 'booking', dto);
  assert.equal(+row.endTime - +row.startTime, 45 * 60000);
  assert.equal(row.membershipId, 'membership'); assert.equal(row.isPaid, true); assert.equal(row.clientConfirmed, false);
  assert.ok(h.calls.some(call => call.excludeBookingId === 'booking'));
  assert.ok(h.messages.some(m => m.key.startsWith('client:client:reschedule:')));
  assert.ok(h.messages.some(m => m.key.startsWith('admin:client:reschedule:')));
});
