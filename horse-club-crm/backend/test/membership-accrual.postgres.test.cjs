const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { MembershipsService } = require('../dist/memberships/memberships.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { MonthlyClosingService } = require('../dist/payments/monthly-closing.service');

test('PostgreSQL accrual: cash receipt, completed lesson, rollover, closed-period protection', {
  skip: process.env.RUN_MEMBERSHIP_SALE_TESTS !== '1', timeout: 60000,
}, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.searchParams.get('schema'), /^membership_sale_check_\d+$/);
  const p = new PrismaClient();
  try {
    const actor = await p.user.create({ data: { email: `${randomUUID()}@accrual.test`, passwordHash: 'test', role: 'ADMIN' } });
    const client = await p.client.create({ data: { name: 'Accrual client' } });
    const trainer = await p.trainer.create({ data: { name: 'Accrual trainer' } });
    const service = await p.service.create({ data: { name: 'Accrual training', durationMinutes: 60, price: 1500 } });
    const membership = await new MembershipsService(p).create({ clientId: client.id, serviceId: service.id, totalLessons: 8,
      totalPrice: 8000, paymentMethod: 'CASH', validUntil: '2099-12-31T20:59:59Z', requestId: randomUUID() }, actor);
    await p.membership.update({ where: { id: membership.id }, data: { createdAt: new Date('2026-09-01T07:00:00Z'), validFrom: new Date('2026-09-01T07:00:00Z') } });
    await p.payment.updateMany({ where: { membershipId: membership.id }, data: { paidAt: new Date('2026-09-01T07:00:00Z') } });
    const lessons = new LessonsService(p, new MembershipLedgerService(p));
    const closing = new MonthlyClosingService(p);
    const createLesson = (date, member = membership.id, cost = 0) => p.lesson.create({ data: {
      trainerId: trainer.id, serviceId: service.id, startTime: new Date(date), endTime: new Date(+new Date(date) + 3600000),
      cost: member ? null : cost,
      bookings: { create: { legacyLessonBinding: true, clientId: client.id, trainerId: trainer.id, membershipId: member, costAmount: cost,
        startTime: new Date(date), endTime: new Date(+new Date(date) + 3600000) } },
    }, include: { bookings: true } });
    const lesson = await createLesson('2026-09-15T08:00:00Z');
    await t.test('sale retains all money in cash; scheduled lesson earns nothing', async () => {
      assert.equal((await p.payment.aggregate({ where: { membershipId: membership.id, status: 'PAID' }, _sum: { amount: true } }))._sum.amount.toString(), '8000');
      assert.equal(await p.revenueRecognition.count({ where: { membershipId: membership.id } }), 0);
    });
    await t.test('COMPLETED debits exactly one lesson and recognizes revenue at lesson date, once', async () => {
      await lessons.updateLessonStatus(lesson.id, 'COMPLETED', {}, actor);
      await lessons.updateLessonStatus(lesson.id, 'COMPLETED', {}, actor);
      assert.equal((await p.membership.findUniqueOrThrow({ where: { id: membership.id } })).remainedLessons, 7);
      const postings = await p.revenueRecognition.findMany({ where: { membershipId: membership.id } });
      assert.equal(postings.length, 1); assert.equal(postings[0].type, 'REVENUE_RECOGNITION');
      assert.equal(postings[0].amount.toString(), '1000');
      assert.equal(postings[0].createdById, actor.id);
      assert.equal(postings[0].recognizedAt.toISOString(), '2026-09-15T08:00:00.000Z');
      assert.equal(await p.payment.count({ where: { membershipId: membership.id } }), 1);
    });
    await t.test('one-off completed service recognizes its full price even when not collected yet', async () => {
      const oneOff = await createLesson('2026-09-16T08:00:00Z', null, 1500);
      await lessons.updateLessonStatus(oneOff.id, 'COMPLETED', {}, actor);
      const posting = await p.revenueRecognition.findFirstOrThrow({ where: { bookingId: oneOff.bookings[0].id } });
      assert.equal(posting.amount.toString(), '1500');
    });
    await t.test('cancellation reverses earned revenue and restores lesson without touching sale receipt', async () => {
      const cancelled = await createLesson('2026-09-17T08:00:00Z');
      await lessons.updateLessonStatus(cancelled.id, 'COMPLETED', {}, actor);
      await lessons.updateLessonStatus(cancelled.id, 'CANCELLED', {}, actor, { refund: false, reason: 'Test cancellation' });
      assert.equal((await p.membership.findUniqueOrThrow({ where: { id: membership.id } })).remainedLessons, 7);
      const journal = await p.revenueRecognition.findMany({ where: { bookingId: cancelled.bookings[0].id } });
      assert.equal(journal.length, 2);
      assert.equal(journal.reduce((sum, row) => sum + Number(row.amount), 0), 0);
      assert.equal(await p.payment.count({ where: { membershipId: membership.id } }), 1);
    });
    await t.test('NO_SHOW does not earn delivered-service revenue', async () => {
      const absent = await createLesson('2026-09-18T08:00:00Z', null, 1500);
      await lessons.updateLessonStatus(absent.id, 'NO_SHOW', {}, actor);
      assert.equal(await p.revenueRecognition.count({ where: { bookingId: absent.bookings[0].id } }), 0);
    });
    await t.test('recognition failure rolls the status and membership debit back atomically', async () => {
      const failed = await createLesson('2026-09-20T08:00:00Z');
      await p.$executeRawUnsafe(`ALTER TABLE "RevenueRecognition" ADD CONSTRAINT "accrual_test_failure" CHECK ("bookingId" <> '${failed.bookings[0].id}'::uuid)`);
      try {
        await assert.rejects(lessons.updateLessonStatus(failed.id, 'COMPLETED', {}, actor));
        assert.equal((await p.lesson.findUniqueOrThrow({ where: { id: failed.id } })).status, 'SCHEDULED');
        assert.equal((await p.membership.findUniqueOrThrow({ where: { id: membership.id } })).remainedLessons, 7);
        assert.equal(await p.membershipOp.count({ where: { lessonId: failed.id } }), 0);
      } finally { await p.$executeRawUnsafe('ALTER TABLE "RevenueRecognition" DROP CONSTRAINT "accrual_test_failure"'); }
    });
    await t.test('direct one-off receipt and its refund create separate monetary postings', async () => {
      const receipt = await p.payment.create({ data: { clientId: client.id, serviceId: service.id, amount: 100,
        method: 'CASH', status: 'PAID', paidAt: new Date('2026-08-20T08:00:00Z'), cashierId: actor.id } });
      assert.equal((await p.revenueRecognition.findFirstOrThrow({ where: { sourcePaymentId: receipt.id } })).amount.toString(), '100');
      await p.expense.create({ data: { amount: 100, category: 'OTHER', paymentMethod: 'CASH', createdById: actor.id,
        description: 'Refund', refundPaymentId: receipt.id, date: new Date('2026-08-21T08:00:00Z') } });
      const postings = await p.revenueRecognition.aggregate({ where: { sourcePaymentId: receipt.id }, _sum: { amount: true } });
      assert.equal(postings._sum.amount.toString(), '0');
    });
    // A later-month consumption must not reduce September's deferred snapshot.
    const later = await createLesson('2026-10-15T08:00:00Z');
    await lessons.updateLessonStatus(later.id, 'COMPLETED', {}, actor);
    await t.test('September carries 7 lessons although October has already consumed another', async () => {
      const report = await closing.status({ year: 2026, month: 9 });
      assert.equal(report.cashFlowIncome.toString(), '8000');
      assert.equal(report.recognizedRevenue.toString(), '2500');
      assert.equal(report.deferredRevenueCarriedOver.toString(), '7000');
    });
    await t.test('closing extends expired membership, preserves cash and snapshots once under parallel retries', async () => {
      await p.membership.update({ where: { id: membership.id }, data: { validUntil: new Date('2026-09-30T20:59:59Z') } });
      const [a, b] = await Promise.all([closing.close({ year: 2026, month: 9 }, actor.id), closing.close({ year: 2026, month: 9 }, actor.id)]);
      assert.equal(a.id, b.id); assert.equal(a.deferredRevenueCarriedOver.toString(), '7000');
      const active = await p.membership.findUniqueOrThrow({ where: { id: membership.id } });
      assert.equal(active.status, 'active'); assert.equal(active.remainedLessons, 6);
      assert.ok(active.validUntil >= new Date('2026-10-31T20:59:59Z'));
      assert.equal(await p.payment.count({ where: { membershipId: membership.id } }), 1);
    });
    await t.test('closed period rejects late completion and backdated cash; report remains immutable', async () => {
      await assert.rejects(createLesson('2026-09-19T08:00:00Z'));
      await assert.rejects(p.payment.create({ data: { clientId: client.id, amount: 1, method: 'CASH', status: 'PAID', paidAt: new Date('2026-09-19T08:00:00Z') } }));
      await assert.rejects(p.monthlyFinancialClosing.updateMany({ where: { year: 2026, month: 9 }, data: { recognizedRevenue: 0 } }));
      assert.equal((await closing.status({ year: 2026, month: 9 })).recognizedRevenue.toString(), '2500');
    });
    await t.test('rounding preserves every cent of a discounted non-divisible sale', async () => {
      const rounded = await new MembershipsService(p).create({ clientId: client.id, serviceId: service.id, totalLessons: 3,
        totalPrice: 100, paymentMethod: 'CARD', validUntil: '2099-12-31T20:59:59Z', requestId: randomUUID() }, actor);
      assert.equal(rounded.pricePerLesson.toString(), '33.33');
      let firstTraining;
      for (const date of ['2026-10-21T08:00:00Z', '2026-10-22T08:00:00Z', '2026-10-23T08:00:00Z']) {
        const training = await createLesson(date, rounded.id);
        firstTraining ??= training;
        await lessons.updateLessonStatus(training.id, 'COMPLETED', {}, actor);
      }
      const journal = await p.revenueRecognition.aggregate({ where: { membershipId: rounded.id }, _sum: { amount: true } });
      assert.equal(journal._sum.amount.toString(), '100');
      assert.equal((await p.membership.findUniqueOrThrow({ where: { id: rounded.id } })).status, 'exhausted');
      await lessons.updateLessonStatus(firstTraining.id, 'CANCELLED', {}, actor, { refund: false, reason: 'Rounding reversal' });
      const replacement = await createLesson('2026-10-24T08:00:00Z', rounded.id);
      await lessons.updateLessonStatus(replacement.id, 'COMPLETED', {}, actor);
      assert.equal((await p.revenueRecognition.aggregate({ where: { membershipId: rounded.id }, _sum: { amount: true } }))._sum.amount.toString(), '100');
    });
  } finally { await p.$disconnect(); }
});
