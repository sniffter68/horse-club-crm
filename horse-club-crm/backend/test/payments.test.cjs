const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { AuthModule } = require('../dist/auth/auth.module');
const { PaymentsModule } = require('../dist/payments/payments.module');
const { PaymentsService } = require('../dist/payments/payments.service');

test('payments module imports authentication providers for its guards', () => {
  const imports = Reflect.getMetadata('imports', PaymentsModule) ?? [];
  assert.ok(imports.includes(AuthModule));
});

test('boarding payment derives client and monthly rate without fiscal integrations', async () => {
  let createArgs;
  const prisma = {
    boardingContract: { findUnique: async () => ({ clientId: 'client-1', monthlyRate: { toNumber: () => 25000 } }) },
    client: { findUnique: async () => ({ id: 'client-1' }) },
    payment: { create: async args => { createArgs = args; return { id: 'payment-1', ...args.data }; } },
  };
  await new PaymentsService(prisma).create({
    boardingContractId: '8e5e03af-cb29-4689-be60-a07188174e26',
    method: 'TRANSFER',
    status: 'PAID',
    description: '  Постой за сентябрь  ',
  });
  assert.equal(createArgs.data.clientId, 'client-1');
  assert.equal(createArgs.data.amount, 25000);
  assert.equal(createArgs.data.description, 'Постой за сентябрь');
  assert.ok(createArgs.data.paidAt instanceof Date);
});

test('payment cannot reference a booking and boarding contract simultaneously', async () => {
  const service = new PaymentsService({});
  await assert.rejects(
    () => service.create({
      bookingId: '9dc6e50b-2779-4f9f-a4dd-a01199a4c239',
      boardingContractId: '8e5e03af-cb29-4689-be60-a07188174e26',
      method: 'CASH',
    }),
    error => error.status === 400 && error.message === 'Платёж нельзя одновременно связать с занятием и договором постоя',
  );
});

test('manual payment requires a client and positive amount', async () => {
  const service = new PaymentsService({});
  await assert.rejects(
    () => service.create({ method: 'CARD', amount: 1000 }),
    error => error.status === 400 && error.message === 'Укажите клиента или выберите связанную запись',
  );
});
