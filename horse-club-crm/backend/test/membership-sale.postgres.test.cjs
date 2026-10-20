const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { MembershipsService } = require('../dist/memberships/memberships.service');

test('PostgreSQL membership sale with real journal trigger, rollback and idempotency', { skip: process.env.RUN_MEMBERSHIP_SALE_TESTS !== '1', timeout: 60000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.searchParams.get('schema'), /^membership_sale_check_\d+$/);
  const p = new PrismaClient();
  const service = new MembershipsService(p);
  const logs = [];
  service.logger.error = (...args) => logs.push(args);
  try {
    const actor = await p.user.create({ data: { email: `${randomUUID()}@membership.test`, passwordHash: 'test', role: 'ADMIN' } });
    const client = await p.client.create({ data: { name: 'Membership sale regression' } });
    const lessonService = await p.service.create({ data: { name: 'Dressage', title: 'Dressage', durationMinutes: 60, price: '1250.15' } });
    const dto = { clientId: client.id, serviceId: lessonService.id, totalLessons: 8, totalPrice: 9500.25, paymentMethod: 'CASH', validUntil: '2099-12-31T20:59:00Z', requestId: randomUUID() };
    // Confirm this test exercises the trigger responsible for the production conflict.
    const triggers = await p.$queryRaw`SELECT tgname FROM pg_trigger WHERE tgname = 'MembershipOp_project_ledger' AND tgrelid = '"MembershipOp"'::regclass`;
    assert.equal(triggers.length, 1);
    await t.test('regression: manual insertion after the trigger reproduces P2002 and rolls back', async () => {
      const id = randomUUID(), creditId = randomUUID();
      await assert.rejects(p.$transaction(async tx => {
        await tx.membership.create({ data: { id, clientId: client.id, totalLessons: 8, remainedLessons: 8, validUntil: new Date(dto.validUntil),
          operations: { create: { id: creditId, type: 'CREDIT', amount: 8, reason: 'Regression credit' } } } });
        assert.equal(await tx.ledgerTransaction.count({ where: { sourceMembershipOpId: creditId } }), 1);
        await tx.ledgerTransaction.create({ data: { clientId: client.id, membershipId: id, sourceMembershipOpId: creditId, transactionType: 'purchase', amount: 8 } });
      }), error => error.code === 'P2002');
      assert.equal(await p.membership.count({ where: { id } }), 0);
      assert.equal(await p.ledgerTransaction.count({ where: { sourceMembershipOpId: creditId } }), 0);
    });
    await t.test('first sale posts one projected lesson credit and one paid cash receipt', async () => {
      const membership = await service.create(dto, actor);
      const ledger = await p.ledgerTransaction.findMany({ where: { membershipId: membership.id } });
      assert.equal(ledger.length, 2);
      assert.equal(ledger.filter(row => row.sourceMembershipOpId).length, 1);
      const payment = await p.payment.findFirstOrThrow({ where: { membershipId: membership.id } });
      assert.equal(payment.status, 'PAID');
      assert.equal(payment.cashierId, actor.id);
      assert.equal(payment.amount.toString(), '9500.25');
      assert.equal(payment.method, 'CASH');
      assert.equal(membership.remainedLessons, 8);
      assert.equal(membership.remainingUnits.toString(), '8');
      const repeated = await service.create(dto, actor);
      assert.equal(repeated.id, membership.id);
      assert.equal(await p.payment.count({ where: { membershipId: membership.id } }), 1);
    });
    await t.test('concurrent CARD retries produce one sale', async () => {
      const parallel = { ...dto, requestId: randomUUID(), paymentMethod: 'CARD' };
      const results = await Promise.all([service.create(parallel, actor), service.create(parallel, actor), service.create(parallel, actor)]);
      assert.equal(new Set(results.map(row => row.id)).size, 1);
      assert.equal(await p.payment.count({ where: { membershipId: results[0].id, method: 'CARD' } }), 1);
    });
    await t.test('cash write failure rolls back all records and releases key for successful retry', async () => {
      const failed = { ...dto, requestId: randomUUID(), totalPrice: 777.23 };
      // Scoped to a disposable schema; force the database to reject the cash write.
      await p.$executeRawUnsafe('ALTER TABLE "Payment" ADD CONSTRAINT "membership_sale_test_failure" CHECK ("amount" <> 777.23)');
      try {
        await assert.rejects(service.create(failed, actor), error => error.getStatus() === 503);
        assert.equal(await p.membership.count({ where: { saleRequestId: failed.requestId } }), 0);
        assert.equal(await p.payment.count({ where: { amount: 777.23 } }), 0);
        assert.equal(logs.at(-1)[0].stage, 'cashbox.payment.create');
      } finally { await p.$executeRawUnsafe('ALTER TABLE "Payment" DROP CONSTRAINT "membership_sale_test_failure"'); }
      const retried = await service.create(failed, actor);
      assert.equal(await p.payment.count({ where: { membershipId: retried.id } }), 1);
      assert.equal(await p.ledgerTransaction.count({ where: { membershipId: retried.id } }), 2);
    });
  } finally { await p.$disconnect(); }
});
