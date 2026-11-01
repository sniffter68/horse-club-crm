const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { MembershipsService } = require('../dist/memberships/memberships.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { LessonsService } = require('../dist/lessons/lessons.service');

test('PostgreSQL late membership payment reclassifies revenue, rejects duplicates and cancels without double debit', {
  skip: process.env.RUN_MEMBERSHIP_SALE_TESTS !== '1', timeout: 60000,
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.searchParams.get('schema'), /^membership_sale_check_\d+$/);
  const p = new PrismaClient();
  try {
    const actor = await p.user.create({ data: { email: `${randomUUID()}@late.test`, passwordHash: 'test', role: 'ADMIN' } });
    const client = await p.client.create({ data: { name: 'Late payer' } });
    const trainer = await p.trainer.create({ data: { name: 'Late trainer' } });
    const service = await p.service.create({ data: { name: 'Late training', durationMinutes: 60, price: 1500, allowMembership: true } });
    const lessons = new LessonsService(p, new MembershipLedgerService(p));
    for (const completed of [false, true]) {
      const start = new Date(completed ? '2030-11-04T09:00Z' : '2030-11-03T09:00Z');
      const end = new Date(+start + 3600000);
      const lesson = await p.lesson.create({ data: { trainerId: trainer.id, serviceId: service.id, startTime: start, endTime: end, cost: 1500,
        bookings: { create: { trainerId: trainer.id, clientId: client.id, startTime: start, endTime: end, costAmount: 1500, legacyLessonBinding: true } } }, include: { bookings: true } });
      if (completed) await lessons.updateLessonStatus(lesson.id, 'COMPLETED', { payRemaining: false }, actor);
      const membership = await new MembershipsService(p).create({ clientId: client.id, serviceId: service.id, totalLessons: 4, totalPrice: 4000,
        paymentMethod: 'CARD', validUntil: '2099-12-31T20:59:59Z', requestId: randomUUID() }, actor);
      const receipts = await p.payment.count();
      await lessons.payWithMembership(lesson.id, membership.id, actor);
      await assert.rejects(lessons.payWithMembership(lesson.id, membership.id, actor));
      if (!completed) await lessons.updateLessonStatus(lesson.id, 'COMPLETED', {}, actor);
      assert.equal((await p.membership.findUniqueOrThrow({ where: { id: membership.id } })).remainedLessons, 3);
      assert.equal(await p.membershipOp.count({ where: { lessonId: lesson.id, type: 'DEBIT' } }), 1);
      const journal = await p.revenueRecognition.findMany({ where: { bookingId: lesson.bookings[0].id } });
      assert.equal(journal.reduce((sum, row) => sum + Number(row.amount), 0), 1000);
      assert.equal(journal.filter(row => row.membershipId === membership.id).reduce((sum, row) => sum + Number(row.amount), 0), 1000);
      assert.ok(journal.every(row => row.createdById === actor.id));
      assert.equal(await p.payment.count(), receipts);
      await lessons.updateLessonStatus(lesson.id, 'CANCELLED', {}, actor, { refund: false, reason: 'Late payment test' });
      assert.equal((await p.membership.findUniqueOrThrow({ where: { id: membership.id } })).remainedLessons, 4);
      const reversed = await p.revenueRecognition.aggregate({ where: { bookingId: lesson.bookings[0].id }, _sum: { amount: true } });
      assert.equal(reversed._sum.amount.toString(), '0');
    }
  } finally { await p.$disconnect(); }
});

