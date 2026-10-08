const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { BookingLifecycleService } = require('../dist/bookings/booking-lifecycle.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { MembershipsService } = require('../dist/memberships/memberships.service');
const { ClientsService } = require('../dist/clients/clients.service');
const hasCode = code => e => e.getStatus?.() === 409 && e.getResponse().code === code;

test('PostgreSQL lifecycle, journal bridge and concurrent financial outcomes', { skip: process.env.RUN_TRIAD_TESTS !== '1', timeout: 60000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.startsWith('/horse_os_triad_check_'));
  const p = new PrismaClient(), lifecycle = new BookingLifecycleService(p);
  const clients = [], horses = [], trainers = [], arenas = [], services = [], lessons = [];
  let app;
  async function fixture({ type = 'fixed_lessons', units = '8', cost = '1500', hours = -5, attach = true, noMembership = false } = {}) {
    const client = await p.client.create({ data: { name: 'Lifecycle QA' } }); clients.push(client.id);
    const horse = await p.horse.create({ data: { name: 'Lifecycle QA' } }); horses.push(horse.id);
    const trainer = await p.trainer.create({ data: { name: 'Lifecycle QA' } }); trainers.push(trainer.id);
    const arena = await p.arena.create({ data: { name: `Lifecycle ${randomUUID()}` } }); arenas.push(arena.id);
    const [{ now }] = await p.$queryRaw`SELECT clock_timestamp() AS now`;
    const membership = noMembership ? null : await p.membership.create({ data: {
      clientId: client.id, type, title: 'Lifecycle QA', initialUnits: units, remainingUnits: units,
      validFrom: new Date(+now - 86400000), validTo: new Date(+now + 30 * 86400000),
    } });
    const data = { clientId: client.id, trainerId: trainer.id, horseId: horse.id, arenaId: arena.id,
      membershipId: attach ? membership?.id : undefined, serviceType: 'dressage', costAmount: cost,
      startTime: new Date(+now + hours * 3600000), endTime: new Date(+now + hours * 3600000 + 1800000) };
    return { booking: await p.booking.create({ data }), membership, data };
  }
  const balance = id => p.membership.findUniqueOrThrow({ where: { id } });
  const journal = id => p.ledgerTransaction.findMany({ where: { bookingId: id } });
  try {
    await t.test('completion atomically debits one fixed unit and both representations agree', async () => {
      const f = await fixture();
      assert.equal((await lifecycle.transition(f.booking.id, 'complete')).status, 'completed');
      const m = await balance(f.membership.id), rows = await journal(f.booking.id);
      assert.equal(m.remainingUnits.toString(), '7'); assert.equal(m.remainedLessons, 7);
      assert.equal(rows.length, 1); assert.equal(rows[0].transactionType, 'usage'); assert.equal(rows[0].amount.toString(), '-1');
      const read = await new ClientsService(p).findLedger(f.booking.clientId, {});
      assert.equal(read.data[0].signedAmount, '-1'); assert.equal(read.data[0].type, 'DEBIT'); assert.equal(read.data[0].amount, 1);
      assert.equal(read.data[0].lesson.id, f.booking.id);
    });
    await t.test('deposit charges exact monetary cost and uses rubles in the history', async () => {
      const f = await fixture({ type: 'deposit', units: '2000.50', cost: '1250.75' });
      await lifecycle.transition(f.booking.id, 'complete');
      assert.equal((await balance(f.membership.id)).remainingUnits.toString(), '749.75');
      assert.equal((await journal(f.booking.id))[0].amount.toString(), '-1250.75');
      assert.equal((await new ClientsService(p).findLedger(f.booking.clientId, {})).data[0].unit, 'RUB');
    });
    await t.test('13-hour client cancellation is free and remains free on a repeat request', async () => {
      const f = await fixture({ hours: 13 });
      for (let i = 0; i < 2; i++) assert.equal((await lifecycle.transition(f.booking.id, 'cancel', { cancelledBy: 'client', reason: 'Changed plans' })).status, 'cancelled_client');
      assert.equal((await balance(f.membership.id)).remainingUnits.toString(), '8'); assert.equal((await journal(f.booking.id)).length, 0);
    });
    await t.test('5-hour cancellation records a penalty debit and reason', async () => {
      const f = await fixture({ hours: 5 });
      const result = await lifecycle.transition(f.booking.id, 'cancel', { cancelledBy: 'client', reason: 'Changed plans' });
      assert.equal(result.status, 'penalty_cancellation'); assert.equal(result.cancellationReason, 'Changed plans');
      const row = (await journal(f.booking.id))[0];
      assert.equal(row.transactionType, 'penalty_cancellation'); assert.equal(row.amount.toString(), '-1');
      assert.equal(row.description, 'Штрафная отмена менее чем за 12 часов');
    });
    await t.test('club cancellation extends attached membership by exactly seven days once', async () => {
      const f = await fixture({ hours: 5 });
      for (let i = 0; i < 3; i++) await lifecycle.transition(f.booking.id, 'cancel', { cancelledBy: 'club', reason: 'Arena closed' });
      const m = await balance(f.membership.id);
      assert.equal(+m.validTo - +f.membership.validTo, 7 * 86400000); assert.equal(+m.validUntil, +m.validTo);
      assert.equal(m.remainingUnits.toString(), '8'); assert.equal((await journal(f.booking.id)).length, 0);
    });
    await t.test('cancellation window is evaluated after waiting for a membership lock', async () => {
      const f = await fixture();
      await p.booking.update({ where: { id: f.booking.id }, data: { startTime: new Date(Date.now() + 12 * 3600000 + 1000), endTime: new Date(Date.now() + 13 * 3600000) } });
      let held, release;
      const ready = new Promise(resolve => { held = resolve; }), gate = new Promise(resolve => { release = resolve; });
      const blocker = p.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${f.membership.id}, 0))::text AS lock`;
        held(); await gate;
      });
      await ready;
      const result = lifecycle.transition(f.booking.id, 'cancel', { cancelledBy: 'client', reason: 'Boundary while waiting' });
      try { await new Promise(resolve => setTimeout(resolve, 1500)); } finally { release(); }
      await blocker;
      assert.equal((await result).status, 'penalty_cancellation'); assert.equal((await journal(f.booking.id))[0].amount.toString(), '-1');
    });
    await t.test('no-show records one penalty and attendance status', async () => {
      const f = await fixture(); const result = await lifecycle.transition(f.booking.id, 'no-show');
      assert.equal(result.status, 'no_show'); assert.equal(result.attendanceStatus, 'NO_SHOW');
      assert.equal((await journal(f.booking.id))[0].transactionType, 'penalty_cancellation');
    });
    await t.test('automatic matching skips an earlier incompatible discipline', async () => {
      const f = await fixture({ attach: false });
      await p.membership.create({ data: { clientId: f.booking.clientId, initialUnits: 2, remainingUnits: 2,
        validFrom: new Date(Date.now() - 86400000), validTo: new Date(Date.now() + 86400000), allowedDisciplines: ['jumping'] } });
      assert.equal((await lifecycle.transition(f.booking.id, 'complete')).membershipId, f.membership.id);
    });
    for (const state of ['insufficient', 'frozen', 'expired', 'discipline']) await t.test(`${state} membership leaves booking and journal unchanged`, async () => {
      const f = await fixture({ type: 'deposit', units: '100', cost: state === 'insufficient' ? '101' : '1' });
      if (state === 'frozen') await p.membership.update({ where: { id: f.membership.id }, data: { status: 'frozen' } });
      if (state === 'expired') await p.membership.update({ where: { id: f.membership.id }, data: { validTo: new Date(Date.now() - 3600000) } });
      if (state === 'discipline') await p.membership.update({ where: { id: f.membership.id }, data: { allowedDisciplines: ['jumping'] } });
      await assert.rejects(lifecycle.transition(f.booking.id, 'complete'), hasCode(state === 'insufficient' ? 'MEMBERSHIP_INSUFFICIENT' : 'MEMBERSHIP_UNAVAILABLE'));
      assert.equal((await p.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status, 'scheduled');
      assert.equal((await balance(f.membership.id)).remainingUnits.toString(), '100'); assert.equal((await journal(f.booking.id)).length, 0);
    });
    await t.test('absent membership blocks billing but permits a free club cancellation', async () => {
      const f = await fixture({ noMembership: true });
      await assert.rejects(lifecycle.transition(f.booking.id, 'complete'), hasCode('MEMBERSHIP_REQUIRED'));
      assert.equal((await lifecycle.transition(f.booking.id, 'cancel', { cancelledBy: 'club', reason: 'Closed' })).status, 'cancelled_club');
    });
    await t.test('concurrent identical requests bill only once; another terminal outcome is rejected', async () => {
      const f = await fixture();
      await Promise.all(Array.from({ length: 5 }, () => lifecycle.transition(f.booking.id, 'complete')));
      assert.equal((await balance(f.membership.id)).remainingUnits.toString(), '7'); assert.equal((await journal(f.booking.id)).length, 1);
      await assert.rejects(lifecycle.transition(f.booking.id, 'no-show'), hasCode('BOOKING_STATE_CONFLICT'));
      await assert.rejects(p.ledgerTransaction.create({ data: { clientId: f.booking.clientId, membershipId: f.membership.id, bookingId: f.booking.id,
        amount: -1, transactionType: 'penalty_cancellation' } }), e => e.code === 'P2002');
    });
    await t.test('two bookings compete for the last unit without a negative balance', async () => {
      const f = await fixture({ units: '1' }), second = await p.booking.create({ data: f.data });
      const results = await Promise.allSettled([lifecycle.transition(f.booking.id, 'complete'), lifecycle.transition(second.id, 'no-show')]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal((await balance(f.membership.id)).remainingUnits.toString(), '0');
      assert.equal((await balance(f.membership.id)).status, 'exhausted');
      assert.equal(await p.ledgerTransaction.count({ where: { clientId: f.booking.clientId } }), 1);
    });
    await t.test('journal uniqueness failure rolls back the preceding balance update', async () => {
      const f = await fixture();
      await p.ledgerTransaction.create({ data: { clientId: f.booking.clientId, membershipId: f.membership.id, bookingId: f.booking.id, transactionType: 'usage', amount: -1 } });
      await assert.rejects(lifecycle.transition(f.booking.id, 'complete'), hasCode('BOOKING_STATE_CONFLICT'));
      assert.equal((await balance(f.membership.id)).remainingUnits.toString(), '8');
      assert.equal((await balance(f.membership.id)).remainedLessons, 8);
      assert.equal((await p.booking.findUniqueOrThrow({ where: { id: f.booking.id } })).status, 'scheduled');
      await assert.rejects(p.membership.update({ where: { id: f.membership.id }, data: { remainingUnits: '7.5' } }));
      assert.equal((await balance(f.membership.id)).remainingUnits.toString(), '8');
    });
    await t.test('already paid cash booking cannot also debit a membership', async () => {
      const f = await fixture();
      await p.payment.create({ data: { clientId: f.booking.clientId, bookingId: f.booking.id, amount: 1500, status: 'PAID', method: 'CASH', paidAt: new Date() } });
      await assert.rejects(lifecycle.transition(f.booking.id, 'complete'), hasCode('BOOKING_STATE_CONFLICT'));
      assert.equal((await balance(f.membership.id)).remainingUnits.toString(), '8'); assert.equal((await journal(f.booking.id)).length, 0);
    });
    await t.test('legacy issuance and debit share balance and canonical history with new completion', async () => {
      const f = await fixture({ noMembership: true });
      const m = await new MembershipsService(p).create({ clientId: f.booking.clientId, totalLessons: 3, validUntil: new Date(Date.now() + 86400000).toISOString() });
      assert.equal(m.remainingUnits.toString(), '3'); assert.equal(+m.validTo, +m.validUntil);
      const service = await p.service.create({ data: { name: 'Lifecycle legacy', durationMinutes: 30, maxCapacity: 1 } }); services.push(service.id);
      const lesson = await p.lesson.create({ data: { trainerId: f.booking.trainerId, serviceId: service.id, startTime: f.booking.startTime, endTime: f.booking.endTime } }); lessons.push(lesson.id);
      await new MembershipLedgerService(p).debitLesson(m.id, lesson.id, 'Legacy attendance');
      await lifecycle.transition(f.booking.id, 'complete');
      const current = await balance(m.id);
      assert.equal(current.remainingUnits.toString(), '1'); assert.equal(current.remainedLessons, 1);
      const rows = await p.ledgerTransaction.findMany({ where: { membershipId: m.id } });
      assert.equal(rows.length, 3); assert.equal(rows.filter(r => r.sourceMembershipOpId).length, 2);
    });
    await t.test('legacy and new billing compete for the same last unit', async () => {
      const f = await fixture({ units: '1' });
      const service = await p.service.create({ data: { name: 'Lifecycle race', durationMinutes: 30, maxCapacity: 1 } }); services.push(service.id);
      const lesson = await p.lesson.create({ data: { trainerId: f.booking.trainerId, serviceId: service.id, startTime: f.booking.startTime, endTime: f.booking.endTime } }); lessons.push(lesson.id);
      const result = await Promise.allSettled([new MembershipLedgerService(p).debitLesson(f.membership.id, lesson.id, 'Legacy race'), lifecycle.transition(f.booking.id, 'complete')]);
      assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal((await balance(f.membership.id)).remainedLessons, 0);
      assert.equal(await p.ledgerTransaction.count({ where: { clientId: f.booking.clientId } }), 1);
    });
    await t.test('HTTP lifecycle permissions and cancellation validation', async () => {
      const { Test } = require('@nestjs/testing'), { ValidationPipe } = require('@nestjs/common');
      const { BookingsController } = require('../dist/bookings/bookings.controller'), { BookingsService } = require('../dist/bookings/bookings.service');
      const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard'), { RolesGuard } = require('../dist/auth/guards/roles.guard');
      const request = require('supertest');
      const module = await Test.createTestingModule({ controllers: [BookingsController], providers: [RolesGuard,
        { provide: BookingsService, useValue: {} }, { provide: BookingLifecycleService, useValue: lifecycle }] })
        .overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) { const req = ctx.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] }; return true; } }).compile();
      app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
      const f = await fixture({ hours: 13 });
      for (const action of ['complete', 'cancel', 'no-show']) await request(app.getHttpServer()).patch(`/bookings/${f.booking.id}/${action}`).set('x-role', 'TRAINER').send({}).expect(403);
      for (const body of [{ cancelledBy: 'other', reason: 'x' }, { cancelledBy: 'client', reason: '   ' }, { cancelledBy: 'club', reason: 'x', unexpected: 1 }]) {
        await request(app.getHttpServer()).patch(`/bookings/${f.booking.id}/cancel`).set('x-role', 'ADMIN').send(body).expect(400);
      }
      await request(app.getHttpServer()).patch(`/bookings/${f.booking.id}/cancel`).set('x-role', 'MANAGER').send({ cancelledBy: 'client', reason: ' Plans ' }).expect(200);
      await request(app.getHttpServer()).patch(`/bookings/${f.booking.id}/complete`).set('x-role', 'ADMIN').expect(409);
    });
  } finally {
    if (app) await app.close();
    await p.ledgerTransaction.deleteMany({ where: { clientId: { in: clients } } });
    await p.payment.deleteMany({ where: { clientId: { in: clients } } });
    await p.membershipOp.deleteMany({ where: { membership: { clientId: { in: clients } } } });
    await p.booking.deleteMany({ where: { clientId: { in: clients } } });
    await p.membership.deleteMany({ where: { clientId: { in: clients } } });
    await p.lesson.deleteMany({ where: { id: { in: lessons } } });
    await p.service.deleteMany({ where: { id: { in: services } } });
    await p.horse.deleteMany({ where: { id: { in: horses } } }); await p.trainer.deleteMany({ where: { id: { in: trainers } } });
    await p.arena.deleteMany({ where: { id: { in: arenas } } }); await p.client.deleteMany({ where: { id: { in: clients } } });
    await p.$disconnect();
  }
});
