require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { VetCalendarService } = require('../dist/boarding/vet-calendar.service');
const { CreateVetEventDto, VetQueryDto } = require('../dist/boarding/boarding.dto');
const horseId = '00000000-0000-4000-8000-000000000001';

test('calendar accepts both new procedure types in creation and filters', async () => {
  for (const type of ['CASTRATION', 'TEETH_FLOATING']) {
    assert.equal((await validate(plainToInstance(CreateVetEventDto, { horseId, type, eventDate: '2026-01-01' }))).length, 0);
    assert.equal((await validate(plainToInstance(VetQueryDto, { type }))).length, 0);
  }
});

test('scheduled castration keeps sex; completion and already performed creation change it in the transaction', async () => {
  let sex = 'STALLION'; let event; let followups = 0;
  const tx = { $queryRaw: async () => [], horse: { findUnique: async () => ({ id: horseId }),
    updateMany: async ({ where, data }) => { assert.deepEqual(where, { id: horseId, sex: 'STALLION' }); sex = data.sex; } },
    vetEvent: { create: async ({ data }) => (event = { id: 'record', ...data }),
      findUnique: async () => event, findUniqueOrThrow: async () => event,
      update: async ({ data }) => (event = { ...event, ...data }), upsert: async () => { followups++; } } };
  const service = new VetCalendarService({ $transaction: async work => work(tx) });
  await service.create({ horseId, type: 'CASTRATION', eventDate: '2026-01-01' });
  assert.equal(sex, 'STALLION');
  await service.complete('record', {}); assert.equal(sex, 'GELDING');
  tx.horse.updateMany = async () => assert.fail('Repeated completion must not change sex');
  await service.complete('record', {});
  await service.create({ horseId, type: 'TEETH_FLOATING', status: 'completed', eventDate: '2026-01-01', nextDueDate: '2099-01-01' });
  assert.equal(followups, 1); assert.equal(event.nextDueDate.toISOString(), '2099-01-01T00:00:00.000Z');
  tx.horse.updateMany = async () => { sex = 'GELDING'; };
  sex = 'STALLION';
  await service.create({ horseId, type: 'CASTRATION', status: 'completed', eventDate: '2026-01-01' });
  assert.equal(sex, 'GELDING');
});
