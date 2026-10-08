const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { HorsesService } = require('../dist/horses/horses.service');

test('feeding updates preserve line breaks, clear empty notes and do not modify unrelated horse fields', async () => {
  let data;
  const service = new HorsesService({ horse: { update: async args => { data = args.data; return { id: 'horse', ...data }; } } });
  await service.update('horse', { feedingNotes: '  Утро: 2 кг\nВечер: сено  ' });
  assert.deepEqual(data, { feedingNotes: 'Утро: 2 кг\nВечер: сено' });
  await service.update('horse', { feedingNotes: '  ' });
  assert.deepEqual(data, { feedingNotes: null });
  await service.update('horse', { name: 'Кролик' });
  assert.deepEqual(data, { name: 'Кролик' });
});

test('feeding API validates text and permissions and serves persisted notes', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { HorsesController } = require('../dist/horses/horses.controller');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  let horse = { id: '8f7fb395-fbcc-46bb-82d9-5f84985e5c5c', name: 'Кролик', feedingNotes: null };
  const module = await Test.createTestingModule({ controllers: [HorsesController], providers: [RolesGuard,
    { provide: HorsesService, useValue: { update: async (_id, dto) => (horse = { ...horse, ...dto }), findOne: async () => horse } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] }; return true;
  } }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const path = `/horses/${horse.id}`;
  try {
    await request(app.getHttpServer()).patch(path).set('x-role', 'TRAINER').send({ feedingNotes: 'text' }).expect(403);
    for (const feedingNotes of [123, 'x'.repeat(5001)]) {
      await request(app.getHttpServer()).patch(path).set('x-role', 'ADMIN').send({ feedingNotes }).expect(400);
    }
    await request(app.getHttpServer()).patch(path).set('x-role', 'MANAGER').send({ feedingNotes: 'Утро: овёс\nВечер: сено' }).expect(200);
    const response = await request(app.getHttpServer()).get(path).set('x-role', 'TRAINER').expect(200);
    assert.equal(response.body.feedingNotes, 'Утро: овёс\nВечер: сено');
    await request(app.getHttpServer()).patch(path).set('x-role', 'ADMIN').send({ feedingNotes: null }).expect(200);
  } finally { await app.close(); }
});
