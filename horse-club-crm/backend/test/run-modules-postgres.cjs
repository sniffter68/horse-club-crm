// Runs all migrations and the real browser/API scenario in a disposable schema.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const root = path.resolve(__dirname, '..');
const source = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
const schema = `modules_check_${Date.now()}`;
const target = new URL(source); target.searchParams.set('schema', schema);
const env = { ...process.env, DATABASE_URL: target.href, NODE_ENV: 'test', PORT: '3019',
  JWT_SECRET: 'module-verification-only-secret-at-least-32-chars', RUN_MODULE_TESTS: '1', CRM_TEST_BASE_URL: 'http://127.0.0.1:3019' };
for (const key of Object.keys(env)) if (key.startsWith('VK_')) delete env[key];
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', windowsHide: true });
  const safe = value => (value ?? '').replaceAll(target.href, '[test database]').replaceAll(source.href, '[local database]');
  process.stdout.write(safe(result.stdout)); process.stderr.write(safe(result.stderr));
  if (result.status !== 0) throw new Error(`Verification exited ${result.status}`);
}
(async () => {
  let created = false, server;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    const p = new PrismaClient({ datasources: { db: { url: target.href } } });
    try {
      assert.equal(await p.clubModuleSettings.count({ where: { isEnabled: true } }), 5);
      assert.equal(await p.roleModulePermission.count(), 20);
      await assert.rejects(p.roleModulePermission.updateMany({ where: { role: 'ADMIN' }, data: { accessLevel: 'HIDDEN' } }));
      assert.equal(await p.roleModulePermission.count({ where: { role: 'ADMIN', accessLevel: 'FULL' } }), 5);
      await p.user.create({ data: { email: 'modules-admin@test.local', passwordHash: await bcrypt.hash('modules-test-password', 10), role: 'ADMIN' } });
      for (const role of ['TRAINER', 'STABLE_WORKER']) {
        const user = await p.user.create({ data: { email: `modules-${role.toLowerCase()}@test.local`, passwordHash: await bcrypt.hash('modules-test-password', 10), role } });
        await p.staffProfile.create({ data: { userId: user.id, fullName: role, roleTitle: role, shiftRate: 1500 } });
      }
    } finally { await p.$disconnect(); }
    server = spawn(process.execPath, ['test/modules-browser-server.cjs'], { cwd: root, env, stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error('Test backend exited before readiness');
      try { if ((await fetch(`${env.CRM_TEST_BASE_URL}/api/health`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Test backend did not become ready');
    run(['node_modules/@playwright/test/cli.js', 'test', '--project=live', 'modules.live.spec.ts', '--output=test-results/modules-live'], path.resolve(root, '../frontend'));
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
