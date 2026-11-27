require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { DemoService } = require('../dist/demo/demo.service');
const { demoAccounts } = require('../dist/demo/demo.config');
const { cashboxBalances } = require('../dist/payments/cashbox-balances');

test('PostgreSQL demo seed/reset with all migrations and financial triggers', { skip: process.env.RUN_DEMO_POSTGRES_TESTS !== '1' }, async () => {
  const target = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
  assert.ok(target.pathname.endsWith('_test_demo'), 'Only an isolated *_test_demo database is allowed');
  assert.equal(process.env.DEMO_MODE, 'true');
  const prisma = new PrismaClient();
  try {
    const service = new DemoService(prisma);
    await service.initialize();
    await service.initialize();
    const verify = async () => {
      for (const [model, count] of Object.entries({ horse: 10, stall: 10, trainer: 3, client: 12, membership: 8, boardingContract: 4, lesson: 14, booking: 14 })) {
        assert.equal(await prisma[model].count(), count, model);
      }
      assert.equal(await prisma.payment.count({ where: { status: 'PAID' } }), 12);
      const boxes = await prisma.$transaction(tx => cashboxBalances(tx, new Date()));
      assert.equal(boxes.mainBalance, '139800.00');
      assert.equal(boxes.boardingBalance, '106000.00');
      const stalls = await prisma.stall.findMany({ include: { building: true } });
      assert.ok(stalls.every(stall => stall.col <= stall.building.gridCols && stall.row <= stall.building.gridRows));
    };
    await verify();
    await prisma.client.create({ data: { firstName: 'Изменение посетителя' } });
    await service.reset(demoAccounts.OWNER);
    await verify();
    await service.reset(demoAccounts.OWNER);
    await verify();
    const audit = await prisma.cashAuditLog.findMany({ where: { action: 'DEMO_RESET' } });
    assert.ok(audit.length >= 2);
    assert.ok(audit.every(row => row.details.snapshots.Payment.length >= 12 && row.actorId === demoAccounts.OWNER.id));
    assert.equal(await prisma.cashAuditLog.count({ where: { action: 'DEMO_INITIALIZED' } }), 1);
  } finally { await prisma.$disconnect(); }
});
