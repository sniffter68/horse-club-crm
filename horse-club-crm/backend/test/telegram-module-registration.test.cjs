const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { Logger } = require('@nestjs/common');
const { AppModule } = require('../dist/app.module');
const { TelegramBotModule } = require('../dist/modules/telegram-bot/telegram-bot.module');
const { TelegramBotService } = require('../dist/modules/telegram-bot/telegram-bot.service');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { AUTH_OPTIONS } = require('../dist/auth/auth.config');

test('AppModule registers Telegram bot and Nest initializes it safely without a token', async t => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  t.after(() => {
    if (token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = token;
  });
  assert.ok(Reflect.getMetadata('imports', AppModule).includes(TelegramBotModule));
  const messages = [];
  t.mock.method(Logger.prototype, 'log', message => messages.push(message));
  t.mock.method(Logger.prototype, 'warn', message => messages.push(message));
  const module = await Test.createTestingModule({ imports: [TelegramBotModule] })
    .overrideProvider(PrismaService).useValue({})
    .overrideProvider(AUTH_OPTIONS).useValue({ secret: 'telegram-module-test-secret-only-32-bytes' })
    .compile();
  t.after(() => module.close());
  await module.init();
  assert.ok(module.get(TelegramBotService) instanceof TelegramBotService);
  assert.ok(messages.includes('Telegram bot module initialized'));
  assert.ok(messages.includes('Telegram bot disabled: TELEGRAM_BOT_TOKEN is empty'));
});
