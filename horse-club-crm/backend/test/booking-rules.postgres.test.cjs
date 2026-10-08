const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { BookingRulesService } = require('../dist/bookings/booking-rules.service');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { LessonsService } = require('../dist/lessons/lessons.service');
const enabled = process.env.RUN_TRIAD_TESTS === '1';
const hasCode = code => e => e.getStatus() === 409 && e.getResponse().code === code;

test('PostgreSQL booking rules, rollback, HTTP contract and concurrent triad writers', { skip: !enabled, timeout: 60000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.startsWith('/horse_os_triad_check_'), 'Dedicated local database required');
  const p = new PrismaClient(), rules = new BookingRulesService(), service = new BookingsService(p, rules);
  const ids = { clients: [], horses: [], trainers: [], arenas: [], services: [] };
  let app;
  async function resources(horseData = {}, arenaData = {}) {
    const client = await p.client.create({ data: { name: 'Rules QA', weightKg: 75 } }); ids.clients.push(client.id);
    const horse = await p.horse.create({ data: { name: 'Rules QA', ...horseData } }); ids.horses.push(horse.id);
    const trainer = await p.trainer.create({ data: { name: 'Rules QA' } }); ids.trainers.push(trainer.id);
    const arena = await p.arena.create({ data: { name: `Rules QA ${randomUUID()}`, ...arenaData } }); ids.arenas.push(arena.id);
    return { clientId: client.id, horseId: horse.id, trainerId: trainer.id, arenaId: arena.id,
      startTime: '2030-01-08T10:00:00Z', endTime: '2030-01-08T10:30:00Z', serviceType: 'dressage', costAmount: 1000 };
  }
  try {
    await t.test('valid booking persists and does not debit a balance', async () => {
      const dto = await resources(); const result = await service.createBooking(dto);
      assert.equal(result.lessonId, null); assert.equal(result.legacyLessonBinding, false);
      assert.equal(await p.ledgerTransaction.count({ where: { bookingId: result.id } }), 0);
    });
    await t.test('overweight and unavailable horse return stable codes without creating rows', async () => {
      const dto = await resources({ maxRiderWeight: 70 });
      await assert.rejects(service.createBooking(dto), hasCode('RIDER_WEIGHT_EXCEEDED'));
      await p.horse.update({ where: { id: dto.horseId }, data: { status: 'sick' } });
      await assert.rejects(service.createBooking(dto), hasCode('HORSE_UNAVAILABLE'));
      assert.equal(await p.booking.count({ where: { horseId: dto.horseId } }), 0);
    });
    await t.test('workload includes completed reservations but excludes cancelled and no-show', async () => {
      const dto = await resources({ maxDailyWorkloadMinutes: 45 });
      const first = await service.createBooking({ ...dto, startTime: '2030-01-08T07:00Z', endTime: '2030-01-08T07:30Z' });
      await p.booking.update({ where: { id: first.id }, data: { status: 'completed' } });
      await assert.rejects(service.createBooking(dto), hasCode('HORSE_OVERLOADED'));
      await p.booking.update({ where: { id: first.id }, data: { status: 'cancelled_club' } });
      await service.createBooking(dto);
      await p.booking.update({ where: { id: first.id }, data: { status: 'no_show' } });
      await service.createBooking({ ...dto, startTime: '2030-01-08T12:00Z', endTime: '2030-01-08T12:10Z' });
      await assert.rejects(service.createBooking({ ...dto, startTime: '2030-01-08T14:00Z', endTime: '2030-01-08T14:30Z' }), hasCode('HORSE_OVERLOADED'));
    });
    await t.test('45-minute rest works across local midnight; failure leaves no row', async () => {
      const dto = await resources();
      await service.createBooking({ ...dto, startTime: '2030-01-08T20:15Z', endTime: '2030-01-08T20:45Z' });
      await assert.rejects(service.createBooking({ ...dto, startTime: '2030-01-08T21:29:59Z', endTime: '2030-01-08T22:00Z' }), hasCode('HORSE_REST_VIOLATION'));
      await service.createBooking({ ...dto, startTime: '2030-01-08T21:30Z', endTime: '2030-01-08T22:00Z' });
      assert.equal(await p.booking.count({ where: { horseId: dto.horseId } }), 2);
    });
    await t.test('trainer conflict with a different horse and arena', async () => {
      const one = await resources(), two = await resources(); await service.createBooking(one);
      await assert.rejects(service.createBooking({ ...two, trainerId: one.trainerId }), hasCode('TRAINER_BUSY'));
    });
    for (const race of ['horse', 'trainer', 'arena', 'daily-workload']) {
      await t.test(`simultaneous ${race} contenders cannot overbook`, async () => {
        const entries = await Promise.all(Array.from({ length: 5 }, () => resources({ maxDailyWorkloadMinutes: 30 }, { maxRidersCapacity: 2 })));
        const results = await Promise.allSettled(entries.map((dto, i) => service.createBooking({ ...dto,
          ...(race === 'horse' || race === 'daily-workload' ? { horseId: entries[0].horseId } : {}),
          ...(race === 'trainer' ? { trainerId: entries[0].trainerId } : {}),
          ...(race === 'arena' ? { arenaId: entries[0].arenaId } : {}),
          ...(race === 'daily-workload' ? { startTime: `2030-01-08T${String(6 + i * 2).padStart(2, '0')}:00Z`, endTime: `2030-01-08T${String(6 + i * 2).padStart(2, '0')}:30Z` } : {}),
        })));
        assert.equal(results.filter(r => r.status === 'fulfilled').length, race === 'arena' ? 2 : 1);
        const expected = race === 'arena' ? 'ARENA_FULL' : race === 'trainer' ? 'TRAINER_BUSY' : 'HORSE_OVERLOADED';
        for (const result of results.filter(r => r.status === 'rejected')) assert.ok(hasCode(expected)(result.reason), String(result.reason));
      });
    }
    await t.test('new and legacy lesson writers share resource locks and strict rules', async () => {
      const one = await resources(), two = await resources();
      const legacyService = await p.service.create({ data: { name: 'Rules QA', durationMinutes: 30, maxCapacity: 2 } }); ids.services.push(legacyService.id);
      const lessons = new LessonsService(p, {}, rules);
      // Jan 8, 2030 is Tuesday; configure the isolated database only.
      await p.clubSchedule.upsert({ where: { id: 1 }, create: { id: 1, openTime: '00:00', closeTime: '23:59', daysOfWeekOff: [] }, update: { openTime: '00:00', closeTime: '23:59', daysOfWeekOff: [] } });
      const legacy = { trainerId: two.trainerId, clientId: two.clientId, horseId: one.horseId, arenaId: two.arenaId, serviceId: legacyService.id, startTime: one.startTime };
      const result = await Promise.allSettled([service.createBooking(one), lessons.createLesson(legacy)]);
      assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
      const rejected = result.find(r => r.status === 'rejected').reason;
      assert.ok(hasCode('HORSE_REST_VIOLATION')(rejected));
    });
    await t.test('legacy reschedule uses real dates, respects new bookings and rolls back conflicts', async () => {
      const dto = await resources();
      const legacyService = await p.service.create({ data: { name: 'Rules QA', durationMinutes: 30, maxCapacity: 1 } }); ids.services.push(legacyService.id);
      const lessons = new LessonsService(p, {}, rules);
      const lesson = await lessons.createLesson({ clientId: dto.clientId, trainerId: dto.trainerId, horseId: dto.horseId, arenaId: dto.arenaId, serviceId: legacyService.id, startTime: '2030-01-08T07:00Z' });
      await lessons.rescheduleLesson(lesson.id, '2030-01-08T08:00Z', 30);
      await assert.rejects(service.createBooking({ ...dto, startTime: '2030-01-08T09:00Z', endTime: '2030-01-08T09:30Z' }), hasCode('HORSE_REST_VIOLATION'));
      await service.createBooking(dto);
      await assert.rejects(lessons.rescheduleLesson(lesson.id, dto.startTime, 30), hasCode('HORSE_REST_VIOLATION'));
      assert.equal((await p.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).startTime.toISOString(), '2030-01-08T08:00:00.000Z');
      await p.lesson.update({ where: { id: lesson.id }, data: { status: 'CANCELLED' } });
      await service.createBooking({ ...dto, startTime: '2030-01-08T08:00Z', endTime: '2030-01-08T08:30Z' });
    });
    await t.test('HTTP RBAC, DTO validation and structured conflict response', async () => {
      const { Test } = require('@nestjs/testing');
      const { ValidationPipe } = require('@nestjs/common');
      const { BookingsController } = require('../dist/bookings/bookings.controller');
      const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
      const { RolesGuard } = require('../dist/auth/guards/roles.guard');
      const request = require('supertest');
      const module = await Test.createTestingModule({ controllers: [BookingsController], providers: [RolesGuard, { provide: BookingsService, useValue: service }] })
        .overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) { const req = ctx.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] }; return true; } }).compile();
      app = module.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
      const dto = await resources({ maxRiderWeight: 70 });
      await request(app.getHttpServer()).post('/bookings').set('x-role', 'TRAINER').send(dto).expect(403);
      await request(app.getHttpServer()).post('/bookings').send(dto).expect(403);
      for (const patch of [{ horseId: 'invalid' }, { serviceType: 'invalid' }, { costAmount: -1 }, { arbitrary: 1 }]) {
        await request(app.getHttpServer()).post('/bookings').set('x-role', 'ADMIN').send({ ...dto, ...patch }).expect(400);
      }
      const response = await request(app.getHttpServer()).post('/bookings').set('x-role', 'MANAGER').send(dto).expect(409);
      assert.equal(response.body.code, 'RIDER_WEIGHT_EXCEEDED'); assert.equal(response.body.error, 'BookingValidationError');
      await p.client.update({ where: { id: dto.clientId }, data: { weightKg: null } });
      await request(app.getHttpServer()).post('/bookings').set('x-role', 'ADMIN').send(dto).expect(201);
    });
  } finally {
    if (app) await app.close();
    await p.booking.deleteMany({ where: { clientId: { in: ids.clients } } });
    await p.lesson.deleteMany({ where: { serviceId: { in: ids.services } } });
    await p.service.deleteMany({ where: { id: { in: ids.services } } });
    await p.client.deleteMany({ where: { id: { in: ids.clients } } });
    await p.horse.deleteMany({ where: { id: { in: ids.horses } } });
    await p.trainer.deleteMany({ where: { id: { in: ids.trainers } } });
    await p.arena.deleteMany({ where: { id: { in: ids.arenas } } });
    await p.$disconnect();
  }
});
