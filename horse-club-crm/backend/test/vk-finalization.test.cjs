const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { VkSettingsService } = require('../dist/vk-bot/vk-settings.service');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { VkBotController } = require('../dist/vk-bot/vk-bot.controller');
const { vkGroupToken, validateVkConfig } = require('../dist/vk-bot/vk-bot.config');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const keys = ['JWT_SECRET', 'VK_COMMUNITY_ID', 'VK_ACCESS_TOKEN', 'VK_CONFIRMATION_TOKEN', 'VK_SECRET_KEY'];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
afterEach(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
const config = { communityId: '123', accessToken: 'access-token', confirmationToken: 'confirmation', secretKey: 'secret' };

test('VK module resolves the production dependency graph and settings startup without a database', async () => {
  process.env.JWT_SECRET = 'a'.repeat(40);
  const { VkBotModule } = require('../dist/vk-bot/vk-bot.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const module = await Test.createTestingModule({ imports: [VkBotModule] })
    .overrideProvider(PrismaService).useValue({ vkIntegrationSettings: { findUnique: async () => null } }).compile();
  try { await module.get(VkSettingsService).onModuleInit(); }
  finally { await module.close(); }
});

test('canonical callback uses requested environment names and acknowledges pending handlers', async () => {
  Object.assign(process.env, { VK_COMMUNITY_ID: '123', VK_ACCESS_TOKEN: 'token', VK_CONFIRMATION_TOKEN: 'confirmation', VK_SECRET_KEY: 'secret' });
  assert.doesNotThrow(() => validateVkConfig()); assert.equal(vkGroupToken(), 'token');
  let finish, calls = 0;
  const module = await Test.createTestingModule({ controllers: [VkBotController], providers: [{ provide: VkBotService, useValue: {
    handleMessage: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
  } }] }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
  const post = body => request(app.getHttpServer()).post('/api/vk/callback').send({ group_id: 123, secret: 'secret', ...body });
  try {
    const response = await post({ type: 'confirmation' }).expect(200); assert.equal(response.text, 'confirmation');
    await post({ type: 'message_new', secret: 'bad' }).expect(403); assert.equal(calls, 0);
    assert.equal((await post({ type: 'message_new', object: { message: { peer_id: 42, text: 'hello' } } }).timeout(1000).expect(200)).text, 'ok');
    assert.equal(calls, 1);
  } finally { finish?.(); await app.close(); }
});

test('settings persist encrypted secrets, omit them from status and reload transports on restart', async () => {
  process.env.JWT_SECRET = 'a'.repeat(40);
  let row, refreshed = 0;
  const prisma = { vkIntegrationSettings: {
    upsert: async args => { row = args.create; }, findUnique: async () => row,
  } };
  const transport = { refreshTransport: () => refreshed++ };
  const service = new VkSettingsService(prisma, transport, transport);
  const status = await service.save(config, 'actor');
  assert.equal(status.configured, true); assert.equal(row.updatedById, 'actor');
  for (const secret of [config.accessToken, config.confirmationToken, config.secretKey]) {
    assert.ok(!row.encryptedConfig.includes(secret)); assert.ok(!JSON.stringify(status).includes(`"${secret}"`));
  }
  delete process.env.VK_ACCESS_TOKEN;
  await new VkSettingsService(prisma, transport, transport).onModuleInit();
  assert.equal(process.env.VK_ACCESS_TOKEN, config.accessToken); assert.equal(refreshed, 4);
  await service.save({ communityId: '124', accessToken: '' }, 'other-actor');
  assert.equal(process.env.VK_ACCESS_TOKEN, config.accessToken);
  process.env.JWT_SECRET = 'b'.repeat(40);
  await assert.rejects(service.onModuleInit(), /расшифровать/);
});

test('connection check rejects missing messages permission and confirmation mismatch without saving', async () => {
  const service = new VkSettingsService({}, {}, {});
  let permissions = [], code = 'wrong';
  service.transport = () => ({ api: { groups: {
    getTokenPermissions: async () => ({ permissions }), getCallbackConfirmationCode: async () => ({ code }),
  } } });
  await assert.rejects(service.check(config), /Не удалось проверить VK/);
  permissions = [{ name: 'messages' }]; await assert.rejects(service.check(config), /Не удалось проверить VK/);
  code = config.confirmationToken; assert.equal((await service.check(config)).connected, true);
});

test('settings endpoints enforce administrator role, module access and validate inputs', async () => {
  const { VkSettingsController } = require('../dist/vk-bot/vk-settings.controller');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
  const { ModuleAccessService } = require('../dist/settings/module-access.service');
  const { ValidationPipe } = require('@nestjs/common');
  let calls = 0, accessLevel = 'FULL';
  const module = await Test.createTestingModule({ controllers: [VkSettingsController], providers: [RolesGuard, ModuleAccessGuard,
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'SCHEDULE', isEnabled: true, accessLevel }] } },
    { provide: VkSettingsService, useValue: { status: () => ({ configured: true }), check: async () => { calls++; return { connected: true }; }, save: async (_, actor) => { assert.equal(actor, 'actor'); calls++; return {}; } } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => {
    const req = context.switchToHttp().getRequest(); req.user = { id: 'actor', role: req.headers['x-role'] }; return Boolean(req.user.role);
  } }).compile();
  const app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  try {
    await request(app.getHttpServer()).get('/settings/vk').expect(403);
    await request(app.getHttpServer()).get('/settings/vk').set('x-role', 'MANAGER').expect(403);
    await request(app.getHttpServer()).get('/settings/vk').set('x-role', 'ADMIN').expect(200);
    await request(app.getHttpServer()).patch('/settings/vk').set('x-role', 'ADMIN').send({ communityId: '-123' }).expect(400);
    await request(app.getHttpServer()).post('/settings/vk/check').set('x-role', 'TRAINER').send(config).expect(403);
    accessLevel = 'READ_ONLY';
    await request(app.getHttpServer()).patch('/settings/vk').set('x-role', 'ADMIN').send(config).expect(403);
    assert.equal(calls, 0); accessLevel = 'FULL';
    await request(app.getHttpServer()).patch('/settings/vk').set('x-role', 'ADMIN').send(config).expect(200);
    await request(app.getHttpServer()).post('/settings/vk/check').set('x-role', 'ADMIN').send(config).expect(201);
    assert.equal(calls, 2);
  } finally { await app.close(); }
});

function bot(profile, prisma = {}, links = {}) {
  const sent = [];
  const service = new VkBotService(prisma, links, {}, {}, { identify: async () => profile });
  prisma.vkConversationState = require('./helpers/vk-identity.cjs').idleConversation();
  service.vk = { api: { messages: { send: async args => sent.push(args) } } };
  return { sent, send: text => service.handleMessage({ message: { from_id: 42, peer_id: 42, text } }, 'event') };
}
test('guest linking requests phone plus administrator code and booking links to the real form', async () => {
  const calls = [];
  const h = bot({ type: 'UNKNOWN' }, {}, { bind: async (...args) => { calls.push(args); return 'CLIENT'; } });
  await h.send('Привязать профиль CRM'); assert.match(h.sent[0].message, /привязать \+79991234567 1234/);
  await h.send('+79991234567'); assert.equal(calls.length, 0);
  await h.send('привязать +79991234567 1234'); assert.deepEqual(calls, [[42, '+79991234567', '1234']]);
  await h.send('Записаться на тренировку'); assert.match(h.sent.at(-1).message, /#booking-form/);
});
test('tomorrow schedule has Moscow boundaries and shows rider and optional horse', async () => {
  let range;
  const h = bot({ type: 'STAFF', role: 'TRAINER', trainerId: 'trainer' }, {
    lesson: { findMany: async query => { range = query.where.startTime; return []; } },
    booking: { findMany: async () => [{ id: 'booking', startTime: new Date(), client: { name: 'Анна' }, horse: null }] },
  });
  await h.send('Расписание на завтра');
  const { DateTime } = require('luxon');
  assert.equal(range.gte.toISOString(), DateTime.now().setZone('Europe/Moscow').plus({ days: 1 }).startOf('day').toJSDate().toISOString());
  assert.equal(range.lt - range.gte, 86400000); assert.match(h.sent[0].message, /Анна/);
  await h.send('Мои лошади в работе'); assert.match(h.sent.at(-1).message, /Лошадь пока не назначена/);
});
test('cash response reads only this client paid receipts and labels the boarding balance', async () => {
  const h = bot({ type: 'CLIENT', clientId: 'client' }, {
    payment: { findMany: async query => { assert.deepEqual(query.where, { clientId: 'client', status: 'PAID' }); return []; } },
    client: { findUniqueOrThrow: async query => { assert.equal(query.where.id, 'client'); return { boardingBalance: -500 }; } },
  });
  await h.send('Баланс и касса'); assert.match(h.sent[0].message, /Баланс постоя: -500 ₽/); assert.match(h.sent[0].message, /Оплат пока нет/);
});
