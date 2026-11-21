const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { resolveTelegramBotToken } = require('../dist/modules/telegram-bot/telegram-config');

test('Telegram token falls back to the environment on any Prisma lookup error', async () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  try {
    for (const error of [
      new Prisma.PrismaClientKnownRequestError('Table does not exist', { code: 'P2021', clientVersion: Prisma.prismaVersion.client }),
      new Error('Database unavailable'),
    ]) {
      const prisma = { telegramIntegrationSettings: { findUnique: async input => {
        assert.deepEqual(input, { where: { id: 1 } });
        throw error;
      } } };
      process.env.TELEGRAM_BOT_TOKEN = '  123:environment-token  ';
      assert.equal(await resolveTelegramBotToken(prisma), '123:environment-token');
      process.env.TELEGRAM_BOT_TOKEN = '   ';
      assert.equal(await resolveTelegramBotToken(prisma), undefined);
      delete process.env.TELEGRAM_BOT_TOKEN;
      assert.equal(await resolveTelegramBotToken(prisma), undefined);
    }
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previous;
  }
});
