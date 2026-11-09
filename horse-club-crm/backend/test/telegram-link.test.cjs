const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { TelegramLinkService } = require('../dist/modules/telegram-bot/telegram-link.service');
const { TelegramPersonalService } = require('../dist/modules/telegram-bot/telegram-personal.service');
const { queueTelegramAdmins, TelegramDelivery } = require('../dist/modules/telegram-bot/telegram-delivery');
const id = '11111111-1111-4111-8111-111111111111';
const actor = { id, role: 'ADMIN', email: 'admin@example.test' };
const status = code => error => error.getStatus() === code;

function fixture() {
  const clients = [{ id, telegramUserId: null, telegramUsername: null, deletedAt: null }];
  const users = [{ id, role: 'TRAINER', telegramUserId: null, telegramUsername: null, trainerId: id, trainer: { isActive: true }, staffProfile: { isActive: true } }];
  const grants = [];
  const options = [];
  const delegate = rows => ({
    findUnique: async ({ where }) => rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    update: async ({ where, data }) => Object.assign(rows.find(row => row.id === where.id), data),
  });
  const tx = {
    client: delegate(clients), user: delegate(users),
    telegramLinkToken: {
      deleteMany: async ({ where }) => { for (let i = grants.length - 1; i >= 0; i--) if (where.OR ? grants[i].expiresAt <= new Date() || grants[i].entityType === where.OR[1].entityType && grants[i].entityId === where.OR[1].entityId : grants[i].entityType === where.entityType && grants[i].entityId === where.entityId) grants.splice(i, 1); },
      create: async ({ data }) => { grants.push(data); return data; },
      findUnique: async ({ where }) => grants.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
      delete: async ({ where }) => { const index = grants.findIndex(row => row.tokenHash === where.tokenHash); assert.ok(index >= 0); grants.splice(index, 1); },
    },
  };
  const prisma = { ...tx, $transaction: async (fn, config) => { options.push(config); return fn(tx); } };
  return { service: new TelegramLinkService(prisma), prisma, tx, clients, users, grants, options };
}

test('client grant stores only hashes, has a 15-minute TTL, Telegram-compatible link and one-use code', async () => {
  const f = fixture(); const before = Date.now();
  const grant = await f.service.issue('client', id, actor);
  assert.match(grant.code, /^\d{6}$/);
  assert.ok(grant.expiresAt.getTime() >= before + 899000 && grant.expiresAt.getTime() <= Date.now() + 900000);
  const start = new URL(grant.deepLink).searchParams.get('start');
  assert.ok(start.length <= 64); assert.match(start, /^link_client_/);
  assert.equal(f.grants[0].code, undefined); assert.notEqual(f.grants[0].codeHash, grant.code);
  assert.equal(f.grants[0].createdById, actor.id);
  assert.equal(await f.service.consume(grant.code, '123456789012', 'anna'), 'client');
  assert.equal(f.clients[0].telegramUserId, '123456789012'); assert.equal(f.clients[0].telegramUsername, 'anna');
  await assert.rejects(f.service.consume(start, '999'), status(400));
  assert.ok(f.options.every(row => row.isolationLevel === 'Serializable'));
});

test('deep links bind users with server-owned roles; role spoofing and manager binding admin are forbidden', async () => {
  const f = fixture();
  await assert.rejects(f.service.issue('user', id, actor, 'admin'), status(400));
  const grant = await f.service.issue('user', id, actor, 'trainer');
  const start = new URL(grant.deepLink).searchParams.get('start');
  await assert.rejects(f.service.consume(start.replace(id, '22222222-2222-4222-8222-222222222222'), '42'), status(400));
  assert.equal(await f.service.consume(start, '42'), 'trainer');
  assert.equal(f.users[0].telegramUserId, '42');
  await f.service.unlink('user', id, actor);
  f.users[0].role = 'ADMIN';
  await assert.rejects(f.service.issue('user', id, { ...actor, role: 'MANAGER' }), status(403));
  await assert.rejects(f.service.unlink('user', id, { ...actor, role: 'MANAGER' }), status(403));
  assert.equal((await f.service.issue('user', id, actor, 'admin')).role, 'admin');
});

test('expired, superseded, archived, inactive and already-linked targets reject redemption', async () => {
  const f = fixture();
  const first = await f.service.issue('client', id, actor);
  const second = await f.service.issue('client', id, actor);
  await assert.rejects(f.service.consume(first.code, '42'), status(400));
  f.grants[0].expiresAt = new Date(0);
  await assert.rejects(f.service.consume(second.code, '42'), status(400));
  const third = await f.service.issue('client', id, actor);
  f.clients[0].deletedAt = new Date();
  await assert.rejects(f.service.consume(third.code, '42'), status(404));
  f.clients[0].deletedAt = null;
  f.clients.push({ id: 'other', telegramUserId: '42' });
  await assert.rejects(f.service.consume(third.code, '42'), status(409));
  assert.equal(f.clients[0].telegramUserId, null);
  f.users[0].staffProfile.isActive = false;
  await assert.rejects(f.service.issue('user', id, actor), status(404));
});

test('unlink clears username and invalidates pending codes; failed attempts are bounded', async () => {
  const f = fixture(); const grant = await f.service.issue('client', id, actor);
  await f.service.unlink('client', id, actor);
  assert.equal(f.grants.length, 0);
  await assert.rejects(f.service.consume(grant.code, '42'), status(400));
  for (let i = 0; i < 4; i++) await assert.rejects(f.service.consume('000000', '42'), status(400));
  await assert.rejects(f.service.consume('000000', '42'), /Слишком много попыток/);
});

test('staff actions recheck active identity and module rights and pass signed scope to existing financial service', async () => {
  const f = fixture(); f.users[0].telegramUserId = '42';
  let accessLevel = 'READ_ONLY', enabled = true, called;
  const personal = new TelegramPersonalService(f.prisma, { forRole: async () => [{ module: 'SCHEDULE', accessLevel, isEnabled: enabled }] },
    { updateLessonStatus: async (...args) => { called = args; } });
  await assert.rejects(personal.status('42', id, 'COMPLETED'), status(403));
  accessLevel = 'FULL'; await personal.status('42', id, 'COMPLETED');
  assert.equal(called[0], id); assert.equal(called[1], 'COMPLETED'); assert.equal(called[3].id, id); assert.equal(called[5], '42');
  enabled = false; await assert.rejects(personal.user('42'), status(403));
  enabled = true; f.users[0].staffProfile.isActive = false; await assert.rejects(personal.user('42'), status(403));
  await assert.rejects(personal.user('999'), status(403));
});

test('notifications target linked active admins and are persisted with stable idempotency keys', async () => {
  const queued = [];
  await queueTelegramAdmins({ user: { findMany: async ({ where }) => {
    assert.equal(where.role, 'ADMIN'); return [{ telegramUserId: '42' }, { telegramUserId: '43', staffProfile: { isActive: false } }, { telegramUserId: null }];
  } }, telegramNotification: { upsert: async args => queued.push(args) } }, 'admin:tma:request', 'Новая запись');
  assert.equal(queued.length, 1); assert.equal(queued[0].where.key, 'admin:tma:request:42');
  assert.deepEqual(queued[0].update, {});
});

test('HTTP endpoints enforce UUID, roles, READ_ONLY and HIDDEN independently of frontend controls', async () => {
  const { Test } = require('@nestjs/testing'); const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
  const { ModuleAccessService } = require('../dist/settings/module-access.service');
  const { ClientTelegramLinkController, UserTelegramLinkController } = require('../dist/modules/telegram-bot/telegram-link.controller');
  let accessLevel = 'FULL', role = 'ADMIN', writes = 0;
  const module = await Test.createTestingModule({ controllers: [ClientTelegramLinkController, UserTelegramLinkController], providers: [RolesGuard, ModuleAccessGuard,
    { provide: ModuleAccessService, useValue: { forRole: async () => ['SCHEDULE', 'STAFF_PAYROLL'].map(module => ({ module, accessLevel, isEnabled: true })) } },
    { provide: TelegramLinkService, useValue: { issue: async () => { writes++; return { code: '123456' }; }, unlink: async () => { writes++; return {}; }, status: async () => ({}) } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: ctx => { ctx.switchToHttp().getRequest().user = { ...actor, role }; return true; } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  try {
    const http = request(app.getHttpServer());
    for (const resource of ['clients', 'users']) {
      await http.post(`/api/${resource}/${id}/telegram-link`).send({}).expect(201);
      await http.delete(`/api/${resource}/${id}/telegram`).expect(200);
      await http.post(`/api/${resource}/bad/telegram-link`).send({}).expect(400);
      for (const level of ['READ_ONLY', 'HIDDEN']) { accessLevel = level;
        await http.post(`/api/${resource}/${id}/telegram-link`).send({}).expect(403);
        await http.delete(`/api/${resource}/${id}/telegram`).expect(403);
      }
      accessLevel = 'FULL'; role = 'TRAINER'; await http.post(`/api/${resource}/${id}/telegram-link`).send({}).expect(403); role = 'ADMIN';
    }
    await http.post(`/api/users/${id}/telegram-link`).send({ role: 'ADMIN' }).expect(400);
    assert.equal(writes, 4);
  } finally { await app.close(); }
});

test('delivery rechecks unlink, role revocation and client reassignment before sending private data', async () => {
  const rows = [{ key: 'admin:tma:req:42', peerId: '42', message: 'Admin', attempts: 0 }, { key: `client:${id}:lesson:x:42`, peerId: '42', message: 'Private', attempts: 0 }];
  const changes = [], sent = [];
  const worker = new TelegramDelivery({ telegramNotification: { findMany: async () => rows, update: async input => changes.push(input), updateMany: async () => ({ count: 1 }) },
    user: { findUnique: async () => ({ role: 'TRAINER' }) }, client: { findUnique: async () => ({ id: 'another-client', deletedAt: null }) } });
  worker.api = { sendMessage: async (...args) => sent.push(args) };
  await worker.flush(); assert.equal(sent.length, 0); assert.equal(changes.length, 2); assert.ok(changes.every(row => row.data.attempts === 5));
});

test('financial status service rejects forged lesson ownership and revoked write access before any mutation', async () => {
  const { LessonsService } = require('../dist/lessons/lessons.service');
  let user = { ...actor, role: 'TRAINER', trainerId: 'another-trainer' };
  const tx = { lesson: { findUnique: async () => ({ trainerId: id }) }, user: { findUnique: async () => user },
    clubModuleSettings: { findUnique: async () => ({ isEnabled: true }) }, roleModulePermission: { findUnique: async () => ({ accessLevel: 'READ_ONLY' }) } };
  const service = new LessonsService({ $transaction: async operation => operation(tx) }, {});
  const trainer = { ...actor, role: 'TRAINER' };
  await assert.rejects(service.updateLessonStatus(id, 'COMPLETED', {}, trainer, {}, '42'), status(403));
  user.trainerId = id;
  await assert.rejects(service.updateLessonStatus(id, 'CANCELLED', {}, trainer, {}, '42'), status(403));
  user.role = 'ADMIN';
  await assert.rejects(service.updateLessonStatus(id, 'COMPLETED', {}, trainer, {}, '42'), status(403));
});

test('real bot dispatch handles private start links, short codes, role menus, personal queries and explicit status confirmation', async t => {
  const { Bot } = require('grammy');
  const { TelegramBotService } = require('../dist/modules/telegram-bot/telegram-bot.service');
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  let bot, updateId = 1;
  const sent = [], consumed = [], changed = [], viewed = [];
  t.mock.method(Bot.prototype, 'start', function () {
    bot = this;
    this.botInfo = { id: 999, is_bot: true, first_name: 'Test', username: 'horseclub68_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false };
    this.api.config.use(async (_previous, method, payload) => {
      if (method === 'sendMessage') sent.push(payload);
      return { ok: true, result: method === 'sendMessage' ? { message_id: 1, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } : true };
    });
    return Promise.resolve();
  });
  const personal = { identity: async sender => sender === '1' ? 'client' : sender === '2' ? 'trainer' : 'admin',
    bookings: async sender => { viewed.push(sender); return 'Мои записи'; }, balance: async () => 'Остаток: 5', user: async () => ({}),
    schedule: async () => [{ id, text: 'Моё занятие', actionable: true }], status: async (...args) => changed.push(args) };
  const service = new TelegramBotService({ consume: async (...args) => { consumed.push(args); return args[1] === '1' ? 'client' : 'trainer'; } }, personal);
  const message = (sender, text, type = 'private') => bot.handleUpdate({ update_id: updateId++, message: { message_id: 1, date: 0, chat: { id: Number(sender), type },
    from: { id: Number(sender), is_bot: false, first_name: 'Test', username: 'test_user' }, text,
    ...(text.startsWith('/start') ? { entities: [{ type: 'bot_command', offset: 0, length: 6 }] } : {}) } });
  const callback = (sender, data) => bot.handleUpdate({ update_id: updateId++, callback_query: { id: 'callback', from: { id: Number(sender), is_bot: false, first_name: 'Test' },
    chat_instance: 'private', data, message: { message_id: 1, date: 0, chat: { id: Number(sender), type: 'private' }, text: 'Menu' } } });
  try {
    process.env.TELEGRAM_BOT_TOKEN = '123:test'; service.onModuleInit();
    await message('1', '/start link_client_test');
    assert.deepEqual(consumed[0], ['link_client_test', '1', 'test_user']);
    assert.match(sent.at(-1).text, /личному кабинету/);
    assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().some(button => button.web_app));
    await message('2', '123456'); assert.equal(consumed.at(-1)[1], '2');
    assert.match(sent.at(-1).text, /Меню управления/);
    assert.ok(!sent.at(-1).reply_markup.inline_keyboard.flat().some(button => button.web_app));
    await message('3', '/start'); assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().some(button => button.callback_data === 'day'));
    await callback('1', 'my_bookings'); assert.deepEqual(viewed, ['1']);
    await callback('2', 'day'); assert.match(sent.at(-1).text, /Моё занятие/);
    await callback('2', `done:${id}`); assert.equal(changed.length, 0);
    await callback('2', `confirm_done:${id}`); assert.deepEqual(changed[0], ['2', id, 'COMPLETED', false]);
    await callback('2', `confirm_refund:${id}`); assert.deepEqual(changed[1], ['2', id, 'CANCELLED', true]);
    const before = consumed.length; await message('1', '123456', 'group'); assert.equal(consumed.length, before);
  } finally { await service.onModuleDestroy(); if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous; }
});
