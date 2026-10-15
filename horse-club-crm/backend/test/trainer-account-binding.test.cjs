require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { UsersService } = require('../dist/users/users.service');
const { UsersController } = require('../dist/users/users.controller');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');

test('only administrators can bind accounts, and a binding change revokes the existing session', async () => {
  assert.deepEqual(Reflect.getMetadata('auth:roles', UsersController), ['ADMIN']);
  const row = { id: 'user', email: 'trainer@test.local', role: 'TRAINER', tokenVersion: 1, trainerId: null };
  const tx = { user: { findUnique: async () => row, update: async ({ data }) => {
    row.trainerId = data.trainerId; row.tokenVersion += data.tokenVersion.increment; return { ...row };
  } }, trainer: { findUnique: async ({ where }) => ({ id: where.id }) } };
  const service = new UsersService({ $transaction: async work => work(tx) });
  const strategy = new JwtStrategy({ secret: 'test-only-secret-with-more-than-32-bytes' }, { user: tx.user });
  const claims = { sub: row.id, email: row.email, role: row.role, authVersion: '1', exp: 9999999999 };
  await strategy.validate(claims);
  await service.setTrainer(row.id, 'trainer');
  assert.equal(row.trainerId, 'trainer'); assert.equal(row.tokenVersion, 2);
  await assert.rejects(strategy.validate(claims), e => e.getStatus() === 401);
  assert.equal((await strategy.validate({ ...claims, authVersion: '2' })).trainerId, 'trainer');
  await service.setTrainer(row.id, null); assert.equal(row.trainerId, null); assert.equal(row.tokenVersion, 3);
});

test('binding rejects non-trainer accounts, missing trainers, missing input and duplicate trainer bindings', async () => {
  const make = (role, exists, duplicate) => new UsersService({ $transaction: async work => work({
    user: { findUnique: async () => ({ id: 'u', role }), update: async () => {
      if (duplicate) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' });
      return {};
    } }, trainer: { findUnique: async () => exists ? {} : null },
  }) });
  await assert.rejects(make('ADMIN', true).setTrainer('u', 't'), e => e.getStatus() === 400);
  await assert.rejects(make('TRAINER', false).setTrainer('u', 't'), e => e.getStatus() === 400);
  await assert.rejects(make('TRAINER', true).setTrainer('u', undefined), e => e.getStatus() === 400);
  await assert.rejects(make('TRAINER', true, true).setTrainer('u', 't'), e => e.getStatus() === 409);
});
