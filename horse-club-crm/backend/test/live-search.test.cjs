require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { phoneSearchIds } = require('../dist/common/phone-search');
const { ClientsService } = require('../dist/clients/clients.service');
const { TrainersService } = require('../dist/trainers/trainers.service');
const { HorsesService } = require('../dist/horses/horses.service');

test('phone search binds unmasked digits and skips non-phone queries', async () => {
  const queries = [];
  const prisma = { $queryRaw: async query => { queries.push(query); return [{ id: 'match' }]; } };
  for (const q of ['+7 (900) 123-45-67', '8-900-123-45-67', '9001234567']) {
    assert.deepEqual(await phoneSearchIds(prisma, 'Client', q), ['match']);
    assert.deepEqual(queries.at(-1).values, ['9001234567']);
    assert.match(queries.at(-1).sql, /regexp_replace/);
  }
  for (const q of ['', 'Анна', '---', "1' OR true"]) assert.deepEqual(await phoneSearchIds(prisma, 'Trainer', q), []);
  assert.equal(queries.length, 3);
});

test('catalog search preserves pagination, archive filters and uses identical count/data filters', async () => {
  for (const [Service, model, q] of [[ClientsService, 'client', '8 (900) 123-45-67'], [TrainersService, 'trainer', '900'], [HorsesService, 'horse', 'Анна']]) {
    let countWhere, list;
    const prisma = {
      $queryRaw: async () => [{ id: 'match' }], $transaction: promises => Promise.all(promises),
      [model]: { count: async ({ where }) => { countWhere = where; return 1; }, findMany: async args => { list = args; return []; } },
    };
    await new Service(prisma).findAll({ q, _start: 10, _end: 20, archivedOnly: true });
    assert.deepEqual(countWhere, list.where);
    assert.equal(list.skip, 10); assert.equal(list.take, 10);
    if (model === 'client') assert.deepEqual(list.where.deletedAt, { not: null });
    if (model !== 'horse') assert.ok(list.where.OR.some(filter => filter.id?.in.includes('match')));
    else {
      assert.ok(list.where.OR.some(filter => filter.breed?.contains === q));
      assert.ok(list.where.OR.some(filter => filter.owner?.is.OR.some(person => person.name?.contains === q)));
    }
  }
});
