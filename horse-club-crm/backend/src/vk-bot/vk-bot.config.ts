const setting = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

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
