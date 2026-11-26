const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { assertTrainerUnlocked } = require('../dist/lessons/trainer-lock');

test('settlement guard checks every participant, cash receipts and payment snapshots', async () => {
  let paid = 0;
  const tx = { booking: { count: async ({ where }) => {
    assert.deepEqual(where.id.in, ['one', 'two']);
    assert.ok(where.OR.some(condition => condition.payments?.some.status === 'PAID'));
    return paid;
  } } };
  await assertTrainerUnlocked(tx, ['one', 'two'], false);
  paid = 1;
  await assert.rejects(assertTrainerUnlocked(tx, ['one', 'two'], false), error => error.getStatus() === 400);
  paid = 0; // reversal restores eligibility only while scheduled
  await assertTrainerUnlocked(tx, ['one', 'two'], false);
  await assert.rejects(assertTrainerUnlocked(tx, ['one', 'two'], true), error => error.getStatus() === 400);
});
