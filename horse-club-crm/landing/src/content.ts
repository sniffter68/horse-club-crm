export interface Direction { key: string; title: string; format: string; duration: string; description: string; price: string; serviceId?: string }
export interface Profile { name: string; specialty: string; description: string; image?: string }
export const club = {
  name: 'Конный клуб',
  address: '',
  hours: '09:00–19:00. Понедельник — выходной. Посещение по предварительной записи.',
  phone: '',
  vkUrl: '', // https://vk.me/имя_сообщества
  mapUrl: '', // Проверенная ссылка на точку клуба в картах
  directions: [
    { key: 'lesson', title: 'Верховая езда', format: 'Разовое занятие', duration: 'Длительность подберём', description: 'Первое знакомство с лошадью или работа над техникой. Расскажите о своём опыте — обсудим подходящий формат.', price: 'Стоимость по запросу' },
    { key: 'membership', title: 'Регулярные тренировки', format: 'Абонемент', duration: 'График по согласованию', description: 'Для тех, кто хочет сделать верховую езду частью своей жизни. Уточните доступные программы и условия абонемента.', price: 'Стоимость по запросу' },
    { key: 'rent', title: 'Для вашей лошади', format: 'Аренда и постой', duration: 'Срок по согласованию', description: 'Обсудите с администратором аренду лошади или денника, наличие мест и условия содержания.', price: 'Стоимость по запросу' },
    { key: 'photo', title: 'Моменты на память', format: 'Фотосессия', duration: 'Длительность по запросу', description: 'Лошади, естественный свет и ваша история. Уточните возможность съёмки, свободные даты и условия.', price: 'Стоимость по запросу' },
  ] satisfies Direction[],
  trainers: [] as Profile[],
  horses: [] as Profile[],
}
