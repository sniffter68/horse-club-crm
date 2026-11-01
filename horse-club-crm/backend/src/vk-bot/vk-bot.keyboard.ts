import { Keyboard } from 'vk-io';

const button = (label: string, command: string) => Keyboard.textButton({ label, payload: { command } });
export function mainMenu(trainer = false) {
  return Keyboard.keyboard(trainer ? [
    [button('📋 Расписание на сегодня', 'today'), button('Расписание на завтра', 'tomorrow')],
    [button('Мои лошади в работе', 'horses'), button('👥 Мои всадники', 'riders')],
  ] : [
    [button('📅 Мои тренировки', 'bookings'), button('🎫 Мой абонемент', 'membership')],
    [button('Записаться онлайн', 'book'), button('Баланс и касса', 'cash')],
    [button('💬 Администратор', 'help')],
  ]);
}
export function welcomeMenu() {
  return Keyboard.keyboard([
    [button('Записаться на тренировку', 'book'), button('Наш прайс и услуги', 'prices')],
    [button('Привязать профиль CRM', 'link'), button('Задать вопрос администратору', 'help')],
    [button('О клубе', 'about'), button('Как доехать', 'directions')],
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
  if (['баланс и касса', 'cash'].includes(command)) return 'cash';
  if (['расписание на завтра', 'tomorrow'].includes(command)) return 'tomorrow';
  if (['мои лошади в работе', 'horses'].includes(command)) return 'horses';
  if (['привязать профиль crm', 'link'].includes(command)) return 'link';
  if (command === 'наш прайс и услуги') return 'prices';
  if (command === 'задать вопрос администратору') return 'help';
  if (['записаться', 'записаться онлайн', 'записаться на тренировку'].includes(command)) return 'book';
  if (command === 'ближайшая тренировка') return 'next-booking';
  if (['памятка', 'памятка всадника'].includes(command)) return 'guide';
  return command;
}
