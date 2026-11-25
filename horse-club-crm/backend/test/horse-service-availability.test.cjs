const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CreateHorseDto } = require('../dist/horses/dto/create-horse.dto');
const { UpdateHorseDto } = require('../dist/horses/dto/update-horse.dto');
const { BookingAvailabilityDto } = require('../dist/bookings/dto/booking-query.dto');
const { HorsesService } = require('../dist/horses/horses.service');
const { BookingsService } = require('../dist/bookings/bookings.service');
const flags = { allowIndividual: false, allowGroup: true, allowWalk: false, allowSpecial: true };

test('horse flags validate booleans, preserve false and support partial updates', async () => {
  assert.deepEqual(await validate(plainToInstance(CreateHorseDto, { name: 'Test', ...flags })), []);
  assert.deepEqual(await validate(plainToInstance(UpdateHorseDto, { allowWalk: false })), []);
  for (const key of Object.keys(flags)) {
    assert.ok((await validate(plainToInstance(UpdateHorseDto, { [key]: 'false' }))).length);
  }
  const stored = { id: 'horse', ...flags };
  const horses = new HorsesService({ horse: {
    create: async ({ data }) => { Object.assign(stored, data); return stored; },
    update: async ({ data }) => { Object.assign(stored, data); return stored; },
  } });
  assert.deepEqual((await horses.create({ name: 'Test', ...flags })).allowIndividual, false);
  await horses.update('horse', { allowWalk: true });
  assert.equal(stored.allowWalk, true);
  assert.equal(stored.allowIndividual, false);
  assert.equal(stored.allowSpecial, true);
});

test('availability adds soft direction warnings without changing workload status or legacy response fields', async () => {
  const tx = { horse: { findMany: async () => [{ id: 'horse', name: 'Test', status: 'active', maxDailyWorkloadMinutes: 120, ...flags }] },
    arena: { findMany: async () => [] }, booking: { findMany: async () => [] }, lesson: { findMany: async () => [] } };
  const service = new BookingsService({ $transaction: fn => fn(tx) });
  const range = { from: '2026-11-25T09:00:00Z', to: '2026-11-25T10:00:00Z' };
  for (const [direction, allowed] of Object.entries(flags)) {
    const result = await service.availability({ ...range, serviceDirection: direction });
    assert.equal(result.horseWorkloads[0].serviceAllowed, allowed);
    assert.equal(result.horseWorkloads[0].status, 'AVAILABLE');
    assert.deepEqual(result.horseWorkloads[0].warnings, allowed ? [] : ['HORSE_SERVICE_DISABLED']);
  }
  assert.equal((await service.availability({ ...range, serviceType: 'walks' })).horseWorkloads[0].serviceAllowed, false);
  assert.equal((await service.availability(range)).horseWorkloads[0].serviceAllowed, undefined);
  assert.deepEqual(await validate(plainToInstance(BookingAvailabilityDto, { ...range, serviceDirection: '', serviceType: '' })), []);
  assert.ok((await validate(plainToInstance(BookingAvailabilityDto, { ...range, serviceDirection: 'unknown' }))).length);
});

test('horse HTTP create/update/list/detail round trip retains flags and validates input', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { HorsesController } = require('../dist/horses/horses.controller');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
  const id = '00000000-0000-4000-8000-000000000091';
  let row = { id, boardingContracts: [], healthLogs: [], bookings: [] };
  const horses = new HorsesService({
    horse: { create: async ({ data }) => (row = { ...row, ...data }),
      update: async ({ data }) => (row = { ...row, ...data }),
      findUnique: async () => row, findMany: async () => [row], count: async () => 1 },
    boardingContract: { findFirst: async () => null },
    $transaction: queries => Promise.all(queries),
  });
  const module = await Test.createTestingModule({ controllers: [HorsesController], providers: [RolesGuard,
    { provide: HorsesService, useValue: horses },
  ] }).overrideGuard(ModuleAccessGuard).useValue({ canActivate: () => true })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
      context.switchToHttp().getRequest().user = { role: 'ADMIN' }; return true;
    } }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  try {
    await request(app.getHttpServer()).post('/horses').send({ name: 'Test', ...flags }).expect(201);
    await request(app.getHttpServer()).patch(`/horses/${id}`).send({ allowSpecial: false }).expect(200);
    await request(app.getHttpServer()).patch(`/horses/${id}`).send({ allowGroup: 'false' }).expect(400);
    const list = await request(app.getHttpServer()).get('/horses').expect(200);
    const detail = await request(app.getHttpServer()).get(`/horses/${id}`).expect(200);
    for (const response of [list.body[0], detail.body]) {
      for (const [key, value] of Object.entries({ ...flags, allowSpecial: false })) assert.equal(response[key], value);
    }
  } finally { await app.close(); }
});
