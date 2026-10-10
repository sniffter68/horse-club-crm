const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
require('reflect-metadata');
mock.method(require('../dist/bookings/booking-rules.service').BookingRulesService.prototype, 'validate', async () => {});
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { VkLinkService, normalizePhone } = require('../dist/vk-bot/vk-link.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { LeadsService } = require('../dist/leads/leads.service');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');
const bookingId = '11111111-1111-4111-8111-111111111111';
function bot(prisma, { links = {}, ledger = {}, leads = {} } = {}) {
  const service = new VkBotService(prisma, links, ledger, leads);
  const sent = [], answers = [];
  service.vk = { api: { messages: { send: async value => { sent.push(value); }, sendMessageEventAnswer: async value => { answers.push(value); } } } };
  return { service, sent, answers };
}
const message = text => ({ message: { from_id: 42, peer_id: 42, text, out: 0 } });
test('normalizes Russian national and international phone numbers', () => {
  assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
  assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567');
  assert.throws(() => normalizePhone('123'));
});
for (const kind of ['CLIENT', 'TRAINER']) test(`links ${kind} by normalized phone and single-use administrator code`, async () => {
  const target = { id: 'target', phone: '+79991234567', vkUserId: null };
  let grant;
  const targetModel = {
    findUnique: async ({ where }) => where.id === target.id || where.vkUserId === target.vkUserId ? target : null,
    update: async ({ data }) => Object.assign(target, data),
  };
  const prisma = {
    client: kind === 'CLIENT' ? targetModel : { findUnique: async () => null },
    trainer: kind === 'TRAINER' ? targetModel : { findUnique: async () => null },
    vkLinkCode: {
      deleteMany: async () => { grant = undefined; },
      create: async ({ data }) => { grant = { id: 'grant', usedBy: null, ...data }; },
      findUnique: async ({ where }) => where.codeHash === grant.codeHash ? grant : null,
      update: async ({ data }) => Object.assign(grant, data),
    },
    $transaction: async callback => callback(prisma),
  };
  const links = new VkLinkService(prisma);
  const { code } = await links.issue(kind, target.id);
  assert.match(code, /^\d{4}$/);
  assert.notEqual(grant.codeHash, code);
  const { service, sent } = bot(prisma, { links });
  await service.handleMessage(message(`привязать 8 (999) 123-45-67 ${code}`), 'link-1');
  assert.equal(target.vkUserId, 42n); assert.equal(grant.usedBy, 42n);
  assert.match(sent[0].message, /успешно привязан/);
  await assert.rejects(links.bind(43, target.phone, code));
  await assert.rejects(links.bind(42, '+79991234568', code));
});
test('client balance query is limited to the linked owner and active memberships', async () => {
  let query;
  const { service, sent } = bot({
    client: { findUnique: async () => ({ id: 'owner' }) }, trainer: { findUnique: async () => null },
    membership: { findMany: async args => { query = args; return [{ id: 'membership', remainedLessons: 4, validUntil: new Date('2030-01-01T00:00:00Z') }]; } },
  });
  await service.handleMessage(message('Мой баланс'), 'balance-1');
  assert.equal(query.where.clientId, 'owner'); assert.equal(query.where.remainedLessons.gt, 0);
  assert.ok(query.where.validUntil.gte instanceof Date); assert.match(sent[0].message, /4 занятия/);
});
test('unlinked visitor is offered supported VK keyboard and a lead form', async () => {
  const { service, sent } = bot({ client: { findUnique: async () => null }, trainer: { findUnique: async () => null } });
  await service.handleMessage(message('привет'), 'welcome');
  assert.equal(sent[0].message, 'Здравствуйте! Вы подключены к боту конного клуба. Здесь будут приходить напоминания о тренировках и статус бронирований.');
  assert.match(String(sent[0].keyboard), /Привязать профиль/);
  assert.doesNotMatch(String(sent[0].keyboard), /request_contact/);
});
test('VK lead requires a separately recorded current consent', async () => {
  let accepted, created;
  const prisma = {
    client: { findUnique: async () => null }, trainer: { findUnique: async () => null },
    vkConsent: {
      findUnique: async () => accepted,
      upsert: async ({ create }) => { accepted = create; return create; },
    },
  };
  const { service, sent } = bot(prisma, { leads: { create: async (payload, source) => { created = { payload, source }; } } });
  await service.handleMessage(message('заявка Анна; +79991234567'), 'lead-before-consent');
  assert.equal(created, undefined); assert.match(sent.at(-1).message, /сначала ознакомьтесь/i);
  await service.handleMessage(message('согласен 2026-09-19'), 'consent');
  assert.equal(accepted.consentVersion, '2026-09-19'); assert.ok(accepted.consentedAt instanceof Date);
  await service.handleMessage(message('заявка Анна; +79991234567'), 'lead-after-consent');
  assert.deepEqual(created, { payload: { consentAccepted: true, consentVersion: '2026-09-19', firstName: 'Анна', phone: '+79991234567' }, source: 'VK' });
});
test('inline attendance invokes billing with authenticated trainer context', async () => {
  const calls = [];
  const { service, answers } = bot({ trainer: { findUnique: async () => ({ id: 'trainer' }) } }, { ledger: { markAttendance: async (...args) => calls.push(args) } });
  for (const attended of [true, false]) await service.handleEvent({ user_id: 42, peer_id: 42, event_id: `event-${attended}`, payload: { action: 'attendance', bookingId, attended } });
  assert.deepEqual(calls, [[bookingId, true, { trainerId: 'trainer', noShow: false }], [bookingId, false, { trainerId: 'trainer', noShow: true }]]);
  assert.equal(answers.length, 2);
});
test('client cannot invoke trainer inline action', async () => {
  let billed = false;
  const { service, answers } = bot({ trainer: { findUnique: async () => null } }, { ledger: { markAttendance: async () => { billed = true; } } });
  await service.handleEvent({ user_id: 42, peer_id: 42, event_id: 'forbidden', payload: { action: 'attendance', bookingId, attended: true } });
  assert.equal(billed, false); assert.match(answers[0].event_data, /только тренеру/);
});
test('today uses club day bounds and includes lessons without bookings', async () => {
  const oldZone = process.env.CLUB_TIME_ZONE;
  process.env.CLUB_TIME_ZONE = 'Europe/Moscow';
  let query;
  const { service, sent } = bot({
    client: { findUnique: async () => null }, trainer: { findUnique: async () => ({ id: 'trainer' }) },
    lesson: { findMany: async args => { query = args; return [{ id: 'lesson', startTime: new Date(), bookings: [] }]; } },
  });
  try {
    await service.handleMessage(message('Расписание на сегодня'), 'today');
    assert.equal(query.where.trainerId, 'trainer');
    assert.equal(query.where.startTime.gte.getUTCHours(), 21);
    assert.equal(query.where.startTime.lt - query.where.startTime.gte, 86400000);
    assert.match(sent[0].message, /Участников пока нет/);
  } finally { if (oldZone === undefined) delete process.env.CLUB_TIME_ZONE; else process.env.CLUB_TIME_ZONE = oldZone; }
});
test('ledger denies another trainer before making changes', async () => {
  let changed = false;
  const ledger = new MembershipLedgerService({ $transaction: async callback => callback({ booking: {
    findUnique: async () => ({ lesson: { trainerId: 'someone-else', status: 'SCHEDULED', startTime: new Date(0) } }),
    update: async () => { changed = true; },
  } }) });
  await assert.rejects(ledger.markAttendance(bookingId, true, { trainerId: 'trainer', noShow: false }), error => error.getStatus() === 403);
  assert.equal(changed, false);
});
test('new lead notification is queued using a stable deduplication key', async () => {
  const original = process.env.VK_ADMIN_PEER_ID;
  process.env.VK_ADMIN_PEER_ID = '2000000001';
  let queued;
  try {
    await new LeadsService({}).notifyAdministrator({ user: { findMany: async () => [] }, vkNotification: { upsert: async args => { queued = args; } } }, 'client', { firstName: 'Анна', phone: '+79991234567' });
    assert.equal(queued.create.peerId, 2000000001n); assert.equal(queued.where.key, 'lead:client:2000000001');
    assert.match(queued.create.message, /Новая заявка/);
  } finally { if (original === undefined) delete process.env.VK_ADMIN_PEER_ID; else process.env.VK_ADMIN_PEER_ID = original; }
});

test('new lead targets only ADMIN VK recipients, deduplicates delivery and names the service', async () => {
  let query, created = 0;
  const queued = new Map();
  const tx = {
    user: { findMany: async args => { query = args; return [{ vkUserId: 42n }, { vkUserId: 43n }, { vkUserId: 42n }]; } },
    service: { findUnique: async () => ({ id: 'service', title: 'Выездка' }) },
    leadRequest: { findFirst: async () => created ? { id: 'lead' } : null, create: async () => { created++; return { id: 'lead' }; } },
    vkNotification: { upsert: async ({ create }) => queued.set(create.key, create) },
  };
  const original = process.env.VK_ADMIN_PEER_ID;
  delete process.env.VK_ADMIN_PEER_ID;
  try {
    const leads = new LeadsService({ $transaction: async fn => fn(tx) });
    const dto = { firstName: 'Анна', phone: '+79991234567', serviceId: 'service', consentVersion: '2026-09-19' };
    await leads.create(dto); await leads.create(dto);
    assert.deepEqual(query.where, { role: 'ADMIN', vkUserId: { not: null } });
    assert.equal(created, 1); assert.equal(queued.size, 2);
    assert.match([...queued.values()][0].message, /🐎 Новая заявка: Анна, \+79991234567, Выездка/);
  } finally { if (original !== undefined) process.env.VK_ADMIN_PEER_ID = original; }
});

function notificationLessons() {
  let lesson;
  const queued = new Map();
  const tx = {
    service: { findUnique: async () => ({ durationMinutes: 60, price: 0, title: 'Выездка', maxCapacity: 4, allowMembership: false }) },
    clubSchedule: { findUnique: async () => ({ openTime: '08:00', closeTime: '22:00', daysOfWeekOff: [] }) },
    lesson: {
      findFirst: async () => null, findMany: async () => [],
      findUnique: async () => lesson,
      findUniqueOrThrow: async () => lesson,
      create: async ({ data }) => { lesson = { ...data, id: 'lesson', trainer: { name: 'Мария', vkUserId: 42n },
        service: { title: 'Выездка', allowMembership: false }, operations: [], bookings: [
          { id: 'booking', clientId: 'client', membershipId: null, horseId: null, client: { name: 'Анна', vkUserId: 43n } },
          { id: 'booking2', clientId: 'client2', membershipId: null, horseId: null, client: { name: 'Борис', vkUserId: null } },
        ] }; return lesson; },
      update: async ({ data }) => { lesson = { ...lesson, ...data }; return lesson; },
    },
    vkNotification: { upsert: async ({ create }) => { if (!queued.has(create.key)) queued.set(create.key, create); } },
  };
  const prisma = { $transaction: async fn => {
    const previous = lesson, pending = new Map(queued);
    try { return await fn(tx); } catch (error) { lesson = previous; queued.clear(); for (const [key, value] of pending) queued.set(key, value); throw error; }
  } };
  return { tx, queued, service: new LessonsService(prisma, {}), lesson: () => lesson };
}
const lessonInput = { serviceId: 'service', trainerId: 'trainer', clientId: 'client', startTime: '2026-10-08T09:00:00Z' };

test('creation, repeated transfers and cancellation enqueue trainer and linked clients after successful mutations', async () => {
  const { service, queued } = notificationLessons();
  await service.createLesson(lessonInput);
  assert.equal(queued.size, 2);
  assert.deepEqual([...queued.values()].map(row => row.peerId), [42n, 43n]);
  assert.match([...queued.values()][0].message, /08\.10\.2026, 12:00/);
  assert.match([...queued.values()][0].message, /^📅 Новое занятие в вашем расписании!/);
  assert.match([...queued.values()][0].message, /Клиент: Анна/);
  assert.match([...queued.values()][1].message, /^✅ Ваша тренировка подтверждена!/);
  assert.doesNotMatch([...queued.values()][1].message, /Борис/);
  await service.rescheduleLesson('lesson', '2026-10-08T10:00:00Z', 60);
  assert.equal(queued.size, 4); assert.match([...queued.values()].at(-1).message, /Ранее:/);
  await service.rescheduleLesson('lesson', '2026-10-08T09:00:00Z', 60);
  await service.rescheduleLesson('lesson', '2026-10-08T10:00:00Z', 60);
  assert.equal(queued.size, 8); // The same target time is a new change after moving back.
  await service.rescheduleLesson('lesson', '2026-10-08T10:00:00Z', 60);
  assert.equal(queued.size, 8); // Unchanged interval produces no push.
  await service.updateLessonStatus('lesson', 'CANCELLED');
  await service.updateLessonStatus('lesson', 'CANCELLED');
  assert.equal(queued.size, 10); assert.match([...queued.values()].at(-1).message, /отменена/);
});

test('group additions notify the trainer and newly added clients without notifying existing clients again', async () => {
  const { service, tx, queued, lesson } = notificationLessons();
  await service.createLesson(lessonInput);
  tx.lesson.findFirst = async () => ({ id: 'lesson', bookings: [{ clientId: 'client' }] });
  tx.lesson.update = async () => ({ ...lesson(), bookings: [...lesson().bookings,
    { clientId: 'new-client', client: { vkUserId: 44n } }] });
  await service.createLesson({ ...lessonInput, clientId: 'new-client' });
  const additions = [...queued.values()].filter(row => row.key.includes(':booking:'));
  assert.deepEqual(additions.map(row => row.peerId), [42n, 44n]);
});

test('failed lesson transaction leaves no notification and transport failure cannot undo a committed booking', async () => {
  const harness = notificationLessons();
  const upsert = harness.tx.vkNotification.upsert;
  harness.tx.vkNotification.upsert = async args => { await upsert(args); throw new Error('DB transaction failed'); };
  await assert.rejects(harness.service.createLesson(lessonInput));
  assert.equal(harness.lesson(), undefined); assert.equal(harness.queued.size, 0);
  harness.tx.vkNotification.upsert = upsert;
  await harness.service.createLesson(lessonInput);
  let fail = true, marked = 0;
  const sends = [];
  const delivery = new VkNotifications({ vkNotification: {
    findMany: async args => { assert.ok(args.where.nextAttemptAt.lte instanceof Date); return [...harness.queued.values()].map(row => ({ ...row, id: row.key, attemptCount: 0 })); },
    update: async ({ data }) => { if (data.sentAt) marked++; else { assert.ok(data.nextAttemptAt > new Date()); assert.deepEqual(data.attemptCount, { increment: 1 }); } },
  } });
  delivery.vk = { api: { messages: { send: async args => { sends.push(args); if (fail) throw new Error('VK unavailable'); } } } };
  await delivery.flush();
  assert.equal(marked, 0); assert.equal(harness.lesson().id, 'lesson');
  fail = false; await delivery.flush();
  assert.equal(marked, 2); assert.equal(sends[0].random_id, sends[2].random_id);
});

test('short code and /start code request phone verification; linked /start greets the client', async () => {
  const { service, sent } = bot({ client: { findUnique: async () => ({ firstName: 'Анна' }) }, trainer: { findUnique: async () => null } });
  for (const text of ['1234', '/start 1234']) {
    await service.handleMessage(message(text), `code-${text}`);
    assert.match(sent.at(-1).message, /привязать ВАШ_ТЕЛЕФОН 1234/);
  }
  await service.handleMessage(message('/start'), 'start');
  assert.match(sent.at(-1).message, /Здравствуйте, Анна/);
});

test('short-code guesses are limited and expired/foreign phone codes never bind', async () => {
  let writes = 0;
  const prisma = { vkLinkCode: { findUnique: async () => ({ phone: '+79991234567', expiresAt: new Date(0), usedBy: null }) },
    client: { update: async () => { writes++; } }, $transaction: async fn => fn(prisma) };
  const links = new VkLinkService(prisma);
  for (let i = 0; i < 5; i++) await assert.rejects(links.bind(42, '+79991234567', '1234'), /Код недействителен/);
  await assert.rejects(links.bind(42, '+79991234567', '1234'), /Слишком много попыток/);
  await assert.rejects(links.bind(43, '+79991234568', '1234'), /Код недействителен/);
  assert.equal(writes, 0);
});

test('unlink clears the profile, revokes issued codes and drops pending personal pushes atomically', async () => {
  const calls = [];
  const tx = { client: { findUnique: async () => ({ id: 'client', vkUserId: 42n }), update: async args => calls.push(args) },
    vkLinkCode: { deleteMany: async args => calls.push(args) }, vkNotification: { deleteMany: async args => calls.push(args) } };
  await new VkLinkService({ $transaction: async fn => fn(tx) }).unlink('CLIENT', 'client');
  assert.deepEqual(calls[0].data, { vkUserId: null });
  assert.deepEqual(calls[1].where, { kind: 'CLIENT', recordId: 'client' });
  assert.equal(calls[2].where.peerId, 42n); assert.equal(calls[2].where.sentAt, null);
});

test('VK management endpoints validate input and enforce ADMIN/MANAGER permissions', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const { VkLinkController } = require('../dist/vk-bot/vk-link.controller');
  const { UsersController } = require('../dist/users/users.controller');
  const { UsersService } = require('../dist/users/users.service');
  const calls = [];
  const module = await Test.createTestingModule({ controllers: [VkLinkController, UsersController], providers: [RolesGuard,
    { provide: VkLinkService, useValue: { issue: async (...args) => { calls.push(args); return { code: '0123' }; },
      unlink: async (...args) => { calls.push(args); return { success: true }; } } },
    { provide: UsersService, useValue: { setVkRecipient: async (...args) => { calls.push(args); return { vkUserId: args[1] }; } } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] }; return Boolean(req.user.role);
  } }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  try {
    const input = { kind: 'CLIENT', id: bookingId };
    for (const path of ['/vk/link-codes', '/vk/link-codes/unlink']) {
      await request(app.getHttpServer()).post(path).send(input).expect(403);
      await request(app.getHttpServer()).post(path).set('x-role', 'TRAINER').send(input).expect(403);
      await request(app.getHttpServer()).post(path).set('x-role', 'MANAGER').send(input).expect(201);
      await request(app.getHttpServer()).post(path).set('x-role', 'ADMIN').send({ ...input, kind: 'ADMIN' }).expect(400);
    }
    assert.deepEqual(calls, [['CLIENT', bookingId], ['CLIENT', bookingId]]);
    const path = `/users/${bookingId}/vk`;
    await request(app.getHttpServer()).patch(path).set('x-role', 'MANAGER').send({ vkUserId: '42' }).expect(403);
    for (const body of [{}, { vkUserId: '0' }, { vkUserId: '-42' }, { vkUserId: 42 }, { vkUserId: 'abc' }, { vkUserId: '42', role: 'ADMIN' }]) {
      await request(app.getHttpServer()).patch(path).set('x-role', 'ADMIN').send(body).expect(400);
    }
    await request(app.getHttpServer()).patch(path).set('x-role', 'ADMIN').send({ vkUserId: '42' }).expect(200);
    await request(app.getHttpServer()).patch(path).set('x-role', 'ADMIN').send({ vkUserId: null }).expect(200);
    assert.deepEqual(calls.slice(-2), [[bookingId, '42'], [bookingId, null]]);
  } finally { await app.close(); }
});

test('administrator recipient configuration rejects non-admin users and revokes pending leads and help', async () => {
  const { UsersService } = require('../dist/users/users.service');
  const deleted = [];
  let user = { role: 'MANAGER', vkUserId: null };
  const tx = { user: { findUnique: async () => user, update: async ({ data, select }) => {
    assert.equal(select.passwordHash, undefined); return Object.assign(user, data);
  } }, vkNotification: { deleteMany: async args => deleted.push(args) } };
  const service = new UsersService({ $transaction: async fn => fn(tx) });
  await assert.rejects(service.setVkRecipient(bookingId, '42'), /только администратор/);
  user = { role: 'ADMIN', vkUserId: 42n };
  await service.setVkRecipient(bookingId, null);
  assert.equal(user.vkUserId, null);
  assert.deepEqual(deleted[0].where, { peerId: 42n, sentAt: null,
    OR: [{ key: { startsWith: 'lead:' } }, { key: { startsWith: 'help:' } }],
  });
});
