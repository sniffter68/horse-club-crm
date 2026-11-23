const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
require('reflect-metadata');
const { PaymentsService } = require('../dist/payments/payments.service');
const { FinanceService } = require('../dist/payments/finance.service');
const { CashDeskService } = require('../dist/payments/cash-desk.service');
const { cashboxBalances } = require('../dist/payments/cashbox-balances');
const { StallsService } = require('../dist/stalls/stalls.service');

test('PostgreSQL boarding channels, unavailable horse, concurrent expense, correction audit and closed periods',
  { skip: process.env.RUN_BOARDING_CASH_TESTS !== '1', timeout: 60000 }, async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    assert.match(url.searchParams.get('schema'), /^boarding_cash_check_\d+$/);
    const p = new PrismaClient();
    try {
      const actor = await p.user.create({ data: { email: `${randomUUID()}@boarding.test`, passwordHash: 'test', role: 'ADMIN' } });
      const client = await p.client.create({ data: { name: 'Олеся Попова' } });
      const horse = await p.horse.create({ data: { name: 'Шанель', ownerType: 'private', ownerId: client.id, status: 'rest', isUnavailable: true } });
      const stall = await p.stall.create({ data: { number: '9', name: 'Денник 9' } });
      const contract = await p.boardingContract.create({ data: { horseId: horse.id, stallId: stall.id, clientId: client.id, status: 'ACTIVE', startsAt: new Date('2026-01-01'), monthlyRate: 1000 } });
      assert.equal((await new StallsService(p).map()).find(row => row.id === stall.id).horse.name, 'Шанель');
      const payments = new PaymentsService(p), finance = new FinanceService(p), desk = new CashDeskService(p);
      const shift = await desk.openShift({ startingCash: 0 }, actor.id);
      assert.ok((await payments.boardingOptions()).some(row => row.id === contract.id));
      const cash = await payments.create({ boardingContractId: contract.id, amount: 1000, method: 'CASH', status: 'PAID', requestId: randomUUID() }, actor);
      await payments.create({ boardingContractId: contract.id, amount: 2000, method: 'TRANSFER', status: 'PAID', requestId: randomUUID() }, actor);
      await finance.create({ cashboxType: 'BOARDING', amount: 200, paymentMethod: 'CARD', category: 'FEED', description: 'Корма', requestId: randomUUID() }, actor.id);
      const expenses = await Promise.allSettled([1, 2].map(() => finance.create({ cashboxType: 'BOARDING', amount: 800, paymentMethod: 'CASH', category: 'BEDDING', description: 'Опилки', requestId: randomUUID() }, actor.id)));
      assert.equal(expenses.filter(row => row.status === 'fulfilled').length, 1);
      let balances = await payments.boardingCash();
      assert.equal(String(balances.cash), '200'); assert.equal(String(balances.bank), '1800');
      const boxes = await p.$transaction(tx => cashboxBalances(tx, new Date(Date.now() + 1000)));
      assert.equal(boxes.mainBalance, '0.00'); assert.equal(boxes.boardingBalance, '2000.00');
      await payments.update(cash.id, { method: 'CARD', amount: 900, description: 'Исправление' }, actor);
      balances = await payments.boardingCash();
      assert.equal(String(balances.cash), '-800'); assert.equal(String(balances.bank), '2700');
      const audit = await p.cashAuditLog.findFirst({ where: { action: 'PAYMENT_CORRECTED' } });
      assert.equal(audit.details.before.method, 'CASH'); assert.equal(audit.details.after.amount, '900');
      assert.equal(String((await p.client.findUnique({ where: { id: client.id } })).boardingBalance), '2900');
      const journal = await finance.journal({ from: '2020-01-01', to: '2099-01-01', cashboxType: 'BOARDING', page: 1, pageSize: 20 });
      assert.equal(journal.total, 4);
      const trainer = await p.trainer.create({ data: { name: 'QA' } });
      const arena = await p.arena.create({ data: { name: 'QA' } });
      const booking = await p.booking.create({ data: { clientId: client.id, trainerId: trainer.id, arenaId: arena.id, horseId: horse.id,
        serviceType: 'dressage', startTime: new Date('2090-01-01T09:00:00Z'), endTime: new Date('2090-01-01T10:00:00Z'), costAmount: 1000 } });
      const lessonReceipt = await desk.pay({ clientId: client.id, bookingId: booking.id, amount: 1000, method: 'CASH', requestId: randomUUID() }, actor.id);
      await payments.update(lessonReceipt.id, { amount: 900, method: 'CARD' }, actor);
      const adjusted = await p.booking.findUnique({ where: { id: booking.id } });
      assert.equal(String(adjusted.finalPaymentAmount), '900'); assert.equal(adjusted.isPaid, false);
      const membership = await p.membership.create({ data: { clientId: client.id, type: 'deposit', validTo: new Date('2090-01-01') } });
      const deposit = await desk.pay({ clientId: client.id, membershipId: membership.id, amount: 200, method: 'CASH', requestId: randomUUID() }, actor.id);
      await payments.update(deposit.id, { amount: 150 }, actor);
      const adjustedDeposit = await p.membership.findUnique({ where: { id: membership.id } });
      assert.equal(String(adjustedDeposit.remainingUnits), '150'); assert.equal(String(adjustedDeposit.initialUnits), '150');
      await desk.closeShift(shift.id, actor.id);
      await assert.rejects(payments.update(cash.id, { method: 'CASH' }, actor), /закрытой смены/);
      await assert.rejects(payments.update(cash.id, { paidAt: '2026-01-02T00:00:00Z' }, actor), /закрытой смены/);
      // Period guard is a DB invariant even without a linked cash shift.
      await p.$executeRaw`SELECT assert_financial_period_open(now())`;
      const oldPayment = await payments.create({ boardingContractId: contract.id, amount: 50, method: 'CASH', status: 'PAID', paidAt: '2025-01-02T09:00:00Z', requestId: randomUUID() }, actor);
      await p.financialPeriodClosing.create({ data: { periodStart: new Date('2025-01-01'), periodEnd: new Date('2025-02-01'), closedById: actor.id,
        type: 'MONTH', snapshot: {} } });
      await assert.rejects(payments.update(oldPayment.id, { description: 'Нельзя' }, actor), /период закрыт/);
    } finally { await p.$disconnect(); }
  });
