const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { queueTrainingConfirmation } = require('../dist/vk-bot/vk-training-notifications');
const { BookingsService } = require('../dist/bookings/bookings.service');
const { VkNotifications } = require('../dist/vk-bot/vk-delivery.module');

const training = () => ({
  startTime: new Date('2026-10-17T08:00:00Z'), endTime: new Date('2026-10-17T09:00:00Z'),
  trainer: { name: 'Анна Сергеевна', vkUserId: 77n }, trainingType: 'Индивидуальное занятие', notes: 'Первое занятие',
  participants: [
    { client: { name: 'Иван', phone: '+79991234567', vkUserId: 42n }, horse: { name: 'Гранит' } },
    { client: { name: 'Мария', phone: '+79997654321', vkUserId: 43n }, horse: { name: 'Искра' } },
  ],
});
function queue() {
  const rows = new Map();
  return { rows, tx: { vkNotification: { upsert: async ({ create }) => {
    if (!rows.has(create.key)) rows.set(create.key, create);
  } } } };
}

test('training confirmation sends full trainer card and private individual client cards, idempotently', async () => {
  const { tx, rows } = queue();
  await queueTrainingConfirmation(tx, 'lesson:1:created', training());
  await queueTrainingConfirmation(tx, 'lesson:1:created', training());
  assert.equal(rows.size, 3);
  const [trainer, client, second] = [...rows.values()];
  assert.equal(trainer.peerId, 77n);
  assert.match(trainer.message, /^📅 Новое занятие в вашем расписании!/);
  assert.match(trainer.message, /Клиент: Иван \(\+79991234567\)/);
  assert.match(trainer.message, /Клиент: Мария \(\+79997654321\)/);
  assert.match(trainer.message, /Лошадь: Гранит/);
  assert.match(trainer.message, /Тип занятия: Индивидуальное занятие/);
  assert.match(trainer.message, /Примечание: Первое занятие/);
  assert.equal(client.peerId, 42n); assert.equal(second.peerId, 43n);
  assert.match(client.message, /^✅ Ваша тренировка подтверждена!/);
  assert.match(client.message, /Тренер: Анна Сергеевна/);
  assert.match(client.message, /Лошадь: Гранит/);
  assert.match(client.message, /за 15 минут/);
  assert.doesNotMatch(client.message, /Мария|Искра|7999|Первое занятие/);
  assert.doesNotMatch(second.message, /Иван|Гранит|7999/);
});

test('notification time uses CLUB_TIME_ZONE across midnight', async () => {
  const original = process.env.CLUB_TIME_ZONE;
  process.env.CLUB_TIME_ZONE = 'Asia/Vladivostok';
  try {
    const { tx, rows } = queue();
    const value = training();
    value.startTime = new Date('2026-10-17T18:00:00Z'); value.endTime = new Date('2026-10-17T19:00:00Z');
    await queueTrainingConfirmation(tx, 'lesson:1:created', value);
    assert.match([...rows.values()][0].message, /18\.10\.2026, 04:00/);
    assert.match([...rows.values()][0].message, /Asia\/Vladivostok/);
  } finally {
    if (original === undefined) delete process.env.CLUB_TIME_ZONE; else process.env.CLUB_TIME_ZONE = original;
  }
});

test('missing VK IDs skip recipients, while missing phone, horse and notes have readable fallbacks', async () => {
  const { tx, rows } = queue();
  const value = training();
  value.trainer.vkUserId = null;
  value.participants[1].client.vkUserId = null;
  await queueTrainingConfirmation(tx, 'one', value);
  assert.deepEqual([...rows.values()].map(row => row.peerId), [42n]);
  rows.clear(); value.participants[0].client.vkUserId = null;
  await queueTrainingConfirmation(tx, 'none', value);
  assert.equal(rows.size, 0);
  value.trainer.vkUserId = 77n;
  value.notes = null; value.participants = [{ client: { firstName: 'Иван', lastName: 'Петров' } }];
  await queueTrainingConfirmation(tx, 'fallback', value);
  const message = [...rows.values()][0].message;
  assert.match(message, /Иван Петров \(телефон не указан\)/);
  assert.match(message, /Лошадь: не назначена/); assert.match(message, /Примечание: не указано/);
});

test('standalone scheduled booking queues trainer and client cards in its transaction without exposing profiles in API result', async () => {
  const { tx, rows } = queue();
  const value = training();
  let committed = false;
  tx.booking = { create: async ({ data, include }) => {
    assert.deepEqual(include, { trainer: true, client: true, horse: true });
    return { id: 'booking', ...data, trainer: value.trainer, ...value.participants[0] };
  } };
  const service = new BookingsService({ $transaction: async work => {
    const result = await work(tx);
    assert.equal(rows.size, 2); committed = true; return result;
  } }, { validate: async () => {} });
  const result = await service.createBooking({ trainerId: 'trainer', clientId: 'client', horseId: 'horse',
    arenaId: 'arena', startTime: value.startTime.toISOString(), endTime: value.endTime.toISOString(), serviceType: 'dressage', costAmount: 0 });
  assert.equal(committed, true); assert.equal(result.status, 'scheduled');
  assert.equal(result.trainer, undefined); assert.equal(result.client, undefined); assert.equal(result.horse, undefined);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.match([...rows.values()][0].message, /Тип занятия: Выездка/);
});

test('VK 901 is logged with recipient and code, retries persist, and another recipient still receives confirmation', async () => {
  const { tx, rows } = queue();
  const value = training(); value.participants.length = 1;
  await queueTrainingConfirmation(tx, 'lesson:1:created', value);
  const logs = [], sent = [], updates = [];
  const delivery = new VkNotifications({ vkNotification: {
    findMany: async () => [...rows.values()].map(row => ({ ...row, id: row.key, attemptCount: 0 })),
    update: async args => updates.push(args),
  } });
  delivery.logger.warn = entry => logs.push(entry);
  delivery.vk = { api: { messages: { send: async params => {
    sent.push(params);
    if (params.peer_id === 77) throw Object.assign(new Error('Cannot send messages to this user'), { code: 901 });
  } } } };
  await assert.doesNotReject(delivery.flush());
  assert.deepEqual(sent.map(row => row.peer_id), [77, 42]);
  assert.ok(updates.some(row => row.data.nextAttemptAt instanceof Date));
  assert.ok(updates.some(row => row.data.sentAt instanceof Date));
  assert.ok(logs.some(entry => entry.message === 'Не удалось отправить VK-уведомление для userId: 77'
    && entry.errorCode === 901 && entry.notificationId === 'lesson:1:created:trainer:77'));
});
