const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Prisma } = require('@prisma/client');
const { MembershipsService } = require('../dist/memberships/memberships.service');
const { CreateMembershipDto } = require('../dist/memberships/dto/create-membership.dto');

const actor = { id: '00000000-0000-4000-8000-000000000001', role: 'ADMIN' };
const sale = { clientId: '00000000-0000-4000-8000-000000000002', serviceId: '00000000-0000-4000-8000-000000000003',
  totalLessons: 8, totalPrice: 9500.25, paymentMethod: 'CASH', validUntil: '2099-12-31T20:59:00Z',
  requestId: '00000000-0000-4000-8000-000000000004' };

function fixture(options = {}) {
  let committed = { memberships: [], payments: [], ledger: [] };
  let calls = 0;
  const errors = [];
  // Only transaction delegates may write; a failed callback discards all staged data.
  const prisma = { $transaction: async (work, config) => {
    assert.equal(config.isolationLevel, 'Serializable'); calls++;
    if (options.transientError && (calls === 1 || options.alwaysFail)) throw options.transientError;
    const staged = Object.fromEntries(Object.entries(committed).map(([key, rows]) => [key, [...rows]]));
    const tx = {
      $queryRaw: async () => [],
      clubModuleSettings: { findUnique: async () => options.disabled ? { isEnabled: false } : null },
      roleModulePermission: { findUnique: async () => ({ accessLevel: options.access || 'FULL' }) },
      client: { findUnique: async () => options.missingClient ? null : { id: sale.clientId } },
      service: { findUnique: async () => options.missingService ? null : { id: sale.serviceId, title: 'Выездка', price: new Prisma.Decimal('1250.15'), allowMembership: options.allowMembership !== false } },
      pricingPlan: { findUnique: async () => null },
      membership: {
        findUnique: async ({ where }) => staged.memberships.find(row => row.saleRequestId === where.saleRequestId),
        create: async ({ data }) => {
          const row = { ...data, id: 'membership', client: { id: sale.clientId }, pricingPlan: null };
          staged.memberships.push(row);
          // Simulate the database's AFTER INSERT trigger, including its unique source.
          if (options.creditError) throw new Error('credit projection unavailable');
          staged.ledger.push({ sourceMembershipOpId: data.operations.create.id, membershipId: row.id, amount: data.totalLessons });
          return row;
        },
      },
      cashShift: { findFirst: async () => ({ id: 'shift' }) },
      payment: { create: async ({ data }) => {
        if (options.paymentError) throw new Error('cashbox unavailable');
        const row = { ...data, id: 'receipt' }; staged.payments.push(row); return row;
      } },
      ledgerTransaction: { create: async ({ data }) => {
        if (staged.ledger.some(row => data.sourceMembershipOpId && row.sourceMembershipOpId === data.sourceMembershipOpId))
          throw new Prisma.PrismaClientKnownRequestError('Duplicate trigger projection', { code: 'P2002', clientVersion: '6.19.3', meta: { target: ['sourceMembershipOpId'] } });
        if (options.ledgerError && data.cashDeskPaymentId || options.creditError && data.sourceMembershipOpId) throw new Error('ledger unavailable');
        staged.ledger.push(data); return data;
      } },
    };
    const result = await work(tx);
    committed = staged;
    return result;
  } };
  const service = new MembershipsService(prisma);
  service.logger.error = (...args) => errors.push(args);
  return { service, state: () => committed, calls: () => calls, errors };
}

for (const method of ['CASH', 'CARD']) test(`sale atomically posts discounted ${method} receipt and linked ledger`, async () => {
  const f = fixture();
  const result = await f.service.create({ ...sale, paymentMethod: method }, actor);
  assert.equal(f.calls(), 1);
  assert.equal(result.pricePerLesson.toString(), '1250.15');
  assert.equal(result.totalPrice.toString(), '9500.25');
  assert.equal(result.remainingUnits, 8);
  assert.equal(result.remainedLessons, 8);
  assert.equal(result.validTo.toISOString(), new Date(sale.validUntil).toISOString());
  assert.equal(result.cashboxPosted, true);
  const [payment] = f.state().payments;
  assert.equal(payment.method, method);
  assert.equal(payment.amount.toString(), '9500.25');
  assert.equal(payment.status, 'PAID');
  assert.equal(payment.membershipId, result.id);
  assert.equal(payment.cashierId, actor.id);
  assert.equal(payment.shiftId, 'shift');
  assert.equal(payment.description, 'Оплата абонемента: Выездка (8 зан.)');
  assert.equal(payment.serviceType, 'MEMBERSHIP');
  assert.equal(f.state().ledger[0].amount, 8);
  assert.ok(f.state().ledger[0].sourceMembershipOpId);
  assert.equal(f.state().ledger[1].cashDeskPaymentId, payment.id);
  assert.equal(f.state().ledger[1].membershipId, result.id);
});

for (const failure of ['paymentError', 'ledgerError', 'creditError']) test(`${failure} rolls back membership, receipt and journal`, async () => {
  const options = { [failure]: true };
  const f = fixture(options);
  await assert.rejects(f.service.create(sale, actor), error => error.getStatus() === 503);
  assert.deepEqual(f.state(), { memberships: [], payments: [], ledger: [] });
  assert.equal(f.errors.length, 1);
  assert.ok(f.errors[0][0].stage);
  assert.match(f.errors[0][1], /unavailable/);
  // A rollback did not reserve the operation key.
  options[failure] = false;
  await f.service.create(sale, actor);
  assert.equal(f.state().memberships.length, 1);
  assert.equal(f.state().payments.length, 1);
});

for (const [code, status] of [['P2002', 409], ['P2003', 409], ['P2025', 409], ['P2021', 503], ['P2022', 503]]) test(`${code} reports a known rollback without generic 500 or blind retries`, async () => {
  const failure = new Prisma.PrismaClientKnownRequestError('sale persistence failed', { code, clientVersion: '6.19.3', meta: { target: ['sourceMembershipOpId'] } });
  const f = fixture({ transientError: failure, alwaysFail: true });
  await assert.rejects(f.service.create(sale, actor), error => {
    assert.equal(error.getStatus(), status);
    assert.equal(error.getResponse().details.rollbackConfirmed, true);
    return true;
  });
  assert.equal(f.calls(), 1);
  assert.equal(f.errors[0][0].prismaCode, code);
  assert.equal(f.errors[0][0].requestId, sale.requestId);
});

test('disabled cashbox issues membership without any cash record', async () => {
  const f = fixture({ disabled: true });
  const result = await f.service.create(sale, actor);
  assert.equal(result.cashboxPosted, false);
  assert.equal(f.state().memberships.length, 1);
  assert.equal(f.state().payments.length, 0);
  assert.equal(f.state().ledger.length, 1);
  assert.equal(f.state().ledger[0].amount, 8);
  assert.equal(f.state().ledger[0].cashDeskPaymentId, undefined);
});

test('zero-price sale is accepted and posted when cashbox is enabled', async () => {
  const f = fixture();
  await f.service.create({ ...sale, totalPrice: 0 }, actor);
  assert.equal(f.state().payments[0].amount.toString(), '0');
});

test('same request returns original sale; changed payload is rejected', async () => {
  const f = fixture();
  await f.service.create(sale, actor);
  await f.service.create(sale, actor);
  assert.equal(f.state().memberships.length, 1);
  assert.equal(f.state().payments.length, 1);
  await assert.rejects(f.service.create({ ...sale, totalPrice: 1 }, actor), error => error.getStatus() === 409);
});

for (const code of ['P2034', 'P2002']) test(`${code} retries safely within the bounded transaction loop`, async () => {
  const failure = new Prisma.PrismaClientKnownRequestError('concurrent sale', { code, clientVersion: '6.19.3', meta: { target: ['saleRequestId'] } });
  const f = fixture({ transientError: failure });
  await f.service.create(sale, actor);
  assert.equal(f.calls(), 2);
  assert.equal(f.state().payments.length, 1);
  const exhausted = fixture({ transientError: failure, alwaysFail: true });
  await assert.rejects(exhausted.service.create(sale, actor));
  assert.equal(exhausted.calls(), 5);
  assert.equal(exhausted.state().memberships.length, 0);
});

for (const access of ['READ_ONLY', 'HIDDEN']) test(`${access} cannot bypass cash permissions through membership sale`, async () => {
  const f = fixture({ access });
  await assert.rejects(f.service.create(sale, { ...actor, role: 'MANAGER' }), error => error.getStatus() === 403);
  assert.equal(f.state().memberships.length, 0);
});

for (const options of [{ missingClient: true }, { missingService: true }, { allowMembership: false }]) test(`invalid relation ${JSON.stringify(options)} leaves no sale`, async () => {
  const f = fixture(options);
  await assert.rejects(f.service.create(sale, actor));
  assert.equal(f.state().memberships.length, 0);
});

test('DTO validates UUIDs, counts, finite two-decimal amounts and payment method', async () => {
  assert.equal((await validate(plainToInstance(CreateMembershipDto, sale))).length, 0);
  for (const patch of [{ clientId: 'bad' }, { serviceId: 'bad' }, { totalLessons: 0 }, { totalLessons: 1.5 },
    { totalPrice: -1 }, { totalPrice: 1.001 }, { totalPrice: Infinity }, { totalPrice: undefined }, { paymentMethod: 'SBP' }]) {
    assert.ok((await validate(plainToInstance(CreateMembershipDto, { ...sale, ...patch }))).length > 0, JSON.stringify(patch));
  }
  const dto = plainToInstance(CreateMembershipDto, { ...sale, pricingPlanId: '', serviceId: '', requestId: '' });
  assert.equal(dto.pricingPlanId, undefined);
  assert.equal(dto.serviceId, undefined);
  assert.equal(dto.requestId, undefined);
});

test('HTTP sale validates input, prevents actor spoofing and denies TRAINER', async () => {
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  const request = require('supertest');
  const { MembershipsController } = require('../dist/memberships/memberships.controller');
  const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
  const { RolesGuard } = require('../dist/auth/guards/roles.guard');
  let role = 'MANAGER', receivedActor;
  const module = await Test.createTestingModule({ controllers: [MembershipsController], providers: [RolesGuard, {
    provide: MembershipsService, useValue: { create: async (dto, user) => { receivedActor = user; return { id: 'membership', ...dto }; } },
  }] }).overrideGuard(require('../dist/auth/module-access.guard').ModuleAccessGuard).useValue({ canActivate: () => true }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => {
    context.switchToHttp().getRequest().user = { ...actor, role }; return true;
  } }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    await request(app.getHttpServer()).post('/memberships').send(sale).expect(201);
    assert.equal(receivedActor.id, actor.id);
    await request(app.getHttpServer()).post('/memberships').send({ ...sale, soldById: actor.id }).expect(400);
    await request(app.getHttpServer()).post('/memberships').send({ ...sale, paymentMethod: 'SBP' }).expect(400);
    await request(app.getHttpServer()).post('/memberships').send({ ...sale, totalLessons: 0 }).expect(400);
    role = 'TRAINER';
    await request(app.getHttpServer()).post('/memberships').send(sale).expect(403);
  } finally { await app.close(); }
});
