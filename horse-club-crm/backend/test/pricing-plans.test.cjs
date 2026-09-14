const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { PricingPlansService } = require('../dist/pricing-plans/pricing-plans.service');
const { MembershipsService } = require('../dist/memberships/memberships.service');

test('pricing plan creation normalizes its name', async () => {
  let saved;
  const prisma = {
    pricingPlan: {
      findFirst: async () => null,
      create: async ({ data }) => { saved = data; return { id: 'plan-1', ...data }; },
    },
  };
  const result = await new PricingPlansService(prisma).create({ name: '  8   занятий  ', totalLessons: 8, validDays: 30, price: 24000 });
  assert.equal(saved.name, '8 занятий');
  assert.equal(result.totalLessons, 8);
});

test('membership issue uses selected pricing plan values', async () => {
  let saved;
  const prisma = {
    client: { findUnique: async () => ({ id: 'client-1' }) },
    pricingPlan: { findUnique: async () => ({ id: 'plan-1', name: '8 занятий', totalLessons: 8, validDays: 30, price: 24000 }) },
    membership: { create: async ({ data }) => {
      saved = data;
      return { id: 'membership-1', ...data, client: { id: 'client-1' }, pricingPlan: { id: 'plan-1' }, createdAt: new Date(), updatedAt: new Date() };
    } },
  };
  const before = Date.now();
  const result = await new MembershipsService(prisma).create({ clientId: 'client-1', pricingPlanId: 'plan-1' });
  assert.equal(saved.pricingPlanId, 'plan-1');
  assert.deepEqual(saved.payments, { create: {
    clientId: 'client-1', amount: 24000, method: 'UNSPECIFIED', status: 'PENDING',
    description: 'Продажа абонемента: 8 занятий',
  } });
  assert.equal(saved.totalLessons, 8);
  assert.equal(saved.remainedLessons, 8);
  assert.ok(saved.validUntil.getTime() >= before + 29 * 86_400_000);
  assert.equal(result.isActive, true);
});
