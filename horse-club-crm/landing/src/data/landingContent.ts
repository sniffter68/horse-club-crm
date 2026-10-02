import type { ClubLandingContent } from '../types/content';

export const landingData: ClubLandingContent = {
  brand: {
    name: 'Élan Equestrian Club',
    logoUrl: '/club.svg',
    legalName: 'Конноспортивный клуб «Элан»',
    description: 'Премиальный конный клуб для спорта, отдыха и осознанного общения с лошадью.',
    locale: 'ru-RU',
    location: 'Московская область',
  },
  navigation: [
    { id: 'infrastructure', label: 'Пространство', href: '#infrastructure' },
    { id: 'services', label: 'Тренировки', href: '#services' },
    { id: 'horses', label: 'Лошади', href: '#horses' },
    { id: 'contact', label: 'Связаться', href: '#contact' },
  ],
  hero: {
    tagline: 'Частный конный клуб · Московская область',
    title: 'Искусство быть в седле.',
    subtitle:
      'Тишина загородной резиденции, спортивная инфраструктура международного уровня и персональное внимание к каждому всаднику.',
    primaryCtaText: 'Записаться на тренировку',
    secondaryCtaText: 'Исследовать клуб',
    mediaUrl:
      'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=2400&q=90',
  },
  infrastructureSection: {
    eyebrow: 'Инфраструктура',
    title: 'Продумано для лошади. Создано для результата.',
    description:
      'Технологичное пространство клуба поддерживает стабильный тренировочный ритм в любой сезон и сохраняет естественный комфорт лошадей.',
  },
  infrastructure: [
    {
      id: 'indoor-arena',
      badge: 'Круглый год',
      title: 'Отапливаемый манеж',
      description:
        'Светлый крытый манеж с профессиональным еврогрунтом, равномерным освещением и стабильным микроклиматом.',
      imageUrl:
        'https://images.unsplash.com/photo-1593179449458-e0d43d512551?auto=format&fit=crop&w=1600&q=85',
      specs: [
        { label: 'Размер', value: '24 × 65 м' },
        { label: 'Грунт', value: 'EuroTex' },
        { label: 'Температура', value: '+12 °C' },
      ],
    },
    {
      id: 'stables',
      badge: 'Комфорт',
      title: 'Просторные денники',
      description:
        'Спокойная светлая конюшня с автоматическими поилками, мягкими матами и индивидуальным режимом ухода.',
      imageUrl:
        'https://images.unsplash.com/photo-1534773728080-33d31da27ae5?auto=format&fit=crop&w=1600&q=85',
      specs: [
        { label: 'Площадь', value: 'от 12 м²' },
        { label: 'Вентиляция', value: 'Климат-контроль' },
        { label: 'Контроль', value: '24 / 7' },
      ],
    },
    {
      id: 'paddocks',
      badge: 'Свобода',
      title: 'Левады и маршруты',
      description:
        'Индивидуальные и групповые левады, безопасные ограждения и прогулочные маршруты среди соснового леса.',
      imageUrl:
        'https://images.unsplash.com/photo-1450052590821-8bf91254a353?auto=format&fit=crop&w=1600&q=85',
      specs: [
        { label: 'Территория', value: '18 га' },
        { label: 'Левады', value: '14 зон' },
        { label: 'Маршруты', value: 'до 7 км' },
      ],
    },
  ],
  servicesSection: {
    eyebrow: 'Направления',
    title: 'Персональный маршрут в конном спорте.',
    description: 'От первого уверенного шага до подготовки к стартам — в собственном темпе и с точной обратной связью.',
  },
  services: [
    {
      id: 'show-jumping',
      title: 'Индивидуальный конкур',
      category: 'Спорт',
      price: 'от 6 500 ₽',
      description: 'Работа над балансом, маршрутом и техникой прыжка с персональным тренером.',
      imageUrl:
        'https://images.unsplash.com/photo-1534307250431-efebd9f0a2a0?auto=format&fit=crop&w=1400&q=85',
    },
    {
      id: 'dressage',
      title: 'Индивидуальная выездка',
      category: 'Мастерство',
      price: 'от 6 500 ₽',
      description: 'Точность средств управления, тонкий контакт и гармоничная работа пары.',
      imageUrl:
        'https://images.unsplash.com/photo-1566251037378-5e04e3bec343?auto=format&fit=crop&w=1400&q=85',
    },
    {
      id: 'boarding',
      title: 'Премиальный постой',
      category: 'Забота',
      price: 'от 85 000 ₽ / мес.',
      description: 'Индивидуальный рацион, ежедневный выгул, берейторская работа и ветеринарное сопровождение.',
      imageUrl:
        'https://images.unsplash.com/photo-1534567110243-8875d64ca8ff?auto=format&fit=crop&w=1400&q=85',
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
};
