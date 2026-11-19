// Isolated migration regression: never connects to the application database.
const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const source = new URL(process.env.PAYROLL_TEST_DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
const database = `horsecrm_identity_test_${Date.now()}`;
const target = new URL(source); target.pathname = `/${database}`;
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
const p = new PrismaClient({ datasources: { db: { url: target.href } } });
const root = path.resolve(__dirname, '../prisma/migrations');
const migration = '20261119120000_trainer_identity_payroll';
function apply(name) {
  const result = spawnSync(process.env.PSQL_PATH || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql'),
    ['-X', '-v', 'ON_ERROR_STOP=1', '-d', target.href, '-f', path.join(root, name, 'migration.sql')], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.error?.message || 'Migration failed').replaceAll(target.href, '[test database]'));
}
(async () => {
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`); created = true;
    for (const name of readdirSync(root).filter(name => /^\d/.test(name) && name < migration).sort()) apply(name);
    const actor = await p.user.create({ data: { email: 'admin@migration.test', passwordHash: 'test', role: 'ADMIN' } });
    const makeUser = (email, fullName, phone) => p.user.create({ data: { email, passwordHash: 'test', role: 'TRAINER', staffProfile: { create: { fullName, phone, roleTitle: 'Trainer' } } }, include: { staffProfile: true } });
    const byName = await p.trainer.create({ data: { name: 'Unique Name' } });
    const named = await makeUser('name@migration.test', ' unique   name ');
    const byPhone = await p.trainer.create({ data: { name: 'Other Name', phone: '+7 (999) 123-45-67' } });
    const phoned = await makeUser('phone@migration.test', 'Different Name', '89991234567');
    await p.trainer.createMany({ data: [{ name: 'Ambiguous' }, { name: 'Ambiguous' }] });
    const ambiguous = await makeUser('ambiguous@migration.test', 'Ambiguous');
    const claimedTrainer = await p.trainer.create({ data: { name: 'Claimed' } });
    const owner = await p.user.create({ data: { email: 'owner@migration.test', passwordHash: 'test', role: 'TRAINER', trainerId: claimedTrainer.id } });
    const claimed = await makeUser('claimed@migration.test', 'Claimed');
    const payoutId = randomUUID(), paidAt = new Date('2026-11-10T10:00Z');
    await p.$executeRaw`INSERT INTO "TrainerPayout" (id,"staffId",type,month,"periodStart","periodEnd",status,"lessonsCount","nominalBase",accrued,"advanceDeducted","totalAmount","lessonBreakdown","createdById","updatedAt")
      VALUES (${payoutId}::uuid,${named.staffProfile.id}::uuid,'ADVANCE','2026-11','2026-11-01','2026-11-15','DRAFT',1,1000,300,0,300,'[]',${actor.id}::uuid,now())`;
    await p.$executeRaw`UPDATE "TrainerPayout" SET status='APPROVED' WHERE id=${payoutId}::uuid`;
    const expense = await p.expense.create({ data: { category: 'SALARY', amount: 300, date: paidAt, paymentMethod: 'CASH', description: 'Historical payout', createdById: actor.id } });
    await p.$executeRaw`UPDATE "TrainerPayout" SET status='PAID',"paidAt"=${paidAt},"expenseId"=${expense.id}::uuid WHERE id=${payoutId}::uuid`;
    const legacyExpense = await p.expense.create({ data: { category: 'SALARY', amount: 100, date: paidAt, paymentMethod: 'CASH', description: 'Legacy payout', createdById: actor.id } });
    await p.payrollCalculation.create({ data: { staffId: named.staffProfile.id, periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-15'), shiftsCount: 1, shiftsTotal: 100, lessonsCount: 0, lessonsTotal: 0, totalAmount: 100, isPaid: true, paidAt, expenseId: legacyExpense.id, createdById: actor.id } });
    const [before] = await p.$queryRaw`SELECT to_jsonb(p) AS row FROM "TrainerPayout" p WHERE id=${payoutId}::uuid`;
    const counts = [await p.trainer.count(), await p.user.count(), await p.expense.count()];
    apply(migration);
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: named.id } })).trainerId, byName.id);
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: named.id } })).tokenVersion, 2);
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: phoned.id } })).trainerId, byPhone.id);
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: ambiguous.id } })).trainerId, null);
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: claimed.id } })).trainerId, null);
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: owner.id } })).trainerId, claimedTrainer.id);
    const [after] = await p.$queryRaw`SELECT to_jsonb(p) - 'trainerId' AS row FROM "TrainerPayout" p WHERE id=${payoutId}::uuid`;
    assert.deepEqual(after.row, before.row);
    assert.equal((await p.trainerPayout.findUniqueOrThrow({ where: { id: payoutId } })).trainerId, byName.id);
    assert.deepEqual([await p.trainer.count(), await p.user.count(), await p.expense.count()], counts);
    await assert.rejects(p.trainerPayout.update({ where: { id: payoutId }, data: { totalAmount: 400 } }), /неизменяема/);
    await assert.rejects(p.user.update({ where: { id: named.id }, data: { trainerId: null } }), /оплаченные ведомости/);
    console.log('PASS: migration binds unique name/phone only, preserves paid statement and expense, retains ambiguous/claimed records and restores paid guard');
  } finally {
    await p.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
