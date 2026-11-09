const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { activeTelegramMembership } = require('../dist/modules/telegram-bot/telegram-membership');
const { TelegramPersonalService } = require('../dist/modules/telegram-bot/telegram-personal.service');
const { TmaBookingService } = require('../dist/modules/telegram-bot/tma-booking.service');
const now = new Date('2026-11-09T12:00:00Z');
const row = { id: 'package', title: 'Манеж <8> & тренер', totalLessons: 8, remainedLessons: 5,
  validUntil: new Date('2026-12-09T21:30:00Z'), serviceTitle: 'Занятия', pricingPlan: { name: 'План' } };

test('membership lookup restricts owner/family, active dates, lesson units and balance; selects nearest expiry deterministically', async () => {
  const membership = await activeTelegramMembership({ membership: { findFirst: async args => {
    assert.deepEqual(args.where, { deletedAt: null, type: 'fixed_lessons', status: 'active',
      validFrom: { lte: now }, validUntil: { gte: now }, remainedLessons: { gt: 0 },
      OR: [{ clientId: 'signed-client' }, { members: { some: { clientId: 'signed-client' } } }] });
    assert.deepEqual(args.orderBy, [{ validUntil: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }]);
    return row;
  } } }, 'signed-client', now);
  assert.deepEqual(membership, { id: row.id, title: row.title, totalLessons: 8, remainingLessons: 5,
    validUntil: row.validUntil.toISOString(), isExpiringSoon: false });
});

test('expiry warning includes exactly three days or one lesson and excludes values above both boundaries', async () => {
  for (const [lessons, milliseconds, expected] of [[2, 3 * 86400000, true], [2, 3 * 86400000 + 1, false], [1, 10 * 86400000, true]]) {
    const result = await activeTelegramMembership({ membership: { findFirst: async () => ({ ...row, remainedLessons: lessons, validUntil: new Date(+now + milliseconds) }) } }, 'client', now);
    assert.equal(result.isExpiringSoon, expected);
  }
});

test('title fallbacks and no active membership produce a usable explicit response', async () => {
  for (const [fields, title] of [[{ title: '' }, 'Занятия'], [{ title: '', serviceTitle: '' }, 'План'], [{ title: '', serviceTitle: '', pricingPlan: null }, 'Абонемент']]) {
    assert.equal((await activeTelegramMembership({ membership: { findFirst: async () => ({ ...row, ...fields }) } }, 'client', now)).title, title);
  }
  assert.equal(await activeTelegramMembership({ membership: { findFirst: async () => null } }, 'client', now), null);
});

test('bot resolves only linked active clients, escapes HTML and uses Moscow date', async () => {
  let client = { id: 'linked', deletedAt: null }, current = row;
  const prisma = { clubModuleSettings: { findUnique: async () => null }, client: { findUnique: async args => {
    assert.deepEqual(args.where, { telegramUserId: '42' }); return client;
  } }, membership: { findFirst: async args => { assert.equal(args.where.OR[0].clientId, 'linked'); return current; } } };
  const service = new TelegramPersonalService(prisma, {}, {});
  assert.equal(await service.balance('42'), '🎫 Ваш абонемент: <b>Манеж &lt;8&gt; &amp; тренер</b>\nОстаток занятий: <b>5 из 8</b>\nДействует до: <b>10.12.2026</b>');
  current = null;
  assert.equal(await service.balance('42'), 'У вас нет активного абонемента. Для оформления обратитесь к администратору клуба.');
  client = { id: 'linked', deletedAt: now }; await assert.rejects(service.balance('42'), { status: 403 });
  client = null; await assert.rejects(service.balance('42'), { status: 403 });
});

test('TMA includes membership even without bookings and on later pages; lookup failures propagate', async () => {
  let fail = false;
  const service = new TmaBookingService({ booking: { findMany: async () => [] }, membership: { findFirst: async args => {
    assert.equal(args.where.OR[0].clientId, 'signed-client'); if (fail) throw new Error('database unavailable'); return row;
  } } }, {}, {});
  for (const offset of [0, 20]) {
    const response = await service.myBookings('signed-client', { offset, limit: 20 });
    assert.equal(response.membership.remainingLessons, 5); assert.deepEqual(response.bookings, []); assert.equal(response.hasMore, false);
  }
  fail = true; await assert.rejects(service.myBookings('signed-client', { offset: 0, limit: 20 }), /database unavailable/);
});
