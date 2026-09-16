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
const leadId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
let clients, leads, app;
const prisma = {
  $transaction: async callback => callback(prisma),
  client: {
    findUnique: async ({ where }) => clients.find(row => row.phone === where.phone) ?? null,
    create: async ({ data }) => { const row = { id: clientId, ...data }; clients.push(row); return row; },
    update: async ({ where, data }) => { const row = clients.find(item => item.id === where.id); Object.assign(row, data); return row; },
  },
  service: { findUnique: async ({ where }) => where.id === serviceId ? { id: serviceId } : null },
  leadRequest: {
    findFirst: async ({ where }) => leads.find(row => row.phone === where.phone && row.status === where.status) ?? null,
    findUnique: async ({ where }) => leads.find(row => row.id === where.id) ?? null,
    create: async ({ data }) => {
      const row = { id: leadId, status: 'PENDING', clientId: null, processedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      leads.push(row); return row;
    },
    update: async ({ where, data }) => { const row = leads.find(item => item.id === where.id); Object.assign(row, data); return row; },
  },
};

before(async () => {
  const module = await Test.createTestingModule({ controllers: [LeadsController], providers: [LeadsService, { provide: PrismaService, useValue: prisma }] }).compile();
  app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  await app.init();
});
beforeEach(() => { clients = []; leads = []; });
after(async () => app?.close());

const lead = { firstName: 'Анна', phone: '+79991234567' };

test('public valid lead creates a pending request without creating a client', async () => {
  const response = await request(app.getHttpServer()).post('/api/leads').send(lead).expect(201);
  assert.deepEqual(response.body, { success: true, leadId, message: 'Заявка успешно принята' });
  assert.equal(clients.length, 0);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].status, 'PENDING');
  assert.equal(leads[0].firstName, 'Анна');
});

for (const [title, input] of Object.entries({
  'missing phone': { firstName: 'Анна' }, 'missing name': { phone: lead.phone },
  'empty name': { ...lead, firstName: '  ' }, 'invalid phone': { ...lead, phone: '123' },
  'numeric name': { ...lead, firstName: 123 }, 'invalid email': { ...lead, email: 'bad' },
  'invalid service': { ...lead, serviceId: 'bad' }, 'unknown field': { ...lead, medicalNotes: 'private' },
})) test(`lead rejects ${title}`, async () => {
  await request(app.getHttpServer()).post('/api/leads').send(input).expect(400);
  assert.equal(clients.length, 0);
  assert.equal(leads.length, 0);
});

test('repeat submission updates one pending request and still creates no client', async () => {
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, serviceId }).expect(201);
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, firstName: 'Анна Мария', email: 'anna@example.com', preferences: 'Новичок', serviceId }).expect(201);
  assert.equal(clients.length, 0);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].firstName, 'Анна Мария');
  assert.equal(leads[0].email, 'anna@example.com');
  assert.equal(leads[0].preferences, 'Новичок');
});

test('administrator acceptance creates a client and closes the request', async () => {
  await new LeadsService(prisma).create({ ...lead, serviceId });
  const result = await new LeadsService(prisma).accept(leadId, {
    firstName: 'Анна', lastName: 'Петрова', phone: lead.phone, email: 'anna@example.com',
    preferences: 'Новичок', isRider: true, isPayer: false,
  });
  assert.equal(result.client.id, clientId);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].name, 'Анна Петрова');
  assert.equal(leads[0].status, 'ACCEPTED');
  assert.equal(leads[0].clientId, clientId);
});

test('unknown service leaves no client or request', async () => {
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, serviceId: '44444444-4444-4444-8444-444444444444' }).expect(404);
  assert.equal(clients.length, 0);
  assert.equal(leads.length, 0);
});

test('BigInt JSON conversion preserves nested VK ids, dates and decimal prices', () => {
  const value = { bookings: [{ client: { vkUserId: 9007199254740993n } }], date: new Date('2026-01-01Z'), price: new Prisma.Decimal('12.50') };
  const json = JSON.parse(JSON.stringify(serializeBigInt(value)));
  assert.equal(json.bookings[0].client.vkUserId, '9007199254740993');
  assert.equal(json.price, '12.5'); assert.equal(json.date, '2026-01-01T00:00:00.000Z');
});
