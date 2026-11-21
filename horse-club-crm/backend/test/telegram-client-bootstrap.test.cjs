const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCipheriv, createHash, createHmac, randomBytes } = require('node:crypto');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { TrainerTmaService } = require('../dist/modules/telegram-bot/trainer-tma.service');
const { TrainerTmaAuthController } = require('../dist/modules/telegram-bot/trainer-tma.controller');
const { TelegramAuthGuard } = require('../dist/modules/telegram-bot/telegram-auth.guard');
const { resolveTelegramBotToken } = require('../dist/modules/telegram-bot/telegram-config');
const id = '11111111-1111-4111-8111-111111111111';
const tgId = '1808998846';
const botToken = '123:database-bot-token';
const secret = 'bootstrap-test-secret-at-least-32-bytes';
function signed(token = botToken) {
  const data = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(tgId), first_name: 'Инна', last_name: 'Ярцева' }) });
  const check = [...data].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  data.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(check).digest('hex'));
  return data.toString();
}

test('bootstrap: either client Telegram ID, no staff account, DB token, headers/body, scoped session, unlinked and forged data', async () => {
  const previous = { token: process.env.TELEGRAM_BOT_TOKEN, secret: process.env.JWT_SECRET };
  process.env.TELEGRAM_BOT_TOKEN = 'wrong:environment-token'; process.env.JWT_SECRET = secret;
  const iv = randomBytes(12), key = createHash('sha256').update(`horsecrm:telegram-settings:v1:${secret}`).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify({ botToken: ` ${botToken} ` })), cipher.final()]);
  const encryptedConfig = Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
  let client, lookups = 0;
  const prisma = {
    telegramIntegrationSettings: { findUnique: async () => ({ encryptedConfig }) },
    user: { findUnique: async () => null, findFirst: async () => null },
    clubModuleSettings: { findUnique: async () => null },
    client: { findFirst: async ({ where }) => {
      lookups++;
      assert.deepEqual(where.OR, [{ telegramUserId: tgId }, { telegramChatId: tgId }]);
      return client && where.OR.some(condition => Object.entries(condition).every(([k, v]) => client[k] === v)) ? client : null;
    } },
  };
  const jwt = new JwtService({ secret });
  const service = new TrainerTmaService(prisma, jwt, {}, {}, {}, { dashboard: async () => ({ membership: null, nextBooking: null }) });
  const module = await Test.createTestingModule({ controllers: [TrainerTmaAuthController], providers: [{ provide: TrainerTmaService, useValue: service }] }).compile();
  const app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  try {
    assert.equal(await resolveTelegramBotToken(prisma), botToken);
    const api = request(app.getHttpServer());
    for (const field of ['telegramUserId', 'telegramChatId']) {
      client = { id, name: 'Инна Ярцева', firstName: 'Инна', lastName: 'Ярцева', phone: '+79991234567', deletedAt: null, [field]: tgId };
      for (const source of ['body', 'authorization', 'header']) {
        let req = api.post('/api/tma/bootstrap');
        if (source === 'authorization') req = req.set('Authorization', `tma ${signed()}`);
        if (source === 'header') req = req.set('Authorization', 'Bearer old-session').set('x-telegram-init-data', signed());
        const result = await req.send(source === 'body' ? { initData: signed() } : {}).expect(200);
        assert.equal(result.body.role, 'CLIENT'); assert.equal(result.body.clientId, id);
        assert.equal(result.body.client.name, 'Инна Ярцева');
        const payload = jwt.verify(result.body.token, { audience: 'client-tma' });
        assert.equal(payload.sub, id); assert.equal(payload.telegramUserId, tgId);
        const guard = new TelegramAuthGuard(prisma, { bindUsername: async () => {} }, jwt);
        for (const authorization of [`Bearer ${result.body.token}`, `tma ${signed()}`]) {
          const req = { get: name => name === 'Authorization' ? authorization : undefined };
          assert.equal(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) }), true);
          assert.equal(req.telegram.clientId, id);
        }
      }
    }
    client = null;
    const unlinked = await api.post('/api/tma/bootstrap').send({ initData: signed() }).expect(200);
    assert.deepEqual(unlinked.body, { role: 'UNLINKED_CLIENT', needsPhoneLink: true });
    // No upsert delegate: a contact request must succeed without creating a client.
    const contactRequest = { method: 'POST', path: '/api/tma/client/request-contact', get: name => name === 'Authorization' ? `tma ${signed()}` : undefined };
    const contactGuard = new TelegramAuthGuard(prisma, { bindUsername: async () => {} }, jwt);
    assert.equal(await contactGuard.canActivate({ switchToHttp: () => ({ getRequest: () => contactRequest }) }), true);
    assert.equal(client, null);
    const before = lookups;
    await api.post('/api/tma/bootstrap').send({ initData: signed('wrong') }).expect(401);
    assert.equal(lookups, before);
    assert.equal(await resolveTelegramBotToken({ telegramIntegrationSettings: { findUnique: async () => null } }), 'wrong:environment-token');
  } finally {
    await app.close();
    if (previous.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous.token;
    if (previous.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous.secret;
  }
});
