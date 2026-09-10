const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomInt, randomUUID } = require('node:crypto');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');

test('real PostgreSQL: public parallel submissions create one client and draft', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  await app.init();
  const prisma = app.get(PrismaService);
  const serviceId = randomUUID();
  let phone;
  do { phone = `+7999${randomInt(0, 10000000).toString().padStart(7, '0')}`; } while (await prisma.client.findUnique({ where: { phone } }));
  let clientId;
  try {
    await prisma.service.create({ data: { id: serviceId, name: 'QA-lead-service', title: 'QA-lead-service', durationMinutes: 60 } });
    const responses = await Promise.all(Array.from({ length: 3 }, () => request(app.getHttpServer()).post('/api/leads').send({ firstName: 'QA lead', phone, serviceId }).expect(201)));
    clientId = responses[0].body.clientId;
    assert.ok(responses.every(response => response.body.clientId === clientId));
    assert.equal(await prisma.client.count({ where: { phone } }), 1);
    assert.equal(await prisma.leadRequest.count({ where: { clientId, serviceId } }), 1);
    assert.equal(await prisma.booking.count({ where: { clientId } }), 0);
    await request(app.getHttpServer()).post('/api/leads').send({ firstName: 'QA lead' }).expect(400);
  } finally {
    const ownClient = await prisma.client.findUnique({ where: { phone } });
    if (ownClient) {
      await prisma.leadRequest.deleteMany({ where: { clientId: ownClient.id, serviceId } });
      await prisma.client.delete({ where: { id: ownClient.id } });
    }
    await prisma.service.deleteMany({ where: { id: serviceId } });
    await app.close();
  }
});
