import { Keyboard } from 'vk-io';

const publicRows = (helpLabel = '💬 Связаться с администратором') => [
  [Keyboard.textButton({ label: 'ℹ️ О клубе', payload: { command: 'about' } }),
    Keyboard.textButton({ label: '📖 Памятка всадника', payload: { command: 'guide' } })],
  [Keyboard.textButton({ label: helpLabel, payload: { command: 'help' } })],
];

function menuKeyboard(trainer = false, helpLabel?: string) {
  return Keyboard.keyboard([
    trainer ? [Keyboard.textButton({ label: 'Расписание на сегодня', payload: { command: 'today' } })] : [
      Keyboard.textButton({ label: '📅 Мои тренировки', payload: { command: 'bookings' } }),
      Keyboard.textButton({ label: '💳 Мой баланс', payload: { command: 'balance' } }),
    ],
    ...publicRows(helpLabel),
  ]);
}

export function mainMenu(trainer = false) {
  return menuKeyboard(trainer);
}

export function welcomeMenu() {
  return menuKeyboard(false, '💬 Позвать администратора').row()
    .textButton({ label: 'Привязать профиль' }).textButton({ label: 'Первичная заявка' });
}

export function normalizeVkCommand(value: string): string {
  const command = value.trim().toLowerCase().replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');
  if (command === 'start') return 'начать';
  if (['о клубе', 'контакты'].includes(command)) return 'about';
  if (['памятка', 'памятка всадника'].includes(command)) return 'guide';
  if (['помощь', 'администратор', 'позвать администратора', 'связаться с администратором'].includes(command)) return 'help';
  return command;
}
