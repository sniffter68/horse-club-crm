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
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=2000',

  infrastructure: [
    {
      id: 'arena',
      badge: 'Всепогодный тренинг',
      title: 'Крытый манеж',
      description:
        'Оборудованный манеж со специализированным еврогрунтом для круглогодичных комфортных тренировок и конкура.',
      imageUrl:
        'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&q=80&w=1200',
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
        'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&q=80&w=1200',
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
        'https://images.unsplash.com/photo-1551884170-09fb70a3a2ed?auto=format&fit=crop&q=80&w=1200',
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
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=800',
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
        'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&q=80&w=800',
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
        'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&q=80&w=800',
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
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=800',
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
        'https://images.unsplash.com/photo-1551884170-09fb70a3a2ed?auto=format&fit=crop&q=80&w=800',
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
        'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&q=80&w=800',
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