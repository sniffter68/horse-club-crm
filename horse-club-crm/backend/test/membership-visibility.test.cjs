const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { MembershipsService } = require('../dist/memberships/memberships.service');
const { MembershipQueryDto } = require('../dist/memberships/dto/membership-query.dto');

const active = () => ({ id: 'active', remainingUnits: new Prisma.Decimal(1),
  remainedLessons: 1, validFrom: new Date('2020-01-01'), validTo: new Date('2099-01-01'),
  validUntil: new Date('2099-01-01'), status: 'active', cancelledAt: null, deletedAt: null });

test('default and explicit active list use live canonical balance and expiry before pagination', async () => {
  for (const query of [{}, { state: 'active' }]) {
    let predicate;
    const service = new MembershipsService({ $transaction: queries => Promise.all(queries), membership: {
      count: async ({ where }) => { predicate = where; return 1; },
      findMany: async ({ where }) => {
        assert.equal(where, predicate);
        assert.equal(where.deletedAt, null); assert.equal(where.cancelledAt, null);
        assert.equal(where.status, 'active'); assert.deepEqual(where.remainingUnits, { gt: 0 });
        assert.ok(Math.abs(+where.validTo.gte - Date.now()) < 1000);
        assert.equal(+where.validFrom.lte, +where.validTo.gte);
        assert.equal(where.validUntil, undefined);
        return [active()];
      },
    } });
    const result = await service.findAll(query);
    assert.equal(result.total, 1); assert.equal(result.data[0].isActive, true);
  }
});

test('all, exhausted, expired and archive filters preserve inactive records on explicit request', async () => {
  for (const state of ['all', 'exhausted', 'expired', 'archived']) {
    const service = new MembershipsService({ $transaction: queries => Promise.all(queries), membership: {
      count: async () => 1,
      findMany: async ({ where }) => {
        if (state === 'all') {
          assert.equal(where.remainingUnits, undefined); assert.equal(where.validTo, undefined);
          assert.equal(where.cancelledAt, undefined); assert.equal(where.deletedAt, null);
        } else if (state === 'archived') {
          assert.equal(where.deletedAt, undefined);
          assert.deepEqual(where.AND, [{ OR: [{ deletedAt: { not: null } }, { cancelledAt: { not: null } }] }]);
        } else {
          assert.equal(where.cancelledAt, null); assert.equal(where.deletedAt, null);
          if (state === 'exhausted') assert.deepEqual(where.remainingUnits, { lte: 0 });
          else assert.ok(Math.abs(+where.validTo.lt - Date.now()) < 1000);
        }
        return [{ ...active(), remainingUnits: new Prisma.Decimal(0), remainedLessons: 0 }];
      },
    } });
    assert.equal((await service.findAll({ state })).data[0].isActive, false);
  }
});

test('isActive follows real time, cancellation, archive and restored balance on every read', async () => {
  let membership = active();
  const service = new MembershipsService({ membership: { findUnique: async () => membership },
    revenueRecognition: { aggregate: async () => ({ _sum: { amount: null } }) } });
  for (const patch of [{ remainingUnits: new Prisma.Decimal(0) }, { remainingUnits: new Prisma.Decimal(-1) },
    { validTo: new Date(Date.now() - 1) }, { cancelledAt: new Date() }, { deletedAt: new Date() },
    { status: 'frozen' }, { validFrom: new Date('2098-01-01') }]) {
    membership = { ...active(), ...patch };
    assert.equal((await service.findOne('active')).isActive, false);
    membership = active();
    assert.equal((await service.findOne('active')).isActive, true);
  }
});

test('query DTO accepts all statuses and treats empty state as default', () => {
  for (const state of ['all', 'active', 'exhausted', 'expired', 'archived', '']) {
    const dto = plainToInstance(MembershipQueryDto, { state });
    assert.equal(validateSync(dto).length, 0);
    if (!state) assert.equal(dto.state, undefined);
  }
  assert.ok(validateSync(plainToInstance(MembershipQueryDto, { state: 'invalid' })).length);
});
