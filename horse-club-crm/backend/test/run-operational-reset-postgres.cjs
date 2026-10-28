// Apply migrations only to an isolated local schema; never migrate the app schema.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const settings = require('node:util').parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8').replace(/^\uFEFF/, ''));
const source = new URL(process.env.DATABASE_URL || settings.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
if (process.env.OPERATIONAL_RESET_TEST_PORT) source.port = process.env.OPERATIONAL_RESET_TEST_PORT;
const schema = `operational_reset_check_${Date.now()}`;
assert.match(schema, /^operational_reset_check_\d+$/);
const target = new URL(source); target.searchParams.set('schema', schema);
const env = { ...process.env, DATABASE_URL: target.href, RUN_OPERATIONAL_RESET_TESTS: '1' };
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', windowsHide: true });
  const safe = value => (value || '').replaceAll(target.href, '[test database]').replaceAll(source.href, '[local database]');
  process.stdout.write(safe(result.stdout)); process.stderr.write(safe(result.stderr));
  if (result.status !== 0) throw new Error(`Verification exited ${result.status}`);
}
(async () => {
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    run(['--test', 'test/operational-reset.postgres.test.cjs']);
  } finally {
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
