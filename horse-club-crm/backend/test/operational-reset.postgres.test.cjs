require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { OperationalResetService } = require('../dist/settings/operational-reset.service');
const { MonthlyClosingService } = require('../dist/payments/monthly-closing.service');
const { FinanceService } = require('../dist/payments/finance.service');

test('PostgreSQL operational reset: real FKs, immutable snapshots, boarding projection, rollback and zero reports', {
  skip: process.env.RUN_OPERATIONAL_RESET_TESTS !== '1', timeout: 60000,
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.searchParams.get('schema'), /^operational_reset_check_\d+$/);
  const p = new PrismaClient();
  const tables = ['monthlyFinancialClosing', 'payrollCalculation', 'ledgerTransaction', 'revenueRecognition',
    'membershipOp', 'bookingHorseChange', 'booking', 'lesson', 'membershipMember', 'membership', 'expense', 'payment', 'cashShift'];
  try {
    const actor = await p.user.create({ data: { email: 'reset@test.local', passwordHash: 'test', role: 'ADMIN' } });
    const client = await p.client.create({ data: { name: 'Preserved client' } });
    const horse = await p.horse.create({ data: { name: 'Preserved horse' } });
    const trainer = await p.trainer.create({ data: { name: 'Preserved trainer' } });
    const service = await p.service.create({ data: { name: 'Preserved service', durationMinutes: 60, price: 11600 } });
    const plan = await p.pricingPlan.create({ data: { name: 'Preserved tariff', totalLessons: 8, validDays: 30 } });
    const staff = await p.staffProfile.create({ data: { userId: actor.id, fullName: 'Preserved staff', roleTitle: 'Admin' } });
    const shift = await p.cashShift.create({ data: { cashierId: actor.id, startingCash: 500 } });
    const membership = await p.membership.create({ data: { clientId: client.id, serviceId: service.id, pricingPlanId: plan.id, totalLessons: 8, remainedLessons: 8, totalPrice: 8000, pricePerLesson: 1000 } });
    await p.membershipMember.create({ data: { membershipId: membership.id, clientId: client.id, createdById: actor.id } });
    const start = new Date('2026-09-10T08:00:00Z'), end = new Date('2026-09-10T09:00:00Z');
    const lesson = await p.lesson.create({ data: { trainerId: trainer.id, serviceId: service.id, startTime: start, endTime: end } });
    const booking = await p.booking.create({ data: { lessonId: lesson.id, clientId: client.id, horseId: horse.id, trainerId: trainer.id,
      membershipId: membership.id, startTime: start, endTime: end, legacyLessonBinding: true } });
    await p.bookingHorseChange.create({ data: { bookingId: booking.id, actorUserId: actor.id, newHorseId: horse.id } });
    await p.membershipOp.create({ data: { membershipId: membership.id, lessonId: lesson.id, attendeeClientId: client.id, type: 'DEBIT', amount: 1, reason: 'test' } });
    await p.lesson.update({ where: { id: lesson.id }, data: { status: 'COMPLETED' } });
    const payment = await p.payment.create({ data: { clientId: client.id, bookingId: booking.id, membershipId: membership.id,
      serviceId: service.id, amount: 176450, method: 'CASH', status: 'PAID', cashierId: actor.id, shiftId: shift.id, archivedAt: new Date(), paidAt: start } });
    await p.ledgerTransaction.create({ data: { clientId: client.id, cashDeskPaymentId: payment.id, amount: 176450, transactionType: 'purchase' } });
    await p.expense.create({ data: { refundPaymentId: payment.id, amount: 100, category: 'OTHER', paymentMethod: 'CASH', description: 'Refund', createdById: actor.id, shiftId: shift.id } });
    const salary = await p.expense.create({ data: { amount: 500, category: 'SALARY', paymentMethod: 'CARD', description: 'Salary', createdById: actor.id } });
    await p.payrollCalculation.create({ data: { staffId: staff.id, periodStart: start, periodEnd: end, shiftsCount: 1, shiftsTotal: 500,
      lessonsCount: 0, lessonsTotal: 0, totalAmount: 500, isPaid: true, paidAt: start, expenseId: salary.id, createdById: actor.id } });
    const contract = await p.boardingContract.create({ data: { clientId: client.id, horseId: horse.id, startsAt: start, monthlyRate: 10000 } });
    await p.payment.create({ data: { clientId: client.id, boardingContractId: contract.id, amount: 10000, method: 'CARD', status: 'PAID', paidAt: start } });
    const closingData = { year: 2026, month: 9, cashFlowIncome: 186450, cashFlowExpense: 600, recognizedRevenue: 1000,
      deferredRevenueCarriedOver: 7000, activeMembershipsCarriedOver: 1, closedById: actor.id };
    await p.monthlyFinancialClosing.create({ data: closingData });
    await assert.rejects(p.monthlyFinancialClosing.deleteMany());
    await assert.rejects(p.revenueRecognition.deleteMany());
    const body = { confirmation: 'RESET_ALL_OPERATIONAL_DATA', requestId: randomUUID() };
    await assert.rejects(p.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('horsecrm.operational_reset_id', ${body.requestId}, true)`;
      await tx.monthlyFinancialClosing.deleteMany();
    }));
    const counts = await Promise.all(tables.map(table => p[table].count()));
    const reset = new OperationalResetService(p);
    // A real database error after the first delete must roll back audit and data.
    await p.$executeRawUnsafe(`CREATE FUNCTION fail_reset_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`);
    await p.$executeRawUnsafe(`CREATE TRIGGER reset_failure BEFORE DELETE ON "PayrollCalculation" FOR EACH ROW EXECUTE FUNCTION fail_reset_delete()`);
    await assert.rejects(reset.reset(body, actor));
    assert.deepEqual(await Promise.all(tables.map(table => p[table].count())), counts);
    assert.equal(await p.cashAuditLog.count(), 0);
    await p.$executeRawUnsafe('DROP TRIGGER reset_failure ON "PayrollCalculation"');
    await reset.reset(body, actor);
    assert.deepEqual(await Promise.all(tables.map(table => p[table].count())), tables.map(() => 0));
    assert.equal((await p.client.findUniqueOrThrow({ where: { id: client.id } })).boardingBalance.toFixed(2), '0.00');
    for (const table of ['client', 'horse', 'trainer', 'service', 'pricingPlan', 'user', 'staffProfile', 'boardingContract']) assert.equal(await p[table].count(), 1, table);
    const finance = await new FinanceService(p).summary({ from: '2026-09-01', to: '2026-09-30', page: 1, pageSize: 20 });
    for (const key of ['balanceCash', 'balanceCard', 'balanceTotal', 'totalRevenue', 'totalExpenses']) assert.equal(finance[key].toFixed(2), '0.00', key);
    const monthly = await new MonthlyClosingService(p).status({ year: 2026, month: 9 });
    for (const key of ['cashFlowIncome', 'cashFlowExpense', 'recognizedRevenue', 'deferredRevenueCarriedOver']) assert.equal(monthly[key].toFixed(2), '0.00', key);
    const audit = await p.cashAuditLog.findUniqueOrThrow({ where: { requestId: body.requestId } });
    assert.equal(audit.actorId, actor.id); assert.equal(audit.details.snapshot.payments.length, 2);
    assert.equal((await reset.reset(body, actor)).alreadyCompleted, true);
    // An old audit and the same setting cannot authorize a later transaction.
    await p.monthlyFinancialClosing.create({ data: closingData });
    await assert.rejects(p.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('horsecrm.operational_reset_id', ${body.requestId}, true)`;
      await tx.monthlyFinancialClosing.deleteMany();
    }));
    await assert.rejects(p.monthlyFinancialClosing.updateMany({ data: { recognizedRevenue: 0 } }));
  } finally { await p.$disconnect(); }
});
