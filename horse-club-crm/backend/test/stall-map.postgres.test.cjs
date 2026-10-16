require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { StallsService } = require('../dist/stalls/stalls.service');
test('PostgreSQL stall seed, relocation races, database invariants and rollback', { skip: process.env.RUN_STALL_TESTS !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) &&
    (url.pathname.startsWith('/horse_os_triad_check_') || /^cash_desk_check_stalls_\d+$/.test(url.searchParams.get('schema') ?? '')));
  const p = new PrismaClient(), service = new StallsService(p);
  const horseIds = [], stallIds = [];
  try {
    const seeded = await p.stall.findMany();
    assert.ok(seeded.length >= 16);
    assert.equal(seeded.filter(s => s.zone === 'MAIN').length >= 12, true);
    assert.equal(seeded.filter(s => s.zone === 'SUMMER').length >= 4, true);
    for (let n = 0; n < 3; n++) {
      const stall = await p.stall.create({ data: { name: `Stall QA ${randomUUID()}`, number: `QA-${randomUUID().slice(0, 8)}`, position: 1000 + n } });
      stallIds.push(stall.id);
      const horse = await p.horse.create({ data: { name: 'Stall QA', sex: n === 0 ? 'STALLION' : 'MARE' } }); horseIds.push(horse.id);
    }
    await service.assign(stallIds[0], horseIds[0]);
    await service.assign(stallIds[1], horseIds[1]);
    assert.equal((await service.findOne(stallIds[0])).warnings.length, 1);
    await service.assign(stallIds[2], horseIds[0]);
    assert.equal((await p.stall.findUniqueOrThrow({ where: { id: stallIds[0] } })).status, 'AVAILABLE');
    await service.assign(stallIds[2], null);
    const competingHorses = await Promise.allSettled([horseIds[0], horseIds[2]].map(id => service.assign(stallIds[0], id)));
    assert.equal(competingHorses.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(competingHorses.find(r => r.status === 'rejected').reason.getStatus(), 409);
    await service.assign(stallIds[0], null);
    const sameHorse = await Promise.allSettled([stallIds[0], stallIds[2]].map(id => service.assign(id, horseIds[0])));
    assert.ok(sameHorse.some(r => r.status === 'fulfilled'));
    assert.equal(await p.stall.count({ where: { horseId: horseIds[0] } }), 1);
    await assert.rejects(p.stall.update({ where: { id: stallIds[1] }, data: { status: 'AVAILABLE' } }));
    await assert.rejects(p.stall.create({ data: { name: `Duplicate QA ${randomUUID()}`, zone: 'MAIN', side: 'LEFT', position: 1000 } }), e => e.code === 'P2002');
    await assert.rejects(service.update(stallIds[1], { status: 'MAINTENANCE' }), e => e.getStatus() === 409);
    const before = await p.stall.findFirstOrThrow({ where: { horseId: horseIds[0] } });
    // Fail after releasing the old stall; PostgreSQL must restore it on rollback.
    const faulty = new StallsService({
      $transaction: (operation, options) => p.$transaction(tx => operation({ ...tx, stall: {
        findUnique: args => tx.stall.findUnique(args), updateMany: args => tx.stall.updateMany(args),
        update: async () => { throw new Error('injected final write failure'); },
      }, horse: tx.horse }), options),
    });
    const target = stallIds.find(id => id !== before.id && id !== stallIds[1]);
    await assert.rejects(faulty.assign(target, horseIds[0]), /injected final write failure/);
    assert.equal((await p.stall.findUniqueOrThrow({ where: { id: before.id } })).horseId, horseIds[0]);
  } finally {
    await p.stall.deleteMany({ where: { id: { in: stallIds } } });
    await p.horse.deleteMany({ where: { id: { in: horseIds } } });
    await p.$disconnect();
  }
});
