require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { VetRecordService } = require('../dist/boarding/vet-record.service');

test('PostgreSQL vet CRUD, superseded reminders, atomic batch, passport and health status', { skip: process.env.RUN_TRIAD_TESTS !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/horse_os_triad_check_'));
  const p = new PrismaClient(); const service = new VetRecordService(p);
  const authorId = randomUUID(), horseId = randomUUID(), privateId = randomUUID();
  try {
    await p.user.create({ data: { id: authorId, email: `${authorId}@vet.test`, passwordHash: 'test', role: 'ADMIN' } });
    await p.horse.createMany({ data: [{ id: horseId, name: 'Вет тест' }, { id: privateId, name: 'Частная лошадь', ownerType: 'private' }] });
    const details = { horseId, type: 'FARRIER', title: 'Расчистка', specialist: 'Коваль', performedAt: '2026-01-01', cost: 1500.25 };
    const old = await service.create(details, authorId);
    assert.equal(old.cost.toFixed(2), '1500.25');
    await service.create({ ...details, performedAt: '2026-02-01', nextDueDate: '2026-03-18' }, authorId);
    const summary = await service.summary(new Date('2026-03-01T09:00Z'));
    assert.equal(summary.overdue.filter(r => r.horseId === horseId).length, 0);
    assert.equal(summary.next30Days.filter(r => r.horseId === horseId).length, 1);
    const before = await p.vetRecord.count();
    await assert.rejects(service.batch({ ...details, type: 'VACCINATION', horseIds: [horseId, randomUUID()] }, authorId));
    assert.equal(await p.vetRecord.count(), before);
    await service.batch({ ...details, type: 'VACCINATION', title: 'Грипп', horseIds: [horseId, privateId] }, authorId);
    assert.equal((await service.list({ horseId: privateId, type: 'VACCINATION', offset: 0, limit: 20 })).total, 1);
    await service.health(horseId, { healthStatus: 'QUARANTINE' });
    const passport = await service.passport(horseId);
    assert.equal(passport.horse.vetRecords.length, 3); assert.equal(passport.horse.isUnavailable, true); assert.equal(passport.horse.status, 'quarantine');
    await service.update(old.id, { notes: 'Акт', nextDueDate: null });
    assert.equal((await p.vetRecord.findUnique({ where: { id: old.id } })).nextDueDate, null);
    await service.remove(old.id); assert.equal(await p.vetRecord.findUnique({ where: { id: old.id } }), null);
  } finally {
    await p.vetRecord.deleteMany({ where: { horseId: { in: [horseId, privateId] } } });
    await p.horse.deleteMany({ where: { id: { in: [horseId, privateId] } } });
    await p.user.deleteMany({ where: { id: authorId } }); await p.$disconnect();
  }
});
