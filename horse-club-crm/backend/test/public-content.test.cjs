const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { PublicModule } = require('../dist/public/public.module');
const { PrismaService } = require('../dist/prisma/prisma.service');

test('public content is anonymous, filtered, ordered and restricted to presentation fields', async () => {
  const calls = {};
  const fake = Object.fromEntries(['horse', 'trainer', 'service'].map(model => [model, {
    findMany: async args => {
      calls[model] = args;
      const record = { id: model, name: 'Public', imageUrl: null, description: null,
        phone: 'private', baseRate: 'private', feedingNotes: 'private', ownerId: 'private' };
      return [Object.fromEntries(Object.keys(args.select).map(key => [key, record[key] ?? null]))];
    },
  }]));
  const module = await Test.createTestingModule({ imports: [PublicModule] })
    .overrideProvider(PrismaService).useValue(fake).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  try {
    const { body } = await request(app.getHttpServer()).get('/api/public/content').expect(200);
    assert.deepEqual(calls.horse.where, { isPublic: true, status: 'active', isUnavailable: false });
    assert.deepEqual(calls.trainer.where, { isPublic: true, isActive: true });
    assert.deepEqual(calls.service.where, { isPublic: true });
    for (const model of ['horse', 'trainer', 'service']) {
      assert.deepEqual(calls[model].orderBy, [{ order: 'asc' }, { id: 'asc' }]);
      const allowed = {
        horse: ['id', 'name', 'breed', 'riderLevel', 'role', 'description', 'imageUrl'],
        trainer: ['id', 'name', 'role', 'qualification', 'specializations', 'description', 'imageUrl'],
        service: ['id', 'name', 'title', 'role', 'durationMinutes', 'price', 'description', 'imageUrl'],
      }[model];
      assert.deepEqual(Object.keys(calls[model].select).sort(), allowed.sort());
    }
    for (const records of Object.values(body)) {
      for (const privateField of ['phone', 'baseRate', 'feedingNotes', 'ownerId']) assert.equal(privateField in records[0], false);
    }
  } finally { await app.close(); }
});

test('all catalog create/update DTOs accept publication fields, validate photos and support clearing', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true,
    transformOptions: { enableImplicitConversion: true } });
  for (const [entity, defaults] of [
    ['horse', { name: 'Horse' }],
    ['trainer', { name: 'Trainer', baseRate: 0 }],
    ['service', { name: 'Service', price: 100, durationMinutes: 60 }],
  ]) {
    for (const action of ['create', 'update']) {
      const className = `${action[0].toUpperCase()}${action.slice(1)}${entity[0].toUpperCase()}${entity.slice(1)}Dto`;
      const dto = require(`../dist/${entity}s/dto/${action}-${entity}.dto`)[className];
      const meta = { type: 'body', metatype: dto };
      const input = { ...(action === 'create' ? defaults : {}), isPublic: false, imageUrl: 'https://example.com/photo.jpg', description: 'Bio', role: 'Role', order: 2 };
      const result = await pipe.transform(input, meta);
      assert.equal(result.isPublic, false);
      assert.equal(result.imageUrl, input.imageUrl);
      const uploaded = '/uploads/65ecf169-6c22-4e89-8baf-ddc3399da7ad.png';
      assert.equal((await pipe.transform({ ...input, imageUrl: uploaded }, meta)).imageUrl, uploaded);
      assert.equal((await pipe.transform({ ...input, imageUrl: '' }, meta)).imageUrl, null);
      for (const imageUrl of ['javascript:alert(1)', '/relative.jpg', 'not a URL', '/uploads/../secret.png', '/uploads/file.svg', '//evil.example/photo.png']) {
        await assert.rejects(pipe.transform({ ...input, imageUrl }, meta));
      }
      await assert.rejects(pipe.transform({ ...input, order: -1 }, meta));
    }
  }
});
