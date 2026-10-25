import { Keyboard } from 'vk-io';

export function mainMenu(trainer = false) {
  return Keyboard.keyboard(trainer ? [
    [Keyboard.textButton({ label: '📋 Расписание на сегодня', payload: { command: 'today' } })],
    [Keyboard.textButton({ label: '👥 Мои всадники', payload: { command: 'riders' } })],
  ] : [
    [Keyboard.textButton({ label: '🎫 Мой абонемент', payload: { command: 'membership' } })],
    [Keyboard.textButton({ label: '📅 Мои тренировки', payload: { command: 'bookings' } })],
    [Keyboard.textButton({ label: '💬 Администратор', payload: { command: 'help' } })],
  ]);
}

export function welcomeMenu() {
  return Keyboard.keyboard([
    [Keyboard.textButton({ label: 'О клубе', payload: { command: 'about' } })],
    [Keyboard.textButton({ label: 'Услуги и цены', payload: { command: 'prices' } })],
    [Keyboard.textButton({ label: 'Как доехать', payload: { command: 'directions' } })],
    [Keyboard.textButton({ label: 'Связаться', payload: { command: 'help' } })],
  ]);
}

export function normalizeVkCommand(value: string): string {
  const command = value.trim().toLowerCase().replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');
  if (['start', '/start', 'начать'].includes(command)) return 'начать';
  if (['membership', 'balance', 'мой абонемент', 'абонемент', 'мой баланс', 'баланс абонемента'].includes(command)) return 'membership';
  if (['мои тренировки', 'мои занятия'].includes(command)) return 'bookings';
  if (['📋 расписание на сегодня', 'расписание на сегодня', 'today'].includes(command)) return 'today';
  if (['👥 мои всадники', 'мои всадники', 'список всадников', 'riders'].includes(command)) return 'riders';
  if (['о клубе', 'контакты'].includes(command)) return 'about';
  if (['услуги и цены', 'цены', 'услуги'].includes(command)) return 'prices';
  if (['как доехать', 'адрес', 'как добраться'].includes(command)) return 'directions';
  if (['помощь', 'администратор', 'связаться', 'позвать администратора', 'связаться с администратором'].includes(command)) return 'help';
  if (command === 'записаться') return 'book';
  if (command === 'ближайшая тренировка') return 'next-booking';
  if (['памятка', 'памятка всадника'].includes(command)) return 'guide';
  return command;
}
