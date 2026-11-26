// Disposable schema only. Never mutates application tables.
const { PrismaClient } = require('@prisma/client');
const { readFileSync, readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { parseEnv } = require('node:util');
const settings = parseEnv(readFileSync(path.resolve(__dirname, '../.env'), 'utf8').replace(/^\uFEFF/, ''));
const source = new URL(process.env.PAYROLL_TEST_DATABASE_URL || settings.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
if (process.env.STAFF_TEST_PORT) source.port = process.env.STAFF_TEST_PORT;
const schema = `unified_staff_check_${Date.now()}`;
assert.match(schema, /^unified_staff_check_\d+$/);
const target = new URL(source); target.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
const p = new PrismaClient({ datasources: { db: { url: target.href } } });
const root = path.resolve(__dirname, '../prisma/migrations');
const migration = '20261126150000_unified_staff_trainer';
const env = { ...process.env, PGHOST: source.hostname, PGPORT: source.port || '5432', PGUSER: decodeURIComponent(source.username), PGPASSWORD: decodeURIComponent(source.password), PGDATABASE: source.pathname.slice(1), PGOPTIONS: `-c search_path=${schema}` };
function apply(name) {
 const result = spawnSync(process.env.PSQL_PATH || 'C:/Program Files/PostgreSQL/18/bin/psql.exe', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', path.join(root, name, 'migration.sql')], { env, encoding: 'utf8', windowsHide: true });
 if (result.status !== 0) throw new Error(`Migration ${name}: ${result.stderr || result.error?.message}`);
}
(async () => {
 let created = false;
 try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  for (const name of readdirSync(root).filter(name => name < migration).sort()) if (name !== 'migration_lock.toml') apply(name);
  const orphan = { id: randomUUID() };
  await p.$executeRaw`INSERT INTO "Trainer" (id,name,"fullName","vkId","commissionPercent") VALUES (${orphan.id}::uuid,'Orphan Trainer','Orphan Trainer',123456789,42)`;
  const linked = { id: randomUUID() };
  await p.$executeRaw`INSERT INTO "Trainer" (id,name) VALUES (${linked.id}::uuid,'Existing Trainer')`;
  const user = await p.user.create({ data: { email: 'existing@test.invalid', passwordHash: 'disabled', crmAccess: false, role: 'TRAINER', trainerId: linked.id,
   staffProfile: { create: { fullName: 'Existing Trainer', roleTitle: 'Trainer' } } }, select: { id: true } });
  const unbound = await p.user.create({ data: { email: 'match@test.invalid', passwordHash: 'disabled', crmAccess: false, role: 'TRAINER', staffProfile: { create: { fullName: 'Match Trainer', roleTitle: 'Trainer' } } }, select: { id: true } });
  const match = { id: randomUUID() };
  await p.$executeRaw`INSERT INTO "Trainer" (id,name) VALUES (${match.id}::uuid,'Match Trainer')`;
  apply(migration);
  assert.equal(await p.user.count(), 3); assert.equal(await p.staffProfile.count(), 3);
  const orphanUser = await p.user.findUnique({ where: { trainerId: orphan.id }, include: { staffProfile: true } });
  assert.equal(orphanUser.crmAccess, false); assert.equal(orphanUser.vkId, '123456789'); assert.equal(orphanUser.staffProfile.fullName, 'Orphan Trainer');
  assert.equal((await p.user.findUnique({ where: { id: user.id } })).trainerId, linked.id);
  assert.equal((await p.user.findUnique({ where: { id: unbound.id } })).trainerId, match.id);
  assert.equal((await p.trainer.findUnique({ where: { id: orphan.id } })).commissionPercent.toNumber(), 42);
  await p.$executeRawUnsafe('CALL sync_staff_trainers()');
  assert.equal(await p.user.count(), 3); assert.equal(await p.staffProfile.count(), 3);
  await assert.rejects(p.trainer.update({ where: { id: orphan.id }, data: { fixedPay: -1 } }));
  const { StaffService } = require('../dist/staff/staff.service');
  const actor = { id: user.id, email: 'existing@test.invalid', role: 'ADMIN' };
  const service = new StaffService(p);
  const row = await service.saveProfile({ fullName: 'New Trainer', role: 'TRAINER', hasCrmAccess: true, email: 'new@test.invalid', temporaryPassword: 'password-123', payScheme: 'FIXED', fixedPay: 800, isPublic: true, vkId: '123456780', allowGroup: false, description: 'Dressage', imageUrl: 'https://example.com/anna.jpg' }, actor);
  const account = await p.user.findUnique({ where: { id: row.userId }, include: { trainer: true } });
  assert.equal(account.crmAccess, true); assert.equal(account.trainer.fixedPay.toNumber(), 800);
  assert.equal(account.trainer.vkId, 123456780n); assert.equal(account.vkId, '123456780');
  assert.equal(account.trainer.allowGroup, false); assert.equal(account.trainer.description, 'Dressage');
  await service.saveProfile({ fullName: 'Renamed Trainer' }, actor, row.id);
  assert.equal(await p.trainer.count(), 4);
  await p.trainer.create({ data: { name: 'Ambiguous Trainer' } });
  await p.user.create({ data: { email: 'ambiguous1@test.invalid', passwordHash: 'disabled', role: 'TRAINER', crmAccess: false, staffProfile: { create: { fullName: 'Ambiguous Trainer', roleTitle: 'Trainer' } } } });
  await p.user.create({ data: { email: 'ambiguous2@test.invalid', passwordHash: 'disabled', role: 'TRAINER', crmAccess: false, staffProfile: { create: { fullName: 'Ambiguous Trainer', roleTitle: 'Trainer' } } } });
  const count = await p.user.count();
  await assert.rejects(p.$executeRawUnsafe('CALL sync_staff_trainers()'), /Ambiguous/);
  assert.equal(await p.user.count(), count);
  console.log('PASS: isolated migrations, backfill, repeated sync, ambiguity rollback, atomic creation, rates and updates');
 } finally {
  await p.$disconnect();
  if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
 }
})().catch(error => { console.error(error.message.replaceAll(source.href, '[local database]')); process.exitCode = 1; });
