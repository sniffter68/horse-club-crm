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
  max: string;
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
    title: "Ваш первый шаг к лошадям — без страха и суеты",
    subtitle:
      "Спокойные лошади, внимательные тренеры рядом на каждом шагу и забота о безопасности с первых минут в манеже.",
    primaryCtaText: "Попробовать первое занятие",
    secondaryCtaText: "Инфраструктура",
    mediaUrl:
      `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    metrics: [
      { value: "Рядом", label: "Тренер держит лошадь" },
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
    eyebrow: "Знакомство в вашем темпе",
    title: "Выберите, с чего начать",
    description:
      "Опыт не требуется. Попробуйте спокойное занятие, познакомьте малыша с пони или приезжайте всей семьёй.",
  },
  services: [
    {
      id: "single-lesson",
      durationMinutes: 45,
      format: "Индивидуально / манеж",
      title: "Первое знакомство с лошадью и пробное занятие",
      category: "Обучение",
      price: "2 000 ₽",
      description:
        "Опыт не требуется. Спокойный шаг и базовое управление. Тренер всё время держит лошадь под уздцы и помогает освоиться.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "kids",
      durationMinutes: 20,
      format: "Катание в поводу с инструктором",
      title: "Катание на пони для самых маленьких",
      category: "Для детей",
      price: "1 500 ₽",
      description:
        "Для детей от 3–4 лет, по готовности ребёнка. Опыт не требуется. Тренер всё время держит пони под уздцы, а малыш знакомится с движением в спокойном шаговом ритме.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "family-visit",
      title: "Семейный визит и экскурсия по конюшне",
      category: "Для всей семьи",
      price: "по запросу",
      description:
        "Опыт не требуется. Погладьте лошадь, угостите морковкой с разрешения тренера и сделайте фото вместе. Во время знакомства тренер держит лошадь под уздцы.",
      imageUrl: `${(import.meta.env?.BASE_URL || '/')}images/first-meeting-fallback.jpg`,
    },
    {
      id: "subscription",
      durationMinutes: 45,
      format: "Индивидуально / манеж",
      title: "Абонемент на тренировки",
      category: "Продолжить занятия",
      price: "от 1 800 ₽ / занятие",
      description:
        "Продолжайте знакомство с лошадьми на регулярных занятиях. Подбираем нагрузку под ваше самочувствие и осваиваем новое без спешки.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "vaulting",
      title: "Гимнастика на лошади",
      category: "Гимнастика",
      price: "по запросу",
      description:
        "Простые упражнения с поддержкой тренера помогают освоиться в седле и почувствовать равновесие. Сложность подбираем индивидуально.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "photo",
      title: "Фотосессия с лошадьми",
      category: "Эстетика",
      price: "по запросу",
      description:
        "Памятные фотографии с лошадьми для вас и всей семьи. Поможем спокойно познакомиться с лошадью перед съёмкой.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "boarding",
      title: "Постой частных лошадей",
      category: "Содержание",
      price: "по договору",
      description:
        "Ежедневная забота о вашей лошади: светлая конюшня, сбалансированное питание, уборка, прогулки и занятия в манеже.",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
  ],
  horsesSection: {
    eyebrow: "Характер, доверие и партнёрство",
    title: "Наши лошади",
    description:
      "Специально обученные, добрые лошади и пони, привыкшие к детям и первым шагам. Тренер поможет познакомиться и подберёт лошадь для занятия.",
  },
  horses: [
    {
      id: "horse-1",
      name: "Камелот",
      breed: "Тракененская порода",
      role: "Занятия с тренером",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "horse-2",
      name: "Мирабель",
      breed: "Ганноверская порода",
      role: "Знакомство и обучение",
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
      "Объясняем простыми словами, слышим ваши опасения и остаёмся рядом на каждом шагу. Вы можете попросить паузу в любой момент.",
  },
  trainers: [
    {
      id: "trainer-1",
      name: "Екатерина Соколова",
      role: "Старший тренер",
      experience: "Опыт более 12 лет",
      imageUrl:
        `${(import.meta.env?.BASE_URL || '/')}images/horse.jpg`,
    },
    {
      id: "trainer-2",
      name: "Ольга Морозова",
      role: "Инструктор пони-клуба для первых занятий",
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
    max: "https://max.ru/join/Evl2Mp0moqVwQAeBIPaY5ozOrE6rs83dO45_5SrqAvo",
    yandexMapsUrl: "https://yandex.ru/maps/?text=%D0%A1%D0%BE%D1%8E%D0%B7%20%D0%BB%D1%8E%D0%B1%D0%B8%D1%82%D0%B5%D0%BB%D0%B5%D0%B9%20%D0%BA%D0%BE%D0%BD%D0%BD%D0%BE%D0%B3%D0%BE%20%D1%81%D0%BF%D0%BE%D1%80%D1%82%D0%B0%20%D0%A2%D0%B0%D0%BC%D0%B1%D0%BE%D0%B2&ll=41.369035%2C52.745154&z=16",
    coordinates: [52.745154, 41.369035],
    mapCoords: [52.745154, 41.369035],
    coords: [52.745154, 41.369035],
    lat: 52.745154,
    lng: 41.369035,
  },
};
