const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { buildRecoverySql } = require('../../scripts/migrate-vk-sql.cjs');

test('VK SQL recovery preserves Prisma checksum and records schema plus history atomically', () => {
  const sql = buildRecoverySql();
  const migration = readFileSync(path.resolve(__dirname, '../prisma/migrations/20261101120000_vk_integration_settings/migration.sql'), 'utf8');
  assert.ok(sql.includes(migration));
  assert.ok(sql.includes(createHash('sha256').update(migration).digest('hex')));
  assert.ok(sql.indexOf('BEGIN;') < sql.indexOf('CREATE TABLE "VkIntegrationSettings"'));
  assert.ok(sql.indexOf('INSERT INTO "_prisma_migrations"') < sql.indexOf('COMMIT;'));
  assert.match(sql, /ON_ERROR_STOP on/);
  assert.match(sql, /pg_advisory_xact_lock\(72707369\)/);
  assert.match(sql, /Other migrations are pending/);
  assert.match(sql, /Unresolved failed Prisma migration/);
  assert.match(sql, /Migration history differs/);
  assert.match(sql, /\\if :vk_pending/);
  assert.doesNotMatch(sql, /ALTER TYPE "LessonPaymentStatus"/);
});
