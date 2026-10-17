// All migrations and financial writes use a disposable local schema.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const root = path.join(__dirname, '..');
const settings = require('node:util').parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8').replace(/^\uFEFF/, ''));
const source = new URL(process.env.DATABASE_URL || settings.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
if (process.env.EXPENSE_TEST_PORT) source.port = process.env.EXPENSE_TEST_PORT;
const schema = `expense_check_${Date.now()}`;
assert.match(schema, /^expense_check_\d+$/);
const target = new URL(source); target.searchParams.set('schema', schema);
const env = { ...process.env, ...settings, DATABASE_URL: target.href, RUN_EXPENSE_TESTS: '1', JWT_SECRET: 'expense-verification-only-secret-at-least-32-chars', NODE_ENV: 'test', PORT: '3000' };
for (const key of Object.keys(env)) if (key.startsWith('VK_')) delete env[key];
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
function run(args, cwd = root, extra = {}) {
  const result = spawnSync(process.execPath, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8' });
  const safe = text => (text ?? '').replaceAll(target.href, '[test database]').replaceAll(source.href, '[local database]');
  process.stdout.write(safe(result.stdout)); process.stderr.write(safe(result.stderr));
  if (result.status !== 0) throw new Error(`Verification exited ${result.status}`);
}
(async () => {
  let created = false, server;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    run(['--test', 'test/expenses.postgres.test.cjs']);
    if (process.env.EXPENSE_TEST_BROWSER === '1') {
      const p = new PrismaClient({ datasources: { db: { url: target.href } } });
      try { await p.user.create({ data: { email: 'expenses-admin@test.local', passwordHash: await bcrypt.hash('expense-test-password', 10), role: 'ADMIN' } }); }
      finally { await p.$disconnect(); }
      server = spawn(process.execPath, ['dist/main.js'], { cwd: root, env, stdio: 'ignore', windowsHide: true });
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (server.exitCode !== null) throw new Error('Test backend exited before readiness');
        try { const response = await fetch('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'expenses-admin@test.local', password: 'expense-test-password' }) }); if (response.ok) { ready = true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!ready) throw new Error('Test backend did not become ready');
      run(['node_modules/@playwright/test/cli.js', 'test', '--project=live', 'expenses.live.spec.ts'], path.join(root, '../frontend'));
    }
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
