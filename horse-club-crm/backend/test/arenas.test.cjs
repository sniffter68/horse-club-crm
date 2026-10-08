const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { ArenasService } = require('../dist/arenas/arenas.service');

test('arena edits synchronize capacity and availability for both booking APIs', async () => {
  let data;
  const service = new ArenasService({ arena: { update: async args => { data = args.data; return data; } } });
  await service.update('arena', { maxRidersCapacity: 3, isActive: false });
  assert.deepEqual(data, { maxRidersCapacity: 3, capacity: 3, isActive: false, isUnavailable: true });
  await assert.rejects(service.update('arena', { capacity: 2, maxRidersCapacity: 3 }), error => error.getStatus() === 400);
});

test('arena list supports Refine pagination, search and sorting', async () => {
  let findManyArgs;
  const prisma = {
    arena: {
      count: async () => 1,
      findMany: async (args) => { findManyArgs = args; return [{ id: 'arena-1', name: 'Крытый манеж' }]; },
    },
    $transaction: async operations => Promise.all(operations),
  };
  const result = await new ArenasService(prisma).findAll({ _start: 10, _end: 20, _sort: 'capacity', _order: 'DESC', q: 'крытый' });
  assert.equal(result.total, 1);
  assert.deepEqual(findManyArgs.where, { OR: [
    { name: { contains: 'крытый', mode: 'insensitive' } },
    { description: { contains: 'крытый', mode: 'insensitive' } },
  ] });
  assert.deepEqual(findManyArgs.orderBy, [{ capacity: 'desc' }, { id: 'asc' }]);
  assert.equal(findManyArgs.skip, 10);
  assert.equal(findManyArgs.take, 10);
});

test('arena creation normalizes its name and description', async () => {
  let data;
  const prisma = { arena: { create: async args => { data = args.data; return { id: 'arena-1', ...args.data }; } } };
  await new ArenasService(prisma).create({ name: '  Крытый   манеж ', description: '  Основная площадка  ', capacity: 6 });
  assert.deepEqual(data, { name: 'Крытый манеж', description: 'Основная площадка', capacity: 6, maxRidersCapacity: 6 });
});
