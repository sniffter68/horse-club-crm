import type { ReminderKind } from './vk-reminder-key';

export function reminderWindow(now: Date, kind: ReminderKind): { gte: Date; lte: Date } {
  const hour = 60 * 60 * 1000;
  const center = +now + (kind === '24h' ? 24 : 2) * hour;
  return { gte: new Date(center - hour / 2), lte: new Date(center + hour / 2) };
}

export function reminderMessage(kind: ReminderKind, start: Date, firstName: string, trainer: string, horse?: string | null): string {
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(start);
  if (kind === '2h') {
    return `Ждем вас на занятие через 2 часа (${time})!\n`
      + 'Адрес: ул. Бастионная, 22АС2.\n'
      + 'Телефон для связи: +7 (915) 672-00-30. До встречи!';
  }
  return `Здравствуйте, ${firstName}! Напоминаем о записи на тренировку завтра в ${time}.\n`
    + `Тренер: ${trainer.trim() || 'пока не назначен'}\n`
    + `Лошадь: ${horse?.trim() || 'пока не назначена'}\n`
    + 'Ждем вас в КСК «СЛКС» (Тамбов, ул. Бастионная, 22АС2). '
    + 'Пожалуйста, возьмите с собой удобную спортивную одежду. '
    + 'Если планы изменятся — предупредите нас заранее.';
}
