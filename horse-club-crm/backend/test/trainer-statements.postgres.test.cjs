require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { TrainerPayoutService } = require('../dist/staff/trainer-payout.service');
const { PeriodClosingService } = require('../dist/payments/period-closing.service');
const { MonthlyClosingService } = require('../dist/payments/monthly-closing.service');

test('PostgreSQL: nominal advance/final, atomic MAIN expense, concurrent pay, both cashboxes and period guards', {
  skip: process.env.RUN_TRAINER_STATEMENT_TESTS !== '1', timeout: 60000,
}, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /^\/horsecrm_payroll_test_\d+$/);
  const p = new PrismaClient();
  try {
    const actor = await p.user.create({ data: { email: `${randomUUID()}@payroll.test`, passwordHash: 'test', role: 'ADMIN' } });
    const trainer = await p.trainer.create({ data: { name: 'Тренер' } });
    const user = await p.user.create({ data: { email: `${randomUUID()}@payroll.test`, passwordHash: 'test', role: 'TRAINER', trainerId: trainer.id } });
    const staff = await p.staffProfile.create({ data: { userId: user.id, fullName: 'Тренер теста', roleTitle: 'Тренер' } });
    const client = await p.client.create({ data: { name: 'Клиент' } });
    const offering = await p.service.create({ data: { name: 'Урок', price: '1000.50', durationMinutes: 60 } });
    const createLesson = date => p.lesson.create({ data: { trainerId: trainer.id, serviceId: offering.id, status: 'COMPLETED', startTime: new Date(date), endTime: new Date(+new Date(date) + 3600000),
      bookings: { create: { legacyLessonBinding: true, clientId: client.id, trainerId: trainer.id, costAmount: 100, startTime: new Date(date), endTime: new Date(+new Date(date) + 3600000) } } } });
    const first = await createLesson('2026-09-10T08:00Z'); await createLesson('2026-09-20T08:00Z');
    await p.payment.create({ data: { clientId: client.id, amount: 10000, method: 'CASH', status: 'PAID', paidAt: new Date('2026-09-01T08:00Z') } });
    const payroll = new TrainerPayoutService(p);
    const closing = new PeriodClosingService(p, new MonthlyClosingService(p));
    let advance, final;
    await t.test('paid advance is 30% of nominal, not discounted client payment', async () => {
      [advance] = await payroll.generate({ type: 'ADVANCE', month: '2026-09', staffId: staff.id }, actor);
      assert.equal(advance.totalAmount.toFixed(2), '300.15');
      await payroll.transition(advance.id, false, actor);
      const results = await Promise.all([1, 2, 3].map(() => payroll.transition(advance.id, true, actor)));
      assert.equal(new Set(results.map(row => row.expenseId)).size, 1);
      assert.equal(await p.expense.count({ where: { category: 'SALARY' } }), 1);
      advance = results[0];
      assert.ok(await p.cashAuditLog.findFirst({ where: { action: 'TRAINER_STATEMENT_PAID' } }));
      await assert.rejects(() => p.expense.update({ where: { id: advance.expenseId }, data: { cancelledAt: new Date() } }), /неизменяема/);
    });
    await t.test('final subtracts paid advance; expense failure after insert rolls back all writes', async () => {
      [final] = await payroll.generate({ type: 'FINAL_SALARY', month: '2026-09', staffId: staff.id }, actor);
      assert.equal(final.accrued.toFixed(2), '600.30'); assert.equal(final.totalAmount.toFixed(2), '300.15');
      await payroll.transition(final.id, false, actor);
      await p.$executeRawUnsafe(`CREATE FUNCTION reject_trainer_test_pay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='TRAINER_STATEMENT_PAID' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$`);
      await p.$executeRawUnsafe(`CREATE TRIGGER reject_trainer_test_pay BEFORE INSERT ON "CashAuditLog" FOR EACH ROW EXECUTE FUNCTION reject_trainer_test_pay()`);
      await assert.rejects(() => payroll.transition(final.id, true, actor), /forced audit failure/);
      assert.equal(await p.expense.count({ where: { category: 'SALARY' } }), 1);
      assert.equal((await p.trainerPayout.findUniqueOrThrow({ where: { id: final.id } })).status, 'APPROVED');
      await p.$executeRawUnsafe('DROP TRIGGER reject_trainer_test_pay ON "CashAuditLog"');
      await payroll.transition(final.id, true, actor);
      await assert.rejects(() => payroll.generate({ type: 'ADVANCE', month: '2026-09', staffId: staff.id, periodStart: '2026-09-16', periodEnd: '2026-09-20' }, actor), /уже оплачен/);
    });
    await t.test('view retains MAIN/BOARDING separation and payout only reduces MAIN', async () => {
      const boxes = await p.$queryRaw`SELECT * FROM public.v_cashbox_balances ORDER BY cashbox_type`;
      assert.equal(boxes.find(row => row.cashbox_type === 'MAIN').current_balance_rub.toFixed(2), '9399.70');
      assert.equal(boxes.find(row => row.cashbox_type === 'BOARDING').current_balance_rub.toFixed(2), '0.00');
    });
    await t.test('day close freezes reconciliation and protects cash, lessons and shifts in Moscow', async () => {
      const dto = { type: 'SHIFT', date: '2026-09-10' };
      const preview = await closing.preview(dto); assert.equal(preview.cashboxes.find(row => row.cashbox === 'MAIN').opening, '10000.00');
      const closed = await closing.close(dto, actor); assert.equal(closed.isClosed, true);
      await assert.rejects(() => p.lesson.update({ where: { id: first.id }, data: { cost: 1500 } }), /период закрыт/);
      await assert.rejects(() => p.payment.create({ data: { clientId: client.id, amount: 50, method: 'CASH', status: 'PAID', paidAt: new Date('2026-09-09T21:00Z') } }), /период закрыт/);
      await assert.rejects(() => p.workShift.create({ data: { staffId: staff.id, date: new Date('2026-09-10'), startTime: '08:00', endTime: '20:00', createdById: actor.id } }), /период закрыт|уже оплачен/);
      assert.deepEqual((await closing.preview(dto)).cashboxes, closed.cashboxes);
    });
    await t.test('month close retains rollover, audits, blocks new/old payroll and backdated expense', async () => {
      const dto = { type: 'MONTH', month: '2026-09' };
      const result = await closing.close(dto, actor); assert.equal(result.isClosed, true);
      assert.ok(await p.openingBalance.findUnique({ where: { year_month: { year: 2026, month: 10 } } }));
      await assert.rejects(() => p.expense.create({ data: { category: 'OTHER', amount: 10, paymentMethod: 'CASH', description: 'Backdate', date: new Date('2026-09-25'), createdById: actor.id } }), /период закрыт/);
      await assert.rejects(() => payroll.generate({ type: 'ADVANCE', month: '2026-09', staffId: staff.id, periodStart: '2026-09-25', periodEnd: '2026-09-26' }, actor));
      assert.equal(await p.cashAuditLog.count({ where: { action: 'FINANCIAL_PERIOD_CLOSED' } }), 2);
      await assert.rejects(() => closing.close(dto, actor), /уже закрыт/);
    });
  } finally { await p.$disconnect(); }
});
