// Disposable local database only. Never migrate the configured application database.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const envFile = require('node:util').parseEnv(require('node:fs').readFileSync(path.join(__dirname, '../.env'), 'utf8').replace(/^\uFEFF/, ''));
for (const [key, value] of Object.entries(envFile)) if (process.env[key] === undefined) process.env[key] = value;
const source = new URL(process.env.DATABASE_URL);
if (process.env.STALL_TEST_PORT) source.port = process.env.STALL_TEST_PORT;
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
const name = `horse_os_triad_check_stalls_${Date.now()}`;
assert.match(name, /^horse_os_triad_check_stalls_\d+$/);
const schema = `cash_desk_check_stalls_${Date.now()}`;
assert.match(schema, /^cash_desk_check_stalls_\d+$/);
const schemaOnly = process.env.STALL_TEST_SCHEMA_ONLY === '1';
const adminUrl = new URL(source); if (!schemaOnly) adminUrl.pathname = '/postgres'; adminUrl.search = '';
const testUrl = new URL(source); if (!schemaOnly) testUrl.pathname = `/${name}`; testUrl.search = `?schema=${schema}`;
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.href } } });
const env = { ...process.env, DATABASE_URL: testUrl.href, RUN_STALL_TESTS: '1', RUN_TRIAD_TESTS: schemaOnly ? '0' : '1', RUN_CASH_DESK_TESTS: '1', RUN_CONCURRENCY_TESTS: '1' };
for (const key of Object.keys(env)) if (key.startsWith('VK_')) delete env[key];
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
  const safe = text => (text ?? '').replaceAll(testUrl.href, '[test database]').replaceAll(source.href, '[application database]');
  process.stdout.write(safe(result.stdout)); process.stderr.write(safe(result.stderr));
  if (result.status !== 0) throw new Error(`Verification exited ${result.status}`);
}
(async () => {
  let created = false;
  try {
    if (schemaOnly) await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    else await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    // Seed the schedule required by the existing concurrency suite without creating a user.
    const p = new PrismaClient({ datasources: { db: { url: testUrl.href } } });
    await p.clubSchedule.create({ data: { id: 1, openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } });
    await p.$disconnect();
    run(['--test', 'test/*.test.cjs']);
  } finally {
    if (created) {
      if (schemaOnly) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      else await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    await admin.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
