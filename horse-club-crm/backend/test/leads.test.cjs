const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { LeadsController } = require('../dist/leads/leads.controller');
const { LeadsService } = require('../dist/leads/leads.service');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');
const { requestLimits } = require('../dist/common/request-limits');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { serializeBigInt } = require('../dist/common/interceptors/bigint-json.interceptor');
const { Prisma } = require('@prisma/client');

const serviceId = '11111111-1111-4111-8111-111111111111';
const leadId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
let clients, leads, notifications, app, queueFails;
const originalPeer = process.env.VK_ADMIN_PEER_ID;
const prisma = {
  vkNotification: { upsert: async ({ create }) => {
    if (queueFails) throw new Error('Queue unavailable');
    if (!notifications.some(row => row.key === create.key)) notifications.push(create);
  } },
  user: { findMany: async () => [] },
  $transaction: async callback => {
    const savedLeads = structuredClone(leads);
    const savedNotifications = structuredClone(notifications);
    try { return await callback(prisma); }
    catch (error) { leads = savedLeads; notifications = savedNotifications; throw error; }
  },
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
beforeEach(() => { queueFails = false; clients = []; leads = []; notifications = []; delete process.env.VK_ADMIN_PEER_ID; });
after(async () => {
  if (originalPeer === undefined) delete process.env.VK_ADMIN_PEER_ID; else process.env.VK_ADMIN_PEER_ID = originalPeer;
  await app?.close();
});

const lead = { consentAccepted: true, consentVersion: '2026-09-19', firstName: 'Анна', phone: '+79991234567' };

test('public valid lead creates a pending request without creating a client', async () => {
  const response = await request(app.getHttpServer()).post('/api/leads').send(lead).expect(201);
  assert.deepEqual(response.body, { success: true, leadId: '', message: 'Заявка успешно принята' });
  assert.equal(clients.length, 0);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].status, 'PENDING');
  assert.equal(leads[0].firstName, 'Анна');
  assert.equal(leads[0].consentVersion, '2026-09-19');
  assert.equal(leads[0].consentSource, 'LANDING');
  assert.ok(leads[0].consentedAt instanceof Date);
});

test('landing DTO saves direction and notes and queues exactly one site card only to the configured admin chat', async () => {
  process.env.VK_ADMIN_PEER_ID = '2000000001';
  const input = { name: ' Анна ', phone: lead.phone, direction: 'Конкур', source: 'landing', notes: 'Первое занятие',
    consentAccepted: true, consentVersion: lead.consentVersion };
  await request(app.getHttpServer()).post('/api/leads').send(input).expect(201);
  await request(app.getHttpServer()).post('/api/leads').send(input).expect(201);
  assert.equal(leads.length, 1); assert.equal(notifications.length, 1);
  assert.equal(leads[0].firstName, 'Анна'); assert.equal(leads[0].consentSource, 'LANDING');
  assert.equal(leads[0].preferences, 'Направление: Конкур\nПервое занятие');
  assert.equal(notifications[0].peerId, 2000000001n);
  assert.equal(notifications[0].message, '🔔 Новая заявка с сайта!\n• Имя: Анна\n• Телефон: +79991234567\n• Направление: Конкур\n• Источник: Лендинг');

  const delivery = new VkNotifications({ vkNotification: {
    findMany: async () => notifications.map(row => ({ ...row, id: row.key, attemptCount: 0 })),
    update: async () => {},
  } });
  delivery.vk = { api: { messages: { send: async () => { throw Object.assign(new Error('VK denied'), { code: 901 }); } } } };
  delivery.logger.warn = () => {};
  await assert.doesNotReject(delivery.flush());
  assert.equal(leads[0].status, 'PENDING');
});

test('landing accepts optional direction and missing VK configuration without losing the lead', async () => {
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, firstName: undefined, name: 'Анна', source: 'landing' }).expect(201);
  assert.equal(leads.length, 1); assert.equal(notifications.length, 0);
});

test('landing without direction sends a readable fallback', async () => {
  process.env.VK_ADMIN_PEER_ID = '2000000001';
  await request(app.getHttpServer()).post('/api/leads').send(lead).expect(201);
  assert.match(notifications[0].message, /Направление: Не указано/);
});

test('production same-origin browser request returns 503 while disabled and 201 with a DB lead and VK queue record once enabled', async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldEnabled = process.env.PUBLIC_LEADS_ENABLED;
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_LEADS_ENABLED = 'false';
  process.env.VK_ADMIN_PEER_ID = '2000000001';
  const module = await Test.createTestingModule({ controllers: [LeadsController],
    providers: [LeadsService, { provide: PrismaService, useValue: prisma }] }).compile();
  const productionApp = module.createNestApplication();
  productionApp.getHttpAdapter().getInstance().set('trust proxy', 1);
  productionApp.use(requestLimits());
  productionApp.setGlobalPrefix('api');
  productionApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true,
    transformOptions: { enableImplicitConversion: true } }));
  await productionApp.init();
  const input = { name: 'Анна', phone: lead.phone, direction: 'Выездка', source: 'landing', notes: 'Первый визит',
    consentAccepted: true, consentVersion: lead.consentVersion };
  const post = () => request(productionApp.getHttpServer()).post('/api/leads')
    .set('Host', 'club.horseclub68.ru').set('Origin', 'https://club.horseclub68.ru')
    .set('X-Forwarded-Proto', 'https').send(input);
  try {
    const disabled = await post().expect(503);
    assert.equal(disabled.body.message, 'Приём заявок временно отключён');
    assert.equal(leads.length, 0); assert.equal(notifications.length, 0);
    process.env.PUBLIC_LEADS_ENABLED = 'true';
    const enabled = await post().expect(201);
    assert.equal(enabled.body.success, true);
    assert.equal(leads.length, 1); assert.equal(leads[0].status, 'PENDING');
    assert.equal(leads[0].preferences, 'Направление: Выездка\nПервый визит');
    assert.equal(notifications.length, 1); assert.equal(notifications[0].peerId, 2000000001n);
    assert.match(notifications[0].message, /Новая заявка с сайта/);
  } finally {
    await productionApp.close();
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldEnabled === undefined) delete process.env.PUBLIC_LEADS_ENABLED; else process.env.PUBLIC_LEADS_ENABLED = oldEnabled;
  }
});

for (const [title, input] of Object.entries({
  'missing phone': { firstName: 'Анна' }, 'missing name': { phone: lead.phone },
  'empty name': { ...lead, firstName: '  ' }, 'invalid phone': { ...lead, phone: '123' },
  'numeric name': { ...lead, firstName: 123 }, 'invalid email': { ...lead, email: 'bad' },
  'invalid service': { ...lead, serviceId: 'bad' }, 'unknown field': { ...lead, medicalNotes: 'private' },
  'missing consent': { firstName: lead.firstName, phone: lead.phone, consentVersion: lead.consentVersion },
  'false consent': { ...lead, consentAccepted: false }, 'invalid consent version': { ...lead, consentVersion: 'draft consent' },
  'invalid source': { ...lead, source: 'VK' }, 'invalid direction': { ...lead, direction: 123 },
  'overlong notes': { ...lead, notes: 'x'.repeat(2001) },
})) test(`lead rejects ${title}`, async () => {
  await request(app.getHttpServer()).post('/api/leads').send(input).expect(400);
  assert.equal(clients.length, 0);
  assert.equal(leads.length, 0);
});

test('repeat submission cannot overwrite an existing request by knowing its phone', async () => {
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, serviceId }).expect(201);
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, firstName: 'Анна Мария', email: 'anna@example.com', preferences: 'Новичок', serviceId }).expect(201);
  assert.equal(clients.length, 0);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].firstName, 'Анна');
  assert.equal(leads[0].email, undefined);
  assert.equal(leads[0].preferences, undefined);
});

test('lead rejects a stale consent version', async () => {
  await request(app.getHttpServer()).post('/api/leads').send({ ...lead, consentVersion: '2026-01-01' }).expect(400);
  assert.equal(leads.length, 0);
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

const landingPayload = {
  consentAccepted: true, consentVersion: '2026-09-19', name: 'Анна',
  phone: '+7 (900) 123-11-11', direction: 'Конкур', source: 'landing', notes: 'Первое занятие',
};

test('POST normalizes a masked landing phone and deduplicates canonical resubmission', async () => {
  process.env.VK_ADMIN_PEER_ID = '2000000001';
  await request(app.getHttpServer()).post('/api/leads').send(landingPayload).expect(201);
  assert.equal(leads[0].phone, '+79001231111');
  assert.equal(leads[0].firstName, 'Анна');
  assert.equal(leads[0].preferences, 'Направление: Конкур\nПервое занятие');
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /\+79001231111/);
  await request(app.getHttpServer()).post('/api/leads').send({ ...landingPayload, phone: '+79001231111' }).expect(201);
  assert.equal(leads.length, 1);
  assert.equal(notifications.length, 1);
});

test('queue failure keeps the saved lead and successful HTTP response', async () => {
  process.env.VK_ADMIN_PEER_ID = '2000000001';
  queueFails = true;
  const response = await request(app.getHttpServer()).post('/api/leads').send(landingPayload).expect(201);
  assert.equal(response.body.success, true);
  assert.equal(leads.length, 1);
});

test('production public-leads flag controls acceptance', async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, PUBLIC_LEADS_ENABLED: process.env.PUBLIC_LEADS_ENABLED };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_LEADS_ENABLED;
    const response = await request(app.getHttpServer()).post('/api/leads').send(landingPayload).expect(503);
    assert.equal(response.body.message, 'Приём заявок временно отключён');
    assert.equal(leads.length, 0);
    process.env.PUBLIC_LEADS_ENABLED = 'true';
    await request(app.getHttpServer()).post('/api/leads').send(landingPayload).expect(201);
    assert.equal(leads.length, 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
