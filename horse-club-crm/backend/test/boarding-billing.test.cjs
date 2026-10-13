const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { BoardingBillingService, billingMonth } = require('../dist/boarding/boarding.service');
const { vetStatus } = require('../dist/boarding/vet-calendar.service');

test('monthly billing is idempotent for a contract and club-local month', async () => {
  const rows = [];
  const contract = { id: 'contract', status: 'ACTIVE', clientId: 'owner', stallId: 'stall', horse: { name: 'Horse', ownerType: 'private' },
    startsAt: new Date('2020-01-01'), endsAt: null, monthlyRate: new Prisma.Decimal('25000.50') };
  const tx = { $queryRaw: async () => [], boardingContract: { findUniqueOrThrow: async () => contract },
    ledgerTransaction: { findUnique: async ({ where }) => rows.find(r => r.billingMonth === where.boardingContractId_billingMonth.billingMonth),
      create: async ({ data }) => { rows.push(data); return data; } } };
  const service = new BoardingBillingService({ boardingContract: { findMany: async () => [{ id: contract.id }] }, $transaction: async fn => fn(tx) });
  assert.equal((await service.triggerMonthlyBoardingBilling(new Date('2026-10-20'))).charged, 1);
  assert.equal((await service.triggerMonthlyBoardingBilling(new Date('2026-10-21'))).charged, 0);
  assert.equal((await service.triggerMonthlyBoardingBilling(new Date('2026-11-01'))).charged, 1);
  assert.equal(rows[0].amount.toString(), '-25000.5');
  assert.equal(billingMonth(new Date('2026-10-31T22:00:00Z')), '2026-11');
  contract.clientId = null;
  assert.equal((await service.triggerMonthlyBoardingBilling(new Date('2026-12-01'))).charged, 0);
});
test('vet overdue is based on club calendar date, completed remains completed', () => {
  const now = new Date('2026-10-08T22:00:00Z');
  assert.equal(vetStatus({ status: 'scheduled', eventDate: new Date('2026-10-08T23:00:00Z') }, now), 'scheduled');
  assert.equal(vetStatus({ status: 'scheduled', eventDate: new Date('2026-10-08T09:00:00Z') }, now), 'overdue');
  assert.equal(vetStatus({ status: 'completed', eventDate: new Date('2026-10-08T09:00:00Z') }, now), 'completed');
});
