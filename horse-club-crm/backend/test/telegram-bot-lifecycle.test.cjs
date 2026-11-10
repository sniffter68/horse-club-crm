const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Api, Bot, GrammyError, HttpError } = require('grammy');
const { Logger } = require('@nestjs/common');
const { TelegramBotService } = require('../dist/modules/telegram-bot/telegram-bot.service');
const token = '123:lifecycle-test-only';
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const names = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBAPP_URL', 'TELEGRAM_API_ROOT'];
  const previous = names.map(name => [name, process.env[name]]);
  process.env.TELEGRAM_BOT_TOKEN = token;
  process.env.TELEGRAM_WEBAPP_URL = 'https://example.test/tma';
  delete process.env.TELEGRAM_API_ROOT;
  const messages = [];
  for (const level of ['log', 'warn', 'error']) {
    t.mock.method(Logger.prototype, level, message => messages.push([level, message]));
  }
  const service = new TelegramBotService();
  t.after(async () => {
    await service.onModuleDestroy();
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  return { service, messages };
}

test('startup clears webhook before init/start, logs success and awaits stop', async t => {
  const { service, messages } = fixture(t);
  const calls = [];
  let running = false;
  t.mock.method(Api.prototype, 'deleteWebhook', async (options, signal) => {
    assert.deepEqual(options, { drop_pending_updates: true });
    assert.equal(signal.aborted, false);
    calls.push('deleteWebhook');
    return true;
  });
  t.mock.method(Bot.prototype, 'init', async () => { calls.push('init'); });
  t.mock.method(Bot.prototype, 'start', async function (options) {
    assert.equal(this.api.options.timeoutSeconds, 30);
    assert.ok(options.timeout < this.api.options.timeoutSeconds);
    assert.deepEqual(options.allowed_updates, ['message', 'callback_query']);
    calls.push('start');
    running = true;
    await options.onStart();
  });
  t.mock.method(Bot.prototype, 'isRunning', () => running);
  let releaseStop;
  t.mock.method(Bot.prototype, 'stop', () => new Promise(resolve => {
    calls.push('stop');
    releaseStop = () => { running = false; resolve(); };
  }));
  assert.equal(service.onModuleInit(), undefined);
  await flush();
  service.onModuleInit();
  assert.deepEqual(calls, ['deleteWebhook', 'init', 'start']);
  assert.ok(messages.some(([, message]) => message === 'Telegram bot polling started successfully'));
  let destroyed = false;
  const destroying = service.onModuleDestroy().then(() => { destroyed = true; });
  await flush();
  assert.equal(destroyed, false);
  releaseStop();
  await destroying;
  assert.equal(destroyed, true);
});

test('webhook timeout aborts request, warns and proceeds to polling without blocking Nest', async t => {
  const { service, messages } = fixture(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started = false;
  t.mock.method(Api.prototype, 'deleteWebhook', (_options, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('webhook timeout')), { once: true });
  }));
  t.mock.method(Bot.prototype, 'init', async () => {});
  t.mock.method(Bot.prototype, 'start', async () => { started = true; });
  assert.equal(service.onModuleInit(), undefined);
  assert.equal(started, false);
  t.mock.timers.tick(10_000);
  await flush();
  assert.equal(started, true);
  assert.ok(messages.some(([level, message]) => level === 'warn' && message.includes('webhook timeout')));
});

for (const stage of ['webhook', 'getMe']) {
  test(`shutdown aborts pending ${stage} and prevents late polling`, async t => {
    const { service } = fixture(t);
    let signal, started = false;
    const pending = async (...args) => {
      signal = args.at(-1);
      await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    };
    t.mock.method(Api.prototype, 'deleteWebhook', stage === 'webhook' ? pending : async () => true);
    t.mock.method(Bot.prototype, 'init', stage === 'getMe' ? pending : async () => {});
    t.mock.method(Bot.prototype, 'start', async () => { started = true; });
    service.onModuleInit();
    await flush();
    assert.equal(signal.aborted, false);
    await service.onModuleDestroy();
    await flush();
    assert.equal(signal.aborted, true);
    assert.equal(started, false);
  });
}

test('polling errors retain API code, stack and nested network cause while redacting tokens', async t => {
  const { service, messages } = fixture(t);
  t.mock.method(Api.prototype, 'deleteWebhook', async () => true);
  t.mock.method(Bot.prototype, 'init', async () => {});
  const network = Object.assign(new Error(`socket failed https://api.telegram.org/bot${token}/getUpdates`), { code: 'ETIMEDOUT' });
  const error = new GrammyError('Conflict', { ok: false, error_code: 409, description: 'Conflict: another polling instance' }, 'getUpdates', {});
  error.cause = new HttpError('network failed', network);
  t.mock.method(Bot.prototype, 'start', async () => { throw error; });
  service.onModuleInit();
  await flush();
  const errors = messages.filter(([level]) => level === 'error').map(([, message]) => message).join('\n');
  assert.match(errors, /409/);
  assert.match(errors, /ETIMEDOUT/);
  assert.match(errors, /telegram-bot-lifecycle.test.cjs/);
  assert.ok(messages.every(([, message]) => !message.includes(token)));
});

test('getMe timeout is cancellable and reported without starting polling', async t => {
  const { service, messages } = fixture(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started = false;
  t.mock.method(Api.prototype, 'deleteWebhook', async () => true);
  t.mock.method(Bot.prototype, 'init', signal => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('getMe timeout')), { once: true });
  }));
  t.mock.method(Bot.prototype, 'start', async () => { started = true; });
  service.onModuleInit();
  await flush();
  t.mock.timers.tick(30_000);
  await flush();
  assert.equal(started, false);
  assert.ok(messages.some(([level, message]) => level === 'error' && message.includes('getMe timeout')));
});

test('global catch logs update identity and cause without dumping the private update', async t => {
  const { service, messages } = fixture(t);
  const { BotError, Context } = require('grammy');
  t.mock.method(Api.prototype, 'deleteWebhook', async () => true);
  t.mock.method(Bot.prototype, 'init', async () => {});
  t.mock.method(Bot.prototype, 'start', async function () {
    const ctx = new Context({ update_id: 42, message: { message_id: 1, text: 'private message content' } }, this.api, {});
    await this.errorHandler(new BotError(new Error(`handler failed ${token}`), ctx));
  });
  service.onModuleInit();
  await flush();
  const errors = messages.filter(([level]) => level === 'error').map(([, message]) => message).join('\n');
  assert.match(errors, /update_id=42, type=message/);
  assert.match(errors, /handler failed/);
  assert.ok(!errors.includes(token));
  assert.ok(!errors.includes('private message content'));
});
