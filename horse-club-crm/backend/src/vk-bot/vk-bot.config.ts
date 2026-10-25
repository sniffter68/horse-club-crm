const setting = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

export function vkGroupToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.VK_GROUP_TOKEN?.trim() || env.VK_COMMUNITY_TOKEN?.trim() || env.VK_BOT_TOKEN?.trim() || undefined;
}

export function validateVkConfig(env: NodeJS.ProcessEnv = process.env): void {
  const token = vkGroupToken(env);
  if (!token && !env.VK_CONFIRMATION_CODE?.trim() && !env.VK_SECRET_KEY?.trim()) return;
  for (const [key, value] of [['VK_GROUP_TOKEN', token], ['VK_CONFIRMATION_CODE', env.VK_CONFIRMATION_CODE?.trim()], ['VK_SECRET_KEY', env.VK_SECRET_KEY?.trim()]]) {
    if (!value) throw new Error(`${key} is required when VK bot is configured`);
  }
  if (env.VK_GROUP_ID?.trim() && (!/^[1-9]\d*$/.test(env.VK_GROUP_ID.trim()) || !Number.isSafeInteger(Number(env.VK_GROUP_ID)))) throw new Error('VK_GROUP_ID must be a positive numeric group ID');
}

export function clubDirections(): string {
  return `📍 Адрес: ${setting('VK_CLUB_ADDRESS', 'уточните у администратора клуба')}\n🗺️ Как доехать: ${setting('VK_CLUB_MAP_URL', 'маршрут отправит администратор')}\n📞 ${setting('VK_CLUB_PHONE', 'Свяжитесь с администратором в сообщениях сообщества')}`;
}

export function clubCard(): string {
  return [
    `🐴 Конный клуб «${setting('VK_CLUB_NAME', 'Союз любителей конного спорта')}»`,
    `📍 Адрес: ${setting('VK_CLUB_ADDRESS', 'уточните у администратора клуба')}`,
    `⏰ Режим работы: ${setting('VK_CLUB_HOURS', 'ежедневно с 09:00 до 21:00')}`,
    `📞 Телефон / WhatsApp: ${setting('VK_CLUB_PHONE', 'уточните у администратора клуба')}`,
    `🗺️ Карта: ${setting('VK_CLUB_MAP_URL', 'ссылку для навигатора отправит администратор')}`,
  ].join('\n');
}

export function riderGuide(): string {
  return setting('VK_RIDER_GUIDE', [
    '📖 Памятка всадника',
    '• Форма одежды: удобные эластичные брюки/леггинсы, закрытая обувь с небольшим каблуком 1–2 см. Шлем предоставляется клубом.',
    '• Время прибытия: за 10–15 минут до начала тренировки.',
    '• Угощения: вымытая морковь или яблоки. Кормить лошадей только с открытой ладони и с разрешения тренера.',
  ].join('\n')).replace(/\\n/g, '\n');
}
