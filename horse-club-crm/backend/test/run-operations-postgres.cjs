// Dedicated disposable local database. The application database is never migrated.
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const source = new URL(process.env.DATABASE_URL || require('node:util').parseEnv(
  fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').replace(/^\uFEFF/, '')).DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
const database = `horse_os_triad_check_operations_${Date.now()}`;
assert.match(database, /^horse_os_triad_check_operations_\d+$/);
const adminUrl = new URL(source); adminUrl.pathname = '/postgres'; adminUrl.search = '';
const target = new URL(source); target.pathname = `/${database}`; target.search = '';
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.href } } });
const env = { ...process.env, DATABASE_URL: target.href, RUN_TRIAD_TESTS: '1' };
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8', windowsHide: true });
  for (const output of [result.stdout, result.stderr]) process.stdout.write((output || '').replaceAll(target.href, '[operations database]').replaceAll(source.href, '[local database]'));
  if (result.status !== 0) throw new Error(`Verification exited ${result.status}`);
}
(async () => {
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`); created = true;
    run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    run(['--test', 'test/booking-lifecycle.postgres.test.cjs', 'test/boarding-vet.postgres.test.cjs', 'test/vet-records.postgres.test.cjs']);
  } finally {
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
