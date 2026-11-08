export interface NavigationItem {
  id: string;
  label: string;
  href: string;
}

export interface HeroContent {
  badge: string;
  title: string;
  subtitle: string;
  primaryCtaText: string;
  secondaryCtaText: string;
  mediaUrl: string;
  metrics: { value: string; label: string }[];
}

export interface SectionMeta {
  eyebrow: string;
  title: string;
  description: string;
}

export interface InfrastructureCard {
  id: string;
  badge: string;
  title: string;
  description: string;
  imageUrl: string;
  specs: { label: string; value: string }[];
}

export interface ServiceItem {
  durationMinutes?: number;
  format?: string;
  id: string;
  title: string;
  category: string;
  price: string;
  description: string;
  imageUrl: string;
}

export interface HorseCard {
  id: string;
  name: string;
  breed: string;
  role: string;
  imageUrl: string;
}

export interface TrainerCard {
  id: string;
  name: string;
  role: string;
  experience: string;
  imageUrl: string;
}

export interface ContactInfo {
  address: string;
  phone: string;
  altPhone: string;
  workingHours: string;
  vkGroup: string;
  telegram: string;
  yandexMapsUrl: string;
  coordinates: [number, number];
  mapCoords: [number, number];
  coords: [number, number];
  lat: number;
  lng: number;
}

export interface LandingData {
  brand: {
    name: string;
    logoUrl?: string;
  };
  navigation: NavigationItem[];
  hero: HeroContent;
  infrastructureSection: SectionMeta;
  infrastructure: InfrastructureCard[];
  servicesSection: SectionMeta;
  services: ServiceItem[];
  horsesSection: SectionMeta;
  horses: HorseCard[];
  trainersSection: SectionMeta;
  trainers: TrainerCard[];
  contacts: ContactInfo;
}

export const landingData: LandingData = {
  brand: {
    name: "СЛКС Тамбов",
    logoUrl: `${(import.meta.env?.BASE_URL || '/')}images/slks-logo-transparent.png`,
  },
  navigation: [
    { id: "hero", label: "Главная", href: "#hero" },
    { id: "infrastructure", label: "Инфраструктура", href: "#infrastructure" },
    { id: "services", label: "Услуги", href: "#services" },
    { id: "horses", label: "Лошади", href: "#horses" },
    { id: "trainers", label: "Тренеры", href: "#trainers" },
    { id: "contacts", label: "Контакты", href: "#contacts" },
  ],
  hero: {
    badge: "Тамбов · ул. Бастионная, 22Ас2",
    title: "Искусство быть в седле",
    subtitle:
      "Семейный конный клуб «Союз любителей конного спорта». Обучение верховой езде детей и взрослых, профессиональный конкур и бережный постой лошадей.",
    primaryCtaText: "Записаться на занятие",
    secondaryCtaText: "Инфраструктура",
    mediaUrl:
      `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    metrics: [
      { value: "100%", label: "Безопасность и еврогрунт" },
      { value: "3+", label: "Лет: пони-клуб для детей" },
      { value: "24/7", label: "Заботливый присмотр и уход" },
    ],
  },
  infrastructureSection: {
    eyebrow: "Инфраструктура",
    title: "Пространство, где растут всадники",
    description:
      "Современный крытый манеж со специализированным грунтом, светлые денники и открытые левады для безопасных тренировок в любое время года.",
  },
  infrastructure: [
    {
      id: "arena",
      badge: "Круглый год",
      title: "Крытый отапливаемый манеж",
      description:
        "Специализированный еврогрунт с регулярным боронованием и увлажнением для максимальной защиты суставов лошадей.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
      specs: [
        { label: "Покрытие", value: "Еврогрунт" },
        { label: "Направление", value: "Конкур / Езда" },
        { label: "Сезон", value: "Всесезонно" },
      ],
    },
    {
      id: "stables",
      badge: "Комфорт 24/7",
      title: "Европейская конюшня и постой",
      description:
        "Просторные вентилируемые денники 3×4 м, автоматические поилки, качественные корма и ежедневный выгул в левадах.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
      specs: [
        { label: "Денники", value: "3×4 метра" },
        { label: "Кормление", value: "Индивидуальный рацион" },
        { label: "Выгул", value: "Ежедневно" },
      ],
    },
    {
      id: "kids-area",
      badge: "Семья и дети",
      title: "Детский пони-клуб",
      description:
        "Бережное обучение верховой езде для самых маленьких всадников в игровой форме под постоянным контролем тренера.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
      specs: [
        { label: "Возраст", value: "Дети от 3 лет" },
        { label: "Формат", value: "В поводу" },
        { label: "Пони", value: "Шетлендские" },
      ],
    },
  ],
  servicesSection: {
    eyebrow: "Ваш маршрут в конном спорте",
    title: "Программы тренировок и форматы посещения",
    description:
      "От первого шага в поводу до участия в соревнованиях по конкуру. Выберите подходящий формат занятий для себя или всей семьи.",
  },
  services: [
    {
      id: "single-lesson",
      durationMinutes: 45,
      format: "Индивидуально / манеж",
      title: "Разовое индивидуальное занятие",
      category: "Обучение",
      price: "2 000 ₽",
      description:
        "Работа с тренером один на один. Правильная посадка, базовый баланс и управление на шагу и рыси.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "subscription",
      durationMinutes: 45,
      format: "Индивидуально / манеж",
      title: "Абонемент на тренировки",
      category: "Спорт",
      price: "от 1 800 ₽ / занятие",
      description:
        "Системный курс верховой езды и преодоления препятствий (конкур) для уверенного спортивного роста.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "kids",
      durationMinutes: 20,
      format: "Катание в поводу с инструктором",
      title: "Катание в поводу для детей",
      category: "Для детей",
      price: "1 500 ₽",
      description:
        "Спокойная прогулка на пони или лошади в сопровождении опытного инструктора. Первые яркие впечатления.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "vaulting",
      title: "Вольтижировка",
      category: "Гимнастика",
      price: "по запросу",
      description:
        "Развивающая гимнастика на движущейся лошади. Развивает гибкость, координацию и снимает страх высоты.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "photo",
      title: "Аренда для фотосессий",
      category: "Эстетика",
      price: "по запросу",
      description:
        "Ухоженные грациозные лошади клуба для индивидуальных, свадебных и семейных памятных съемок.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "boarding",
      title: "Постой частных лошадей",
      category: "Содержание",
      price: "по договору",
      description:
        "Полный пансион в светлой конюшне: пятиразовое сбалансированное питание, отбивка, выгул и манеж.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
  ],
  horsesSection: {
    eyebrow: "Характер, доверие и партнёрство",
    title: "Наши лошади",
    description:
      "Воспитанные, контактные и спокойные скакуны и пони, с которыми комфортно и безопасно как новичкам, так и опытным всадникам.",
  },
  horses: [
    {
      id: "horse-1",
      name: "Камелот",
      breed: "Тракененская порода",
      role: "Конкур / Старший состав",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "horse-2",
      name: "Мирабель",
      breed: "Ганноверская порода",
      role: "Выездка / Обучение",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "horse-3",
      name: "Буян",
      breed: "Шетлендский пони",
      role: "Любимец пони-клуба",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
  ],
  trainersSection: {
    eyebrow: "Наставники",
    title: "Тренеры, которые слышат всадника",
    description:
      "Профессионалы с многолетним стажем, бережно передающие культуру верховой езды и тонкости управления скакуном.",
  },
  trainers: [
    {
      id: "trainer-1",
      name: "Екатерина Соколова",
      role: "Старший тренер / Конкур",
      experience: "Опыт более 12 лет",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "trainer-2",
      name: "Ольга Морозова",
      role: "Инструктор пони-клуба и начальной подготовки",
      experience: "Опыт более 8 лет",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
  ],
  contacts: {
    address: "г. Тамбов, ул. Бастионная, д. 22А, стр. 2",
    phone: "+7 (915) 672-00-30",
    altPhone: "+7 (902) 936-47-27",
    workingHours: "Ежедневно с 09:00 до 19:00 (по предварительной записи)",
    vkGroup: "https://vk.com/soyuz68ru",
    telegram: import.meta.env?.VITE_TELEGRAM_URL?.trim() || "https://t.me/+79156720030",
    yandexMapsUrl: "https://yandex.ru/maps/?text=%D0%A1%D0%BE%D1%8E%D0%B7%20%D0%BB%D1%8E%D0%B1%D0%B8%D1%82%D0%B5%D0%BB%D0%B5%D0%B9%20%D0%BA%D0%BE%D0%BD%D0%BD%D0%BE%D0%B3%D0%BE%20%D1%81%D0%BF%D0%BE%D1%80%D1%82%D0%B0%20%D0%A2%D0%B0%D0%BC%D0%B1%D0%BE%D0%B2&ll=41.369035%2C52.745154&z=16",
    coordinates: [52.745154, 41.369035],
    mapCoords: [52.745154, 41.369035],
    coords: [52.745154, 41.369035],
    lat: 52.745154,
    lng: 41.369035,
  },
};