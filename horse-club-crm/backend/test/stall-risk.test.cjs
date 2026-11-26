const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { neighborhoodWarnings } = require('../dist/stalls/neighborhood');
const { SettingsService } = require('../dist/settings/settings.service');
const { StallsService } = require('../dist/stalls/stalls.service');
const { UpdateStallRiskDto } = require('../dist/settings/dto/update-stall-risk.dto');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

for (const grid of [false, true]) test(`independent adjacent/opposite risk flags (grid=${grid})`, () => {
  const stall = { id: 'one', number: '1', name: '1', zone: 'MAIN', side: 'LEFT', position: 1,
    ...(grid ? { buildingId: 'building', row: 1, col: 1 } : {}), horse: { sex: 'STALLION', name: 'Буран' } };
  const next = { ...stall, id: 'next', position: 3, ...(grid ? { row: 2 } : {}) };
  const opposite = { ...stall, id: 'opposite', side: 'RIGHT', position: 2, ...(grid ? { col: 4 } : {}), horse: { sex: 'MARE', name: 'Искра' } };
  const all = [stall, next, opposite];
  assert.deepEqual(neighborhoodWarnings(stall, all).map(w => w.neighborId), ['next']);
  assert.deepEqual(neighborhoodWarnings(stall, all, { stallRiskAdjacent: true, stallRiskOpposite: true }).map(w => w.neighborId), ['next', 'opposite']);
  assert.deepEqual(neighborhoodWarnings(stall, all, { stallRiskAdjacent: false, stallRiskOpposite: true }).map(w => w.neighborId), ['opposite']);
  assert.deepEqual(neighborhoodWarnings(stall, all, { stallRiskAdjacent: false, stallRiskOpposite: false }), []);
});

test('settings persist explicit false without overwriting the other flag; DTO rejects strings', async () => {
  let flags = { stallRiskAdjacent: true, stallRiskOpposite: false };
  const service = new SettingsService({ clubSchedule: { upsert: async ({ update }) => flags = { ...flags, ...update } } });
  assert.deepEqual(await service.getStallRisk(), flags);
  assert.deepEqual(await service.updateStallRisk({ stallRiskOpposite: true }), { stallRiskAdjacent: true, stallRiskOpposite: true });
  assert.deepEqual(await service.updateStallRisk({ stallRiskAdjacent: false }), { stallRiskAdjacent: false, stallRiskOpposite: true });
  assert.equal((await validate(plainToInstance(UpdateStallRiskDto, { stallRiskOpposite: 'false' }))).length, 1);
});

test('map and assignment response read the persisted club flags', async () => {
  const stall = { id: 'one', number: '1', name: '1', zone: 'MAIN', side: 'LEFT', position: 1,
    horse: { id: 'horse', name: 'Буран', sex: 'STALLION' }, contracts: [] };
  const opposite = { ...stall, id: 'two', side: 'RIGHT', position: 2, horse: { name: 'Искра', sex: 'MARE' } };
  let flags = { stallRiskAdjacent: true, stallRiskOpposite: false };
  const service = new StallsService({ clubSchedule: { findUnique: async () => flags },
    stall: { findMany: async () => [stall, opposite], findUnique: async () => stall } });
  assert.equal((await service.map())[0].warnings.length, 0);
  assert.equal((await service.findOne('one')).warnings.length, 0);
  flags = { ...flags, stallRiskOpposite: true };
  assert.equal((await service.map())[0].warnings.length, 1);
  assert.equal((await service.findOne('one')).warnings.length, 1);
});
