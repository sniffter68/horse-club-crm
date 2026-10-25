const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { Prisma } = require('@prisma/client');
const { VkIdentityService, parseVkProfile } = require('../dist/vk-bot/vk-identity.service');
const { VkIdentityController } = require('../dist/vk-bot/vk-identity.controller');

for (const input of ['12345678', 'id12345678', ' https://vk.com/id12345678 ', 'vk.com/id12345678/', '@id12345678', 'https://m.vk.com/id12345678?from=search']) {
  test(`numeric profile: ${input}`, () => assert.deepEqual(parseVkProfile(input), { vkId: '12345678' }));
}
for (const input of ['username', '@username', 'https://vk.com/username', 'vk.com/USERNAME', 'https://vk.ru/username/']) {
  test(`screen name: ${input}`, () => assert.deepEqual(parseVkProfile(input), { vkScreenName: 'username' }));
}
for (const input of ['0', '-1', '0123', 'id0', '1234567890123456', 'https://evil.com/user', 'vk.com/user/extra', 'vk.com/club123', 'https://vk.com.evil.com/user', 'https://vk.com:8080/user', 'https://vk.com/user%2Fpath']) {
  test(`reject invalid profile: ${input}`, () => assert.throws(() => parseVkProfile(input)));
}
test('screen name resolves through VK to a numeric ID; unavailable/deactivated pages never save', async () => {
  const original = process.env.VK_COMMUNITY_TOKEN;
  process.env.VK_COMMUNITY_TOKEN = 'test-token';
  try {
    const service = new VkIdentityService({});
    service.resolveScreenName = async (screen, token) => { assert.equal(screen, 'username'); assert.equal(token, 'test-token'); return [{ id: 42 }]; };
    assert.deepEqual(await service.normalize('@username'), { vkId: '42', vkScreenName: 'username' });
    service.resolveScreenName = async () => [];
    await assert.rejects(service.normalize('@username'), error => error.getStatus() === 400);
    service.resolveScreenName = async () => [{ id: 42, deactivated: 'deleted' }];
    await assert.rejects(service.normalize('@username'), error => error.getStatus() === 400);
    service.resolveScreenName = async () => { throw Error('timeout'); };
    await assert.rejects(service.normalize('@username'), error => error.getStatus() === 503);
    assert.deepEqual(await service.normalize('  '), { vkId: null, vkScreenName: null });
    assert.deepEqual(await service.normalize(null), { vkId: null, vkScreenName: null });
  } finally { if (original === undefined) delete process.env.VK_COMMUNITY_TOKEN; else process.env.VK_COMMUNITY_TOKEN = original; }
});

const fixtures = (patch = {}) => ({
  client: { findFirst: async () => null, findUnique: async () => null },
  user: { findFirst: async () => null, findUnique: async () => null },
  trainer: { findUnique: async () => null }, ...patch,
});
test('uniqueness covers both tables and legacy trainer bindings, permits same owner', async () => {
  const service = new VkIdentityService({});
  for (const [field, kind] of [['client', 'STAFF'], ['user', 'CLIENT'], ['trainer', 'CLIENT']]) {
    const model = field === 'trainer' ? { findUnique: async () => ({ id: 'other' }) } : { findFirst: async () => ({ id: 'other' }) };
    await assert.rejects(service.assertAvailable(fixtures({ [field]: model }), '42', kind, 'self'), error => error.getStatus() === 409);
  }
  await service.assertAvailable(fixtures({ client: { findFirst: async () => ({ id: 'self' }) } }), '42', 'CLIENT', 'self');
  await service.assertAvailable(fixtures({ user: { findFirst: async () => ({ id: 'self' }) }, trainer: { findUnique: async () => ({ id: 'trainer' }) } }), '42', 'STAFF', 'self', 'trainer');
});
test('concurrent unique conflicts return a helpful 409, serialization failures retry', async () => {
  const error = code => new Prisma.PrismaClientKnownRequestError('conflict', { code, clientVersion: '6.19.3' });
  let attempts = 0;
  const service = new VkIdentityService({ $transaction: async work => { if (++attempts === 1) throw error('P2034'); return work({}); } });
  assert.equal(await service.atomic(async () => 'saved'), 'saved'); assert.equal(attempts, 2);
  service.prisma.$transaction = async () => { throw error('P2002'); };
  await assert.rejects(service.atomic(async () => {}), error => error.getStatus() === 409 && /VK ID/.test(error.message));
});
test('staff update and clear synchronize user/trainer delivery IDs and revoke pending notifications', async () => {
  const account = { id: 'staff', trainerId: 'trainer', vkUserId: 41n };
  const writes = [];
  const tx = fixtures({ user: { findUnique: async () => account, findFirst: async () => null, update: async query => { writes.push(['user', query]); return query.data; } },
    trainer: { findUnique: async () => ({ id: 'trainer', vkUserId: 41n }), update: async query => writes.push(['trainer', query]) },
    vkNotification: { deleteMany: async query => writes.push(['queue', query]) } });
  const service = new VkIdentityService({ $transaction: async work => work(tx) });
  const result = await service.setStaff('staff', 'id42');
  assert.equal(result.vkId, '42'); assert.equal(result.vkUserId, 42n);
  assert.equal(writes.find(([kind]) => kind === 'trainer')[1].data.vkUserId, 42n);
  assert.deepEqual(writes.find(([kind]) => kind === 'queue')[1].where.peerId, { in: [41n] });
  assert.equal((await service.setStaff('staff', null)).vkId, null);
});
test('identification prioritizes staff, rejects inactive profiles, returns client summary and UNKNOWN', async () => {
  let user = { id: 'staff', role: 'TRAINER', trainerId: 'trainer', trainer: { name: 'Тренер', isActive: true }, staffProfile: { fullName: 'Иван', isActive: true } };
  let client = { id: 'client', name: 'Анна', deletedAt: null };
  let clientReads = 0;
  const service = new VkIdentityService({ user: { findUnique: async query => { assert.deepEqual(query.where, { vkId: '42' }); return user; } },
    client: { findUnique: async () => { clientReads++; return client; } },
    membership: { count: async query => { assert.equal(query.where.status, 'active'); assert.deepEqual(query.where.remainingUnits, { gt: 0 }); return 2; } },
    booking: { findFirst: async query => { assert.equal(query.where.status, 'scheduled'); return { id: 'booking' }; } } });
  assert.deepEqual(await service.identify('42'), { type: 'STAFF', staffId: 'staff', role: 'TRAINER', trainerId: 'trainer', name: 'Иван' });
  assert.equal(clientReads, 0);
  user = null;
  assert.deepEqual(await service.identify('42'), { type: 'CLIENT', clientId: 'client', name: 'Анна', activeMembershipsCount: 2, nextBooking: { id: 'booking' } });
  client = { ...client, deletedAt: new Date() };
  assert.deepEqual(await service.identify('42'), { type: 'UNKNOWN' });
  client = null; user = { staffProfile: { isActive: false } };
  assert.deepEqual(await service.identify('42'), { type: 'UNKNOWN' });
  await assert.rejects(service.identify('id42'), error => error.getStatus() === 400);
});
test('GET /api/vk/identify requires its service token and validates numeric input', async () => {
  const original = process.env.VK_IDENTIFY_TOKEN;
  process.env.VK_IDENTIFY_TOKEN = 'service-secret';
  const calls = [];
  const module = await Test.createTestingModule({ controllers: [VkIdentityController], providers: [{ provide: VkIdentityService, useValue: {
    identify: async id => { calls.push(id); return { type: id === '42' ? 'CLIENT' : id === '43' ? 'STAFF' : 'UNKNOWN' }; },
  } }] }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    const get = (id, token) => { const req = request(app.getHttpServer()).get(`/api/vk/identify?vkId=${id}`); return token ? req.set('x-bot-token', token) : req; };
    await get('42').expect(401); await get('42', 'wrong').expect(401); assert.equal(calls.length, 0);
    for (const [id, type] of [['42', 'CLIENT'], ['43', 'STAFF'], ['44', 'UNKNOWN']]) assert.equal((await get(id, 'service-secret').expect(200)).body.type, type);
    for (const id of ['', '0', '-1', 'id42', '1&vkId=2']) await get(id, 'service-secret').expect(400);
    delete process.env.VK_IDENTIFY_TOKEN; await get('42', 'service-secret').expect(503);
  } finally { await app.close(); if (original === undefined) delete process.env.VK_IDENTIFY_TOKEN; else process.env.VK_IDENTIFY_TOKEN = original; }
});

test('client PATCH resolves aliases, checks uniqueness and clears legacy delivery in one transaction', async () => {
  const { ClientsService } = require('../dist/clients/clients.service');
  let conflict = false;
  const writes = [], queues = [];
  const tx = fixtures({
    client: { findFirst: async () => null, findUnique: async () => ({ id: 'client', vkUserId: 41n }),
      update: async query => { writes.push(query); return query.data; } },
    user: { findFirst: async () => conflict ? { id: 'other' } : null },
    vkNotification: { deleteMany: async query => queues.push(query) },
  });
  const prisma = { $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(tx); } };
  const identity = new VkIdentityService(prisma);
  identity.normalize = async input => input ? { vkId: '42', vkScreenName: 'alice' } : { vkId: null, vkScreenName: null };
  const clients = new ClientsService(prisma, identity);
  clients.findOne = async () => ({ firstName: 'Анна', lastName: 'Орлова' });
  await clients.update('client', { vkId: '@alice' });
  assert.equal(writes[0].data.vkId, '42'); assert.equal(writes[0].data.vkScreenName, 'alice'); assert.equal(writes[0].data.vkUserId, 42n);
  assert.deepEqual(queues[0].where, { peerId: 41n, sentAt: null });
  conflict = true;
  await assert.rejects(clients.update('client', { vkId: '@alice' }), error => error.getStatus() === 409);
  assert.equal(writes.length, 1);
  conflict = false;
  await clients.update('client', { vkId: null });
  assert.equal(writes[1].data.vkId, null); assert.equal(writes[1].data.vkUserId, null);
});

test('bot identifies actual from_id and immediately opens the correct menu without phone or code', async () => {
  const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
  for (const profile of [
    { type: 'CLIENT', clientId: 'client', name: 'Анна' },
    { type: 'STAFF', role: 'TRAINER', staffId: 'user', trainerId: 'trainer', name: 'Иван' },
    { type: 'UNKNOWN' },
  ]) {
    const calls = [], sent = [];
    const bot = new VkBotService({}, { bind: () => { throw Error('Phone binding must never run'); } }, {}, {}, {
      identify: async vkId => { calls.push(vkId); return profile; },
    });
    bot.vk = { api: { messages: { send: async params => sent.push(params) } } };
    await bot.handleMessage({ message: { from_id: 9876, peer_id: 9876, text: 'Здравствуйте', out: 0 } }, 'direct-message');
    assert.deepEqual(calls, ['9876']);
    assert.match(sent[0].message, profile.type === 'UNKNOWN' ? /Приглашаем/ : new RegExp(profile.name));
    assert.match(String(sent[0].keyboard), profile.type === 'STAFF' ? /Список всадников/ : profile.type === 'CLIENT' ? /Записаться/ : /Первичная заявка/);
    assert.doesNotMatch(sent[0].message, /код|ВАШ_ТЕЛЕФОН/);
  }
});

test('PATCH /api/users/:id validates payload and enforces role and module write access', async () => {
  const { UsersController } = require('../dist/users/users.controller');
  const { UsersService } = require('../dist/users/users.service');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const { ModuleAccessService } = require('../dist/settings/module-access.service');
  let level = 'FULL'; const calls = [];
  const module = await Test.createTestingModule({ controllers: [UsersController], providers: [RolesGuard,
    { provide: UsersService, useValue: {} },
    { provide: VkIdentityService, useValue: { setStaff: async (id, input) => { calls.push([id, input]); return { id, vkId: input }; } } },
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'STAFF_PAYROLL', isEnabled: true, accessLevel: level }] } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] || 'ADMIN' }; return true;
  } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  const id = '11111111-1111-4111-8111-111111111111';
  const patch = body => request(app.getHttpServer()).patch(`/api/users/${id}`).send(body);
  try {
    await patch({ vkId: 'vk.com/alice' }).expect(200); assert.deepEqual(calls[0], [id, 'vk.com/alice']);
    await patch({ vkId: null }).expect(200);
    for (const body of [{}, { vkId: 42 }, { vkId: 'x'.repeat(257) }, { vkId: '42', role: 'ADMIN' }]) await patch(body).expect(400);
    await patch({ vkId: '42' }).set('x-role', 'TRAINER').expect(403);
    level = 'READ_ONLY'; await patch({ vkId: '42' }).expect(403);
    level = 'HIDDEN'; await patch({ vkId: '42' }).expect(403);
    assert.equal(calls.length, 2);
  } finally { await app.close(); }
});
