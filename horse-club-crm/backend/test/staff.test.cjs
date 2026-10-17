require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Prisma } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const dto = require('../dist/staff/staff.dto');
const { StaffService, payrollAmounts, payrollDay, payrollRange } = require('../dist/staff/staff.service');
const { StaffController, PayrollController } = require('../dist/staff/staff.controller');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const admin = { id: randomUUID(), role: 'ADMIN' };
const staffId = randomUUID();
const shift = { staffId, date: '2026-10-01', startTime: '08:00', endTime: '20:00' };

test('staff DTO validates shifts, batch limits, kopecks, rates and payout methods', async () => {
  for (const valid of [shift, { ...shift, date: undefined, dates: ['2026-10-01', '2026-10-02'] }]) assert.equal((await validate(plainToInstance(dto.CreateShiftDto, valid))).length, 0);
  for (const invalid of [{ ...shift, startTime: '24:00' }, { ...shift, endTime: '8:00' }, { ...shift, staffId: 'bad' }, { ...shift, dates: ['2026-10-01', '2026-10-01'] }, { ...shift, dates: Array(32).fill('2026-10-01') }]) assert.ok((await validate(plainToInstance(dto.CreateShiftDto, invalid))).length);
  const profile = { userId: randomUUID(), fullName: 'Иван Иванов', roleTitle: 'Конюх', shiftRate: 1200.1, lessonPercentage: 20 };
  assert.equal((await validate(plainToInstance(dto.StaffProfileDto, profile))).length, 0);
  for (const values of [{ lessonPercentage: 101 }, { shiftRate: -1 }, { lessonRate: 1.001 }, { fullName: '  ' }]) assert.ok((await validate(plainToInstance(dto.StaffProfileDto, { ...profile, ...values }))).length);
  assert.ok((await validate(plainToInstance(dto.StaffProfileDto, { ...profile, isActive: 'false' }, { enableImplicitConversion: true }))).length);
  for (const values of [{ bonuses: -1 }, { penalties: 0.001 }, { from: 'wrong' }]) assert.ok((await validate(plainToInstance(dto.SavePayrollDto, { staffId, from: '2026-10-01', to: '2026-10-31', bonuses: 0, penalties: 0, ...values }))).length);
  for (const values of [{ expectedTotal: 0 }, { paymentMethod: 'TRANSFER' }]) assert.ok((await validate(plainToInstance(dto.PayoutDto, { calculationId: randomUUID(), expectedTotal: 100, paymentMethod: 'CASH', ...values }))).length);
});
test('query converts numbers, empty strings become undefined, invalid pagination is rejected', async () => {
  const query = plainToInstance(dto.ShiftQueryDto, { page: '2', pageSize: '10', staffId: '', status: '' });
  assert.equal(query.page, 2); assert.equal(query.pageSize, 10); assert.equal(query.staffId, undefined);
  assert.equal((await validate(query)).length, 0);
  const empty = plainToInstance(dto.ShiftQueryDto, { page: '', pageSize: '' });
  assert.equal(empty.page, undefined); assert.equal(empty.pageSize, undefined); assert.equal((await validate(empty)).length, 0);
  for (const page of ['-1', '0', '1.5', 'bad']) assert.ok((await validate(plainToInstance(dto.ShiftQueryDto, { page }))).length);
});
test('business days include the entire Moscow end date and reject invalid/reversed/oversize ranges', () => {
  assert.equal(payrollDay('2026-10-01').toISOString(), '2026-10-01T00:00:00.000Z');
  const range = payrollRange('2026-10-01', '2026-10-31');
  assert.equal(range.start.toISOString(), '2026-09-30T21:00:00.000Z'); assert.equal(range.end.toISOString(), '2026-10-31T21:00:00.000Z');
  for (const [from, to] of [['2026-02-30', '2026-03-01'], ['2026-10-02', '2026-10-01'], ['2025-01-01', '2026-10-01']]) assert.throws(() => payrollRange(from, to), e => e.status === 400);
});
test('precise decimal formula, group fixed rate once per lesson, additive percentage and adjustment', () => {
  const result = payrollAmounts(2, { shiftRate: new Prisma.Decimal('1500.10'), lessonRate: new Prisma.Decimal('400.20'), groupLessonRate: new Prisma.Decimal('700.30'), lessonPercentage: new Prisma.Decimal('12.5') }, [
    { bookings: [{ costAmount: new Prisma.Decimal('1000.10') }] }, { bookings: [{ costAmount: new Prisma.Decimal('1000.10') }, { costAmount: new Prisma.Decimal('2000.20') }] },
  ], '100.10', '50.20');
  assert.equal(result.shiftsTotal.toFixed(2), '3000.20'); assert.equal(result.lessonsTotal.toFixed(2), '1600.55'); assert.equal(result.totalAmount.toFixed(2), '4650.65'); assert.equal(result.lessonsCount, 2);
  assert.equal(payrollAmounts(0, { lessonRate: new Prisma.Decimal('100') }, [{ bookings: [{ costAmount: new Prisma.Decimal(0) }, { costAmount: new Prisma.Decimal(0) }] }]).totalAmount.toString(), '100');
});
test('trainer is scoped to own profiles and shifts, foreign identifiers are forbidden including when profile is missing', async () => {
  const seen = [];
  const tx = { staffProfile: { findUnique: async () => ({ id: staffId }), findMany: async ({ where }) => { seen.push(where); return []; }, count: async () => 0 }, workShift: { findMany: async ({ where }) => { seen.push(where); return []; }, count: async () => 0 } };
  const service = new StaffService({ $transaction: work => work(tx) });
  const trainer = { id: randomUUID(), role: 'TRAINER' };
  await service.profiles(trainer, {}); await service.shifts({ from: '2026-10-01', to: '2026-10-31' }, trainer);
  assert.equal(seen[0].id, staffId); assert.equal(seen[1].staffId, staffId);
  await assert.rejects(() => service.calculate({ staffId: randomUUID(), from: '2026-10-01', to: '2026-10-31' }, trainer), e => e.status === 403);
  tx.staffProfile.findUnique = async () => null;
  await service.profiles(trainer, {}); assert.equal(seen.at(-1).id, '00000000-0000-0000-0000-000000000000');
  assert.throws(() => service.createShifts(shift, trainer), e => e.status === 403);
});
test('invalid shift range, future completion, paid shift modification and manager deletion are rejected', async () => {
  let paid = false;
  const service = new StaffService({ $transaction: work => work({ workShift: { findUnique: async () => ({ ...shift, date: new Date('2099-01-01'), id: 'shift' }) }, payrollCalculation: { findFirst: async () => paid ? { id: 'paid' } : null } }) });
  assert.throws(() => service.createShifts({ ...shift, endTime: '07:00' }, admin), e => e.status === 400);
  assert.throws(() => service.createShifts({ ...shift, dates: ['2026-10-01'] }, admin), e => e.status === 400);
  await assert.rejects(() => service.changeShift('shift', { status: 'COMPLETED' }, admin), e => e.status === 400);
  paid = true; await assert.rejects(() => service.changeShift('shift', { status: 'SICK' }, admin), e => e.status === 409);
  assert.throws(() => service.changeShift('shift', null, { ...admin, role: 'MANAGER' }), e => e.status === 403);
});
test('HTTP RBAC and validation: trainers read only, managers cannot delete, authors cannot be spoofed', async () => {
  let role = 'TRAINER', received;
  const module = await Test.createTestingModule({ controllers: [StaffController, PayrollController], providers: [RolesGuard, { provide: StaffService, useValue: {
    profiles: async () => ({ data: [], total: 0 }), shifts: async () => ({ data: [], total: 0 }), calculate: async () => ({ data: [], total: 0 }),
    createShifts: async (dto, user) => { received = user.id; return { count: 1 }; }, changeShift: async () => ({}), payout: async () => ({}),
  } }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => { context.switchToHttp().getRequest().user = { ...admin, role }; return true; } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  try {
    const server = app.getHttpServer();
    await request(server).get('/api/staff/shifts?from=2026-10-01&to=2026-10-31&page=&status=').expect(200);
    await request(server).post('/api/staff/shifts').send(shift).expect(403);
    await request(server).patch(`/api/staff/shifts/${randomUUID()}`).send({ status: 'COMPLETED' }).expect(403);
    await request(server).post('/api/payroll/payout').send({}).expect(403);
    await request(server).get('/api/staff/candidates').expect(403);
    role = 'MANAGER'; await request(server).post('/api/staff/shifts').send(shift).expect(201); assert.equal(received, admin.id);
    await request(server).post('/api/staff/shifts').send({ ...shift, createdById: randomUUID() }).expect(400);
    await request(server).delete(`/api/staff/shifts/${randomUUID()}`).expect(403);
    await request(server).get('/api/staff?page=0').expect(400);
    await request(server).post('/api/payroll/payout').send({ calculationId: randomUUID(), expectedTotal: 1, paymentMethod: 'TRANSFER' }).expect(400);
    role = 'ADMIN'; await request(server).delete(`/api/staff/shifts/${randomUUID()}`).expect(200);
  } finally { await app.close(); }
});
