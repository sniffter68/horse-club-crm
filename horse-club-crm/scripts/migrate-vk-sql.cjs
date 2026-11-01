// Engine-free recovery, deliberately restricted to the additive VK migration.
const { readFileSync, readdirSync } = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const migrationName = '20261101120000_vk_integration_settings';
const migrationsDir = path.resolve(__dirname, '../backend/prisma/migrations');
const quote = value => `'${value.replaceAll("'", "''")}'`;

function buildRecoverySql(dir = migrationsDir) {
  const migrations = readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
    const sql = readFileSync(path.join(dir, entry.name, 'migration.sql'), 'utf8');
    return { name: entry.name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
  const target = migrations.find(entry => entry.name === migrationName);
  if (!target) throw new Error('VK settings migration is missing');
  const values = migrations.map(entry => `(${quote(entry.name)}, ${quote(entry.checksum)})`).join(',\n');
  return `\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '30s';
SELECT pg_advisory_xact_lock(72707369);
LOCK TABLE "_prisma_migrations" IN EXCLUSIVE MODE;
CREATE TEMP TABLE deploy_expected_migrations (name text, checksum text) ON COMMIT DROP;
INSERT INTO deploy_expected_migrations VALUES ${values};
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Unresolved failed Prisma migration; inspect before recovery';
  END IF;
  IF EXISTS (SELECT 1 FROM deploy_expected_migrations e WHERE e.name <> ${quote(migrationName)} AND NOT EXISTS
    (SELECT 1 FROM "_prisma_migrations" m WHERE m.migration_name = e.name AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL)) THEN
    RAISE EXCEPTION 'Other migrations are pending; use pinned Prisma migrate deploy before VK recovery';
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" m LEFT JOIN deploy_expected_migrations e ON e.name = m.migration_name
    WHERE m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL AND (e.name IS NULL OR e.checksum <> m.checksum)) THEN
    RAISE EXCEPTION 'Migration history differs from checkout; refusing SQL recovery';
  END IF;
END $guard$;
SELECT NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${quote(migrationName)}
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS vk_pending \\gset
\\if :vk_pending
${target.sql}
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES (${quote(randomUUID())}, ${quote(target.checksum)}, ${quote(migrationName)}, clock_timestamp(), clock_timestamp(), 1);
\\endif
SELECT "id", "encryptedConfig", "updatedById", "updatedAt" FROM "VkIntegrationSettings" LIMIT 0;
COMMIT;
`;
}
module.exports = { buildRecoverySql };
if (require.main === module) {
  try {
    const compose = process.argv.slice(2);
    if (compose[0] !== 'compose') throw new Error('Pass docker compose arguments, e.g. node scripts/migrate-vk-sql.cjs compose');
    // Use the container's actual DB/user, never assume postgres/postgres.
    const result = spawnSync('docker', [...compose, 'exec', '-T', 'postgres', 'sh', '-c',
      'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    { input: buildRecoverySql(), encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`VK SQL recovery failed (exit ${result.status})`);
    console.log('VK migration and Prisma history verified.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
