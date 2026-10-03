import type { ClubLandingContent } from '../types/content';

export const landingData: ClubLandingContent = {
  brand: {
    name: 'СЛКС Тамбов',
    logoUrl: '/images/slks-logo-transparent.png',
    legalName: 'Союз любителей конного спорта',
    description: 'Семейный конный клуб для детей и взрослых в Тамбове.',
    locale: 'ru-RU',
    location: 'Тамбов',
  },
  navigation: [
    { id: 'infrastructure', label: 'Клуб', href: '#infrastructure' },
    { id: 'services', label: 'Услуги', href: '#services' },
    { id: 'contacts', label: 'Контакты', href: '#contacts' },
  ],
  hero: {
    tagline: 'Тамбов · ул. Бастионная, 22Ас2',
    title: 'Искусство быть в седле',
    subtitle:
      'Семейный конный клуб «Союз любителей конного спорта». Обучение верховой езде детей и взрослых, профессиональный тренинг, конкур и забота о каждой лошади.',
    primaryCtaText: 'Записаться на занятие',
    secondaryCtaText: 'Узнать о клубе',
    mediaUrl: '/images/hero-rider.webp',
  },
  infrastructureSection: {
    eyebrow: 'Инфраструктура',
    title: 'Пространство, где растут всадники.',
    description:
      'Всё необходимое для безопасных занятий, спортивного роста и внимательного ухода за лошадьми.',
  },
  infrastructure: [
    {
      id: 'indoor-arena',
      badge: 'Для тренировок',
      title: 'Манеж со специализированным грунтом',
      description:
        'Подготовленное покрытие бережёт суставы лошади и даёт всаднику уверенную опору во время занятий.',
      imageUrl:
        'https://images.unsplash.com/photo-1593179449458-e0d43d512551?auto=format&fit=crop&w=1600&q=85',
      specs: [
        { label: 'Формат', value: 'Крытый' },
        { label: 'Грунт', value: 'Специальный' },
        { label: 'Занятия', value: 'В любой сезон' },
      ],
    },
    {
      id: 'stables',
      badge: 'Забота',
      title: 'Конюшня с индивидуальным уходом',
      description:
        'Просторные денники, рацион с учётом потребностей лошади и регулярный выгул под наблюдением команды клуба.',
      imageUrl:
        'https://images.unsplash.com/photo-1534773728080-33d31da27ae5?auto=format&fit=crop&w=1600&q=85',
      specs: [
        { label: 'Рацион', value: 'Индивидуальный' },
        { label: 'Выгул', value: 'Регулярный' },
        { label: 'Уход', value: 'Ежедневный' },
      ],
    },
    {
      id: 'pony-club',
      badge: 'Для детей',
      title: 'Пони-клуб',
      description:
        'Бережное знакомство с лошадьми, занятия и катание в поводу в спокойном темпе под контролем тренера.',
      imageUrl:
        'https://images.unsplash.com/photo-1450052590821-8bf91254a353?auto=format&fit=crop&w=1600&q=85',
      specs: [
        { label: 'Формат', value: 'Индивидуально' },
        { label: 'Темп', value: 'Бережный' },
        { label: 'Атмосфера', value: 'Семейная' },
      ],
    },
  ],
  servicesSection: {
    eyebrow: 'Услуги',
    title: 'Ваш маршрут в конном спорте.',
    description: 'От первого знакомства с лошадью до регулярных тренировок и спортивного роста.',
  },
  services: [
    {
      id: 'single-training',
      title: 'Разовое занятие с тренером',
      category: 'Первое занятие',
      price: '2 000 ₽ / 45 мин',
      description: 'Индивидуальное занятие с учётом вашего опыта, целей и физической подготовки.',
      imageUrl:
        'https://images.unsplash.com/photo-1534307250431-efebd9f0a2a0?auto=format&fit=crop&w=1400&q=85',
    },
    {
      id: 'regular-training',
      title: 'Регулярные тренировки',
      category: 'Прогресс',
      price: '1 800 ₽ / 45 мин',
      description: 'Системная работа над посадкой, балансом и техникой в выбранном спортивном направлении.',
      imageUrl:
        'https://images.unsplash.com/photo-1566251037378-5e04e3bec343?auto=format&fit=crop&w=1400&q=85',
    },
    {
      id: 'pony-ride',
      title: 'Катание в поводу для детей',
      category: 'Детям',
      price: '1 500 ₽ / 20 мин',
      description: 'Спокойное и безопасное знакомство ребёнка с лошадью в сопровождении специалиста.',
      imageUrl:
        'https://images.unsplash.com/photo-1534567110243-8875d64ca8ff?auto=format&fit=crop&w=1400&q=85',
    },
    {
      id: 'horse-gymnastics',
      title: 'Гимнастика на лошади',
      category: 'Развитие',
      price: 'По запросу',
      description: 'Упражнения на баланс, координацию и уверенность в седле в мягком и понятном формате.',
      imageUrl: 'https://images.unsplash.com/photo-1566251037378-5e04e3bec343?auto=format&fit=crop&w=1400&q=85',
    },
    {
      id: 'photo-session',
      title: 'Фотосессии с лошадьми',
      category: 'Впечатления',
      price: 'По запросу',
      description: 'Съёмка на территории клуба с подходящей лошадью и помощью команды во время съёмки.',
      imageUrl: 'https://images.unsplash.com/photo-1551098891-7a1c852f6c6b?auto=format&fit=crop&w=1400&q=85',
    },
    {
      id: 'boarding',
      title: 'Постой частных лошадей',
      category: 'Забота',
      price: 'По согласованию',
      description: 'Индивидуальный рацион, регулярный выгул и внимательный ежедневный уход по согласованному режиму.',
      imageUrl: 'https://images.unsplash.com/photo-1534567110243-8875d64ca8ff?auto=format&fit=crop&w=1400&q=85',
    },
  ],
  horsesSection: {
    eyebrow: 'Команда клуба',
    title: 'Партнёры с характером.',
    description: 'Каждая лошадь подобрана по темпераменту, уровню подготовки и специализации.',
  },
  horses: [
    {
      id: 'horse-atlas',
      name: 'Атлас',
      breed: 'Ганноверская',
      age: 9,
      discipline: 'Конкур',
      imageUrl:
        'https://images.unsplash.com/photo-1551884831-bbf3cdc6469e?auto=format&fit=crop&w=1200&q=85',
    },
    {
      id: 'horse-luna',
      name: 'Луна',
      breed: 'Ольденбургская',
      age: 8,
      discipline: 'Выездка',
      imageUrl:
        'https://images.unsplash.com/photo-1551098891-7a1c852f6c6b?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  contacts: {
    address: 'г. Тамбов, ул. Бастионная, д. 22А, стр. 2',
    phone: '+7 (915) 672-00-30',
    altPhone: '+7 (902) 936-47-27',
    workingHours: 'Ежедневно с 09:00 до 19:00 (по предварительной записи)',
    vkGroup: 'https://vk.com/soyuz68ru',
    coordinates: [52.7438702, 41.3699069],
  },
};
