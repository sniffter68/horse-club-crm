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
const trainer = { id: '00000000-0000-4000-8000-000000000002', name: 'Мария' };
const horse = { id: '00000000-0000-4000-8000-000000000003', name: 'Валдай' };

test('client preferences API: create, list, detail, replace, omit, reset and UUID validation', async () => {
  let row = { id, firstName: 'Анна', lastName: '', name: 'Анна', preferredTrainerId: null, preferredHorseId: null };
  const includes = [];
  const response = include => {
    includes.push(include);
    return { ...row, memberships: [],
      preferredTrainer: row.preferredTrainerId ? { ...trainer, id: row.preferredTrainerId } : null,
      preferredHorse: row.preferredHorseId ? horse : null };
  };
  const service = new ClientsService({ client: {
    create: async ({ data, include }) => { row = { ...row, ...data }; return response(include); },
    update: async ({ data, include }) => { row = { ...row, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) }; return response(include); },
    findUnique: async ({ include }) => response(include),
    findMany: async ({ include }) => [response(include)], count: async () => 1,
  }, $transaction: queries => Promise.all(queries) });
  const module = await Test.createTestingModule({ controllers: [ClientsController], providers: [{ provide: ClientsService, useValue: service }] })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
    .overrideInterceptor(SanitizeRbacInterceptor).useValue({ intercept: (_, next) => next.handle() }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    const api = request(app.getHttpServer());
    const prefs = { preferredTrainerId: trainer.id, preferredHorseId: horse.id };
    const created = await api.post('/api/clients').send({ name: 'Анна', ...prefs }).expect(201);
    assert.deepEqual(created.body.preferredTrainer, trainer);
    assert.deepEqual(created.body.preferredHorse, horse);
    const list = await api.get('/api/clients').expect(200);
    assert.deepEqual(list.body[0].preferredHorse, horse);
    const detail = await api.get(`/api/clients/${id}`).expect(200);
    assert.deepEqual(detail.body.preferredTrainer, trainer);
    const replacement = '00000000-0000-4000-8000-000000000004';
    const changed = await api.patch(`/api/clients/${id}`).send({ preferredTrainerId: replacement }).expect(200);
    assert.equal(changed.body.preferredTrainer.id, replacement);
    assert.equal(changed.body.preferredHorseId, horse.id);
    await api.patch(`/api/clients/${id}`).send({ preferredTrainerId: '', preferredHorseId: '' }).expect(200);
    assert.equal(row.preferredTrainerId, replacement);
    assert.equal(row.preferredHorseId, horse.id);
    for (const field of ['preferredTrainerId', 'preferredHorseId']) {
      await api.patch(`/api/clients/${id}`).send({ [field]: 'invalid' }).expect(400);
      await api.post('/api/clients').send({ name: 'Анна', [field]: 42 }).expect(400);
    }
    const reset = await api.patch(`/api/clients/${id}`).send({ preferredTrainerId: null, preferredHorseId: null }).expect(200);
    assert.equal(reset.body.preferredTrainerId, null);
    assert.equal(reset.body.preferredHorseId, null);
    assert.equal(reset.body.preferredTrainer, null);
    assert.equal(reset.body.preferredHorse, null);
    for (const include of includes) {
      assert.deepEqual(include.preferredTrainer, { select: { id: true, name: true } });
      assert.deepEqual(include.preferredHorse, { select: { id: true, name: true } });
    }
  } finally { await app.close(); }
});
