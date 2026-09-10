const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { VkBotService } = require('../dist/vk-bot/vk-bot.service');
const { VkLinkService, normalizePhone } = require('../dist/vk-bot/vk-link.service');
const { MembershipLedgerService } = require('../dist/memberships/membership-ledger.service');
const { LeadsService } = require('../dist/leads/leads.service');
const bookingId = '11111111-1111-4111-8111-111111111111';
function bot(prisma, { links = {}, ledger = {}, leads = {} } = {}) {
  const service = new VkBotService(prisma, links, ledger, leads);
  const sent = [], answers = [];
  service.vk = { api: { messages: { send: async value => { sent.push(value); }, sendMessageEventAnswer: async value => { answers.push(value); } } } };
  return { service, sent, answers };
}
const message = text => ({ message: { from_id: 42, peer_id: 42, text, out: 0 } });
test('normalizes Russian national and international phone numbers', () => {
  assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
  assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567');
  assert.throws(() => normalizePhone('123'));
});
for (const kind of ['CLIENT', 'TRAINER']) test(`links ${kind} by normalized phone and single-use administrator code`, async () => {
  const target = { id: 'target', phone: '+79991234567', vkUserId: null };
  let grant;
  const targetModel = {
    findUnique: async ({ where }) => where.id === target.id || where.vkUserId === target.vkUserId ? target : null,
    update: async ({ data }) => Object.assign(target, data),
  };
  const prisma = {
    client: kind === 'CLIENT' ? targetModel : { findUnique: async () => null },
    trainer: kind === 'TRAINER' ? targetModel : { findUnique: async () => null },
    vkLinkCode: {
      create: async ({ data }) => { grant = { id: 'grant', usedBy: null, ...data }; },
      findUnique: async ({ where }) => where.codeHash === grant.codeHash ? grant : null,
      update: async ({ data }) => Object.assign(grant, data),
    },
    $transaction: async callback => callback(prisma),
  };
  const links = new VkLinkService(prisma);
  const { code } = await links.issue(kind, target.id);
  assert.notEqual(grant.codeHash, code);
  const { service, sent } = bot(prisma, { links });
  await service.handleMessage(message(`привязать 8 (999) 123-45-67 ${code}`), 'link-1');
  assert.equal(target.vkUserId, 42n); assert.equal(grant.usedBy, 42n);
  assert.match(sent[0].message, /успешно привязан/);
  await assert.rejects(links.bind(43, target.phone, code));
  await assert.rejects(links.bind(42, '+79991234568', code));
});
test('client balance query is limited to the linked owner and active memberships', async () => {
  let query;
  const { service, sent } = bot({
    client: { findUnique: async () => ({ id: 'owner' }) }, trainer: { findUnique: async () => null },
    membership: { findMany: async args => { query = args; return [{ id: 'membership', remainedLessons: 4, validUntil: new Date('2030-01-01T00:00:00Z') }]; } },
  });
  await service.handleMessage(message('Баланс абонемента'), 'balance-1');
  assert.equal(query.where.clientId, 'owner'); assert.equal(query.where.remainedLessons.gt, 0);
  assert.ok(query.where.validUntil.gte instanceof Date); assert.match(sent[0].message, /4 занятий/);
});
test('unlinked visitor is offered supported VK keyboard and a lead form', async () => {
  const { service, sent } = bot({ client: { findUnique: async () => null }, trainer: { findUnique: async () => null } });
  await service.handleMessage(message('привет'), 'welcome');
  assert.match(sent[0].message, /код/);
  assert.match(String(sent[0].keyboard), /Привязать профиль/);
  assert.doesNotMatch(String(sent[0].keyboard), /request_contact/);
});
test('inline attendance invokes billing with authenticated trainer context', async () => {
  const calls = [];
  const { service, answers } = bot({ trainer: { findUnique: async () => ({ id: 'trainer' }) } }, { ledger: { markAttendance: async (...args) => calls.push(args) } });
  for (const attended of [true, false]) await service.handleEvent({ user_id: 42, peer_id: 42, event_id: `event-${attended}`, payload: { action: 'attendance', bookingId, attended } });
  assert.deepEqual(calls, [[bookingId, true, { trainerId: 'trainer', noShow: false }], [bookingId, false, { trainerId: 'trainer', noShow: true }]]);
  assert.equal(answers.length, 2);
});
test('client cannot invoke trainer inline action', async () => {
  let billed = false;
  const { service, answers } = bot({ trainer: { findUnique: async () => null } }, { ledger: { markAttendance: async () => { billed = true; } } });
  await service.handleEvent({ user_id: 42, peer_id: 42, event_id: 'forbidden', payload: { action: 'attendance', bookingId, attended: true } });
  assert.equal(billed, false); assert.match(answers[0].event_data, /только тренеру/);
});
test('today uses club day bounds and includes lessons without bookings', async () => {
  const oldZone = process.env.CLUB_TIME_ZONE;
  process.env.CLUB_TIME_ZONE = 'Europe/Moscow';
  let query;
  const { service, sent } = bot({
    client: { findUnique: async () => null }, trainer: { findUnique: async () => ({ id: 'trainer' }) },
    lesson: { findMany: async args => { query = args; return [{ id: 'lesson', startTime: new Date(), horse: { name: 'Звезда' }, bookings: [] }]; } },
  });
  try {
    await service.handleMessage(message('Расписание на сегодня'), 'today');
    assert.equal(query.where.trainerId, 'trainer');
    assert.equal(query.where.startTime.gte.getUTCHours(), 21);
    assert.equal(query.where.startTime.lt - query.where.startTime.gte, 86400000);
    assert.match(sent[0].message, /Участников пока нет/); assert.match(sent[0].message, /Звезда/);
  } finally { if (oldZone === undefined) delete process.env.CLUB_TIME_ZONE; else process.env.CLUB_TIME_ZONE = oldZone; }
});
test('ledger denies another trainer before making changes', async () => {
  let changed = false;
  const ledger = new MembershipLedgerService({ $transaction: async callback => callback({ booking: {
    findUnique: async () => ({ lesson: { trainerId: 'someone-else', status: 'SCHEDULED', startTime: new Date(0) } }),
    update: async () => { changed = true; },
  } }) });
  await assert.rejects(ledger.markAttendance(bookingId, true, { trainerId: 'trainer', noShow: false }), error => error.getStatus() === 403);
  assert.equal(changed, false);
});
test('new lead notification is queued using a stable deduplication key', async () => {
  const original = process.env.VK_ADMIN_PEER_ID;
  process.env.VK_ADMIN_PEER_ID = '2000000001';
  let queued;
  try {
    await new LeadsService({}).notifyAdministrator({ vkNotification: { upsert: async args => { queued = args; } } }, 'client', { firstName: 'Анна', phone: '+79991234567' });
    assert.equal(queued.create.peerId, 2000000001n); assert.equal(queued.where.key, 'lead:client:general');
    assert.match(queued.create.message, /Новая заявка/);
  } finally { if (original === undefined) delete process.env.VK_ADMIN_PEER_ID; else process.env.VK_ADMIN_PEER_ID = original; }
});
