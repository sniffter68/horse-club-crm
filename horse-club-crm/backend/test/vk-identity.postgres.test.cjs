const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { ClientsController } = require('../dist/clients/clients.controller');
const { ClientsService } = require('../dist/clients/clients.service');
const { VkIdentityService } = require('../dist/vk-bot/vk-identity.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { BigIntJsonInterceptor } = require('../dist/common/interceptors/bigint-json.interceptor');

test('PostgreSQL PATCH /api/clients/:id/vk validates real Prisma selects and ownership', {
  skip: process.env.RUN_VK_IDENTITY_TESTS !== '1', timeout: 60000,
}, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.searchParams.get('schema') || '', /^vk_identity_check_\d+$/);
  const p = new PrismaClient();
  let app;
  const clients = [], trainers = [], users = [];
  try {
    const module = await Test.createTestingModule({ controllers: [ClientsController], providers: [
      { provide: ClientsService, useValue: new ClientsService(p, new VkIdentityService(p)) },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .overrideGuard(ModuleAccessGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new BigIntJsonInterceptor());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    const target = await p.client.create({ data: { name: 'VK target' } }); clients.push(target.id);
    const patch = vkId => request(app.getHttpServer()).patch(`/api/clients/${target.id}/vk`).send({ vkId });
    await t.test('bind and repeat same owner', async () => {
      await patch('900000001').expect(200);
      await patch('900000001').expect(200);
      const row = await p.client.findUniqueOrThrow({ where: { id: target.id } });
      assert.equal(row.vkId, '900000001'); assert.equal(row.vkUserId, 900000001n);
    });
    for (const kind of ['trainer', 'client', 'user']) {
      await t.test(`active ${kind} conflicts; archived ${kind} releases binding`, async () => {
        const vkId = String(900000002 + ['trainer', 'client', 'user'].indexOf(kind));
        let row;
        if (kind === 'trainer') {
          row = await p.trainer.create({ data: { name: 'VK trainer', vkId: BigInt(vkId) } }); trainers.push(row.id);
        } else if (kind === 'client') {
          row = await p.client.create({ data: { name: 'VK owner', vkId, vkUserId: BigInt(vkId) } }); clients.push(row.id);
        } else {
          row = await p.user.create({ data: { email: `${randomUUID()}@vk.test`, passwordHash: 'unused', role: 'MANAGER', vkId, vkUserId: BigInt(vkId),
            staffProfile: { create: { fullName: 'VK staff', roleTitle: 'Manager' } } } }); users.push(row.id);
        }
        const before = await p.client.findUniqueOrThrow({ where: { id: target.id } });
        await patch(vkId).expect(409);
        assert.equal((await p.client.findUniqueOrThrow({ where: { id: target.id } })).vkId, before.vkId);
        if (kind === 'trainer') await p.trainer.update({ where: { id: row.id }, data: { isActive: false } });
        else if (kind === 'client') await p.client.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
        else await p.staffProfile.update({ where: { userId: row.id }, data: { isActive: false } });
        await patch(vkId).expect(200);
        const previous = await p[kind].findUniqueOrThrow({ where: { id: row.id } });
        assert.equal(previous.vkId, null);
        if (kind !== 'trainer') assert.equal(previous.vkUserId, null);
      });
    }
    await patch(null).expect(200);
    assert.equal((await p.client.findUniqueOrThrow({ where: { id: target.id } })).vkUserId, null);
  } finally {
    if (app) await app.close();
    await p.staffProfile.deleteMany({ where: { userId: { in: users } } });
    await p.user.deleteMany({ where: { id: { in: users } } });
    await p.client.deleteMany({ where: { id: { in: clients } } });
    await p.trainer.deleteMany({ where: { id: { in: trainers } } });
    await p.$disconnect();
  }
});
