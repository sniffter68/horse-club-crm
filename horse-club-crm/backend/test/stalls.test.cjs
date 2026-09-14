const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { AuthModule } = require('../dist/auth/auth.module');
const { StallsModule } = require('../dist/stalls/stalls.module');
const { StallsService } = require('../dist/stalls/stalls.service');

test('stalls module imports authentication providers for its guards', () => {
  const imports = Reflect.getMetadata('imports', StallsModule) ?? [];
  assert.ok(imports.includes(AuthModule));
});

test('stall list supports Refine pagination, search and sorting', async () => {
  let findManyArgs;
  const prisma = {
    stall: {
      count: async () => 1,
      findMany: async args => { findManyArgs = args; return [{ id: 'stall-1', name: 'Денник 1' }]; },
    },
    $transaction: async operations => Promise.all(operations),
  };
  const result = await new StallsService(prisma).findAll({
    _start: 10,
    _end: 20,
    _sort: 'isUnavailable',
    _order: 'DESC',
    q: 'денник',
  });
  assert.equal(result.total, 1);
  assert.deepEqual(findManyArgs.where, {
    OR: [
      { name: { contains: 'денник', mode: 'insensitive' } },
      { description: { contains: 'денник', mode: 'insensitive' } },
    ],
  });
  assert.deepEqual(findManyArgs.orderBy, [{ isUnavailable: 'desc' }, { id: 'asc' }]);
  assert.equal(findManyArgs.skip, 10);
  assert.equal(findManyArgs.take, 10);
});

test('stall creation normalizes its name and description', async () => {
  let data;
  const prisma = { stall: { create: async args => { data = args.data; return { id: 'stall-1', ...args.data }; } } };
  await new StallsService(prisma).create({
    name: '  Денник   1 ',
    description: '  Первый корпус  ',
    isUnavailable: false,
  });
  assert.deepEqual(data, { name: 'Денник 1', description: 'Первый корпус', isUnavailable: false });
});
