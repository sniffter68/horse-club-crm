require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { UpdateClientDto } = require('../dist/clients/dto/update-client.dto');
const { UpdateHorseDto } = require('../dist/horses/dto/update-horse.dto');
const { UpdateTrainerDto } = require('../dist/trainers/dto/update-trainer.dto');
const { UpdateStaffProfileDto } = require('../dist/staff/staff.dto');
const { HorsesService } = require('../dist/horses/horses.service');
const { TrainersService } = require('../dist/trainers/trainers.service');
const { ClientsService } = require('../dist/clients/clients.service');
const { StaffService } = require('../dist/staff/staff.service');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { Reflector } = require('@nestjs/core');
const { HorsesController } = require('../dist/horses/horses.controller');
const { TrainersController } = require('../dist/trainers/trainers.controller');

test('catalog mutations enforce their module and trainer rates additionally enforce payroll', async () => {
  async function check(Controller, method, body, levels) {
    const guard = new ModuleAccessGuard(new Reflector(), { forRole: async () => Object.entries(levels).map(([module, accessLevel]) => ({ module, isEnabled: true, accessLevel })) });
    return guard.canActivate({ getHandler: () => Controller.prototype[method], getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => ({ method: 'PATCH', body, user: { role: 'MANAGER' } }) }) });
  }
  await assert.rejects(check(HorsesController, 'update', { name: 'Буран' }, { STABLES: 'READ_ONLY' }), error => error.getStatus() === 403);
  await assert.rejects(check(TrainersController, 'update', { name: 'Анна' }, { SCHEDULE: 'READ_ONLY', STAFF_PAYROLL: 'FULL' }), error => error.getStatus() === 403);
  assert.equal(await check(TrainersController, 'update', { phone: '+79991234567' }, { SCHEDULE: 'FULL', STAFF_PAYROLL: 'READ_ONLY' }), true);
  await assert.rejects(check(TrainersController, 'update', { baseRate: 2000 }, { SCHEDULE: 'FULL', STAFF_PAYROLL: 'READ_ONLY' }), error => error.getStatus() === 403);
  assert.equal(await check(TrainersController, 'update', { baseRate: 2000 }, { SCHEDULE: 'FULL', STAFF_PAYROLL: 'FULL' }), true);
});

test('profile dates, owner UUIDs and schedule colors are validated; clearable fields accept null', async () => {
  for (const [Dto, value] of [
    [UpdateClientDto, { birthDate: '1990-02-30' }], [UpdateClientDto, { birthDate: '1990-02-02T00:00:00Z' }],
    [UpdateHorseDto, { ownerId: 'invalid' }], [UpdateHorseDto, { ownerType: 'unknown' }],
    [UpdateTrainerDto, { scheduleColor: 'red' }], [UpdateStaffProfileDto, { scheduleColor: '#12345Z' }],
  ]) assert.ok((await validate(plainToInstance(Dto, value))).length > 0);
  for (const [Dto, value] of [
    [UpdateClientDto, { birthDate: '1992-02-29', riderLevel: 'Новичок' }],
    [UpdateClientDto, { birthDate: null }], [UpdateHorseDto, { ownerId: '', ownerType: '' }],
    [UpdateTrainerDto, { scheduleColor: '#724C39' }], [UpdateStaffProfileDto, { scheduleColor: null, phone: null }],
  ]) assert.deepEqual(await validate(plainToInstance(Dto, value)), []);
});

test('client edits persist date and experience while rebuilding full name', async () => {
  let saved;
  const service = new ClientsService({ client: {
    findUnique: async () => ({ firstName: 'Анна', lastName: 'Иванова', memberships: [] }),
    update: async ({ data }) => { saved = data; return data; },
  } });
  await service.update('client', { firstName: 'Мария', birthDate: '1990-05-15', riderLevel: 'Новичок' });
  assert.equal(saved.name, 'Мария Иванова');
  assert.equal(saved.birthDate, '1990-05-15');
  assert.equal(saved.riderLevel, 'Новичок');
});

test('horse edit persists coat and owner and synchronizes safety and workload aliases', async () => {
  let saved;
  const service = new HorsesService({ horse: { update: async ({ data }) => { saved = data; return data; } } });
  await service.update('horse', { coat: 'Гнедая', status: 'sick', maxDailyMinutes: 90, ownerType: 'private', ownerId: 'client' });
  assert.equal(saved.coat, 'Гнедая');
  assert.equal(saved.healthStatus, 'TREATMENT');
  assert.equal(saved.isUnavailable, true);
  assert.equal(saved.maxDailyWorkloadMinutes, 90);
  assert.equal(saved.ownerId, 'client');
  await assert.rejects(service.update('horse', { status: 'sick', isUnavailable: false }), error => error.getStatus() === 400);
});

test('trainer and staff profile edits persist contact, color and rates through existing services', async () => {
  let trainer, staff;
  await new TrainersService({ trainer: { update: async ({ data }) => { trainer = data; return data; } } })
    .update('trainer', { phone: '+79991234567', scheduleColor: '#724C39', baseRate: 2000 });
  assert.equal(trainer.scheduleColor, '#724C39');
  const tx = { user: { findUnique: async () => ({ id: 'user', role: 'OTHER' }), update: async () => ({}) }, staffProfile: { findUnique: async () => ({ id: 'staff', userId: 'user', fullName: 'Сотрудник', roleTitle: 'Сотрудник', isActive: true }), update: async ({ data }) => { staff = data; return data; } } };
  await new StaffService({ $transaction: async work => work(tx) })
    .saveProfile({ phone: '+79991234567', scheduleColor: '#724C39', shiftRate: 2000 }, { role: 'ADMIN' }, 'staff');
  assert.equal(staff.shiftRate, 2000);
  assert.equal(staff.phone, '+79991234567');
  assert.equal(staff.scheduleColor, '#724C39');
});
