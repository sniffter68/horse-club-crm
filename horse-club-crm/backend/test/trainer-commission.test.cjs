require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Prisma } = require('@prisma/client');
const { CreateTrainerDto } = require('../dist/trainers/dto/create-trainer.dto');
const { UpdateTrainerDto } = require('../dist/trainers/dto/update-trainer.dto');
const { TrainersService } = require('../dist/trainers/trainers.service');
const { trainerPayout, payrollAmounts } = require('../dist/staff/staff.service');

test('create/update commissions accept inclusive endpoints and decimals; reject invalid inputs', async () => {
  for (const Dto of [CreateTrainerDto, UpdateTrainerDto]) {
    for (const commissionPercent of [undefined, 0, 30, 33.33, 100]) {
      assert.equal((await validate(plainToInstance(Dto, { name: 'Trainer', baseRate: 0, commissionPercent }))).length, 0);
    }
    for (const commissionPercent of [-1, 100.01, 101, null, '', '30', NaN, Infinity, 33.333]) {
      assert.ok((await validate(plainToInstance(Dto, { name: 'Trainer', baseRate: 0, commissionPercent }))).some(error => error.property === 'commissionPercent'));
    }
  }
});

test('staff payroll uses individual nominal commission; existing fixed rates and rounding remain', () => {
  const lesson = rate => ({ trainer: { commissionPercent: new Prisma.Decimal(rate) }, service: { price: new Prisma.Decimal('1000.50') }, bookings: [{ costAmount: new Prisma.Decimal(100) }] });
  assert.equal(trainerPayout(lesson(100)), 1001);
  assert.equal(trainerPayout(lesson(30)), 300);
  assert.equal(trainerPayout(lesson(0)), 0);
  const amounts = payrollAmounts(0, { shiftRate: null, lessonRate: null, groupLessonRate: null, lessonPercentage: null }, [lesson(100), lesson(30)]);
  assert.equal(amounts.totalAmount.toFixed(2), '1301.00');
});

test('commission edit and actor audit commit atomically; audit failure rolls the edit back', async () => {
  let trainer = { id: 'trainer', commissionPercent: new Prisma.Decimal(30) };
  let fail = false;
  const audits = [];
  const tx = { trainer: {
    findUnique: async () => trainer,
    update: async ({ data }) => trainer = { ...trainer, commissionPercent: new Prisma.Decimal(data.commissionPercent) },
  }, cashAuditLog: { create: async ({ data }) => { if (fail) throw new Error('audit unavailable'); audits.push(data); } } };
  const identity = { atomic: async work => { const before = trainer; try { return await work(tx); } catch (error) { trainer = before; throw error; } } };
  const service = new TrainersService({}, identity);
  const actor = { id: 'actor', email: 'admin@test' };
  await service.update('trainer', { commissionPercent: 100 }, actor);
  assert.equal(audits[0].actorId, actor.id);
  assert.deepEqual(audits[0].details, { trainerId: 'trainer', before: '30.00', after: '100' });
  fail = true;
  await assert.rejects(() => service.update('trainer', { commissionPercent: 0 }, actor), /audit unavailable/);
  assert.equal(trainer.commissionPercent.toNumber(), 100);
});
