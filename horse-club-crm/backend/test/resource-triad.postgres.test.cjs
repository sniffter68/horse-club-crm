const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const enabled = process.env.RUN_TRIAD_TESTS === '1';
const prisma = enabled ? new PrismaClient() : null;
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
after(async () => { if (prisma) await prisma.$disconnect(); });
async function rolledBack(work) {
  const marker = new Error('resource-triad-test-rollback');
  try { await prisma.$transaction(async tx => { await work(tx); throw marker; }); }
  catch (error) { if (error.message !== marker.message) throw error; }
}
const run = (name, work) => test(name, { skip: !enabled }, work);

run('migration preserves legacy relations, physiological settings and missing resources', async () => {
  const horse = await prisma.horse.findUniqueOrThrow({ where: { id: id(3) } });
  assert.equal(horse.maxDailyWorkloadMinutes, 240);
  assert.equal(horse.requiredRestMinutes, 15);
  assert.equal(horse.ownerId, id(1)); assert.equal(horse.ownerType, 'private');
  assert.equal(horse.stallNumber, '12'); assert.equal(horse.status, 'rest');
  assert.equal(horse.feedingNotes, 'Existing feeding notes');
  const trainer = await prisma.trainer.findUniqueOrThrow({ where: { id: id(2) } });
  assert.equal(trainer.fullName, trainer.name); assert.equal(trainer.phone, null);
  const arena = await prisma.arena.findUniqueOrThrow({ where: { id: id(4) } });
  assert.equal(arena.maxRidersCapacity, 1); assert.equal(arena.isActive, false);
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: id(9) }, include: { lesson: true } });
  assert.equal(booking.trainerId, id(2)); assert.equal(booking.arenaId, id(4)); assert.equal(booking.status, 'completed');
  assert.equal(booking.startTime.getTime(), booking.lesson.startTime.getTime());
  assert.equal(Number(booking.costAmount), 1500); assert.equal(booking.serviceType, null);
  const missing = await prisma.booking.findUniqueOrThrow({ where: { id: id(10) } });
  assert.equal(missing.horseId, null); assert.equal(missing.legacyLessonBinding, true);
});

run('migration preserves membership units, timestamps and original operations, projecting known owners once', async () => {
  const membership = await prisma.membership.findUniqueOrThrow({ where: { id: id(7) } });
  assert.equal(Number(membership.initialUnits), 8); assert.equal(Number(membership.remainingUnits), 7);
  assert.equal(membership.validTo.getTime(), membership.validUntil.getTime());
  const orphan = await prisma.membership.findUniqueOrThrow({ where: { id: id(8) } });
  assert.equal(orphan.clientId, null); assert.equal(orphan.legacyUnassigned, true);
  assert.equal(await prisma.membershipOp.count(), 3);
  const transactions = await prisma.ledgerTransaction.findMany({ orderBy: { amount: 'desc' } });
  assert.equal(transactions.length, 2);
  assert.deepEqual(transactions.map(row => [row.transactionType, Number(row.amount)]), [['purchase', 8], ['usage', -1]]);
  assert.equal(transactions[1].bookingId, id(9)); assert.equal(transactions[1].sourceMembershipOpId, id(12));
});

run('new core resources support required defaults, unique trainer contacts and exact decimal memberships', async () => {
  await rolledBack(async tx => {
    const horse = await tx.horse.create({ data: { name: 'Core test horse' } });
    assert.equal(horse.maxRiderWeight, 85); assert.equal(horse.maxDailyWorkloadMinutes, 120); assert.equal(horse.requiredRestMinutes, 45);
    assert.equal(horse.ownerType, 'club'); assert.deepEqual(horse.suitability, []);
    const arena = await tx.arena.create({ data: { name: `Core-${randomUUID()}`, type: 'round_pen' } });
    assert.equal(arena.maxRidersCapacity, 6); assert.equal(arena.isActive, true);
    const membership = await tx.membership.create({ data: { clientId: id(1), type: 'deposit', title: 'Deposit', initialUnits: '1234.56', remainingUnits: '234.56',
      validFrom: new Date('2026-01-01Z'), validTo: new Date('2030-01-01Z') } });
    assert.equal(membership.initialUnits.toString(), '1234.56'); assert.equal(membership.remainingUnits.toString(), '234.56');
  });
  for (const field of ['phone', 'telegramId']) await rolledBack(async tx => {
    const value = `unique-${randomUUID()}`;
    await tx.trainer.create({ data: { fullName: 'One', [field]: value } });
    await assert.rejects(tx.trainer.create({ data: { fullName: 'Two', [field]: value } }), error => error.code === 'P2002');
  });
});

run('standalone bookings require the complete triad, valid intervals and real foreign keys', async () => {
  const data = { clientId: id(1), trainerId: id(2), horseId: id(3), arenaId: id(4), serviceType: 'dressage',
    startTime: new Date('2028-01-01T09:00Z'), endTime: new Date('2028-01-01T09:30Z') };
  await rolledBack(async tx => {
    const booking = await tx.booking.create({ data });
    assert.equal(booking.lessonId, null); assert.equal(booking.status, 'scheduled'); assert.equal(Number(booking.costAmount), 0);
    const transaction = await tx.ledgerTransaction.create({ data: { clientId: id(1), bookingId: booking.id, transactionType: 'manual_adjustment', amount: '-0.50' } });
    assert.equal(transaction.amount.toString(), '-0.5');
  });
  for (const patch of [{ horseId: null }, { arenaId: null }, { serviceType: null }, { endTime: data.startTime }, { trainerId: randomUUID() }, { costAmount: -1 }]) {
    await rolledBack(async tx => { await assert.rejects(tx.booking.create({ data: { ...data, ...patch } })); });
  }
});

run('membership and physiological constraints reject invalid new records', async () => {
  for (const data of [{ name: 'Invalid', maxRiderWeight: 0 }, { name: 'Invalid', requiredRestMinutes: -1 }, { name: 'Invalid', maxDailyWorkloadMinutes: 0 }]) {
    await rolledBack(async tx => { await assert.rejects(tx.horse.create({ data })); });
  }
  for (const patch of [{ clientId: null }, { remainingUnits: '-0.01' }, { validFrom: new Date('2031-01-01Z') }]) {
    await rolledBack(async tx => { await assert.rejects(tx.membership.create({ data: { clientId: id(1), type: 'fixed_lessons', title: 'Invalid', validTo: new Date('2030-01-01Z'), ...patch } })); });
  }
});

run('scheduled triad indexes have status predicates and ledger foreign keys protect journal history', async () => {
  const indexes = await prisma.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Booking' AND indexname LIKE 'Booking_scheduled_%'`);
  assert.equal(indexes.length, 3);
  for (const index of indexes) assert.match(index.indexdef, /WHERE.*status.*scheduled/);
  await rolledBack(async tx => { await assert.rejects(tx.membershipOp.delete({ where: { id: id(12) } }), error => error.code === 'P2003' || (error.message.includes('23001') && error.message.includes('LedgerTransaction_sourceMembershipOpId_fkey'))); });
  await rolledBack(async tx => { await assert.rejects(tx.ledgerTransaction.create({ data: { clientId: randomUUID(), transactionType: 'refund', amount: 1 } }), error => error.code === 'P2003'); });
});
