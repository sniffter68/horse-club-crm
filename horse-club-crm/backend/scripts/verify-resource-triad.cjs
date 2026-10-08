// Uses a dedicated local PostgreSQL database, never resets application tables.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');
const database = process.env.TRIAD_TEST_DATABASE || 'horse_os_triad_check_20261008';
if (!/^horse_os_triad_check_[a-z0-9_]+$/.test(database)) throw new Error('Dedicated test database name required');
const url = new URL(process.env.TRIAD_DATABASE_URL || process.env.DATABASE_URL);
if (process.env.TRIAD_TEST_PORT) url.port = process.env.TRIAD_TEST_PORT;
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Only local PostgreSQL is permitted');
const target = new URL(url); target.pathname = `/${database}`;
const cli = path.join(__dirname, '../node_modules/prisma/build/index.js');
function prisma(args) {
  const run = spawnSync(process.execPath, [cli, ...args], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_URL: target.toString() }, stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`Prisma ${args.join(' ')} failed (${run.status})`);
}
async function main() {
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    if (process.argv[2] === 'prepare' || process.argv[2] === 'prepare-legacy') {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
      if (process.argv[2] === 'prepare-legacy') {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'horse-os-migration-baseline-'));
        fs.writeFileSync(path.join(directory, 'schema.prisma'), fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma')));
        fs.mkdirSync(path.join(directory, 'migrations'));
        for (const entry of fs.readdirSync(path.join(__dirname, '../prisma/migrations'))) {
          if (/^\d/.test(entry) && entry >= '20261008200000') continue;
          fs.cpSync(path.join(__dirname, '../prisma/migrations', entry), path.join(directory, 'migrations', entry), { recursive: true });
        }
        prisma(['migrate', 'deploy', '--schema', path.join(directory, 'schema.prisma')]);
        const seeded = spawnSync('psql', ['-h', target.hostname, '-p', target.port || '5432', '-U', decodeURIComponent(target.username), '-d', database,
          '-v', 'ON_ERROR_STOP=1', '-f', path.join(__dirname, '../test/fixtures/resource-triad-legacy.sql')], {
          env: { ...process.env, PGPASSWORD: decodeURIComponent(target.password) }, stdio: 'inherit',
        });
        if (seeded.status !== 0) throw new Error('Legacy migration fixture failed');
      } else prisma(['migrate', 'deploy']);
    } else if (process.argv[2] === 'generate') {
      prisma(['migrate', 'dev', '--name', 'init_resource_triad_and_boarding', '--create-only']);
    } else if (process.argv[2] === 'generate-diff') {
      const directory = path.join(__dirname, '../prisma/migrations/20261008200000_init_resource_triad_and_boarding');
      fs.mkdirSync(directory);
      prisma(['migrate', 'diff', '--from-url', target.toString(), '--to-schema-datamodel', 'prisma/schema.prisma', '--script', '--output', path.join(directory, 'migration.sql')]);
    } else if (process.argv[2] === 'deploy') {
      prisma(['migrate', 'deploy']);
    } else if (process.argv[2] === 'test') {
      const run = spawnSync(process.execPath, ['--test', 'test/resource-triad.postgres.test.cjs', 'test/booking-rules.postgres.test.cjs'], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_URL: target.toString(), RUN_TRIAD_TESTS: '1' }, stdio: 'inherit',
      });
      if (run.status !== 0) throw new Error('Resource triad database tests failed');
    } else throw new Error('Use prepare, prepare-legacy, generate, generate-diff, deploy or test');
  } finally { await admin.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
