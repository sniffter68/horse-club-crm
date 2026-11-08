const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');

function harness(error, attemptCount = 0) {
  const row = { id: 'notification', key: 'training:client:42', peerId: 42n,
    message: 'Training confirmed', attemptCount, sentAt: null, nextAttemptAt: new Date(0) };
  const warnings = [], queries = [], updates = [];
  let sends = 0;
  const prisma = { vkNotification: {
    findMany: async ({ where }) => {
      queries.push(where);
      return !row.sentAt && row.attemptCount < where.attemptCount.lt
        && row.nextAttemptAt <= where.nextAttemptAt.lte ? [{ ...row }] : [];
    },
    update: async ({ data }) => {
      updates.push(data);
      for (const [key, value] of Object.entries(data)) {
        row[key] = key === 'attemptCount' && typeof value === 'object'
          ? row.attemptCount + value.increment : value;
      }
    },
  } };
  const createWorker = () => {
    const worker = new VkNotifications(prisma);
    worker.logger.warn = entry => warnings.push(entry);
    worker.logger.log = () => {};
    worker.vk = { api: { messages: { send: async () => {
      sends++;
      if (error !== undefined) throw error;
    } } } };
    return worker;
  };
  return { row, warnings, queries, updates, createWorker, sends: () => sends };
}

for (const code of [900, 901, 902]) {
  test(`VK ${code} stops delivery after one attempt, including after restart`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 100000 });
    const h = harness(Object.assign(new Error('Cannot send messages'), { code }));
    const worker = h.createWorker();
    await worker.flush();
    assert.equal(h.sends(), 1);
    assert.equal(h.row.attemptCount, 5);
    assert.equal(h.row.sentAt, null);
    assert.equal(h.warnings[0].errorCode, code);
    assert.equal(h.warnings[0].reason, 'fatal_vk_api_error');
    assert.equal(h.warnings[0].retryStopped, true);
    assert.equal(h.warnings[0].attemptCount, 1);
    assert.equal('nextAttemptAt' in h.updates[0], false);
    t.mock.timers.tick(86400000);
    await worker.flush();
    await h.createWorker().flush();
    assert.equal(h.sends(), 1);
  });
}

for (const error of [new Error('Network timeout'), { code: 6 }, null]) {
  test(`temporary failure ${JSON.stringify(error)} stops at five attempts with backoff`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 100000 });
    // Throw null too: arbitrary thrown values must remain safe to handle.
    const h = harness(error);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const worker = h.createWorker();
      await worker.flush();
      assert.equal(h.sends(), attempt);
      assert.equal(h.row.attemptCount, attempt);
      if (attempt < 5) {
        assert.ok(h.row.nextAttemptAt > new Date());
        await worker.flush();
        assert.equal(h.sends(), attempt);
        t.mock.timers.tick(+h.row.nextAttemptAt - Date.now());
      }
    }
    assert.equal(h.warnings[4].reason, 'max_attempts');
    assert.equal(h.warnings[4].retryStopped, true);
    t.mock.timers.tick(86400000);
    await h.createWorker().flush();
    assert.equal(h.sends(), 5);
    assert.equal(h.row.sentAt, null);
  });
}

test('legacy notifications already beyond the attempt limit are excluded', async () => {
  const h = harness(new Error('Network timeout'), 60);
  await h.createWorker().flush();
  assert.equal(h.sends(), 0);
  assert.equal(h.queries[0].attemptCount.lt, 5);
});

test('successful delivery marks the notification sent and never retries', async () => {
  const h = harness();
  const worker = h.createWorker();
  await worker.flush();
  await worker.flush();
  assert.equal(h.sends(), 1);
  assert.ok(h.row.sentAt instanceof Date);
  assert.equal(h.warnings.length, 0);
});
