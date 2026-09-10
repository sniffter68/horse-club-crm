const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSerializationFailure } = require('../dist/common/serialization-failure');
test('retries Prisma serialization and raw SQLSTATE, not uniqueness or validation', () => {
  for (const error of [{ code: 'P2034' }, { code: '40001' }, { code: 'P2010', meta: { code: '40001' } }, { code: '40P01' }]) assert.equal(isSerializationFailure(error), true);
  for (const error of [null, { code: 'P2002' }, { code: 'P2010', meta: { code: '23505' } }]) assert.equal(isSerializationFailure(error), false);
});
