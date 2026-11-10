import { DateTime } from 'luxon';

interface CancellationParticipant {
  client: { name: string; firstName: string; lastName: string };
  horse: { name: string } | null;
  cancellationReason: string | null;
}

export function telegramCancellation(startTime: Date, endTime: Date, participants: CancellationParticipant[]): string {
  const date = (value: Date) => DateTime.fromJSDate(value, { zone: 'Europe/Moscow' }).toFormat('dd.MM.yyyy HH:mm');
  const details = participants.map(row => [
    `👤 Всадник: ${row.client.name || [row.client.firstName, row.client.lastName].filter(Boolean).join(' ') || 'Не указан'}`,
    `🐎 Лошадь: ${row.horse?.name || 'Не назначена'}`,
    `💬 Причина: ${row.cancellationReason?.trim() || 'Не указана'}`,
  ].join('\n')).join('\n\n');
  return `❌ Занятие отменено\n📅 Дата и время: ${date(startTime)} – ${date(endTime)} (Москва)\n${details || '💬 Причина: Не указана'}`;
}
