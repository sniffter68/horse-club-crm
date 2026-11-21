const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { DateTime } = require('luxon');
const { ClientMiniappService } = require('../dist/modules/telegram-bot/client-miniapp.service');
const { TelegramBotController } = require('../dist/modules/telegram-bot/telegram-bot.controller');
const { TelegramBotService } = require('../dist/modules/telegram-bot/telegram-bot.service');
const { TelegramAuthGuard } = require('../dist/modules/telegram-bot/telegram-auth.guard');
const { TelegramLinkService } = require('../dist/modules/telegram-bot/telegram-link.service');
const { TrainerTmaAuthController } = require('../dist/modules/telegram-bot/trainer-tma.controller');
const { TrainerTmaService } = require('../dist/modules/telegram-bot/trainer-tma.service');
const { TmaBookingService } = require('../dist/modules/telegram-bot/tma-booking.service');
const { BookingRulesService } = require('../dist/bookings/booking-rules.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { DEFAULT_LEAD_CONSENT_VERSION } = require('../dist/common/lead-consent');
const clientId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const botToken = 'test:client-bot';
const secret = 'test-client-scope-secret-at-least-32-bytes';
function signed() {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 123, first_name: 'Анна' }) });
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(botToken).digest()).update(check).digest('hex'));
  return p.toString();
}
function fixture({ debit = true, group = false, legacy = false } = {}) {
  let row = { id, lessonId: other, clientId, status: 'scheduled', clientConfirmed: false, clientCancellationRequested: false,
    startTime: new Date(Date.now() + 86400000), endTime: new Date(Date.now() + 90000000), membershipId: id,
    membership: { clientId }, horse: { name: 'Гром' }, trainer: { name: 'Тренер' }, lesson: { status: 'SCHEDULED', deletedAt: null, startTime: new Date(Date.now() + 86400000), service: { title: 'Тренировка' } } };
  let balance = 4, refunded = false, lessonCancelled = false;
  const audit = [], notifications = [];
  let linked = true;
  const tx = {
    $queryRaw: async () => [],
    user: { findUnique: async () => null, findFirst: async () => null, findMany: async () => [{ telegramUserId: '789' }] },
    client: { findUnique: async () => linked ? { id: clientId, name: 'Анна Всадник', telegramUserId: '123', deletedAt: null } : null,
      findFirst: async ({ where }) => linked && (where.id === clientId || where.OR?.some(x => x.telegramUserId === '123')) ? { id: clientId, name: 'Анна Всадник' } : null },
    clubModuleSettings: { findUnique: async () => null },
    membership: { findUnique: async () => ({ id, clientId }), update: async () => { balance++; },
      findFirst: async ({ where }) => { assert.ok(where.OR.some(x => x.clientId === clientId)); return { id, title: 'Абонемент 8', totalLessons: 8, remainedLessons: balance, status: 'active', validUntil: new Date(Date.now() + 864000000), pricingPlan: { name: 'Тариф 8', totalLessons: 8 } }; } },
    booking: { findFirst: async ({ where }) => { assert.equal(where.clientId, clientId); return where.OR.some(x => x.id === id || x.lessonId === other) ? row : null; },
      findMany: async ({ where }) => { assert.equal(where.clientId, clientId); return [row]; },
      update: async ({ data }) => { row = { ...row, ...data }; return row; },
      count: async () => group ? 1 : 0 },
    membershipOp: { findFirst: async ({ where }) => {
      if (where.type === 'DEBIT') return debit ? { id, attendeeClientId: legacy ? null : clientId } : null;
      return refunded ? { id: other } : null;
    }, create: async () => { refunded = true; } },
    lesson: { update: async () => { lessonCancelled = true; } },
    cashAuditLog: { create: async ({ data }) => audit.push(data) },
    telegramNotification: { upsert: async ({ create }) => notifications.push(create) },
  };
  const prisma = { ...tx, $transaction: async cb => {
    const snapshot = { row: { ...row }, balance, refunded, lessonCancelled, audit: audit.length, notifications: notifications.length };
    try { return await cb(tx); } catch (e) { row = snapshot.row; balance = snapshot.balance; refunded = snapshot.refunded; lessonCancelled = snapshot.lessonCancelled; audit.length = snapshot.audit; notifications.length = snapshot.notifications; throw e; }
  } };
  const service = new ClientMiniappService(prisma, new MembershipLedgerService(prisma));
  return { service, prisma, tx, audit, notifications, balance: () => balance, cancelled: () => lessonCancelled,
    unlink: () => { linked = false; } };
}

test('client HTTP auto-login without staff, overview, owner-only actions, scoped session and unlink revocation', async () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_BOT_TOKEN = botToken;
  const f = fixture();
  const jwt = new JwtService({ secret });
  const bookings = { dashboard: async () => ({ membership: null, nextBooking: null }) };
  const auth = new TrainerTmaService(f.prisma, jwt, {}, {}, {}, bookings);
  const module = await Test.createTestingModule({ controllers: [TrainerTmaAuthController, TelegramBotController], providers: [
    { provide: TrainerTmaService, useValue: auth }, { provide: TmaBookingService, useValue: bookings },
    { provide: ClientMiniappService, useValue: f.service }, { provide: PrismaService, useValue: f.prisma },
    { provide: TelegramBotService, useValue: {} }, { provide: TelegramLinkService, useValue: {} },
    { provide: JwtService, useValue: jwt }, TelegramAuthGuard,
  ] }).compile();
  const app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  const api = request(app.getHttpServer());
  try {
    const result = await api.post('/api/tma/auth/telegram').send({ initData: signed() }).expect(201);
    assert.equal(result.body.role, 'CLIENT'); assert.equal(result.body.clientId, clientId);
    const token = result.body.token;
    assert.equal(jwt.verify(token, { audience: 'client-tma' }).sub, clientId);
    assert.throws(() => jwt.verify(token, { audience: 'trainer-tma' }));
    await assert.rejects(require('../dist/auth/strategies/jwt.strategy').JwtStrategy.prototype.validate.call({}, jwt.decode(token)), e => e.getStatus() === 401);
    await api.get('/api/tma/client/overview').expect(401);
    const overview = await api.get('/api/tma/client/overview').auth(token, { type: 'bearer' }).expect(200);
    assert.equal(overview.body.client.name, 'Анна Всадник');
    assert.equal(overview.body.membership.remainingLessons, 4);
    assert.equal(overview.body.membership.planName, 'Тариф 8');
    assert.equal(overview.body.bookings[0].horse.name, 'Гром');
    assert.equal(overview.body.bookings[0].canCancel, true);
    for (const action of ['confirm', 'cancel']) {
      await api.post(`/api/tma/client/lessons/${clientId}/${action}`).auth(token, { type: 'bearer' }).expect(404);
      await api.post(`/api/tma/client/lessons/bad/${action}`).auth(token, { type: 'bearer' }).expect(400);
    }
    const confirmed = await api.post(`/api/tma/client/lessons/${id}/confirm`).auth(token, { type: 'bearer' }).expect(201);
    assert.equal(confirmed.body.clientStatus, 'CONFIRMED'); assert.equal(confirmed.body.membershipId, undefined);
    await api.post(`/api/tma/client/lessons/${id}/cancel`).auth(token, { type: 'bearer' }).expect(201);
    await api.post(`/api/tma/client/lessons/${id}/cancel`).auth(token, { type: 'bearer' }).expect(201);
    assert.equal(f.balance(), 5); assert.equal(f.audit.length, 2); assert.equal(f.notifications.length, 2);
    f.unlink(); await api.get('/api/tma/client/overview').auth(token, { type: 'bearer' }).expect(401);
  } finally { await app.close(); if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous; }
});

test('cancellation refunds only actual own debits, including legacy owner operations; preserves other riders', async () => {
  for (const debit of [true, false]) for (const legacy of [true, false]) {
    const f = fixture({ debit, legacy, group: true });
    await f.service.action(clientId, id, 'cancel');
    assert.equal(f.balance(), debit ? 5 : 4); assert.equal(f.cancelled(), false);
    await f.service.action(clientId, id, 'cancel'); assert.equal(f.balance(), debit ? 5 : 4);
  }
});

test('audit failure rolls back cancellation and membership refund together', async () => {
  const f = fixture(); f.tx.cashAuditLog.create = async () => { throw new Error('audit down'); };
  await assert.rejects(f.service.action(clientId, id, 'cancel'), /audit down/);
  assert.equal(f.balance(), 4); assert.equal(f.cancelled(), false);
  assert.equal((await f.service.overview(clientId)).bookings[0].status, 'scheduled');
});

test('TMA rechecks real resource rules inside Serializable; a stale slot cannot double-book its horse', async () => {
  const start = DateTime.now().setZone('Europe/Moscow').plus({ days: 2 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  const reservations = [], locks = [], audit = [];
  const horse = { id, name: 'Гром', status: 'active', healthStatus: 'HEALTHY', maxRiderWeight: 85, maxDailyWorkloadMinutes: 120, requiredRestMinutes: 45 };
  const tx = { $queryRaw: async sql => { locks.push(sql.text); return []; },
    user: { findMany: async () => [] }, workShift: { findMany: async () => [] },
    client: { findUnique: async ({ where }) => where.phone ? null : { id: clientId, deletedAt: null },
      findMany: async () => [{ id: clientId, weightKg: null }, { id: other, weightKg: null }], update: async () => ({}) },
    horse: { findMany: async () => [horse] }, trainer: { findFirst: async () => ({ id: other }),
      findUnique: async () => ({ id: other, isActive: true, maxParallelLessons: 4 }) },
    service: { findFirst: async () => ({ id, durationMinutes: 60 }) },
    clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
    booking: { findUnique: async () => null, findMany: async () => [], update: async ({ data }) => data },
    lesson: { findMany: async () => reservations }, cashAuditLog: { create: async input => audit.push(input) },
  };
  // Model committed serializable ordering; actual PostgreSQL concurrency is in booking-rules.postgres.test.cjs.
  let queue = Promise.resolve();
  const service = new TmaBookingService({ $transaction: (cb, options) => { assert.equal(options.isolationLevel, 'Serializable'); const task = queue.then(() => cb(tx)); queue = task.catch(() => {}); return task; } }, new BookingRulesService(), {
    createLesson: async dto => { reservations.push({ trainerId: other, arenaId: null, startTime: start.toJSDate(), endTime: start.plus({ hours: 1 }).toJSDate(), bookings: [{ clientId: dto.participants[0].clientId, horseId: id }] }); return { id, bookings: [{ id }] }; },
  });
  const dto = { serviceId: id, trainerId: other, requestId: clientId, startTime: start.toISO(), phone: '+79991234567', consentAccepted: true, consentVersion: DEFAULT_LEAD_CONSENT_VERSION };
  const outcomes = await Promise.allSettled([service.create(clientId, dto), service.create(other, { ...dto, requestId: other })]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(r => r.status === 'rejected').reason.getStatus(), 409);
  assert.equal(reservations.length, 1); assert.equal(audit.length, 1);
  assert.ok(locks.some(sql => /Horse.*FOR UPDATE/.test(sql)));
});


test('staff binding takes priority over client cards and never issues administrator rights', async () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_BOT_TOKEN = botToken;
  const user = { id, role: 'MANAGER', email: 'staff@test.local', crmAccess: true, tokenVersion: 1, trainerId: null, staffProfile: { isActive: true, fullName: 'Сотрудник' } };
  const prisma = { user: { findUnique: async () => user }, client: { findUnique: async () => { throw new Error('must not resolve client'); } } };
  const service = new TrainerTmaService(prisma, new JwtService({ secret }), { forRole: async () => [{ module: 'SCHEDULE', isEnabled: true, accessLevel: 'READ_ONLY' }] }, {}, {}, {});
  try {
    const result = await service.bootstrap(signed());
    assert.equal(result.role, 'STAFF'); assert.equal(result.accessLevel, 'READ_ONLY');
    user.crmAccess = false;
    await assert.rejects(service.bootstrap(signed()), e => e.getStatus() === 403);
  } finally { if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous; }
});

test('past or completed lessons cannot be confirmed or cancelled', async () => {
  for (const completed of [false, true]) {
    const f = fixture(); const read = f.tx.booking.findFirst;
    f.tx.booking.findFirst = async args => ({ ...await read(args), status: completed ? 'completed' : 'scheduled',
      lesson: { status: completed ? 'COMPLETED' : 'SCHEDULED', startTime: new Date('2020-01-01'), deletedAt: null } });
    for (const action of ['confirm', 'cancel']) await assert.rejects(f.service.action(clientId, id, action), e => e.getStatus() === 409);
    assert.equal(f.balance(), 4); assert.equal(f.audit.length, 0);
  }
});

test('standalone lesson cancellation credits an actual visit once in the same transaction', async () => {
  const { Prisma } = require('@prisma/client');
  const f = fixture(); const read = f.tx.booking.findFirst;
  f.tx.booking.findFirst = async args => ({ ...await read(args), lessonId: null, lesson: null });
  f.tx.membership.findUnique = async () => ({ id, clientId, type: 'fixed_lessons', status: 'active' });
  let credits = 0, refunds = 0;
  f.tx.membership.update = async ({ data }) => { assert.equal(data.remainingUnits.increment.toString(), '1'); credits++; };
  f.tx.ledgerTransaction = { findFirst: async ({ where }) => where.transactionType === 'refund' ? refunds ? { id } : null : { amount: new Prisma.Decimal(-1) }, create: async () => { refunds++; } };
  await f.service.action(clientId, id, 'cancel'); await f.service.action(clientId, id, 'cancel');
  assert.equal(credits, 1); assert.equal(refunds, 1);
});
