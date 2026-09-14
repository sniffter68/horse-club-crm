const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { AuthModule } = require('../dist/auth/auth.module');
const { BoardingContractsModule } = require('../dist/boarding-contracts/boarding-contracts.module');
const { BoardingContractsService } = require('../dist/boarding-contracts/boarding-contracts.service');

test('boarding contracts module imports authentication providers for its guards', () => {
  const imports = Reflect.getMetadata('imports', BoardingContractsModule) ?? [];
  assert.ok(imports.includes(AuthModule));
});

function createPrisma({ stallUnavailable = false, conflicts = [] } = {}) {
  const state = { createArgs: undefined, transactionOptions: undefined, findFirstArgs: [] };
  const tx = {
    client: { findUnique: async () => ({ id: 'client-1' }) },
    horse: { findUnique: async () => ({ id: 'horse-1' }) },
    stall: { findUnique: async () => ({ id: 'stall-1', isUnavailable: stallUnavailable }) },
    boardingContract: {
      findFirst: async args => { state.findFirstArgs.push(args); return conflicts.shift() ?? null; },
      create: async args => { state.createArgs = args; return { id: 'contract-1', ...args.data }; },
    },
  };
  return {
    state,
    prisma: {
      $transaction: async (operation, options) => {
        state.transactionOptions = options;
        return operation(tx);
      },
    },
  };
}

const activeContract = {
  clientId: '9dc6e50b-2779-4f9f-a4dd-a01199a4c239',
  horseId: '8f7fb395-fbcc-46bb-82d9-5f84985e5c5c',
  stallId: '8e5e03af-cb29-4689-be60-a07188174e26',
  status: 'ACTIVE',
  startsAt: '2026-09-15T09:00:00.000Z',
  endsAt: '2026-10-15T09:00:00.000Z',
  monthlyRate: 25000,
};

test('active boarding contract is created in a serializable transaction', async () => {
  const { prisma, state } = createPrisma();
  await new BoardingContractsService(prisma).create({ ...activeContract, notes: '  Полный пансион  ' });
  assert.equal(state.transactionOptions.isolationLevel, 'Serializable');
  assert.equal(state.createArgs.data.notes, 'Полный пансион');
  assert.deepEqual(state.createArgs.data.payments, { create: {
    clientId: activeContract.clientId,
    amount: activeContract.monthlyRate,
    method: 'UNSPECIFIED',
    status: 'PENDING',
    description: 'Начисление за первый месяц постоя',
  } });
  assert.equal(state.findFirstArgs.length, 2);
  assert.equal(state.findFirstArgs[0].where.horseId, activeContract.horseId);
  assert.equal(state.findFirstArgs[1].where.stallId, activeContract.stallId);
});

test('unavailable stall cannot be assigned to a boarding contract', async () => {
  const { prisma } = createPrisma({ stallUnavailable: true });
  await assert.rejects(
    () => new BoardingContractsService(prisma).create(activeContract),
    error => error.status === 409 && error.message === 'Выбранный денник недоступен',
  );
});

test('overlapping active contract for the same horse is rejected', async () => {
  const { prisma } = createPrisma({ conflicts: [{ id: 'existing-contract' }] });
  await assert.rejects(
    () => new BoardingContractsService(prisma).create(activeContract),
    error => error.status === 409 && error.message === 'У лошади уже есть пересекающийся договор постоя',
  );
});

test('contract end date must be after its start date', async () => {
  const { prisma } = createPrisma();
  await assert.rejects(
    () => new BoardingContractsService(prisma).create({
      ...activeContract,
      endsAt: activeContract.startsAt,
    }),
    error => error.status === 400 && error.message === 'Дата окончания должна быть позже даты начала',
  );
});
