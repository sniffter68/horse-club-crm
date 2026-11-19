// Migrate only a disposable local schema. The application schema is never changed.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const settings = require('node:util').parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8').replace(/^\uFEFF/, ''));
const source = new URL(process.env.COMMISSION_TEST_DATABASE_URL || settings.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
if (process.env.COMMISSION_TEST_PORT) source.port = process.env.COMMISSION_TEST_PORT;
const schema = `commission_check_${Date.now()}`;
assert.match(schema, /^commission_check_\d+$/);
const target = new URL(source); target.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, encoding: 'utf8', env: { ...process.env, DATABASE_URL: target.href, RUN_COMMISSION_TESTS: '1' } });
  for (const output of [result.stdout, result.stderr]) process.stdout.write((output || '').replaceAll(source.href, '[local database]').replaceAll(target.href, '[test schema]'));
  if (result.status !== 0) throw new Error(`Verification exited ${result.status}`);
}
(async () => {
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    run(['--test', 'test/trainer-commission.postgres.test.cjs']);
  } finally {
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error.message.replaceAll(source.href, '[local database]')); process.exitCode = 1; });
