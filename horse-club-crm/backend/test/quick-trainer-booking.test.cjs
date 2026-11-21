const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { QuickTrainerBookingService } = require('../dist/modules/telegram-bot/quick-trainer-booking.service');
const { QuickTrainerBookingTmaController, TrainerTmaGuard } = require('../dist/modules/telegram-bot/trainer-tma.controller');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');
const { TrainerTmaService } = require('../dist/modules/telegram-bot/trainer-tma.service');
const id = '11111111-1111-4111-8111-111111111111';
const actor = { id, role: 'TRAINER', trainerId: id, email: 'trainer@test.local' };

test('quick trainer HTTP validates DTO, authenticates TMA and enforces FULL/role permissions', async () => {
  let level = 'FULL', own = true, any = false;
  const created = [], clientCalls = [];
  const prisma = { roleAccess: { findUnique: async () => ({ lessonCreateOwn: own, lessonCreateAny: any }) },
    client: { findMany: async args => { assert.equal(args.take, 30); assert.equal(args.select.phone, true); return [{ id, name: 'Анна', phone: '+79991234567' }]; } } };
  const service = new QuickTrainerBookingService(prisma,
    { quickCreate: async dto => { clientCalls.push(dto); return { id, ...dto }; } },
    { createLesson: async (dto, tx, user) => { created.push({ dto, user }); return { id, startTime: dto.startTime }; } });
  const module = await Test.createTestingModule({ controllers: [QuickTrainerBookingTmaController], providers: [
    { provide: QuickTrainerBookingService, useValue: service },
    { provide: TrainerTmaService, useValue: { session: async token => { if (token !== 'tma-only') throw new (require('@nestjs/common').UnauthorizedException)(); return actor; } } },
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'SCHEDULE', isEnabled: true, accessLevel: level }] } },
    TrainerTmaGuard, ModuleAccessGuard,
  ] }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const api = request(app.getHttpServer());
  const auth = req => req.set('Authorization', 'Bearer tma-only');
  const body = { trainerId: id, clientId: id, serviceId: id, startTime: '2026-11-22T10:00:00+03:00', durationMinutes: 60 };
  try {
    await api.post('/tma/quick-booking/lessons').send(body).expect(401);
    await api.get('/tma/quick-booking/permissions').set('Authorization', 'Bearer crm-token').expect(401);
    await auth(api.post('/tma/quick-booking/lessons')).send({ ...body, serviceId: 'invalid' }).expect(400);
    await auth(api.post('/tma/quick-booking/lessons')).send(body).expect(201);
    await auth(api.post('/tma/quick-booking/lessons')).send({ ...body, trainerId: '22222222-2222-4222-8222-222222222222' }).expect(403);
    await auth(api.post('/tma/quick-booking/lessons')).send({ ...body, clientId: undefined }).expect(400);
    assert.equal(created[0].dto.serviceId, id); assert.equal(created[0].user.id, actor.id);
    assert.equal(created[0].dto.prepaymentAmount, undefined); assert.equal(created[0].dto.membershipId, undefined);
    await auth(api.get('/tma/quick-booking/clients?search=Анна')).expect(200);
    await auth(api.post('/tma/quick-booking/clients/quick')).send({ name: ' Анна ', phone: '+79991234567' }).expect(201);
    assert.deepEqual(clientCalls[0], { name: 'Анна', phone: '+79991234567' });
    level = 'READ_ONLY';
    await auth(api.post('/tma/quick-booking/lessons')).send(body).expect(403);
    await auth(api.post('/tma/quick-booking/clients/quick')).send({ name: 'Анна' }).expect(403);
    level = 'HIDDEN'; await auth(api.get('/tma/quick-booking/permissions')).expect(403);
    level = 'FULL'; own = false;
    await auth(api.post('/tma/quick-booking/lessons')).send(body).expect(403);
    await auth(api.get('/tma/quick-booking/clients')).expect(403);
    any = true; await auth(api.get('/tma/quick-booking/permissions')).expect(200, { lessonCreateOwn: true, lessonCreateAny: true });
  } finally { await app.close(); }
});

test('quick context uses Moscow boundaries, both reservation sources and the strictest daily limit', async () => {
  let bounds;
  const prisma = {
    roleAccess: { findUnique: async () => ({ lessonCreateOwn: true, lessonCreateAny: false }) },
    service: { findMany: async () => [] }, trainer: { findMany: async () => [] }, arena: { findMany: async () => [] },
    horse: { findMany: async () => [{ id, maxDailyMinutes: 240, maxDailyWorkloadMinutes: 120 }] },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '20:00', daysOfWeekOff: [] }) },
    lesson: { findMany: async query => { bounds = query.where; assert.equal(query.select.bookings.select.clientId, undefined); return [{ startTime: new Date('2026-11-22T07:00:00Z'), endTime: new Date('2026-11-22T08:00:00Z'), bookings: [{ horseId: id }] }]; } },
    booking: { findMany: async query => { assert.equal(query.where.lessonId, null); return [{ startTime: new Date('2026-11-22T09:00:00Z'), endTime: new Date('2026-11-22T09:30:00Z'), horseId: id }]; } },
  };
  const result = await new QuickTrainerBookingService(prisma, {}, {}).context(actor, '2026-11-22');
  assert.equal(bounds.startTime.lt.toISOString(), '2026-11-22T21:00:00.000Z');
  assert.equal(bounds.endTime.gt.toISOString(), '2026-11-21T21:00:00.000Z');
  assert.equal(result.entries.length, 2); assert.equal(result.horses[0].usedMinutes, 90); assert.equal(result.horses[0].maxDailyMinutes, 120);
  await assert.rejects(new QuickTrainerBookingService(prisma, {}, {}).context(actor, '2026-02-30'), error => error.getStatus() === 400);
});

for (const price of [0, 1500]) test(`trainer creation stays SCHEDULED / UNPAID with no financial input, price=${price}`, async () => {
  const { LessonsService } = require('../dist/lessons/lessons.service');
  let written;
  const prisma = {
    roleAccess: { findUnique: async () => ({ lessonCreateOwn: true, lessonCreateAny: false }) },
    service: { findUnique: async () => ({ durationMinutes: 60, price, title: 'Индивидуальная', name: 'Занятие', maxCapacity: 1 }) },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '20:00', daysOfWeekOff: [] }) },
    lesson: { findMany: async () => [], create: async args => { written = args.data; return { id, ...args.data, bookings: [] }; } },
    cashAuditLog: { create: async () => ({}) },
    $transaction: async callback => callback(prisma),
  };
  const service = new LessonsService(prisma, {}, { validate: async () => {} });
  service.notifyLesson = async () => {};
  await service.createLesson({ trainerId: id, clientId: id, serviceId: id, startTime: '2026-11-22T10:00:00+03:00' }, undefined, actor);
  assert.equal(written.status, 'SCHEDULED'); assert.equal(written.paymentStatus, 'UNPAID');
  assert.equal(written.prepaymentAmount.toString(), '0');
});
