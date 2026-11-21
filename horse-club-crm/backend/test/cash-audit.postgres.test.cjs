require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { cashboxBalances } = require('../dist/payments/cashbox-balances');
const { cashJournal } = require('../dist/payments/cash-journal');

// Temp tables shadow production names only on this transaction's connection;
// no migrations or writes to application tables. Every table drops on commit.
test('PostgreSQL merged ledger: current boundary, boarding refund, kopecks, literal search, stable pages', { skip: process.env.RUN_CASH_AUDIT_SQL_TESTS !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'local database only');
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Client" (id uuid, name text, "firstName" text, "lastName" text) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "User" (id uuid, email text) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Service" (id uuid, title text) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Payment" (id uuid, "clientId" uuid, "cashierId" uuid, "shiftId" uuid, "serviceId" uuid, "boardingContractId" uuid, amount numeric(14,2), method text, status text, "paidAt" timestamptz, "createdAt" timestamptz, "archivedAt" timestamptz, notes text, description text, "serviceType" text) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Expense" (id uuid, "createdById" uuid, "shiftId" uuid, "refundPaymentId" uuid, amount numeric(14,2), "paymentMethod" text, date timestamptz, "archivedAt" timestamptz, "cancelledAt" timestamptz, description text) ON COMMIT DROP');
      await tx.$executeRaw`INSERT INTO "Client" (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Анна')`;
      await tx.$executeRaw`INSERT INTO "User" (id, email) VALUES ('00000000-0000-4000-8000-000000000002', 'audit@test')`;
      await tx.$executeRaw`INSERT INTO "Payment" (id, "clientId", amount, method, status, "createdAt", notes) VALUES
        ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 1000.10, 'CASH', 'PAID', '2026-11-01T09:00Z', '100%_ буквально'),
        ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 5000.20, 'SBP', 'PAID', '2026-11-01T09:00Z', 'Постой'),
        ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 999999.99, 'CASH', 'PAID', '2027-01-01T09:00Z', 'Будущий'),
        ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 888, 'CASH', 'PENDING', '2026-11-01T09:00Z', 'Не оплачен')`;
      await tx.$executeRaw`UPDATE "Payment" SET "boardingContractId" = '00000000-0000-4000-8000-000000000009' WHERE method = 'SBP'`;
      await tx.$executeRaw`INSERT INTO "Expense" (id, "createdById", "refundPaymentId", amount, "paymentMethod", date, description) VALUES
        ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 100.01, 'CARD', '2026-11-01T10:00Z', 'Возврат постоя'),
        ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000002', null, 50.02, 'CASH', '2026-11-01T10:00Z', 'Расход клуба')`;
      const boxes = await cashboxBalances(tx, new Date('2026-11-02T00:00Z'));
      assert.deepEqual(boxes, { mainBalance: '950.08', boardingBalance: '4900.19', mainOperationsCount: 2, boardingOperationsCount: 2 });
      const query = { page: 1, pageSize: 2 }, range = { gte: new Date('2026-11-01T00:00Z'), lt: new Date('2026-11-02T00:00Z') };
      const first = await cashJournal(tx, query, range), second = await cashJournal(tx, { ...query, page: 2 }, range);
      assert.equal(first.total, 4); assert.equal(second.total, 4);
      assert.equal(new Set([...first.data, ...second.data].map(row => row.id)).size, 4);
      const refunds = await cashJournal(tx, { ...query, paymentMethod: 'BANK', operationType: 'EXPENSE', search: 'Анна' }, range);
      assert.equal(refunds.total, 1); assert.equal(refunds.data[0].amount, '100.01');
      const literal = await cashJournal(tx, { ...query, search: '100%_' }, range);
      assert.equal(literal.total, 1); assert.equal(literal.data[0].kind, 'INCOME');
      await tx.$executeRaw`UPDATE "Expense" SET "cancelledAt" = now() WHERE "refundPaymentId" IS NOT NULL`;
      await tx.$executeRaw`UPDATE "Payment" SET "archivedAt" = now() WHERE method = 'CASH'`;
      const after = await cashboxBalances(tx, new Date('2026-11-02T00:00Z'));
      assert.equal(after.mainBalance, '-50.02'); assert.equal(after.boardingBalance, '5000.20');
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
  } finally { await prisma.$disconnect(); }
});
