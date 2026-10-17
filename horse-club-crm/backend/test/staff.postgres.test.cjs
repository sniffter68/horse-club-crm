require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { StaffService } = require('../dist/staff/staff.service');
const { FinanceService } = require('../dist/payments/finance.service');

test('PostgreSQL payroll: actual lessons, rollback after expense insertion, concurrent retries, privacy and cash/card balances', { skip: process.env.RUN_STAFF_TESTS !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname)); assert.match(url.searchParams.get('schema'), /^staff_check_\d+$/);
  const p = new PrismaClient(), service = new StaffService(p), finance = new FinanceService(p);
  try {
    const trainer = await p.trainer.create({ data: { name: 'Тренер', fullName: 'Тренер' } });
    const user = await p.user.create({ data: { email: `${randomUUID()}@staff.test`, passwordHash: 'test', role: 'ADMIN', trainerId: trainer.id } });
    const actor = { id: user.id, role: 'ADMIN' };
    const staff = await service.saveProfile({ userId: user.id, fullName: 'Тест расчета', roleTitle: 'Тренер', shiftRate: 1500.1, lessonRate: 400.2, groupLessonRate: 700.3, lessonPercentage: 12.5 }, actor);
    const client = await p.client.create({ data: { name: 'Клиент' } });
    const offering = await p.service.create({ data: { name: 'Урок', durationMinutes: 60, maxCapacity: 2, price: 9999 } });
    const arena = await p.arena.create({ data: { name: randomUUID(), capacity: 2, maxRidersCapacity: 2 } });
    const horses = await Promise.all([0, 1].map(() => p.horse.create({ data: { name: randomUUID() } })));
    for (const [index, amounts] of [[1, [1000.1]], [2, [1000.1, 2000.2]], [3, [9999]]]) {
      await p.lesson.create({ data: { trainerId: trainer.id, serviceId: offering.id, arenaId: arena.id, status: index === 3 ? 'CANCELLED' : 'COMPLETED', startTime: new Date(`2026-01-0${index}T09:00Z`), endTime: new Date(`2026-01-0${index}T10:00Z`), bookings: { create: amounts.map((costAmount, i) => ({ trainerId: trainer.id, clientId: client.id, serviceType: 'dressage', horseId: horses[i].id, arenaId: arena.id, costAmount, status: 'scheduled', startTime: new Date(`2026-01-0${index}T09:00Z`), endTime: new Date(`2026-01-0${index}T10:00Z`) })) } } });
    }
    await service.createShifts({ staffId: staff.id, dates: ['2026-01-01', '2026-01-02', '2026-01-03'], startTime: '08:00', endTime: '20:00' }, actor);
    const shifts = await service.shifts({ staffId: staff.id, from: '2026-01-01', to: '2026-01-31' }, actor);
    await service.changeShift(shifts.data[0].id, { status: 'COMPLETED' }, actor); await service.changeShift(shifts.data[1].id, { status: 'COMPLETED' }, actor); await service.changeShift(shifts.data[2].id, { status: 'SICK' }, actor);
    // A duplicate in a batch rolls back the entire batch, including the new date.
    await assert.rejects(() => service.createShifts({ staffId: staff.id, dates: ['2026-01-04', '2026-01-01'], startTime: '08:00', endTime: '20:00' }, actor), e => e.status === 409);
    assert.equal(await p.workShift.count({ where: { staffId: staff.id } }), 3);
    const period = { staffId: staff.id, from: '2026-01-01', to: '2026-01-31' };
    const preview = (await service.calculate(period, actor)).data[0];
    assert.equal(preview.lessonsCount, 2); assert.equal(preview.shiftsCount, 2); assert.equal(preview.totalAmount.toFixed(2), '4600.75');
    const row = await service.savePayroll({ ...period, bonuses: 100.1, penalties: 50.2 }, actor);
    await assert.rejects(() => service.savePayroll({ ...period, bonuses: 1, penalties: 0, expectedUpdatedAt: null }, actor), e => e.status === 409);
    await assert.rejects(() => service.savePayroll({ ...period, bonuses: 1, penalties: 0, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }, actor), e => e.status === 409);
    assert.equal(row.totalAmount.toFixed(2), '4650.65');
    const payout = { calculationId: row.id, paymentMethod: 'CASH', expectedTotal: 4650.65 };
    await p.staffProfile.update({ where: { id: staff.id }, data: { shiftRate: 2000 } });
    await assert.rejects(() => service.payout(payout, actor), e => e.status === 409); assert.equal(await p.expense.count(), 0);
    await p.staffProfile.update({ where: { id: staff.id }, data: { shiftRate: 1500.1 } });
    // Fail after creating Expense, at the final update: both changes must roll back.
    await p.$executeRawUnsafe(`CREATE FUNCTION reject_staff_test_payout() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."isPaid" THEN RAISE EXCEPTION 'forced payroll rollback'; END IF; RETURN NEW; END $$`);
    await p.$executeRawUnsafe(`CREATE TRIGGER reject_staff_test_payout BEFORE UPDATE ON "PayrollCalculation" FOR EACH ROW EXECUTE FUNCTION reject_staff_test_payout()`);
    await assert.rejects(() => service.payout(payout, actor)); assert.equal(await p.expense.count(), 0); assert.equal((await p.payrollCalculation.findUnique({ where: { id: row.id } })).isPaid, false);
    await p.$executeRawUnsafe(`DROP TRIGGER reject_staff_test_payout ON "PayrollCalculation"`); await p.$executeRawUnsafe(`DROP FUNCTION reject_staff_test_payout()`);
    const before = await finance.summary({ from: '2026-01-01', to: '2099-01-01', page: 1, pageSize: 20 });
    const paid = await Promise.all([service.payout(payout, actor), service.payout(payout, actor), service.payout(payout, actor)]);
    assert.equal(new Set(paid.map(row => row.expenseId)).size, 1); assert.equal(await p.expense.count(), 1);
    const expense = await p.expense.findUnique({ where: { id: paid[0].expenseId } });
    assert.equal(expense.category, 'SALARY'); assert.equal(expense.createdById, user.id); assert.equal(expense.amount.toFixed(2), '4650.65'); assert.match(expense.description, /2026-01-01–2026-01-31/);
    const after = await finance.summary({ from: '2026-01-01', to: '2099-01-01', page: 1, pageSize: 20 });
    assert.equal(before.balanceCash.minus(after.balanceCash).toFixed(2), '4650.65');
    await assert.rejects(() => finance.cancel(expense.id, actor), e => e.status === 409);
    await assert.rejects(() => service.payout({ ...payout, paymentMethod: 'CARD' }, actor), e => e.status === 409);
    await assert.rejects(() => service.savePayroll({ ...period, to: '2026-02-01', bonuses: 0, penalties: 0 }, actor), e => e.status === 409);
    await assert.rejects(() => service.changeShift(shifts.data[0].id, { status: 'ABSENT' }, actor), e => e.status === 409);
    await p.staffProfile.update({ where: { id: staff.id }, data: { shiftRate: 9999 } });
    assert.equal((await service.calculate(period, actor)).data[0].totalAmount.toFixed(2), '4650.65');
    const card = await service.savePayroll({ staffId: staff.id, from: '2026-02-01', to: '2026-02-28', bonuses: 100, penalties: 0 }, actor);
    await service.payout({ calculationId: card.id, expectedTotal: 100, paymentMethod: 'CARD' }, actor);
    const cardBalance = await finance.summary({ from: '2026-01-01', to: '2099-01-01', page: 1, pageSize: 20 });
    assert.equal(cardBalance.balanceCash.toString(), after.balanceCash.toString()); assert.equal(after.balanceCard.minus(cardBalance.balanceCard).toString(), '100');
    const reader = { id: user.id, role: 'TRAINER' };
    assert.equal((await service.calculate(period, reader)).total, 1);
    await assert.rejects(() => service.calculate({ ...period, staffId: randomUUID() }, reader), e => e.status === 403);
  } finally { await p.$disconnect(); }
});
