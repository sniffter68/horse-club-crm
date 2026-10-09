require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { BookingRulesService } = require('../dist/bookings/booking-rules.service');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const fail = code => e => e.getStatus() === 409 && e.getResponse().code === code;
test('PostgreSQL replacement race, rollback and profile/password auth versions', { skip: process.env.RUN_TRIAD_TESTS !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.startsWith('/horse_os_triad_check_'));
  const p = new PrismaClient(), service = new BookingsService(p, new BookingRulesService());
  const clients = [], horses = [], trainers = [], arenas = [], bookings = [];
  let user;
  try {
    user = await p.user.create({ data: { email: `${randomUUID()}@test.local`, passwordHash: 'test-hash', role: 'ADMIN' } });
    const strategy = new JwtStrategy({ secret: 'test-only-secret-more-than-32-bytes' }, p);
    const claims = { sub: user.id, email: user.email, role: user.role, authVersion: String(user.tokenVersion), exp: 9999999999 };
    await p.user.update({ where: { id: user.id }, data: { vkUserId: BigInt(Date.now()) } });
    await strategy.validate(claims);
    const changed = await p.user.update({ where: { id: user.id }, data: { passwordHash: 'new-hash' } });
    assert.equal(changed.tokenVersion, user.tokenVersion + 1);
    await assert.rejects(strategy.validate(claims), e => e.getStatus() === 401);
    const shared = await p.horse.create({ data: { name: 'Shared replacement QA', maxDailyWorkloadMinutes: 120, maxRiderWeight: 90 } }); horses.push(shared.id);
    for (let i = 0; i < 2; i++) {
      const client = await p.client.create({ data: { name: 'Replacement QA', weightKg: 75 } }); clients.push(client.id);
      const horse = await p.horse.create({ data: { name: 'Original replacement QA' } }); horses.push(horse.id);
      const trainer = await p.trainer.create({ data: { name: 'Replacement QA' } }); trainers.push(trainer.id);
      const arena = await p.arena.create({ data: { name: `Replacement QA ${randomUUID()}` } }); arenas.push(arena.id);
      const booking = await service.createBooking({ clientId: client.id, horseId: horse.id, trainerId: trainer.id, arenaId: arena.id,
        startTime: '2030-10-09T10:00:00Z', endTime: '2030-10-09T11:00:00Z', serviceType: 'dressage', costAmount: 1500 });
      bookings.push(booking);
    }
    const results = await Promise.allSettled(bookings.map(b => service.replaceHorse(b.id, shared.id, 'Хромота')));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const rejected = results.find(r => r.status === 'rejected');
    assert.ok(fail('HORSE_REST_VIOLATION')(rejected.reason));
    for (const original of bookings) {
      const updated = await p.booking.findUniqueOrThrow({ where: { id: original.id } });
      for (const field of ['clientId', 'trainerId', 'arenaId', 'membershipId', 'status']) assert.equal(updated[field], original[field]);
      assert.equal(String(updated.costAmount), String(original.costAmount));
      assert.equal(await p.ledgerTransaction.count({ where: { bookingId: original.id } }), 0);
      assert.equal(await p.payment.count({ where: { bookingId: original.id } }), 0);
    }
    await p.horse.update({ where: { id: shared.id }, data: { status: 'sick' } });
    await assert.rejects(service.replaceHorse(bookings[0].id, shared.id), fail('HORSE_NOT_ACTIVE'));
  } finally {
    await p.booking.deleteMany({ where: { id: { in: bookings.map(b => b.id) } } });
    await p.client.deleteMany({ where: { id: { in: clients } } });
    await p.horse.deleteMany({ where: { id: { in: horses } } });
    await p.trainer.deleteMany({ where: { id: { in: trainers } } });
    await p.arena.deleteMany({ where: { id: { in: arenas } } });
    if (user) await p.user.delete({ where: { id: user.id } });
    await p.$disconnect();
  }
});
