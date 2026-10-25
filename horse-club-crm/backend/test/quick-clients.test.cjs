require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { ClientsController } = require('../dist/clients/clients.controller');
const { ClientsService } = require('../dist/clients/clients.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { SanitizeRbacInterceptor } = require('../dist/common/interceptors/sanitize-rbac.interceptor');
const id = '00000000-0000-4000-8000-000000000001';

test('quick clients HTTP: minimal guest, regular, validation, filtering and idempotent conversion', async () => {
  const rows = [];
  const whereArgs = [];
  const service = new ClientsService({
    client: {
      create: async ({ data }) => { const row = { id, ...data }; rows.push(row); return row; },
      update: async ({ data }) => Object.assign(rows[0], data),
      count: async ({ where }) => { whereArgs.push(where); return 1; },
      findMany: async ({ where }) => { whereArgs.push(where); return [{ ...rows[0], memberships: [] }]; },
    },
    $transaction: async queries => Promise.all(queries),
  });
  const module = await Test.createTestingModule({ controllers: [ClientsController], providers: [{ provide: ClientsService, useValue: service }] })
    .overrideGuard(require('../dist/auth/module-access.guard').ModuleAccessGuard).useValue({ canActivate: () => true }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
    .overrideInterceptor(SanitizeRbacInterceptor).useValue({ intercept: (_, next) => next.handle() }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    const api = request(app.getHttpServer());
    const guest = await api.post('/api/clients/quick').send({ name: '  Анна   Орлова  ', isOneTime: true }).expect(201);
    assert.equal(guest.body.name, 'Анна Орлова');
    assert.equal(guest.body.clientType, 'ONE_TIME');
    assert.equal(guest.body.id, id);
    assert.equal(rows[0].phone, undefined);
    await api.post('/api/clients/quick').send({ name: '   ' }).expect(400);
    await api.post('/api/clients/quick').send({ name: 'A', isOneTime: 'true' }).expect(400);
    await api.post('/api/clients/quick').send({ name: 'A', phone: 123 }).expect(400);
    const regular = await api.post('/api/clients/quick').send({ name: 'Мария', phone: '', riderLevel: 'BEGINNER', note: 'Первый визит' }).expect(201);
    assert.equal(regular.body.clientType, 'REGULAR');
    assert.equal(regular.body.riderLevel, 'BEGINNER');
    assert.equal(regular.body.preferences, 'Первый визит');
    await api.get('/api/clients?clientType=ONE_TIME&_start=0&_end=20&q=Анна').expect(200);
    assert.equal(whereArgs[0].clientType, 'ONE_TIME');
    assert.equal(whereArgs[0].OR[0].name.contains, 'Анна');
    await api.get('/api/clients?clientType=').expect(200);
    assert.equal(whereArgs[2].clientType, undefined);
    await api.get('/api/clients?clientType=WRONG').expect(400);
    await api.get('/api/clients?_start=wrong').expect(400);
    await api.patch(`/api/clients/${id}/convert-to-regular`).expect(200).expect(({ body }) => assert.equal(body.clientType, 'REGULAR'));
    await api.patch(`/api/clients/${id}/convert-to-regular`).expect(200);
    assert.equal(rows[0].name, 'Анна Орлова');
    await api.patch('/api/clients/invalid/convert-to-regular').expect(400);
    assert.deepEqual(Reflect.getMetadata('auth:roles', ClientsController.prototype.quickCreate), ['ADMIN', 'MANAGER']);
    assert.deepEqual(Reflect.getMetadata('auth:roles', ClientsController.prototype.convertToRegular), ['ADMIN', 'MANAGER']);
  } finally { await app.close(); }
});
