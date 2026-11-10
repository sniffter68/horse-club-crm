const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
require('reflect-metadata');
const { validateTelegramInitData } = require('../dist/modules/telegram-bot/telegram-init-data');
const { TelegramAuthGuard } = require('../dist/modules/telegram-bot/telegram-auth.guard');
const { TelegramLinkService } = require('../dist/modules/telegram-bot/telegram-link.service');
const { TmaBookingService } = require('../dist/modules/telegram-bot/tma-booking.service');
const { TelegramBotService } = require('../dist/modules/telegram-bot/telegram-bot.service');
const { DEFAULT_LEAD_CONSENT_VERSION } = require('../dist/common/lead-consent');
const { DateTime } = require('luxon');
const token = '123:test-token-only';
const clientId = '11111111-1111-4111-8111-111111111111';
const trainerId = '22222222-2222-4222-8222-222222222222';
const serviceId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
function sign(fields = {}) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 123456789012, first_name: 'Анна', last_name: 'Тест', username: 'anna' }), ...fields });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
const status = code => error => error.getStatus() === code;
test('Telegram HMAC verifies signed identity and rejects tampering, duplicate fields, wrong token, stale/future data and invalid users', () => {
  assert.deepEqual(validateTelegramInitData(sign(), token), { telegramUserId: '123456789012', firstName: 'Анна', lastName: 'Тест', username: 'anna' });
  const now = Math.floor(Date.now() / 1000);
  for (const raw of ['', sign() + '&user=forged', sign().replace('anna', 'evil'), sign({ auth_date: String(now - 3601) }),
    sign({ auth_date: String(now + 100) }), sign({ auth_date: 'NaN' }), sign({ user: 'invalid' }),
    sign({ user: JSON.stringify({ id: -1, first_name: 'A' }) }), sign({ user: JSON.stringify({ id: 1.5, first_name: 'A' }) })]) {
    assert.throws(() => validateTelegramInitData(raw, token), status(401));
  }
  assert.throws(() => validateTelegramInitData(sign(), 'wrong'), status(401));
});

test('guard derives signed identity and lets archived profiles access only the booking flow', async () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_BOT_TOKEN = token;
  try {
    let archived = false, disabled = false, upserts = 0;
    const bindings = [];
    const guard = new TelegramAuthGuard({
      clubModuleSettings: { findUnique: async () => ({ isEnabled: !disabled }) },
      client: { upsert: async input => { upserts++; assert.equal(input.where.telegramUserId, '123456789012'); return { id: clientId, deletedAt: archived ? new Date() : null }; } },
    }, { bindUsername: async (...args) => bindings.push(args) });
    const request = { get: name => name === 'X-Telegram-Init-Data' ? sign() : undefined };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    assert.equal(await guard.canActivate(context), true); assert.equal(request.telegram.clientId, clientId); assert.deepEqual(bindings, [['123456789012', 'anna']]);
    disabled = true; await assert.rejects(guard.canActivate(context), status(403)); assert.equal(upserts, 1);
    disabled = false; archived = true; await assert.rejects(guard.canActivate(context), status(403));
    for (const [method, path] of [['GET', '/api/tma/services'], ['GET', '/api/tma/slots'], ['POST', '/api/tma/bookings']]) {
      request.method = method; request.path = path;
      assert.equal(await guard.canActivate(context), true);
    }
    request.method = 'GET'; request.path = '/api/tma/my-bookings';
    await assert.rejects(guard.canActivate(context), status(403));
    request.method = 'POST'; request.path = '/api/tma/bookings/id/cancel-request';
    await assert.rejects(guard.canActivate(context), status(403));
  } finally { if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous; }
});

test('signed TMA binds the pending CRM profile before upsert and rejects forged data before linking', async () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_BOT_TOKEN = token;
  const client = { id: clientId, telegramUsername: 'anna', telegramUserId: null, deletedAt: null };
  let upserts = 0, bindings = 0;
  const prisma = {
    clubModuleSettings: { findUnique: async () => null },
    client: {
      findUnique: async ({ where }) => client.telegramUserId === where.telegramUserId ? client : null,
      findMany: async ({ where }) => client.telegramUsername === where.telegramUsername && client.telegramUserId === null ? [client] : [],
      updateMany: async ({ where, data }) => { assert.equal(where.id, clientId); bindings++; Object.assign(client, data); return { count: 1 }; },
      upsert: async ({ where }) => { upserts++; assert.equal(client.telegramUserId, where.telegramUserId); return client; },
    },
    user: { findUnique: async () => null, findMany: async () => [] },
    $transaction: async operation => operation(prisma),
  };
  const guard = new TelegramAuthGuard(prisma, new TelegramLinkService(prisma));
  let raw = sign().replace('anna', 'evil');
  const request = { method: 'GET', path: '/api/tma/services', get: name => name === 'X-Telegram-Init-Data' ? raw : undefined };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  try {
    await assert.rejects(guard.canActivate(context), status(401));
    assert.equal(bindings, 0); assert.equal(upserts, 0);
    raw = sign();
    await guard.canActivate(context);
    assert.equal(bindings, 1); assert.equal(request.telegram.clientId, clientId);
    await guard.canActivate(context);
    assert.equal(bindings, 1); assert.equal(upserts, 2);
  } finally { if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous; }
});

function fixture() {
  const start = DateTime.now().setZone('Europe/Moscow').plus({ days: 2 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  const saved = { id: '55555555-5555-4555-8555-555555555555', clientId, status: 'scheduled', startTime: start.toJSDate(), endTime: start.plus({ hours: 1 }).toJSDate(),
    clientCancellationRequested: false, lesson: null };
  const writes = [], options = [];
  const tx = {
    user: { findMany: async () => [] },
    service: { findFirst: async () => ({ id: serviceId, isPublic: true, durationMinutes: 60 }) },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
    trainer: { findFirst: async () => ({ id: trainerId }), findMany: async () => [{ id: trainerId, name: 'Тренер' }] },
    client: { findUnique: async ({ where }) => where.phone ? null : { id: clientId, deletedAt: null }, update: async input => { writes.push(input); } },
    booking: { findUnique: async () => null, findFirst: async ({ where }) => where.clientId === clientId ? saved : null,
      findUniqueOrThrow: async () => saved, update: async input => { writes.push(input); return { ...saved, ...input.data }; } },
  };
  const prisma = { ...tx, $transaction: async (operation, config) => { options.push(config); return operation(tx); } };
  const lessons = { createLesson: async (input, transaction) => { assert.equal(transaction, tx); assert.deepEqual(input.participants, [{ clientId }]); writes.push(input); return { bookings: [saved] }; } };
  const rules = { validate: async () => {} };
  const service = new TmaBookingService(prisma, rules, lessons);
  const dto = { serviceId, trainerId, requestId, startTime: start.toISO(), phone: '+79991234567', consentAccepted: true, consentVersion: DEFAULT_LEAD_CONSENT_VERSION };
  return { service, dto, tx, saved, writes, options, rules, start };
}
test('create uses serializable existing lesson rules, server-owned client and audited consent; retry returns original', async () => {
  const f = fixture();
  const result = await f.service.create(clientId, f.dto);
  assert.equal(result.telegramRequestId, requestId); assert.ok(result.telegramConsentedAt instanceof Date);
  assert.equal(f.options[0].isolationLevel, 'Serializable');
  f.tx.booking.findUnique = async () => f.saved;
  f.writes.length = 0;
  assert.equal((await f.service.create(clientId, f.dto)).id, f.saved.id); assert.equal(f.writes.length, 0);
  await assert.rejects(f.service.create('other-client', f.dto), status(409));
});
test('rejects stale consent, phone takeover, unpublished services and unoffered start times', async () => {
  let f = fixture(); await assert.rejects(f.service.create(clientId, { ...f.dto, consentVersion: 'old' }), status(400));
  f = fixture(); f.tx.client.findUnique = async ({ where }) => where.phone ? { id: 'another', telegramUserId: '456' } : { id: clientId, telegramUserId: '123' };
  await assert.rejects(f.service.create(clientId, f.dto), status(400)); assert.equal(f.writes.length, 0);
  f = fixture(); f.tx.service.findFirst = async () => null; await assert.rejects(f.service.create(clientId, f.dto), status(404));
  f = fixture(); await assert.rejects(f.service.create(clientId, { ...f.dto, startTime: f.start.plus({ minutes: 1 }).toISO() }), status(409));
});
test('slots honor Moscow date, day off, trainer capacity conflicts and do not swallow infrastructure failures', async () => {
  const f = fixture(); const date = f.start.toISODate();
  assert.ok((await f.service.slots(clientId, { date, serviceId })).slots.length > 0);
  f.rules.validate = async () => { const { ConflictException } = require('@nestjs/common'); throw new ConflictException(); };
  assert.deepEqual(await f.service.slots(clientId, { date, serviceId }), { slots: [] });
  f.rules.validate = async () => { throw new Error('database unavailable'); };
  await assert.rejects(f.service.slots(clientId, { date, serviceId }), /database unavailable/);
  f.tx.clubSchedule.findUnique = async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [f.start.weekday % 7] });
  assert.deepEqual(await f.service.slots(clientId, { date, serviceId }), { slots: [] });
  await assert.rejects(f.service.slots(clientId, { date: '2026-02-30' }), status(400));
  f.tx.clubSchedule.findUnique = async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [0] });
  const sunday = DateTime.now().setZone('Europe/Moscow').plus({ days: 7 }).set({ weekday: 7 }).toISODate();
  assert.deepEqual(await f.service.slots(clientId, { date: sunday, serviceId }), { slots: [] });
  f.tx.clubSchedule.findUnique = async () => null;
  await assert.rejects(f.service.slots(clientId, { date, serviceId }), status(503));
});
test('archived profile can preview trainer slots without restoring the client', async () => {
  const f = fixture();
  f.tx.client.findUnique = async () => ({ id: clientId, deletedAt: new Date() });
  let validations = 0;
  f.rules.validate = async (_tx, input) => {
    validations++;
    assert.equal(input.lockResources, false);
    assert.deepEqual(input.participants, []);
  };
  assert.ok((await f.service.slots(clientId, { date: f.start.toISODate(), serviceId })).slots.length > 0);
  assert.ok(validations > 0);
  assert.equal(f.writes.length, 0);
});

test('cancellation checks owner and effective lesson state, leaves finances and reservation untouched', async () => {
  const f = fixture();
  await assert.rejects(f.service.cancelRequest('another-client', f.saved.id), status(404));
  const result = await f.service.cancelRequest(clientId, f.saved.id);
  assert.equal(result.clientCancellationRequested, true);
  assert.deepEqual(f.writes[0].data, { clientCancellationRequested: true, clientConfirmed: false });
  f.saved.lesson = { startTime: f.start.toJSDate(), status: 'CANCELLED' };
  await assert.rejects(f.service.cancelRequest(clientId, f.saved.id), status(409));
});
test('bot is disabled without a token and rejects non-HTTPS WebApp URLs before polling', () => {
  const previous = { token: process.env.TELEGRAM_BOT_TOKEN, url: process.env.TELEGRAM_WEBAPP_URL };
  try {
    delete process.env.TELEGRAM_BOT_TOKEN; assert.doesNotThrow(() => new TelegramBotService().onModuleInit());
    process.env.TELEGRAM_BOT_TOKEN = token; process.env.TELEGRAM_WEBAPP_URL = 'http://example.test/tma';
    assert.throws(() => new TelegramBotService().onModuleInit(), /HTTPS/);
  } finally {
    for (const [name, value] of [['TELEGRAM_BOT_TOKEN', previous.token], ['TELEGRAM_WEBAPP_URL', previous.url]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('bot routes getMe through TELEGRAM_API_ROOT without waiting for the network during Nest initialization', { timeout: 5000 }, async t => {
  const { createServer } = require('node:http');
  const { Bot } = require('grammy');
  const previous = Object.fromEntries(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_API_ROOT', 'TELEGRAM_WEBAPP_URL'].map(name => [name, process.env[name]]));
  const requests = [];
  let finishResponse;
  let receivedRequest;
  const received = new Promise(resolve => { receivedRequest = resolve; });
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url.endsWith('/deleteWebhook')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, result: true }));
      return;
    }
    finishResponse = () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, result: { id: 123, is_bot: true, first_name: 'Test', username: 'test_bot' } }));
    };
    receivedRequest();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let started;
  const probe = new Promise(resolve => { started = resolve; });
  t.mock.method(Bot.prototype, 'start', function () {
    started(this.botInfo);
    return Promise.resolve();
  });
  try {
    process.env.TELEGRAM_BOT_TOKEN = token;
    process.env.TELEGRAM_API_ROOT = ` http://127.0.0.1:${server.address().port}/telegram `;
    process.env.TELEGRAM_WEBAPP_URL = 'https://example.test/tma';
    const service = new TelegramBotService();
    assert.equal(service.onModuleInit(), undefined);
    await received;
    // The proxy is still holding getMe open while Nest initialization has returned.
    finishResponse();
    assert.equal((await probe).username, 'test_bot');
    assert.deepEqual(requests, [`/telegram/bot${token}/deleteWebhook`, `/telegram/bot${token}/getMe`]);
    await service.onModuleDestroy();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('empty API root keeps the Telegram default and polling failure is handled without leaking credentials', async t => {
  const { Api, Bot } = require('grammy');
  const { Logger } = require('@nestjs/common');
  const previous = Object.fromEntries(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_API_ROOT', 'TELEGRAM_WEBAPP_URL'].map(name => [name, process.env[name]]));
  const messages = [];
  t.mock.method(Api.prototype, 'deleteWebhook', async () => true);
  t.mock.method(Bot.prototype, 'init', async () => {});
  t.mock.method(Logger.prototype, 'error', message => messages.push(message));
  t.mock.method(Bot.prototype, 'start', function () {
    assert.equal(this.api.options.apiRoot, undefined);
    return Promise.reject(new Error(`network unavailable: ${token}`));
  });
  try {
    process.env.TELEGRAM_BOT_TOKEN = token;
    process.env.TELEGRAM_API_ROOT = '   ';
    process.env.TELEGRAM_WEBAPP_URL = 'https://example.test/tma';
    const service = new TelegramBotService();
    assert.equal(service.onModuleInit(), undefined);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.length, 1);
    assert.match(messages[0], /network/);
    assert.ok(!messages[0].includes(token));
    await service.onModuleDestroy();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('HTTP routes require signed Telegram auth, reject invalid UUIDs, staff fields and consent coercion', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { TelegramBotController } = require('../dist/modules/telegram-bot/telegram-bot.controller');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const previous = process.env.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_BOT_TOKEN = token;
  const f = fixture();
  const service = { services: async () => ({ services: [] }), create: async (owner, dto) => ({ owner, requestId: dto.requestId }), cancelRequest: async () => ({}),
    myBookings: async (owner, query) => { assert.equal(owner, clientId); assert.equal(query.offset, 0); assert.equal(query.limit, 20); return { bookings: [], hasMore: false }; } };
  const module = await Test.createTestingModule({ controllers: [TelegramBotController], providers: [TelegramAuthGuard,
    { provide: TelegramLinkService, useValue: { bindUsername: async () => {} } },
    { provide: TmaBookingService, useValue: service }, { provide: PrismaService, useValue: {
      clubModuleSettings: { findUnique: async () => null }, client: { upsert: async () => ({ id: clientId }) },
    } }] }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  await app.init();
  try {
    await request(app.getHttpServer()).get('/api/tma/services').expect(401);
    await request(app.getHttpServer()).get('/api/tma/services').set('X-Telegram-Init-Data', sign()).expect(200);
    await request(app.getHttpServer()).get('/api/tma/my-bookings?offset=0&limit=20').set('Authorization', `tma ${sign()}`).expect(200);
    await request(app.getHttpServer()).get('/api/tma/my-bookings').set('Authorization', `tma ${sign().replace('anna', 'evil')}`).expect(401);
    await request(app.getHttpServer()).get('/api/tma/my-bookings').set('Authorization', 'Bearer invalid').set('X-Telegram-Init-Data', sign()).expect(401);
    await request(app.getHttpServer()).post('/api/tma/bookings/bad/cancel-request').set('X-Telegram-Init-Data', sign()).expect(400);
    await request(app.getHttpServer()).post('/api/tma/bookings').set('X-Telegram-Init-Data', sign()).send({ ...f.dto, clientId: 'victim', costAmount: 0 }).expect(400);
    const result = await request(app.getHttpServer()).post('/api/tma/bookings').set('X-Telegram-Init-Data', sign()).send(f.dto).expect(201);
    assert.equal(result.body.owner, clientId);
    await request(app.getHttpServer()).post('/api/tma/bookings').set('X-Telegram-Init-Data', sign()).send({ ...f.dto, consentAccepted: 'false' }).expect(400);
  } finally { await app.close(); if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous; }
});

// Booking has no deletedAt: archival belongs to its optional Lesson.
test('my bookings are scoped to the signed client, exclude archived lessons and retain legacy bookings with pagination', async () => {
  let captured;
  const rows = [{ id: 'latest' }, { id: 'older' }, { id: 'next-page' }];
  const service = new TmaBookingService({ membership: { findFirst: async () => null }, booking: { findMany: async input => { captured = input; return rows; } } }, {}, {});
  assert.deepEqual(await service.myBookings(clientId, { offset: 0, limit: 2 }), { bookings: rows.slice(0, 2), hasMore: true, membership: null });
  assert.deepEqual(captured.where, { clientId, OR: [{ lesson: null }, { lesson: { deletedAt: null } }] });
  assert.deepEqual(captured.orderBy, [{ startTime: 'desc' }, { id: 'desc' }]);
  assert.equal(captured.take, 3);
  assert.equal(captured.skip, 0);
});
