const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { HorseHealthLogsService } = require('../dist/horse-health-logs/horse-health-logs.service');
const { HorseHealthLogsModule } = require('../dist/horse-health-logs/horse-health-logs.module');
const { AuthModule } = require('../dist/auth/auth.module');

test('health logs module imports authentication providers for its guards', () => {
  const imports = Reflect.getMetadata('imports', HorseHealthLogsModule) ?? [];
  assert.ok(imports.includes(AuthModule));
});

test('health log list searches horse names and notes', async () => {
  let findManyArgs;
  const prisma = {
    horseHealthLog: {
      count: async () => 1,
      findMany: async args => { findManyArgs = args; return []; },
    },
    $transaction: async operations => Promise.all(operations),
  };
  await new HorseHealthLogsService(prisma).findAll({
    _start: 0,
    _end: 10,
    _sort: 'nextDueAt',
    _order: 'ASC',
    q: 'Буран',
  });
  assert.deepEqual(findManyArgs.where, {
    OR: [
      { notes: { contains: 'Буран', mode: 'insensitive' } },
      { horse: { name: { contains: 'Буран', mode: 'insensitive' } } },
    ],
  });
  assert.deepEqual(findManyArgs.orderBy, [{ nextDueAt: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(findManyArgs.include, { horse: { select: { id: true, name: true } } });
});

test('health log creation trims notes and clears empty next date', async () => {
  let createArgs;
  const prisma = {
    horseHealthLog: {
      create: async args => { createArgs = args; return { id: 'log-1', ...args.data }; },
    },
  };
  await new HorseHealthLogsService(prisma).create({
    horseId: '9dc6e50b-2779-4f9f-a4dd-a01199a4c239',
    type: 'INSPECTION',
    occurredAt: '2026-09-15T09:00:00.000Z',
    nextDueAt: null,
    notes: '  Плановый осмотр  ',
  });
  assert.deepEqual(createArgs.data, {
    horseId: '9dc6e50b-2779-4f9f-a4dd-a01199a4c239',
    type: 'INSPECTION',
    occurredAt: '2026-09-15T09:00:00.000Z',
    nextDueAt: null,
    notes: 'Плановый осмотр',
  });
});
