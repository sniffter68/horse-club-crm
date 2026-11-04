require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { VkIdentityService } = require('../dist/vk-bot/vk-identity.service');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { TrainersService } = require('../dist/trainers/trainers.service');
const { CreateTrainerDto } = require('../dist/trainers/dto/create-trainer.dto');

function fixture(patch = {}) {
  const row = { id: 'trainer', name: 'Анна', isActive: true, vkId: null, ...patch };
  const tx = {
    trainer: {
      findUnique: async ({ where }) => where.id === row.id || where.vkId != null && where.vkId === row.vkId ? { ...row } : null,
      findFirst: async ({ where }) => row.vkId === where.vkId && row.isActive ? { ...row } : null,
      update: async ({ data, omit }) => { Object.assign(row, data); return Object.fromEntries(Object.entries(row).filter(([key]) => !omit?.[key])); },
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }) => { Object.assign(row, data); return row; },
    },
    user: { findUnique: async () => null, findFirst: async () => null },
    client: { findFirst: async () => null },
    vkNotification: { deleteMany: async () => ({ count: 0 }) },
  };
  const prisma = { ...tx, $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); return work(tx);
  } };
  return { row, tx, prisma, service: new VkIdentityService(prisma) };
}

test('trainer resolves with one direct indexed query and no account/profile lookup', async () => {
  const service = new VkIdentityService({ trainer: { findFirst: async query => {
    assert.deepEqual(query.where, { vkId: 42n, isActive: true });
    return { id: 'trainer', name: 'Анна' };
  } } });
  assert.deepEqual(await service.identify('42'), { type: 'TRAINER', id: 'trainer', name: 'Анна' });
});

test('trainer can bind and unbind a VK URL without Staff/User, using only the direct BigInt field', async () => {
  const { row, service } = fixture();
  const result = await service.setTrainer('trainer', 'https://vk.com/id42');
  assert.equal(row.vkId, 42n);
  assert.equal('bindPin' in result, false);
  await service.setTrainer('trainer', null);
  assert.equal(row.vkId, null);
});

test('direct binding rejects a VK owned by another client or trainer', async () => {
  const { tx, service, row } = fixture();
  tx.client.findFirst = async () => ({ id: 'client' });
  await assert.rejects(service.setTrainer('trainer', '42'), error => error.getStatus() === 409);
  assert.equal(row.vkId, null);
  tx.client.findFirst = async () => null;
  const read = tx.trainer.findUnique;
  tx.trainer.findUnique = async query => query.where.vkId ? { id: 'other' } : read(query);
  await assert.rejects(service.setTrainer('trainer', '42'), error => error.getStatus() === 409);
});

test('inactive trainer and a legacy trainer account cannot grant trainer identity', async () => {
  const { prisma, service } = fixture({ vkId: 42n, isActive: false });
  prisma.user.findUnique = async () => ({ id: 'account', role: 'TRAINER', trainerId: 'trainer', staffProfile: { isActive: true } });
  prisma.client.findUnique = async () => null;
  assert.deepEqual(await service.identify('42'), { type: 'UNKNOWN' });
});

test('changing or clearing trainer VK revokes pending notifications without writing accounts', async () => {
  const { row, tx, service } = fixture({ vkId: 41n });
  const removed = [];
  tx.vkNotification.deleteMany = async query => removed.push(query.where.peerId);
  await service.setTrainer('trainer', '42');
  assert.equal(row.vkId, 42n);
  await service.setTrainer('trainer', null);
  assert.deepEqual(removed, [41n, 42n]);
});

test('create/update normalize VK and preserve schedule fields without a staff account', async () => {
  const { prisma, service, row } = fixture();
  const trainers = new TrainersService(prisma, service);
  await trainers.create({ name: 'Анна', baseRate: 0, vkId: 'vk.com/id42', maxParallelLessons: 4 });
  assert.equal(row.vkId, 42n); assert.equal(row.maxParallelLessons, 4);
  await trainers.update('trainer', { vkId: 'id43', maxDailyLoad: 480 });
  assert.equal(row.vkId, 43n); assert.equal(row.maxDailyLoad, 480);
  const dto = plainToInstance(CreateTrainerDto, { name: 'Анна', baseRate: 0, vkId: 42 });
  assert.equal(dto.vkId, '42'); assert.equal((await validate(dto)).length, 0);
});

for (const command of ['код 1234', 'тренер 1234']) test(`bot ignores removed PIN command: ${command}`, async () => {
  const bot = new VkBotService({ vkConversationState: require('./helpers/vk-identity.cjs').idleConversation() }, {}, {}, {}, {
    identify: async () => { throw Error('PIN command must not resolve identity'); },
  });
  bot.vk = { api: { messages: { send: async () => { throw Error('PIN command must not reply'); } } } };
  await bot.handleMessage({ message: { from_id: 42, peer_id: 42, text: command, out: 0 } }, command);
});

test('direct trainer can open menu, request schedule and mark attendance', async () => {
  const sent = [], days = [], attendance = [];
  const identity = { identify: async () => ({ type: 'TRAINER', id: 'trainer', name: 'Анна' }) };
  const bot = new VkBotService({ vkConversationState: require('./helpers/vk-identity.cjs').idleConversation() }, {}, {
    markAttendance: async (...args) => attendance.push(args),
  }, {}, identity);
  bot.vk = { api: { messages: { send: async message => sent.push(message), sendMessageEventAnswer: async () => {} } } };
  bot.today = async (...args) => days.push(args);
  await bot.handleMessage({ message: { from_id: 42, peer_id: 42, text: '/start', out: 0 } }, 'menu');
  assert.match(String(sent[0].keyboard), /Мои всадники/);
  await bot.handleMessage({ message: { from_id: 42, peer_id: 42, text: 'today', out: 0 } }, 'today');
  assert.equal(days[0][0], 'trainer');
  await bot.handleEvent({ user_id: 42, peer_id: 42, event_id: 'attendance', payload: {
    action: 'attendance', bookingId: '11111111-1111-4111-8111-111111111111', attended: true,
  } });
  assert.equal(attendance[0][2].trainerId, 'trainer');
});

test('trainer VK API validates UUID and requires writable schedule and administrator/manager role', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { TrainersController } = require('../dist/trainers/trainers.controller');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const { ModuleAccessService } = require('../dist/settings/module-access.service');
  let level = 'FULL';
  let calls = 0;
  const module = await Test.createTestingModule({ controllers: [TrainersController], providers: [RolesGuard,
    { provide: TrainersService, useValue: {} },
    { provide: VkIdentityService, useValue: { setTrainer: async (_id, vkId) => { calls++; return { vkId }; } } },
    { provide: ModuleAccessService, useValue: { forRole: async () => [{ module: 'SCHEDULE', isEnabled: true, accessLevel: level }] } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] || 'MANAGER' }; return true;
  } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true })); await app.init();
  const post = (id = '11111111-1111-4111-8111-111111111111') => request(app.getHttpServer()).patch(`/api/trainers/${id}/vk`).send({ vkId: '42' });
  try {
    assert.equal((await post().expect(200)).body.vkId, '42');
    await request(app.getHttpServer()).post('/api/trainers/11111111-1111-4111-8111-111111111111/bind-code').expect(404);
    await post('invalid').expect(400);
    await post().set('x-role', 'TRAINER').expect(403);
    level = 'READ_ONLY'; await post().expect(403);
    level = 'HIDDEN'; await post().expect(403);
    assert.equal(calls, 1);
  } finally { await app.close(); }
});
