const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const bcrypt = require('bcrypt');
const { UsersService } = require('../dist/users/users.service');
const { MembershipsService } = require('../dist/memberships/memberships.service');

test('admin creation hashes the password and returns no passwordHash', async () => {
  let saved;
  const prisma = { user: { create: async ({ data, select }) => {
    saved = data;
    assert.equal(select.passwordHash, undefined);
    return { id: 'user-1', email: data.email, role: data.role, createdAt: new Date(), updatedAt: new Date() };
  } } };
  const result = await new UsersService(prisma).create({ email: 'ADMIN@EXAMPLE.COM', password: 'safe-admin-password', role: 'ADMIN' });
  assert.equal(result.email, 'admin@example.com');
  assert.equal(result.passwordHash, undefined);
  assert.equal(await bcrypt.compare('safe-admin-password', saved.passwordHash), true);
});

test('membership issue creates balance and initial CREDIT operation atomically', async () => {
  let saved;
  const prisma = {
    client: { findUnique: async () => ({ id: 'client-1' }) },
    pricingPlan: { findUnique: async () => null },
    membership: { create: async ({ data }) => {
      saved = data;
      return { id: 'membership-1', ...data, client: { id: 'client-1', name: 'Иван Иванов' }, pricingPlan: null, createdAt: new Date(), updatedAt: new Date() };
    } },
  };
  const validUntil = new Date(Date.now() + 86_400_000).toISOString();
  const result = await new MembershipsService(prisma).create({ clientId: 'client-1', totalLessons: 8, validUntil });
  assert.equal(saved.totalLessons, 8);
  assert.equal(saved.remainedLessons, 8);
  assert.deepEqual(saved.operations.create, { type: 'CREDIT', amount: 8, reason: 'Initial membership issue' });
  assert.equal(result.isActive, true);
});
