const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { ValidationPipe } = require('@nestjs/common');
const { Prisma } = require('@prisma/client');
const { LeadsService } = require('../dist/leads/leads.service');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { BookingRulesService } = require('../dist/bookings/booking-rules.service');
const { AcceptLeadDto } = require('../dist/leads/accept-lead.dto');
const { LeadsModule } = require('../dist/leads/leads.module');
const { LessonsModule } = require('../dist/lessons/lessons.module');

const ids = Object.fromEntries(['lead', 'client', 'trainer', 'horse', 'arena', 'service', 'lesson'].map((key, i) => [key, `${i + 1}1111111-1111-4111-8111-111111111111`]));
const dto = () => ({ firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567', isRider: true, isPayer: false,
  lesson: { trainerId: ids.trainer, horseId: ids.horse, arenaId: ids.arena, startTime: '2026-10-14T10:00:00Z', durationMinutes: 45 } });

function harness({ existing = false, collision, failLeadUpdate = false, missingService = false } = {}) {
  let state = { lead: { id: ids.lead, status: 'PENDING', serviceId: missingService ? null : ids.service },
    clients: existing ? [{ id: ids.client, phone: dto().phone, firstName: 'Старое имя', vkUserId: 42n }] : [], lessons: [], notifications: [] };
  let transactionCount = 0, validateCount = 0;
  const trainer = { id: ids.trainer, isActive: true, name: 'Мария', vkUserId: 77n };
  const horse = { id: ids.horse, name: 'Валдай', status: 'active', isUnavailable: false,
    requiredRestMinutes: 45, maxDailyWorkloadMinutes: 240, maxDailyMinutes: 240, maxRiderWeight: 85 };
  const arena = { id: ids.arena, name: 'Манеж', isActive: true, isUnavailable: false, capacity: 6, maxRidersCapacity: 6 };
  const service = { durationMinutes: 60, maxCapacity: 1, price: 1500, title: 'Индивидуальное', name: 'Индивидуальное' };
  const prisma = { $transaction: async (work, options) => {
    transactionCount++;
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    const draft = structuredClone(state);
    const tx = {
      $queryRaw: async () => [],
      leadRequest: {
        findUnique: async () => draft.lead,
        update: async ({ data }) => { if (failLeadUpdate) throw new Error('Lead update failed'); return Object.assign(draft.lead, data); },
      },
      client: {
        findUnique: async ({ where }) => draft.clients.find(row => row.phone === where.phone) || null,
        findMany: async () => draft.clients,
        create: async ({ data }) => { const client = { id: ids.client, weightKg: null, vkUserId: null, ...data }; draft.clients.push(client); return client; },
        update: async ({ where, data }) => Object.assign(draft.clients.find(row => row.id === where.id), data),
      },
      trainer: { findUnique: async () => trainer },
      horse: { findUnique: async () => horse, findMany: async () => [horse] },
      arena: { findUnique: async () => arena },
      service: { findUnique: async () => service },
      clubSchedule: { findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }) },
      booking: { findMany: async () => collision ? [{ trainerId: collision === 'trainer' ? ids.trainer : 'other',
        horseId: collision === 'horse' ? ids.horse : null, arenaId: null,
        startTime: new Date('2026-10-14T10:00:00Z'), endTime: new Date('2026-10-14T11:00:00Z') }] : [] },
      lesson: {
        findMany: async () => [], findFirst: async () => null,
        create: async ({ data }) => {
          const lesson = { id: ids.lesson, ...data, service, trainer,
            bookings: data.bookings.create.map(row => ({ ...row, client: draft.clients.find(client => client.id === row.clientId), horse })) };
          draft.lessons.push(lesson); return lesson;
        },
      },
      vkNotification: { upsert: async ({ create }) => draft.notifications.push(create) },
    };
    const result = await work(tx);
    state = draft;
    return result;
  } };
  const rules = new BookingRulesService();
  const validate = rules.validate.bind(rules);
  rules.validate = async (...args) => { validateCount++; return validate(...args); };
  const lessons = new LessonsService(prisma, {}, rules);
  return { service: new LeadsService(prisma, lessons), state: () => state, transactions: () => transactionCount, validations: () => validateCount };
}

test('conversion creates client, scheduled lesson/participant, pending charge and notifications in one transaction', async () => {
  const h = harness();
  const result = await h.service.accept(ids.lead, dto());
  assert.equal(h.transactions(), 1); assert.equal(h.validations(), 1);
  assert.equal(result.lessonId, ids.lesson);
  const { lead, clients, lessons, notifications } = h.state();
  assert.equal(clients.length, 1); assert.equal(clients[0].name, 'Анна Орлова');
  assert.equal(lead.status, 'ACCEPTED'); assert.equal(lead.clientId, ids.client);
  assert.ok(lead.processedAt instanceof Date);
  const [lesson] = lessons;
  assert.equal(lesson.status, 'SCHEDULED'); assert.equal(lesson.serviceId, ids.service);
  assert.equal(lesson.endTime.toISOString(), '2026-10-14T10:45:00.000Z');
  assert.equal(lesson.bookings[0].clientId, ids.client); assert.equal(lesson.bookings[0].horseId, ids.horse);
  assert.equal(lesson.bookings[0].payments.create.status, 'PENDING');
  assert.equal(notifications.length, 1); assert.equal(notifications[0].peerId, 77n);
  await assert.rejects(h.service.accept(ids.lead, dto()), /Заявка уже обработана/);
  assert.equal(h.state().lessons.length, 1);
});

test('existing client is reused by phone and receives the participant notification', async () => {
  const h = harness({ existing: true });
  await h.service.accept(ids.lead, { ...dto(), lesson: { ...dto().lesson, serviceId: ids.service } });
  assert.equal(h.state().clients.length, 1);
  assert.equal(h.state().clients[0].id, ids.client);
  assert.equal(h.state().notifications.length, 2);
});

for (const collision of ['trainer', 'horse']) test(`${collision} overlap rejects and rolls back client and lead`, async () => {
  const h = harness({ collision });
  await assert.rejects(h.service.accept(ids.lead, dto()), error => error.getStatus() === 409);
  assert.equal(h.validations(), 1);
  assert.deepEqual(h.state().clients, []); assert.deepEqual(h.state().lessons, []);
  assert.deepEqual(h.state().notifications, []); assert.equal(h.state().lead.status, 'PENDING');
});

test('lead persistence failure rolls back lesson, client, payment and outbox', async () => {
  const h = harness({ failLeadUpdate: true });
  await assert.rejects(h.service.accept(ids.lead, dto()), /Lead update failed/);
  assert.equal(h.state().lead.status, 'PENDING');
  assert.deepEqual(h.state().clients, []); assert.deepEqual(h.state().lessons, []); assert.deepEqual(h.state().notifications, []);
});

test('ordinary client-only conversion remains supported without selecting a service', async () => {
  const h = harness({ missingService: true });
  const { lesson, ...client } = dto();
  const result = await h.service.accept(ids.lead, client);
  assert.equal(result.lessonId, undefined); assert.equal(h.state().lead.status, 'ACCEPTED');
  assert.equal(h.state().lessons.length, 0); assert.equal(h.validations(), 0);
  assert.equal(lesson.trainerId, ids.trainer);
});

test('missing service and payer-only clients cannot be converted with a lesson', async () => {
  await assert.rejects(harness({ missingService: true }).service.accept(ids.lead, dto()), /Выберите услугу/);
  await assert.rejects(harness().service.accept(ids.lead, { ...dto(), isRider: false }), /всадника/);
});

test('nested conversion payload validates fields and rejects arbitrary participants', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const check = body => pipe.transform(body, { type: 'body', metatype: AcceptLeadDto });
  const valid = await check(dto());
  assert.equal(valid.lesson.horseId, ids.horse);
  for (const lesson of [[], 'lesson', {}, { ...dto().lesson, horseId: 'invalid' },
    { ...dto().lesson, startTime: '2026-10-14T10:00:00' }, { ...dto().lesson, durationMinutes: 0 },
    { ...dto().lesson, durationMinutes: 481 }, { ...dto().lesson, durationMinutes: '60' },
    { ...dto().lesson, participants: [{ clientId: ids.client }] }]) {
    await assert.rejects(check({ ...dto(), lesson }), error => error.getStatus() === 400);
  }
  assert.ok(Reflect.getMetadata('imports', LeadsModule).includes(LessonsModule));
});
