const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { BoardingBillingService, BoardingServicesService } = require('../dist/boarding/boarding.service');
const { VetCalendarService } = require('../dist/boarding/vet-calendar.service');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { BookingRulesService } = require('../dist/bookings/booking-rules.service');

test('PostgreSQL boarding finance and veterinary calendar', { skip: process.env.RUN_TRIAD_TESTS !== '1', timeout: 60000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/horse_os_triad_check_'));
  const p = new PrismaClient();
  const billing = new BoardingBillingService(p), services = new BoardingServicesService(p), vet = new VetCalendarService(p);
  let client, horse, stall, contract, trainer, arena;
  try {
    client = await p.client.create({ data: { name: 'Boarding QA' } });
    horse = await p.horse.create({ data: { name: 'Boarding QA' } });
    stall = await p.stall.create({ data: { name: `QA ${randomUUID()}` } });
    contract = await p.boardingContract.create({ data: { clientId: client.id, horseId: horse.id, stallId: stall.id,
      status: 'ACTIVE', startsAt: new Date(Date.now()-86400000), monthlyRate: '25000.50' } });
    const account = async () => (await p.client.findUniqueOrThrow({ where: { id: client.id } })).boardingBalance.toString();
    await t.test('concurrent monthly runs charge once and debit owner exact rubles', async () => {
      const results = await Promise.all(Array.from({ length: 4 }, () => billing.triggerMonthlyBoardingBilling()));
      assert.equal(results.flatMap(r => r.chargedContractIds).filter(id => id === contract.id).length,1);
      assert.equal(await account(), '-25000.5');
      assert.equal(await p.ledgerTransaction.count({ where: { boardingContractId: contract.id, billingMonth: { not: null } } }),1);
      assert.equal((await p.horse.findUniqueOrThrow({ where: { id: horse.id } })).ownerType,'private');
    });
    await t.test('additional service and retry are atomic and idempotent, changed retry rejected', async () => {
      const dto = { horseId: horse.id, serviceType: 'blanket_wash', cost: 500.25, requestId: randomUUID(), notes: 'QA' };
      const results = await Promise.all([services.create(dto,'staff'),services.create(dto,'staff')]);
      assert.equal(results[0].id,results[1].id); assert.equal(await account(),'-25500.75');
      assert.equal(await p.ledgerTransaction.count({ where: { boardingDailyLogId: results[0].id } }),1);
      await assert.rejects(services.create({ ...dto, cost: 1 },'staff'), e => e.getStatus()===409);
      const logs = await services.logs({ horseId: horse.id, limit:20, offset:0 }); assert.equal(logs.total,1);
    });
    await t.test('paid receipts and refund edits update account without recharging month', async () => {
      const payment = await p.payment.create({ data: { clientId:client.id, boardingContractId:contract.id, amount:'25000.50', status:'PAID', method:'CASH' } });
      assert.equal(await account(),'-500.25');
      await p.payment.update({ where:{ id:payment.id }, data:{ description:'QA' } });
      assert.equal(await account(),'-500.25');
      await p.payment.update({ where:{ id:payment.id }, data:{ status:'REFUNDED' } });
      assert.equal(await account(),'-25500.75');
    });
    await t.test('planned shoeing, completion, followup and repeated completion synchronize horse dates', async () => {
      const event = await vet.create({ horseId:horse.id, type:'shoeing', eventDate:new Date(Date.now()-86400000).toISOString(), status:'scheduled' });
      assert.equal(event.status,'overdue');
      assert.equal((await p.horse.findUniqueOrThrow({ where:{ id:horse.id } })).nextShoeingDate.toISOString(),event.eventDate.toISOString());
      const next = new Date(Date.now()+30*86400000).toISOString();
      await Promise.all([vet.complete(event.id,{ nextDueDate:next }), vet.complete(event.id,{ nextDueDate:next })]);
      assert.equal(await p.vetEvent.count({ where:{ predecessorId:event.id } }),1);
      assert.equal((await p.horse.findUniqueOrThrow({ where:{ id:horse.id } })).nextShoeingDate.toISOString(),next);
      await vet.create({ horseId:horse.id, type:'vet_check', eventDate:new Date(Date.now()-1000).toISOString(), status:'completed' });
      assert.ok((await p.horse.findUniqueOrThrow({ where:{ id:horse.id } })).lastVetCheckAt);
      await assert.rejects(vet.create({ horseId:horse.id, type:'dentist',eventDate:next,nextDueDate:new Date().toISOString(),status:'scheduled' }), e => e.getStatus()===400);
    });
    await t.test('legacy health records project to completed history plus an upcoming appointment', async () => {
      const record = await p.horseHealthLog.create({ data:{ horseId:horse.id,type:'VACCINATION',occurredAt:new Date(),nextDueAt:new Date(Date.now()+5*86400000) } });
      const projected = await p.vetEvent.findUniqueOrThrow({ where:{ sourceHealthLogId:record.id } });
      assert.equal(projected.status,'completed');
      assert.equal(await p.vetEvent.count({ where:{ predecessorId:projected.id } }),1);
      assert.ok((await vet.list({ horseId:horse.id,limit:20,offset:0 },true)).data.some(e=>e.type==='vaccination'));
    });
    await t.test('sick and quarantine horses cannot be booked; no booking is created', async () => {
      trainer = await p.trainer.create({ data:{ name:'QA' } });
      arena = await p.arena.create({ data:{ name:randomUUID() } });
      const dto={ clientId:client.id,horseId:horse.id,trainerId:trainer.id,arenaId:arena.id,serviceType:'dressage',costAmount:0,startTime:new Date(Date.now()+86400000).toISOString(),endTime:new Date(Date.now()+86400000+1800000).toISOString() };
      for (const status of ['sick','quarantine']) {
        await p.horse.update({ where:{ id:horse.id }, data:{ status,isUnavailable:true } });
        await assert.rejects(new BookingsService(p,new BookingRulesService()).createBooking(dto), e=>e.getStatus()===409 && e.getResponse().code==='HORSE_UNAVAILABLE');
      }
      assert.equal(await p.booking.count({ where:{ horseId:horse.id } }),0);
    });
    await t.test('club placement has no financial services or monthly charges', async () => {
      await p.boardingContract.update({ where:{ id:contract.id },data:{ clientId:null,monthlyRate:0 } });
      assert.equal((await billing.triggerMonthlyBoardingBilling()).charged,0);
      await assert.rejects(services.create({ horseId:horse.id,serviceType:'blanket_wash',cost:10,requestId:randomUUID() },'staff'),e=>e.getStatus()===409);
    });
  } finally {
    if (client) {
      await p.payment.deleteMany({ where:{ clientId:client.id } });
      await p.ledgerTransaction.deleteMany({ where:{ clientId:client.id } });
      await p.boardingDailyLog.deleteMany({ where:{ clientId:client.id } });
      await p.boardingContract.deleteMany({ where:{ clientId:client.id } });
    }
    if(horse) { await p.boardingContract.deleteMany({ where:{ horseId:horse.id } }); await p.vetEvent.deleteMany({ where:{ horseId:horse.id } }); await p.horse.delete({ where:{ id:horse.id } }); }
    if(stall) await p.stall.delete({ where:{ id:stall.id } });
    if(trainer) await p.trainer.delete({ where:{ id:trainer.id } });
    if(arena) await p.arena.delete({ where:{ id:arena.id } });
    if(client) await p.client.delete({ where:{ id:client.id } });
    await p.$disconnect();
  }
});
