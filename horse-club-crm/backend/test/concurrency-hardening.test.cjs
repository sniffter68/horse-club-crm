const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const enabled = !process.env.NODE_TEST_CONTEXT || process.env.RUN_CONCURRENCY_TESTS === '1';
if (enabled && !process.env.DATABASE_URL && fs.existsSync(path.join(__dirname, '../.env'))) process.loadEnvFile(path.join(__dirname, '../.env'));
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { DateTime } = require('luxon');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');

test('PostgreSQL: resource and last-balance races', { skip: !enabled, timeout: 60000 }, async t => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(VkNotifications).useValue({})
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) { context.switchToHttp().getRequest().user = { role: 'ADMIN' }; return true; } }).compile();
  const app = module.createNestApplication(); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  const p = app.get(PrismaService), ledger = app.get(MembershipLedgerService);
  const trainers = [], horses = [], lessons = [];
  const serviceId = randomUUID(), membershipId = randomUUID();
  try {
    await p.service.create({ data: { id: serviceId, name: 'QA concurrency', durationMinutes: 30 } });
    const schedule = await p.clubSchedule.findUniqueOrThrow({ where: { id: 1 } });
    let start = DateTime.now().setZone(process.env.CLUB_TIME_ZONE || 'Europe/Moscow').plus({ days: 7 }).startOf('day');
    while (start.weekday % 7 === schedule.dayOfWeekOff) start = start.plus({ days: 1 });
    const [hour, minute] = schedule.openTime.split(':').map(Number);
    start = start.set({ hour, minute });
    for (const resource of ['trainer', 'horse']) await t.test(`five simultaneous HTTP requests competing for one ${resource}`, async () => {
      const pairs = [];
      for (let i = 0; i < 5; i++) {
        const trainer = await p.trainer.create({ data: { name: 'QA race trainer' } }); trainers.push(trainer.id);
        const horse = await p.horse.create({ data: { name: 'QA race horse' } }); horses.push(horse.id);
        pairs.push({ trainerId: trainer.id, horseId: horse.id });
      }
      const responses = await Promise.all(pairs.map(pair => request(app.getHttpServer()).post('/api/lessons').send({
        ...pair, [resource === 'trainer' ? 'trainerId' : 'horseId']: pairs[0][resource === 'trainer' ? 'trainerId' : 'horseId'],
        serviceId, startTime: start.toUTC().toISO(), durationMinutes: 1,
      })));
      for (const response of responses) if (response.status === 201) lessons.push(response.body.id);
      assert.deepEqual(responses.map(response => response.status).sort(), [201, 409, 409, 409, 409]);
    });
    await t.test('two different lessons compete for the last membership credit', async () => {
      await p.membership.create({ data: { id: membershipId, remainedLessons: 1, validUntil: new Date(Date.now() + 30 * 86400000) } });
      assert.equal(lessons.length, 2);
      const results = await Promise.allSettled(lessons.map(id => ledger.debitLesson(membershipId, id, 'QA last credit')));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const rejected = results.find(result => result.status === 'rejected');
      assert.equal(rejected.reason.getStatus(), 409);
      assert.equal((await p.membership.findUniqueOrThrow({ where: { id: membershipId } })).remainedLessons, 0);
      assert.equal(await p.membershipOp.count({ where: { membershipId, type: 'DEBIT' } }), 1);
    });
  } finally {
    await p.membershipOp.deleteMany({ where: { membershipId } });
    await p.membership.deleteMany({ where: { id: membershipId } });
    await p.lesson.deleteMany({ where: { serviceId } });
    await p.service.deleteMany({ where: { id: serviceId } });
    await p.trainer.deleteMany({ where: { id: { in: trainers } } });
    await p.horse.deleteMany({ where: { id: { in: horses } } });
    await app.close();
  }
});
