const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
require('reflect-metadata');

const { ValidationPipe } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { Role } = require('@prisma/client');
const request = require('supertest');
const { ClientsController } = require('../dist/clients/clients.controller');
const { ClientsService } = require('../dist/clients/clients.service');
const { SanitizeRbacInterceptor } = require('../dist/common/interceptors/sanitize-rbac.interceptor');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { SettingsController } = require('../dist/settings/settings.controller');
const { SettingsService } = require('../dist/settings/settings.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');

const clientId = '11111111-1111-4111-8111-111111111111';
const clients = [
  { id: clientId, name: 'Анна', phone: '+70000000001', email: 'anna@example.com', medicalNotes: 'Аллергия' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Борис', phone: '+70000000002', email: null, medicalNotes: null },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Вера', phone: '+70000000003', email: null, medicalNotes: 'Ограничение' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Глеб', phone: '+70000000004', email: null, medicalNotes: null },
];

let schedule = {
  id: 1,
  openTime: '09:00',
  closeTime: '21:00',
  dayOfWeekOff: 1,
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

const prisma = {
  client: {
    count: async () => clients.length,
    findMany: async ({ skip, take }) => clients.slice(skip, skip + take),
    findUnique: async ({ where }) => clients.find((client) => client.id === where.id) ?? null,
  },
  clubSchedule: {
    upsert: async () => schedule,
    update: async ({ data }) => {
      schedule = { ...schedule, ...data, updatedAt: new Date() };
      return schedule;
    },
  },
  $transaction: async (operations) => Promise.all(operations),
};

const testAuthGuard = {
  canActivate(context) {
    const req = context.switchToHttp().getRequest();
    const requestedRole = req.headers['x-test-role'];
    const role = Object.values(Role).includes(requestedRole) ? requestedRole : Role.ADMIN;
    req.user = { id: 'test-user', email: 'test@example.com', role };
    return true;
  },
};

let app;

before(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [ClientsController, SettingsController],
    providers: [
      ClientsService,
      SettingsService,
      RolesGuard,
      SanitizeRbacInterceptor,
      { provide: PrismaService, useValue: prisma },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(testAuthGuard)
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  await app.init();
});

after(async () => {
  await app?.close();
});

test('clients list returns the Refine slice and total headers', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/clients?_start=1&_end=3&_sort=name&_order=ASC')
    .set('x-test-role', Role.ADMIN)
    .expect(200);

  assert.deepEqual(response.body.map(({ name }) => name), ['Борис', 'Вера']);
  assert.equal(response.headers['x-total-count'], '4');
  assert.equal(response.headers['access-control-expose-headers'], 'x-total-count');
});

test('client medical notes are hidden from TRAINER and preserved for ADMIN', async () => {
  const trainerResponse = await request(app.getHttpServer())
    .get(`/api/clients/${clientId}`)
    .set('x-test-role', Role.TRAINER)
    .expect(200);
  assert.equal(Object.hasOwn(trainerResponse.body, 'medicalNotes'), false);

  const adminResponse = await request(app.getHttpServer())
    .get(`/api/clients/${clientId}`)
    .set('x-test-role', Role.ADMIN)
    .expect(200);
  assert.equal(adminResponse.body.medicalNotes, 'Аллергия');
});

test('ADMIN updates club schedule while TRAINER receives 403', async () => {
  const updated = await request(app.getHttpServer())
    .patch('/api/settings/club-schedule')
    .set('x-test-role', Role.ADMIN)
    .send({ openTime: '08:00', closeTime: '20:00', dayOfWeekOff: 0 })
    .expect(200);
  assert.equal(updated.body.openTime, '08:00');
  assert.equal(updated.body.closeTime, '20:00');
  assert.equal(updated.body.dayOfWeekOff, 0);

  await request(app.getHttpServer())
    .patch('/api/settings/club-schedule')
    .set('x-test-role', Role.TRAINER)
    .send({ openTime: '10:00' })
    .expect(403);
});
