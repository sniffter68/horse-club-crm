require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { TrainerPayoutService } = require('../dist/staff/trainer-payout.service');
const { TrainersService } = require('../dist/trainers/trainers.service');
const { StaffService } = require('../dist/staff/staff.service');

test('PostgreSQL: mixed 30/100 commissions, SQL constraints, audit, approved/paid and final snapshots', { skip: process.env.RUN_COMMISSION_TESTS !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.searchParams.get('schema'), /^commission_check_\d+$/);
  const p = new PrismaClient();
  try {
    const actor = await p.user.create({ data: { email: 'commission-admin@test', passwordHash: 'test', role: 'ADMIN' } });
    const trainers = await Promise.all([30, 100].map(commissionPercent => p.trainer.create({ data: { name: `Commission ${commissionPercent}`, commissionPercent } })));
    const service = await p.service.create({ data: { name: 'Lesson', price: '1000.50', durationMinutes: 60 } });
    for (const trainer of trainers) await p.lesson.create({ data: { trainerId: trainer.id, serviceId: service.id, status: 'COMPLETED', startTime: new Date('2026-08-02T07:00Z'), endTime: new Date('2026-08-02T08:00Z') } });
    const payroll = new TrainerPayoutService(p);
    const rows = await payroll.generate({ type: 'ADVANCE', month: '2026-08' }, actor);
    assert.equal(rows.length, 2);
    for (const trainer of trainers) {
      const row = rows.find(row => row.trainerId === trainer.id);
      const expected = trainer.commissionPercent.equals(100) ? '1000.50' : '300.15';
      assert.equal(row.totalAmount.toFixed(2), expected);
      await payroll.transition(row.id, false, actor);
      await assert.rejects(() => p.trainerPayout.update({ where: { id: row.id }, data: { commissionPercent: 50 } }));
      await new TrainersService(p).update(trainer.id, { commissionPercent: 0 }, actor);
      const [approved] = await payroll.generate({ type: 'ADVANCE', month: '2026-08', trainerId: trainer.id }, actor);
      assert.equal(approved.status, 'APPROVED');
      const paid = await payroll.transition(row.id, true, actor);
      assert.equal(paid.totalAmount.toFixed(2), expected);
      assert.equal(paid.lessonBreakdown[0].commissionPercent, trainer.commissionPercent.toNumber());
      await p.trainer.update({ where: { id: trainer.id }, data: { commissionPercent: 50 } });
      const [again] = await payroll.generate({ type: 'ADVANCE', month: '2026-08', trainerId: trainer.id }, actor);
      assert.deepEqual(again.lessonBreakdown, paid.lessonBreakdown);
      const [final] = await payroll.generate({ type: 'FINAL_SALARY', month: '2026-08', trainerId: trainer.id }, actor);
      assert.equal(final.totalAmount.toFixed(2), '0.00');
      assert.deepEqual(final.lessonBreakdown, paid.lessonBreakdown);
      await assert.rejects(() => p.trainerPayout.update({ where: { id: row.id }, data: { commissionPercent: 50 } }));
    }
    assert.equal(await p.cashAuditLog.count({ where: { action: 'TRAINER_COMMISSION_CHANGED', actorId: actor.id } }), 2);
    for (const commissionPercent of [-1, 101]) await assert.rejects(() => p.trainer.create({ data: { name: 'Invalid', commissionPercent } }));
    assert.equal((await p.trainer.create({ data: { name: 'Default' } })).commissionPercent.toNumber(), 30);
    const closing = await p.monthlyFinancialClosing.create({ data: { year: 2026, month: 8, closedById: actor.id, cashFlowIncome: 0, cashFlowExpense: 0, recognizedRevenue: 0, deferredRevenueCarriedOver: 0, activeMembershipsCarriedOver: 0 } });
    await new TrainersService(p).update(trainers[0].id, { commissionPercent: 100 }, actor);
    await assert.rejects(() => payroll.generate({ type: 'FINAL_SALARY', month: '2026-08', trainerId: trainers[0].id }, actor));
    assert.deepEqual(await p.monthlyFinancialClosing.findUnique({ where: { id: closing.id } }), closing);
    const client = await p.client.create({ data: { name: 'Discounted customer' } });
    const staffService = new StaffService(p);
    for (const [index, commissionPercent] of [30, 100].entries()) {
      const trainer = trainers[index];
      await p.trainer.update({ where: { id: trainer.id }, data: { commissionPercent } });
      const user = await p.user.create({ data: { email: `commission-${index}@test`, passwordHash: 'test', role: 'TRAINER', trainerId: trainer.id } });
      const staff = await p.staffProfile.create({ data: { userId: user.id, fullName: trainer.name, roleTitle: 'Trainer' } });
      await p.lesson.create({ data: { trainerId: trainer.id, serviceId: service.id, status: 'COMPLETED', startTime: new Date('2026-07-02T07:00Z'), endTime: new Date('2026-07-02T08:00Z'), bookings: { create: { legacyLessonBinding: true, trainerId: trainer.id, clientId: client.id, costAmount: 100, startTime: new Date('2026-07-02T07:00Z'), endTime: new Date('2026-07-02T08:00Z') } } } });
      const saved = await staffService.savePayroll({ staffId: staff.id, from: '2026-07-01', to: '2026-07-31' }, actor);
      assert.equal(saved.totalAmount.toFixed(2), commissionPercent === 100 ? '1001.00' : '300.00');
      const paid = await staffService.payout({ calculationId: saved.id, expectedTotal: saved.totalAmount.toNumber(), paymentMethod: 'CASH' }, actor);
      await p.trainer.update({ where: { id: trainer.id }, data: { commissionPercent: 0 } });
      const result = await staffService.calculate({ staffId: staff.id, from: '2026-07-01', to: '2026-07-31' }, actor);
      assert.deepEqual(result.data[0].lessonBreakdown, paid.lessonBreakdown);
      assert.equal(result.data[0].lessonBreakdown[0].commissionPercent, commissionPercent);
      assert.equal(result.data[0].totalAmount.toString(), paid.totalAmount.toString());
    }
  } finally { await p.$disconnect(); }
});
