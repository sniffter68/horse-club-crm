export interface Direction {
  key: string;
  title: string;
  format: string;
  price: string;
  badge?: string;
  description: string;
  imageUrl: string;
}

export interface Profile {
  name: string;
  specialty: string;
  description: string;
  imageUrl?: string;
}

export interface InfrastructureItem {
  id: string;
  badge: string;
  title: string;
  description: string;
  imageUrl: string;
  specs: { label: string; value: string }[];
}

export const club = {
  name: 'СЛКС Тамбов',
  fullName: 'Союз любителей конного спорта',
  tagline: 'Искусство быть в седле',
  citySubtitle: 'Тамбов · ул. Бастионная, 22Ас2',
  description:
    'Семейный конный клуб с теплой атмосферой. Обучение верховой езде для взрослых и детей, профессиональный тренинг, конкур и заботливый постой.',
  address: 'г. Тамбов, ул. Бастионная, д. 22А, стр. 2',
  hours: 'Ежедневно с 09:00 до 19:00 (по предварительной записи)',
  phone: '+7 (915) 672-00-30',
  altPhone: '+7 (902) 936-47-27',
  vkUrl: 'https://vk.com/soyuz68ru',
  mapUrl: 'https://yandex.ru/maps/-/CDu1UB3c',

  heroMedia:
    `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,

  infrastructure: [
    {
      id: 'arena',
      badge: 'Всепогодный тренинг',
      title: 'Крытый манеж',
      description:
        'Оборудованный манеж со специализированным еврогрунтом для круглогодичных комфортных тренировок и конкура.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
      specs: [
        { label: 'Покрытие', value: 'Специальный еврогрунт' },
        { label: 'Направления', value: 'Конкур и базовая выездка' },
        { label: 'Формат', value: 'Индивидуально и группы' },
      ],
    },
    {
      id: 'stables',
      badge: 'Премиум уход',
      title: 'Конюшня и постой',
      description:
        'Просторные светлые денники с регулярной отбивкой, сбалансированным рационом, выгулом и ветеринарным контролем.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
      specs: [
        { label: 'Уход', value: 'Ежедневная отбивка' },
        { label: 'Кормление', value: 'Индивидуальный рацион' },
        { label: 'Выгул', value: 'Просторные левады' },
      ],
    },
    {
      id: 'kids',
      badge: 'Семейный клуб',
      title: 'Пони-клуб и отдых',
      description:
        'Бережное обучение верховой езде для самых маленьких, развивающая гимнастика на лошади и семейные фотосессии.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
      specs: [
        { label: 'Возраст', value: 'Дети от 3-х лет' },
        { label: 'Лошади', value: 'Пони и спокойные кони' },
        { label: 'Эмоции', value: 'Безопасно и душевно' },
      ],
    },
  ] satisfies InfrastructureItem[],

  directions: [
    {
      key: 'single-lesson',
      title: 'Разовое занятие с тренером',
      format: 'Индивидуально',
      price: '2 000 ₽ / 45 мин',
      badge: 'Старт',
      description:
        'Первое знакомство с лошадью, постановка базового баланса и правильной посадки под контролем опытного наставника.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      key: 'membership',
      title: 'Регулярные тренировки',
      format: 'Абонемент',
      price: '1 800 ₽ / 45 мин',
      badge: 'Популярно',
      description:
        'Системный тренинг по абонементу: совершенствование навыков управления, преодоление препятствий и конкур.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      key: 'kids-lead',
      title: 'Катание в поводу для детей',
      format: 'Для малышей',
      price: '1 500 ₽ / 20 мин',
      badge: 'Дети от 3 лет',
      description:
        'Спокойная прогулка в поводу на пони или надежной лошади в сопровождении инструктора.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      key: 'vaulting',
      title: 'Гимнастика на лошади',
      format: 'Развитие',
      price: 'по запросу',
      badge: 'Координация',
      description:
        'Вольтижировка: упражнения на шагающей или рысящей лошади для развития чувства баланса, гибкости и уверенности.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      key: 'photo',
      title: 'Фотосессии с лошадьми',
      format: 'Медиа',
      price: 'по запросу',
      badge: 'Эстетика',
      description:
        'Аренда грациозных ухоженных скакунов для индивидуальных, свадебных или семейных съемок.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      key: 'rent',
      title: 'Постой частных лошадей',
      format: 'Содержание',
      price: 'по договоренности',
      badge: 'Все включено',
      description:
        'Полный пансион для вашей лошади: светлый денник, качественные корма, выгул в левадах и пользование манежем.',
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
  ] satisfies Direction[],

  trainers: [
    {
      name: 'Команда инструкторов СЛКС',
      specialty: 'Конкур и начальная подготовка',
      description:
        'Опытные наставники с чутким подходом к каждому ученику и глубоким пониманием психологии лошадей.',
    },
  ] as Profile[],

  horses: [
    {
      name: 'Турнирные и учебные скакуны',
      specialty: 'Конкур / Выездка / Обучение',
      description:
        'Выезженные, контактные лошади и пони, приученные к мягкой работе со всадниками любого уровня.',
    },
  ] as Profile[],
};