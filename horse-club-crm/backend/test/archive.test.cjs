const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
require('reflect-metadata');
const { ClientsService } = require('../dist/clients/clients.service');
const { MembershipsService } = require('../dist/memberships/memberships.service');
const { ArchiveQueryDto } = require('../dist/common/dto/archive-query.dto');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { ClientsController } = require('../dist/clients/clients.controller');
const { MembershipsController } = require('../dist/memberships/memberships.controller');

function fixture(kind, overrides = {}) {
  const calls = [];
  const counts = Object.fromEntries((kind === 'client'
    ? ['bookings', 'memberships', 'payments', 'transactions', 'boardingContracts', 'boardingDailyLogs', 'ownedHorses', 'leadRequests']
    : ['bookings', 'payments', 'transactions', 'operations']).map(key => [key, 0]));
  const record = { id: 'record', deletedAt: null, boardingBalance: new Prisma.Decimal(0),
    totalLessons: 8, remainedLessons: 8, initialUnits: new Prisma.Decimal(8), remainingUnits: new Prisma.Decimal(8),
    cashboxPosted: false, _count: counts, ...overrides };
  const tx = { $queryRaw: async () => [], [kind]: {
    findUnique: async () => record,
    delete: async args => { calls.push(['delete', args]); return record; },
    update: async args => { calls.push(['update', args]); return { ...record, ...args.data }; },
  } };
  const prisma = { ...tx, $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); return fn(tx);
  } };
  return { record, calls, tx, prisma, service: kind === 'client' ? new ClientsService(prisma) : new MembershipsService(prisma) };
}

test('empty client is physically deleted inside a serializable transaction', async () => {
  const f = fixture('client');
  assert.equal((await f.service.remove('record')).softDeleted, false);
  assert.deepEqual(f.calls, [['delete', { where: { id: 'record' } }]]);
});
for (const relation of ['bookings', 'memberships', 'payments', 'transactions', 'boardingContracts', 'boardingDailyLogs', 'ownedHorses', 'leadRequests']) {
  test(`client with ${relation} is archived without deleting history`, async () => {
    const f = fixture('client'); f.record._count[relation] = 1;
    assert.equal((await f.service.remove('record')).softDeleted, true);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'update');
    assert.ok(f.calls[0][1].data.deletedAt instanceof Date);
  });
}
test('archived client cannot later be hard deleted and restoration only clears archive marker', async () => {
  const deletedAt = new Date(); const f = fixture('client', { deletedAt });
  assert.equal((await f.service.remove('record')).softDeleted, true);
  assert.equal(f.calls[0][1].data.deletedAt, deletedAt);
  assert.equal((await f.service.restore('record')).deletedAt, null);
});
test('nonzero client balance prevents hard deletion', async () => {
  const f = fixture('client', { boardingBalance: new Prisma.Decimal('0.01') });
  assert.equal((await f.service.remove('record')).softDeleted, true);
});
test('missing client and membership return 404', async () => {
  for (const kind of ['client', 'membership']) {
    const f = fixture(kind); f.tx[kind].findUnique = async () => null;
    await assert.rejects(f.service.remove('missing'), { status: 404 });
  }
});
test('serialization retry rechecks history instead of replaying hard delete', async () => {
  const f = fixture('client'); let attempts = 0;
  f.prisma.$transaction = async fn => {
    if (++attempts === 1) { f.record._count.payments = 1; throw { code: 'P2034' }; }
    return fn(f.tx);
  };
  assert.equal((await f.service.remove('record')).softDeleted, true);
  assert.equal(attempts, 2); assert.equal(f.calls[0][0], 'update');
});
test('empty unused membership is physically deleted', async () => {
  const f = fixture('membership');
  assert.equal((await f.service.remove('record')).softDeleted, false);
  assert.equal(f.calls[0][0], 'delete');
});
for (const relation of ['bookings', 'payments', 'transactions', 'operations']) {
  test(`membership with ${relation} preserves balances and history`, async () => {
    const f = fixture('membership'); f.record._count[relation] = 1;
    const result = await f.service.remove('record');
    assert.equal(result.softDeleted, true); assert.match(result.message, /кассе/);
    assert.deepEqual(Object.keys(f.calls[0][1].data), ['deletedAt']);
  });
}
test('used or cash-posted membership is archived even without remaining relation rows', async () => {
  for (const overrides of [{ remainedLessons: 7 }, { cashboxPosted: true }, { remainingUnits: new Prisma.Decimal(7) }, { deletedAt: new Date() }]) {
    const f = fixture('membership', overrides);
    assert.equal((await f.service.remove('record')).softDeleted, true);
  }
});
test('list archive filters apply equally to counts and records, preserving searches', async () => {
  for (const kind of ['client', 'membership']) for (const [query, expected] of [[{}, null], [{ includeArchived: true }, undefined], [{ archivedOnly: true }, { not: null }]]) {
    const prisma = { $transaction: async queries => Promise.all(queries), [kind]: {
      count: async ({ where }) => { assert.deepEqual(where.deletedAt, expected); return 0; },
      findMany: async ({ where }) => { assert.deepEqual(where.deletedAt, expected); return []; },
    } };
    await (kind === 'client' ? new ClientsService(prisma) : new MembershipsService(prisma)).findAll(query);
  }
});
test('archive query accepts explicit booleans and rejects malformed values', () => {
  for (const [input, expected] of [['true', true], ['false', false]]) {
    const dto = plainToInstance(ArchiveQueryDto, { includeArchived: input });
    assert.equal(dto.includeArchived, expected); assert.equal(validateSync(dto).length, 0);
  }
  assert.ok(validateSync(plainToInstance(ArchiveQueryDto, { includeArchived: 'yes' })).length);
});
test('archived memberships are inactive and cannot be debited through the legacy ledger', async () => {
  const service = new MembershipsService({ membership: { findUnique: async () => ({
    deletedAt: new Date(), status: 'active', remainedLessons: 8, validUntil: new Date('2099-01-01'),
  }) } });
  assert.equal((await service.findOne('m')).isActive, false);
  const tx = { $queryRaw: async () => [{ now: new Date() }], membershipOp: { findFirst: async () => null },
    membership: { findUnique: async () => ({ deletedAt: new Date(), remainedLessons: 8, type: 'fixed_lessons', status: 'active' }) } };
  await assert.rejects(new MembershipLedgerService({}).debitLesson('m', 'l', 'test', tx), { status: 409 });
});
test('archive endpoints preserve role restrictions and module protection', () => {
  assert.deepEqual(Reflect.getMetadata('auth:roles', ClientsController.prototype.restore), ['ADMIN', 'MANAGER']);
  for (const controller of [ClientsController, MembershipsController]) {
    assert.ok(Reflect.getMetadata('system-module', controller));
  }
});
