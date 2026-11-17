// Create a disposable DATABASE on an explicitly supplied local PostgreSQL server.
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const source = new URL(process.env.PAYROLL_TEST_DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
const database = `horsecrm_payroll_test_${Date.now()}`;
const target = new URL(source); target.pathname = `/${database}`; target.searchParams.set('schema', 'public');
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: require('node:path').resolve(__dirname, '..'), windowsHide: true, encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: target.href, RUN_TRAINER_STATEMENT_TESTS: '1' } });
  for (const output of [result.stdout, result.stderr]) process.stdout.write((output || '').replaceAll(source.href, '[local database]').replaceAll(target.href, '[test database]'));
  if (result.status !== 0) throw new Error(`Check exited ${result.status}`);
}
(async () => {
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`); created = true;
    run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    run(['--test', 'test/trainer-statements.postgres.test.cjs']);
  } finally {
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
