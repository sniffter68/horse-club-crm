const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CreateServiceDto } = require('../dist/services/dto/create-service.dto');
const { UpdateServiceDto } = require('../dist/services/dto/update-service.dto');
const { ServicesService } = require('../dist/services/services.service');
const { resolveServiceDirection } = require('../dist/services/service-direction');
const { BookingsService } = require('../dist/bookings/bookings.service');

test('services validate directions/capacity and retain them across create and partial updates', async () => {
  let stored;
  const services = new ServicesService({ service: {
    create: async ({ data }) => (stored = { id: 'service', ...data }),
    update: async ({ data }) => (stored = { ...stored, ...data }),
  } });
  const dto = plainToInstance(CreateServiceDto, { name: 'Фотосессия', durationMinutes: 60, price: 1500, serviceDirection: 'allowWalk', maxCapacity: '4' });
  assert.deepEqual(await validate(dto), []);
  await services.create(dto);
  assert.equal(stored.serviceDirection, 'allowWalk');
  assert.equal(stored.maxCapacity, 4);
  await services.update('service', { price: 1700 });
  assert.equal(stored.serviceDirection, 'allowWalk');
  assert.equal(stored.maxCapacity, 4);
  await services.update('service', { serviceDirection: 'allowIndividual', maxCapacity: 1 });
  assert.equal(stored.serviceDirection, 'allowIndividual');
  assert.equal(stored.maxCapacity, 1);
  for (const maxCapacity of [0, -1, 1.5, 1001]) assert.ok((await validate(plainToInstance(UpdateServiceDto, { maxCapacity }))).length);
  assert.ok((await validate(plainToInstance(UpdateServiceDto, { serviceDirection: 'unknown' }))).length);
  assert.deepEqual(await validate(plainToInstance(UpdateServiceDto, { serviceDirection: '' })), []);
  assert.deepEqual(await validate(plainToInstance(UpdateServiceDto, { serviceDirection: null })), []);
});

test('direction prioritizes explicit value and preserves all legacy rules', () => {
  const legacy = [
    ['Фотосессия', 4, 'allowSpecial'], ['Прогулка', 4, 'allowWalk'], ['Выездка', 1, 'allowIndividual'],
    ['Тренировка', 4, 'allowGroup'], ['Групповое занятие', 1, 'allowGroup'], ['Прочее', 1, 'allowSpecial'],
  ];
  for (const [title, maxCapacity, expected] of legacy) {
    assert.equal(resolveServiceDirection({ title, maxCapacity, serviceDirection: null }), expected);
    assert.equal(resolveServiceDirection({ title, maxCapacity, serviceDirection: 'allowIndividual' }), 'allowIndividual');
  }
});

test('availability resolves stored service before query hints and falls back for legacy services', async () => {
  let direction = 'allowWalk';
  const tx = {
    service: { findUnique: async () => ({ title: 'Фотосессия', maxCapacity: 4, serviceDirection: direction }) },
    horse: { findMany: async () => [{ id: 'horse', status: 'active', maxDailyWorkloadMinutes: 120, allowWalk: false, allowSpecial: true }] },
    arena: { findMany: async () => [] }, booking: { findMany: async () => [] }, lesson: { findMany: async () => [] },
  };
  const services = new BookingsService({ $transaction: fn => fn(tx) });
  const query = { from: '2026-11-25T09:00:00Z', to: '2026-11-25T10:00:00Z', serviceId: 'service', serviceDirection: 'allowSpecial' };
  assert.equal((await services.availability(query)).horseWorkloads[0].serviceAllowed, false);
  direction = null;
  assert.equal((await services.availability(query)).horseWorkloads[0].serviceAllowed, true);
  tx.service.findUnique = async () => null;
  await assert.rejects(services.availability(query), /Услуга не найдена/);
});
