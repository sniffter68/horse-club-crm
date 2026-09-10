const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { LeadsController } = require('../dist/leads/leads.controller');
const { LeadsService } = require('../dist/leads/leads.service');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { serializeBigInt } = require('../dist/common/interceptors/bigint-json.interceptor');
const { Prisma } = require('@prisma/client');
const serviceId = '11111111-1111-4111-8111-111111111111';
let clients, drafts, app;
const prisma = {
  $transaction: async callback => callback(prisma),
  client: {
    findUnique: async ({ where }) => clients.find(row => row.phone === where.phone) ?? null,
    create: async ({ data }) => { const row = { id: '22222222-2222-4222-8222-222222222222', ...data }; clients.push(row); return row; },
    update: async ({ where, data }) => { const row = clients.find(row => row.id === where.id); Object.assign(row, data); return row; },
  },
  service: { findUnique: async ({ where }) => where.id === serviceId ? { id: serviceId } : null },
  leadRequest: { upsert: async ({ create }) => { if (!drafts.some(row => row.clientId === create.clientId && row.serviceId === create.serviceId)) drafts.push(create); } },
};
before(async () => {
  const module = await Test.createTestingModule({ controllers: [LeadsController], providers: [LeadsService, { provide: PrismaService, useValue: prisma }] }).compile();
  app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  await app.init();
});
beforeEach(() => { clients = []; drafts = []; });
after(async () => app?.close());
const lead = { firstName: 'Анна', phone: '+79991234567' };
test('public valid lead requires no Bearer token', async () => {
  const response = await request(app.getHttpServer()).post('/api/leads').send(lead).expect(201);
  assert.deepEqual(response.body, { success: true, clientId: clients[0].id, message: 'Заявка успешно принята' });
  assert.equal(clients[0].isRider, true);
  assert.equal(clients[0].name, 'Анна');
  assert.equal(drafts.length, 0);
});
for (const [title, input] of Object.entries({
  'missing phone': { firstName: 'Анна' }, 'missing name': { phone: lead.phone },
  'empty name': { ...lead, firstName: '  ' }, 'invalid phone': { ...lead, phone: '123' },
  'numeric name': { ...lead, firstName: 123 }, 'invalid email': { ...lead, email: 'bad' },
  'invalid service': { ...lead, serviceId: 'bad' }, 'unknown field': { ...lead, medicalNotes: 'private' },
})) test(`lead rejects ${title}`, async () => {
  await request(app.getHttpServer()).post('/api/leads').send(input).expect(400);
  assert.equal(clients.length, 0);
});
test('repeat lead fills missing fields and keeps one service draft', async () => {
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, serviceId }).expect(201);
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, firstName: 'Другое имя', email: 'anna@example.com', preferences: 'Новичок', serviceId }).expect(201);
  assert.equal(clients.length, 1); assert.equal(drafts.length, 1);
  assert.equal(clients[0].firstName, 'Анна'); assert.equal(clients[0].email, 'anna@example.com');
  assert.equal(clients[0].preferences, 'Новичок');
});
test('unknown service leaves no client or draft', async () => {
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, serviceId: '33333333-3333-4333-8333-333333333333' }).expect(404);
  assert.equal(clients.length, 0); assert.equal(drafts.length, 0);
});
test('BigInt JSON conversion preserves nested VK ids, dates and decimal prices', () => {
  const value = { bookings: [{ client: { vkUserId: 9007199254740993n } }], date: new Date('2026-01-01Z'), price: new Prisma.Decimal('12.50') };
  const json = JSON.parse(JSON.stringify(serializeBigInt(value)));
  assert.equal(json.bookings[0].client.vkUserId, '9007199254740993');
  assert.equal(json.price, '12.5'); assert.equal(json.date, '2026-01-01T00:00:00.000Z');
});
