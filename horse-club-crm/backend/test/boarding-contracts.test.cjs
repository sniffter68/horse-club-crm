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

test('club placement accepts omitted/null client, forces zero rate and creates no payments', async () => {
  for (const clientId of [undefined, null]) {
    const { prisma, state } = createPrisma();
    await new BoardingContractsService(prisma).create({ ...activeContract, clientId, monthlyRate: 25000 });
    assert.equal(state.createArgs.data.clientId, null);
    assert.equal(state.createArgs.data.monthlyRate, 0);
    assert.equal(state.createArgs.data.payments, undefined);
  }
  const { prisma, state } = createPrisma();
  await new BoardingContractsService(prisma).create({ horseId: activeContract.horseId, startsAt: activeContract.startsAt });
  assert.equal(state.createArgs.data.monthlyRate, 0);
  await assert.rejects(new BoardingContractsService(prisma).create({ ...activeContract, monthlyRate: undefined }), error => error.status === 400);
});

test('club update preserves omitted client, supports explicit null, and cannot introduce a club rate', async () => {
  for (const [currentClient, patch, expectedClient] of [
    [activeContract.clientId, { clientId: null }, null],
    [activeContract.clientId, { notes: 'note' }, activeContract.clientId],
    [null, { monthlyRate: 999 }, null],
  ]) {
    let saved;
    const tx = {
      client: { findUnique: async () => ({ id: activeContract.clientId }) },
      horse: { findUnique: async () => ({ id: activeContract.horseId }) },
      stall: { findUnique: async () => ({ id: activeContract.stallId, isUnavailable: false }) },
      boardingContract: {
        findUnique: async () => ({ ...activeContract, clientId: currentClient, startsAt: new Date(activeContract.startsAt), endsAt: null }),
        findFirst: async () => null,
        update: async args => { saved = args.data; return args.data; },
      },
    };
    await new BoardingContractsService({ $transaction: async fn => fn(tx) }).update('contract', patch);
    assert.equal(saved.clientId, expectedClient);
    assert.equal(saved.monthlyRate, expectedClient ? 25000 : 0);
    assert.equal(saved.payments, undefined);
  }
});

test('manual payments cannot be linked to club placement', async () => {
  const { PaymentsService } = require('../dist/payments/payments.service');
  const service = new PaymentsService({ boardingContract: { findUnique: async () => ({ clientId: null, monthlyRate: { toNumber: () => 0 } }) },
    payment: { create: async () => assert.fail('club payment must not be created') } });
  await assert.rejects(service.create({ boardingContractId: 'contract', clientId: activeContract.clientId, amount: 100, method: 'CASH' }), error => error.status === 409);
});

test('boarding DTO accepts club placement and still validates private UUIDs and rates', async () => {
  const { ValidationPipe } = require('@nestjs/common');
  const { CreateBoardingContractDto } = require('../dist/boarding-contracts/dto/create-boarding-contract.dto');
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata = { type: 'body', metatype: CreateBoardingContractDto };
  const club = { horseId: activeContract.horseId, startsAt: activeContract.startsAt, clientId: null };
  await pipe.transform(club, metadata);
  await pipe.transform({ horseId: club.horseId, startsAt: club.startsAt }, metadata);
  for (const patch of [{ clientId: 'invalid' }, { monthlyRate: -1 }, { monthlyRate: 1.234 }, { monthlyRate: '25000' }]) {
    await assert.rejects(pipe.transform({ ...club, ...patch }, metadata), error => error.status === 400);
  }
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

test('quick placement excludes active/suspended and future reservations but allows drafts and contracts ending at the start', async () => {
  const start = new Date('2026-10-08T09:00:00Z');
  const fixtures = [
    { id: 'occupied', status: 'ACTIVE', startsAt: new Date('2026-01-01Z'), endsAt: null },
    { id: 'future', status: 'ACTIVE', startsAt: new Date('2026-11-01Z'), endsAt: null },
    { id: 'suspended', status: 'SUSPENDED', startsAt: new Date('2026-01-01Z'), endsAt: null },
    { id: 'draft', status: 'DRAFT', startsAt: new Date('2026-01-01Z'), endsAt: null },
    { id: 'ended', status: 'ACTIVE', startsAt: new Date('2026-01-01Z'), endsAt: start },
    { id: 'terminated', status: 'TERMINATED', startsAt: new Date('2026-01-01Z'), endsAt: null },
  ];
  const match = (contract, filter) => filter.status.in.includes(contract.status)
    && filter.OR.some(clause => clause.endsAt === null ? contract.endsAt === null : contract.endsAt > clause.endsAt.gt);
  const tx = {
    horse: { findMany: async ({ where }) => fixtures.filter(row => !match(row, where.boardingContracts.none)).map(row => ({ id: row.id, name: row.id, boardingContracts: row.id === 'ended' ? [{ clientId: activeContract.clientId }] : [] })) },
    stall: { findMany: async ({ where }) => {
      assert.equal(where.isUnavailable, false);
      return fixtures.filter(row => !match(row, where.contracts.none)).map(row => ({ id: row.id, name: row.id }));
    } },
  };
  const service = new BoardingContractsService({ $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead'); return fn(tx);
  } });
  const result = await service.availability(start.toISOString());
  assert.deepEqual(result.horses.map(row => row.id), ['draft', 'ended', 'terminated']);
  assert.equal(result.horses[1].ownerClientId, activeContract.clientId);
  assert.equal(result.horses[0].ownerClientId, null);
  assert.deepEqual(result.stalls.map(row => row.id), ['draft', 'ended', 'terminated']);
  await assert.rejects(service.availability('invalid'), error => error.status === 400);
});

test('quick release preserves rate/parties/payments, closes unavailable stalls and is idempotent', async () => {
  let writes = 0;
  const contract = { ...activeContract, id: 'contract', startsAt: new Date('2026-01-01Z'), endsAt: null, payments: [{ id: 'payment', status: 'PENDING' }], stall: { isUnavailable: true } };
  const tx = { boardingContract: {
    findUnique: async () => contract,
    update: async ({ data }) => { writes++; assert.deepEqual(Object.keys(data).sort(), ['endsAt', 'status']); Object.assign(contract, data); return contract; },
  } };
  const service = new BoardingContractsService({ $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); return fn(tx);
  } });
  const before = Date.now();
  await service.terminate(contract.id);
  const end = contract.endsAt;
  assert.equal(contract.status, 'TERMINATED'); assert.ok(end.getTime() >= before && end.getTime() <= Date.now());
  await service.terminate(contract.id);
  assert.equal(writes, 1); assert.equal(contract.endsAt, end); assert.equal(contract.monthlyRate, 25000);
  assert.deepEqual(contract.payments, [{ id: 'payment', status: 'PENDING' }]);
});

for (const [name, patch] of [['draft', { status: 'DRAFT' }], ['expired', { status: 'EXPIRED' }], ['future', { startsAt: new Date('2099-01-01Z') }], ['ended', { endsAt: new Date('2026-01-02Z') }]]) {
  test(`quick release rejects ${name} without changing contract`, async () => {
    const tx = { boardingContract: { findUnique: async () => ({ ...activeContract, startsAt: new Date('2026-01-01Z'), endsAt: null, ...patch }),
      update: async () => assert.fail('must not mutate') } };
    await assert.rejects(new BoardingContractsService({ $transaction: async fn => fn(tx) }).terminate('contract'), error => error.status === 409);
  });
}

test('horse card includes current boarding even when more than twenty newer historical contracts exist', async () => {
  const { HorsesService } = require('../dist/horses/horses.service');
  const current = { id: 'current', status: 'ACTIVE' };
  const service = new HorsesService({ horse: { findUnique: async () => ({ id: 'horse', boardingContracts: Array.from({ length: 20 }, (_, id) => ({ id: String(id), status: 'TERMINATED' })) }) },
    boardingContract: { findFirst: async ({ where }) => {
      assert.equal(where.horseId, 'horse'); assert.deepEqual(where.status.in, ['ACTIVE', 'SUSPENDED']);
      assert.ok(where.startsAt.lte instanceof Date); return current;
    } } });
  const result = await service.findOne('horse');
  assert.equal(result.currentBoardingContract.id, 'current'); assert.equal(result.boardingContracts[0].id, 'current');
});

test('quick boarding HTTP endpoints validate dates and restrict changes to ADMIN/MANAGER', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { BoardingContractsController } = require('../dist/boarding-contracts/boarding-contracts.controller');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  const calls = [];
  const module = await Test.createTestingModule({ controllers: [BoardingContractsController], providers: [RolesGuard,
    { provide: BoardingContractsService, useValue: {
      availability: async value => { calls.push(value); return { horses: [], stalls: [] }; },
      terminate: async value => { calls.push(value); return { id: value, status: 'TERMINATED' }; },
    } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] }; return true;
  } }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  try {
    await request(app.getHttpServer()).get('/boarding-contracts/availability?startsAt=2026-10-08T09:00:00Z').set('x-role', 'TRAINER').expect(403);
    await request(app.getHttpServer()).get('/boarding-contracts/availability').set('x-role', 'ADMIN').expect(400);
    await request(app.getHttpServer()).get('/boarding-contracts/availability?startsAt=invalid').set('x-role', 'ADMIN').expect(400);
    await request(app.getHttpServer()).get('/boarding-contracts/availability?startsAt=2026-10-08T09:00:00Z').set('x-role', 'MANAGER').expect(200);
    const path = `/boarding-contracts/${activeContract.horseId}/terminate`;
    await request(app.getHttpServer()).post(path).set('x-role', 'TRAINER').expect(403);
    await request(app.getHttpServer()).post('/boarding-contracts/invalid/terminate').set('x-role', 'ADMIN').expect(400);
    await request(app.getHttpServer()).post(path).set('x-role', 'MANAGER').expect(201);
    assert.deepEqual(calls, ['2026-10-08T09:00:00Z', activeContract.horseId]);
  } finally { await app.close(); }
});
