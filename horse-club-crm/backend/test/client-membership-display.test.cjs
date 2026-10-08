const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { ClientsService } = require('../dist/clients/clients.service');
const { ClientsController } = require('../dist/clients/clients.controller');

test('client list includes nearest active membership and returns an explicit empty balance', async () => {
  const validUntil = new Date(Date.now() + 3 * 86400000);
  const service = new ClientsService({
    $transaction: async (queries) => Promise.all(queries),
    client: {
      count: async () => 2,
      findMany: async (args) => {
        assert.equal(args.include.memberships.where.remainedLessons.gt, 0);
        assert.ok(args.include.memberships.where.validUntil.gte instanceof Date);
        assert.deepEqual(args.include.memberships.orderBy, [{ validUntil: 'asc' }, { id: 'asc' }]);
        assert.equal(args.include.memberships.take, 1);
        return [{ id: 'a', memberships: [{ id: 'm', remainedLessons: 5, totalLessons: 8, validUntil, pricingPlan: { name: '8 занятий' } }] },
          { id: 'b', memberships: [] }];
      },
    },
  });
  const result = await service.findAll({ _start: 0, _end: 10 });
  assert.equal(result.total, 2);
  assert.deepEqual(result.data[0].membership, { id: 'm', remainingUnits: 5, totalUnits: 8, validUntil, planName: '8 занятий', status: 'EXPIRING' });
  assert.equal(result.data[1].membership, null);
  assert.equal(result.data[0].memberships, undefined);
});

test('client ledger scopes all operations to client and paginates without excluding expired memberships', async () => {
  const checkWhere = (where) => assert.deepEqual(where, { membership: { clientId: 'client-a' } });
  const service = new ClientsService({
    client: { findUnique: async () => ({ id: 'client-a' }) },
    $transaction: async (queries) => Promise.all(queries),
    membershipOp: {
      count: async ({ where }) => { checkWhere(where); return 21; },
      findMany: async (args) => {
        checkWhere(args.where);
        assert.equal(args.skip, 10); assert.equal(args.take, 10);
        assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'asc' }]);
        return [{ id: 'operation-a', amount: 1, type: 'DEBIT' }];
      },
    },
  });
  const result = await service.findLedger('client-a', { _start: 10, _end: 20 });
  assert.equal(result.total, 21);
  assert.equal(result.data[0].amount, 1);
});

test('ledger rejects missing clients and restricts history to membership management roles', async () => {
  const service = new ClientsService({ client: { findUnique: async () => null } });
  await assert.rejects(service.findLedger('missing', {}), { status: 404 });
  assert.deepEqual(Reflect.getMetadata('auth:roles', ClientsController.prototype.findLedger), ['ADMIN', 'MANAGER']);
});
