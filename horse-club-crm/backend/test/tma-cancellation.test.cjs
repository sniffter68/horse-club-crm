const { test } = require('node:test');
const assert = require('node:assert/strict');
const { telegramCancellation } = require('../dist/modules/telegram-bot/telegram-cancellation');
const { LessonsService } = require('../dist/lessons/lessons.service');

test('cancellation notifications use Moscow time and participant details for admins and clients', async () => {
  const participant = { clientId: 'client-id', client: { name: 'Анна', firstName: '', lastName: '', telegramUserId: '123' },
    horse: { name: 'Гром' }, cancellationReason: 'По просьбе клиента' };
  const lesson = { id: '11111111-1111-4111-8111-111111111111', bookings: [participant],
    startTime: new Date('2026-11-11T21:00:00Z'), endTime: new Date('2026-11-11T21:45:00Z'), service: { title: 'Тренировка' } };
  const messages = [];
  const tx = { user: { findMany: async () => [{ telegramUserId: '456' }] },
    telegramNotification: { upsert: async query => messages.push(query.create) } };
  await LessonsService.prototype.notifyTelegramLesson.call({}, tx, lesson, 'cancelled', 'Тренировка отменена');
  assert.equal(messages.length, 2);
  for (const row of messages) {
    assert.match(row.message, /❌ Занятие отменено/);
    assert.match(row.message, /12.11.2026 00:00 – 12.11.2026 00:45/);
    assert.match(row.message, /Всадник: Анна/); assert.match(row.message, /Лошадь: Гром/);
    assert.match(row.message, /Причина: По просьбе клиента/); assert.ok(!row.message.includes(lesson.id));
  }
  assert.match(telegramCancellation(lesson.startTime, lesson.endTime, [{ ...participant, horse: null, cancellationReason: '  ' }]), /Причина: Не указана/);
});
