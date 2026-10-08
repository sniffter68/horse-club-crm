type UiMessage =
  | { type: 'generate-landing' }
  | { type: 'resize-ui'; height: number };

type SandboxMessage =
  | { type: 'fonts-ready' }
  | { type: 'generation-started' }
  | { type: 'generation-complete'; frameName: string }
  | { type: 'error'; message: string };

type HorizontalTextAlignment = 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';

interface TextOptions {
  content: string;
  name: string;
  color?: string;
  fontName?: FontName;
  fontSize: number;
  width: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: HorizontalTextAlignment;
}

interface PackageContent {
  name: string;
  eyebrow: string;
  price: string;
  description: string;
  features: readonly string[];
  featured: boolean;
}

interface CoachContent {
  role: string;
  rank: 'МСМК' | 'МС' | 'КМС';
  specialization: string;
  experience: string;
  description: string;
}

interface LogisticsContent {
  label: string;
  value: string;
  description: string;
}

const PLUGIN_OWNER = 'slks-tambov-landing-builder';
const FRAME_NAME = 'СЛКС Тамбов — Конный клуб';
const UI_WIDTH = 360;
const CONTENT_WIDTH = 1280;

const COLORS = {
  page: '#0D1210',
  card: '#141C18',
  border: '#233129',
  accent: '#C5A059',
  text: '#F4F3EF',
  secondary: '#8D9A92',
  darkText: '#17140E',
  transparent: '#000000',
} as const;

const FONTS = {
  regular: { family: 'Inter', style: 'Regular' },
  medium: { family: 'Inter', style: 'Medium' },
  semiBold: { family: 'Inter', style: 'Semi Bold' },
  bold: { family: 'Inter', style: 'Bold' },
} as const satisfies Record<string, FontName>;

const PACKAGES: readonly PackageContent[] = [
  {
    name: 'Базовый',
    eyebrow: 'КОМФОРТНЫЙ ПОСТОЙ',
    price: '35 000 ₽ / мес.',
    description: 'Надёжная ежедневная забота и всё необходимое для спокойной жизни лошади.',
    features: [
      'Просторный денник и ежедневная уборка',
      'Сено, овёс и базовый рацион',
      'Ежедневный выгул в леваде',
      'Контроль состояния дежурным персоналом',
    ],
    featured: false,
  },
  {
    name: 'Спортивный',
    eyebrow: 'ДЛЯ АКТИВНОЙ РАБОТЫ',
    price: '48 000 ₽ / мес.',
    description: 'Постой для лошадей в тренинге с расширенным уходом и спортивным режимом.',
    features: [
      'Всё из пакета «Базовый»',
      'Индивидуальный рацион и добавки',
      'Работа в манеже по графику',
      'Подготовка к тренировкам и шаговка',
      'Координация ветврача и коваля',
    ],
    featured: true,
  },
  {
    name: 'VIP / Берейторский',
    eyebrow: 'ПОЛНОЕ СОПРОВОЖДЕНИЕ',
    price: '75 000 ₽ / мес.',
    description: 'Персональная программа содержания, тренинга и подготовки лошади к стартам.',
    features: [
      'Всё из пакета «Спортивный»',
      'Индивидуальная работа берейтора',
      'Персональный план нагрузок',
      'Груминг и амуниция под контролем',
      'Подготовка и сопровождение на стартах',
    ],
    featured: false,
  },
];

const COACHES: readonly CoachContent[] = [
  {
    role: 'Главный тренер клуба',
    rank: 'МСМК',
    specialization: 'Конкур · подготовка к стартам',
    experience: '18 лет опыта',
    description: 'Спортивная стратегия пары, маршруты, техника прыжка и системная подготовка к турнирам.',
  },
  {
    role: 'Тренер по выездке',
    rank: 'МС',
    specialization: 'Выездка · работа с лошадью',
    experience: '14 лет опыта',
    description: 'Посадка, баланс, качество аллюров и последовательное развитие лошади любого уровня.',
  },
  {
    role: 'Тренер начинающих всадников',
    rank: 'КМС',
    specialization: 'Базовая подготовка · дети и взрослые',
    experience: '9 лет опыта',
    description: 'Безопасное знакомство с лошадью, уверенная посадка и бережный путь к самостоятельной езде.',
  },
];

const LOGISTICS: readonly LogisticsContent[] = [
  {
    label: 'ЗАЕЗД КОНЕВОЗОВ',
    value: 'По предварительному согласованию',
    description: 'Администратор согласует время прибытия и подготовит безопасный маршрут по территории.',
  },
  {
    label: 'ПАРКОВКА',
    value: 'Охраняемая территория',
    description: 'Отдельные места для автомобилей гостей и зона временной стоянки коневозов.',
  },
  {
    label: 'ВРЕМЯ РАБОТЫ',
    value: 'Ежедневно · 09:00–19:00',
    description: 'Посещение, тренировки и заезд осуществляются по предварительной записи.',
  },
];

function hexToRgb(hex: string): RGB {
  const value = hex.trim().replace(/^#/, '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((character: string): string => `${character}${character}`)
          .join('')
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Некорректный HEX-цвет: ${hex}`);
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16) / 255,
    g: Number.parseInt(expanded.slice(2, 4), 16) / 255,
    b: Number.parseInt(expanded.slice(4, 6), 16) / 255,
  };
}

function solidPaint(hex: string, opacity = 1): SolidPaint {
  return {
    type: 'SOLID',
    color: hexToRgb(hex),
    opacity,
  };
}

function linearGradient(from: string, to: string): GradientPaint {
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    gradientStops: [
      { position: 0, color: { ...hexToRgb(from), a: 1 } },
      { position: 1, color: { ...hexToRgb(to), a: 1 } },
    ],
  };
}

function createText(options: TextOptions): TextNode {
  const node = figma.createText();
  node.name = options.name;
  node.fontName = options.fontName ?? FONTS.regular;
  node.fontSize = options.fontSize;
  node.characters = options.content;
  node.fills = [solidPaint(options.color ?? COLORS.text)];
  node.lineHeight = {
    unit: 'PIXELS',
    value: options.lineHeight ?? Math.round(options.fontSize * 1.35),
  };
  node.letterSpacing = {
    unit: 'PIXELS',
    value: options.letterSpacing ?? 0,
  };
  node.textAlignHorizontal = options.textAlign ?? 'LEFT';
  node.textAutoResize = 'HEIGHT';
  node.resize(options.width, Math.max(1, node.height));
  return node;
}

function createVerticalFrame(
  name: string,
  width: number,
  gap: number,
  padding: number,
  fill: Paint = solidPaint(COLORS.transparent, 0),
  radius = 0,
): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, 100);
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'FIXED';
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'MIN';
  frame.paddingTop = padding;
  frame.paddingRight = padding;
  frame.paddingBottom = padding;
  frame.paddingLeft = padding;
  frame.itemSpacing = gap;
  frame.fills = [fill];
  frame.cornerRadius = radius;
  frame.clipsContent = false;
  return frame;
}

function createHorizontalFrame(
  name: string,
  width: number,
  gap: number,
  padding: number,
  fill: Paint = solidPaint(COLORS.transparent, 0),
  radius = 0,
): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, 100);
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'AUTO';
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'MIN';
  frame.paddingTop = padding;
  frame.paddingRight = padding;
  frame.paddingBottom = padding;
  frame.paddingLeft = padding;
  frame.itemSpacing = gap;
  frame.fills = [fill];
  frame.cornerRadius = radius;
  frame.clipsContent = false;
  return frame;
}

function createFixedFrame(
  name: string,
  width: number,
  height: number,
  direction: 'VERTICAL' | 'HORIZONTAL',
  gap: number,
  padding: number,
  fill: Paint,
  radius: number,
): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, height);
  frame.layoutMode = direction;
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'MIN';
  frame.paddingTop = padding;
  frame.paddingRight = padding;
  frame.paddingBottom = padding;
  frame.paddingLeft = padding;
  frame.itemSpacing = gap;
  frame.fills = [fill];
  frame.cornerRadius = radius;
  frame.clipsContent = true;
  return frame;
}

function createSpacer(width: number, height = 1): FrameNode {
  const spacer = figma.createFrame();
  spacer.name = 'Spacer';
  spacer.resize(width, height);
  spacer.fills = [];
  return spacer;
}

function createDivider(width: number): RectangleNode {
  const divider = figma.createRectangle();
  divider.name = 'Divider';
  divider.resize(width, 1);
  divider.fills = [solidPaint(COLORS.border)];
  return divider;
}

function createVerticalDivider(height: number): RectangleNode {
  const divider = figma.createRectangle();
  divider.name = 'Vertical divider';
  divider.resize(1, height);
  divider.fills = [solidPaint(COLORS.border)];
  return divider;
}

function applyCardStyle(frame: FrameNode, featured = false): void {
  frame.strokes = [solidPaint(featured ? COLORS.accent : COLORS.border)];
  frame.strokeWeight = featured ? 2 : 1;
  frame.effects = [
    {
      type: 'DROP_SHADOW',
      color: { ...hexToRgb('#000000'), a: featured ? 0.28 : 0.18 },
      offset: { x: 0, y: 18 },
      radius: 36,
      spread: 0,
      visible: true,
      blendMode: 'NORMAL',
    },
  ];
}

function createBadge(label: string): FrameNode {
  const badge = createHorizontalFrame(
    `Бейдж — ${label}`,
    120,
    0,
    0,
    solidPaint(COLORS.accent),
    999,
  );
  badge.primaryAxisSizingMode = 'AUTO';
  badge.counterAxisSizingMode = 'AUTO';
  badge.paddingTop = 8;
  badge.paddingRight = 12;
  badge.paddingBottom = 8;
  badge.paddingLeft = 12;
  badge.counterAxisAlignItems = 'CENTER';
  badge.appendChild(
    createText({
      content: label,
      name: 'Текст бейджа',
      color: COLORS.darkText,
      fontName: FONTS.bold,
      fontSize: 11,
      width: Math.max(42, label.length * 8),
      lineHeight: 14,
      letterSpacing: 0.8,
      textAlign: 'CENTER',
    }),
  );
  return badge;
}

function createButton(label: string, width: number, secondary = false): FrameNode {
  const button = createFixedFrame(
    `Кнопка — ${label}`,
    width,
    52,
    'HORIZONTAL',
    0,
    0,
    solidPaint(secondary ? COLORS.card : COLORS.accent),
    999,
  );
  button.primaryAxisAlignItems = 'CENTER';
  button.counterAxisAlignItems = 'CENTER';
  button.strokes = secondary ? [solidPaint(COLORS.border)] : [];
  button.strokeWeight = secondary ? 1 : 0;
  button.appendChild(
    createText({
      content: label,
      name: 'Текст кнопки',
      color: secondary ? COLORS.text : COLORS.darkText,
      fontName: FONTS.semiBold,
      fontSize: 14,
      width: width - 32,
      lineHeight: 18,
      textAlign: 'CENTER',
    }),
  );
  return button;
}

function createSectionHeader(
  eyebrow: string,
  title: string,
  description: string,
): FrameNode {
  const header = createHorizontalFrame('Заголовок секции', CONTENT_WIDTH, 80, 0);
  const titleGroup = createVerticalFrame('Название секции', 760, 18, 0);
  titleGroup.appendChild(
    createText({
      content: eyebrow,
      name: 'Надзаголовок',
      color: COLORS.accent,
      fontName: FONTS.semiBold,
      fontSize: 12,
      width: 500,
      lineHeight: 16,
      letterSpacing: 2,
    }),
  );
  titleGroup.appendChild(
    createText({
      content: title,
      name: 'Заголовок',
      fontName: FONTS.bold,
      fontSize: 52,
      width: 760,
      lineHeight: 58,
      letterSpacing: -1.8,
    }),
  );
  header.appendChild(titleGroup);
  header.appendChild(
    createText({
      content: description,
      name: 'Описание секции',
      color: COLORS.secondary,
      fontSize: 18,
      width: 440,
      lineHeight: 28,
    }),
  );
  return header;
}

function createNavbar(): FrameNode {
  const navbar = createFixedFrame(
    'Навигация',
    CONTENT_WIDTH,
    72,
    'HORIZONTAL',
    28,
    14,
    solidPaint(COLORS.card, 0.92),
    999,
  );
  navbar.counterAxisAlignItems = 'CENTER';
  navbar.strokes = [solidPaint(COLORS.border)];
  navbar.strokeWeight = 1;

  const brand = createHorizontalFrame('Бренд', 230, 12, 0);
  brand.counterAxisAlignItems = 'CENTER';
  const mark = createFixedFrame(
    'Знак клуба',
    42,
    42,
    'HORIZONTAL',
    0,
    0,
    solidPaint(COLORS.accent),
    13,
  );
  mark.primaryAxisAlignItems = 'CENTER';
  mark.counterAxisAlignItems = 'CENTER';
  mark.appendChild(
    createText({
      content: 'СЛ',
      name: 'Монограмма',
      color: COLORS.darkText,
      fontName: FONTS.bold,
      fontSize: 12,
      width: 30,
      lineHeight: 16,
      textAlign: 'CENTER',
    }),
  );
  brand.appendChild(mark);
  brand.appendChild(
    createText({
      content: 'СЛКС Тамбов',
      name: 'Название клуба',
      fontName: FONTS.semiBold,
      fontSize: 16,
      width: 160,
      lineHeight: 20,
    }),
  );

  const links = createHorizontalFrame('Ссылки', 360, 32, 0);
  links.counterAxisAlignItems = 'CENTER';
  for (const label of ['Клуб', 'Постой', 'Тренеры', 'Контакты']) {
    links.appendChild(
      createText({
        content: label,
        name: `Ссылка — ${label}`,
        color: COLORS.secondary,
        fontName: FONTS.medium,
        fontSize: 14,
        width: 66,
        lineHeight: 18,
        textAlign: 'CENTER',
      }),
    );
  }

  navbar.appendChild(brand);
  navbar.appendChild(createSpacer(286));
  navbar.appendChild(links);
  navbar.appendChild(createButton('Записаться', 160));
  return navbar;
}

function createHeroSpec(label: string, value: string): FrameNode {
  const card = createVerticalFrame(
    `Характеристика — ${label}`,
    296,
    9,
    24,
    solidPaint(COLORS.card),
    20,
  );
  card.strokes = [solidPaint(COLORS.border)];
  card.strokeWeight = 1;
  card.appendChild(
    createText({
      content: label,
      name: 'Подпись',
      color: COLORS.secondary,
      fontName: FONTS.medium,
      fontSize: 11,
      width: 248,
      lineHeight: 15,
      letterSpacing: 1.2,
    }),
  );
  card.appendChild(
    createText({
      content: value,
      name: 'Значение',
      fontName: FONTS.semiBold,
      fontSize: 18,
      width: 248,
      lineHeight: 24,
    }),
  );
  return card;
}

function createHeroSection(): FrameNode {
  const section = createVerticalFrame(
    '01 — Hero + Specs',
    1440,
    72,
    80,
    solidPaint(COLORS.page),
  );
  section.paddingTop = 28;
  section.paddingBottom = 100;
  section.appendChild(createNavbar());

  const content = createHorizontalFrame('Hero content', CONTENT_WIDTH, 80, 0);
  content.counterAxisAlignItems = 'CENTER';

  const copy = createVerticalFrame('Hero copy', 730, 26, 0);
  copy.appendChild(
    createText({
      content: 'ТАМБОВ · УЛ. БАСТИОННАЯ, 22А СТР. 2',
      name: 'Адрес',
      color: COLORS.accent,
      fontName: FONTS.semiBold,
      fontSize: 12,
      width: 600,
      lineHeight: 16,
      letterSpacing: 2.2,
    }),
  );
  copy.appendChild(
    createText({
      content: 'Искусство\nбыть в седле',
      name: 'Главный заголовок',
      fontName: FONTS.bold,
      fontSize: 96,
      width: 730,
      lineHeight: 94,
      letterSpacing: -4,
    }),
  );
  copy.appendChild(
    createText({
      content: 'Семейный конный клуб «Союз любителей конного спорта». Обучение детей и взрослых, профессиональный тренинг, конкур и выездка.',
      name: 'Описание',
      color: COLORS.secondary,
      fontSize: 19,
      width: 620,
      lineHeight: 30,
    }),
  );
  const actions = createHorizontalFrame('Hero actions', 500, 16, 0);
  actions.counterAxisAlignItems = 'CENTER';
  actions.appendChild(createButton('Записаться на занятие', 238));
  actions.appendChild(createButton('Узнать о клубе', 190, true));
  copy.appendChild(actions);

  const visual = createFixedFrame(
    'Фото — лошадь и всадник',
    470,
    520,
    'VERTICAL',
    24,
    32,
    linearGradient('#314039', '#111713'),
    34,
  );
  visual.primaryAxisAlignItems = 'SPACE_BETWEEN';
  visual.strokes = [solidPaint(COLORS.border)];
  visual.strokeWeight = 1;
  visual.appendChild(createBadge('КОННЫЙ СПОРТ'));
  visual.appendChild(
    createText({
      content: 'Сила. Баланс.\nДоверие.',
      name: 'Подпись изображения',
      fontName: FONTS.bold,
      fontSize: 38,
      width: 360,
      lineHeight: 44,
      letterSpacing: -1,
    }),
  );

  content.appendChild(copy);
  content.appendChild(visual);
  section.appendChild(content);

  const specs = createHorizontalFrame('Specs', CONTENT_WIDTH, 32, 0);
  specs.appendChild(createHeroSpec('МАНЕЖ', 'Крытый · еврогрунт'));
  specs.appendChild(createHeroSpec('НАПРАВЛЕНИЯ', 'Конкур · выездка'));
  specs.appendChild(createHeroSpec('ФОРМАТ', 'Дети и взрослые'));
  specs.appendChild(createHeroSpec('ГРАФИК', 'Ежедневно · 09–19'));
  section.appendChild(specs);
  return section;
}

function createFeatureItem(text: string, width: number): FrameNode {
  const row = createHorizontalFrame(`Пункт — ${text}`, width, 12, 0);
  row.counterAxisAlignItems = 'CENTER';
  const dot = figma.createEllipse();
  dot.name = 'Маркер';
  dot.resize(8, 8);
  dot.fills = [solidPaint(COLORS.accent)];
  row.appendChild(dot);
  row.appendChild(
    createText({
      content: text,
      name: 'Текст пункта',
      color: COLORS.secondary,
      fontSize: 13,
      width: width - 20,
      lineHeight: 20,
    }),
  );
  return row;
}

function createPackageCard(item: PackageContent): FrameNode {
  const card = createVerticalFrame(
    `Пакет — ${item.name}`,
    410,
    22,
    30,
    solidPaint(COLORS.card),
    26,
  );
  applyCardStyle(card, item.featured);
  const top = createHorizontalFrame('Название и бейдж', 350, 12, 0);
  top.counterAxisAlignItems = 'CENTER';
  top.appendChild(
    createText({
      content: item.eyebrow,
      name: 'Категория',
      color: COLORS.accent,
      fontName: FONTS.semiBold,
      fontSize: 10,
      width: item.featured ? 205 : 350,
      lineHeight: 14,
      letterSpacing: 1.4,
    }),
  );
  if (item.featured) top.appendChild(createBadge('ПОПУЛЯРНЫЙ'));
  card.appendChild(top);
  card.appendChild(
    createText({
      content: item.name,
      name: 'Название пакета',
      fontName: FONTS.bold,
      fontSize: 28,
      width: 350,
      lineHeight: 34,
      letterSpacing: -0.6,
    }),
  );
  card.appendChild(
    createText({
      content: item.price,
      name: 'Стоимость',
      color: COLORS.accent,
      fontName: FONTS.semiBold,
      fontSize: 21,
      width: 350,
      lineHeight: 28,
    }),
  );
  card.appendChild(
    createText({
      content: item.description,
      name: 'Описание пакета',
      color: COLORS.secondary,
      fontSize: 14,
      width: 350,
      lineHeight: 22,
    }),
  );
  card.appendChild(createDivider(350));
  const features = createVerticalFrame('Включено', 350, 13, 0);
  for (const feature of item.features) {
    features.appendChild(createFeatureItem(feature, 350));
  }
  card.appendChild(features);
  card.appendChild(createSpacer(350, item.features.length === 4 ? 20 : 1));
  card.appendChild(createButton('Выбрать пакет', 350, !item.featured));
  return card;
}

function createPackagesSection(): FrameNode {
  const section = createVerticalFrame(
    '02 — Пакеты постоя',
    1440,
    64,
    80,
    solidPaint('#101612'),
  );
  section.paddingTop = 112;
  section.paddingBottom = 112;
  section.appendChild(
    createSectionHeader(
      'ПАКЕТЫ ПОСТОЯ',
      'Условия для здоровья и результата.',
      'Три уровня сопровождения — от ежедневного ухода до полной спортивной подготовки лошади.',
    ),
  );
  const row = createHorizontalFrame('Карточки пакетов', CONTENT_WIDTH, 25, 0);
  for (const item of PACKAGES) row.appendChild(createPackageCard(item));
  section.appendChild(row);
  return section;
}

function createCoachCard(coach: CoachContent, index: number): FrameNode {
  const card = createVerticalFrame(
    `Тренер ${index + 1} — ${coach.role}`,
    410,
    22,
    24,
    solidPaint(COLORS.card),
    26,
  );
  applyCardStyle(card);
  const portrait = createFixedFrame(
    'Портрет тренера',
    362,
    250,
    'VERTICAL',
    0,
    20,
    linearGradient(index === 1 ? '#3B3527' : '#293A32', '#111713'),
    18,
  );
  portrait.primaryAxisAlignItems = 'SPACE_BETWEEN';
  portrait.appendChild(createBadge(coach.rank));
  portrait.appendChild(
    createText({
      content: `0${index + 1}`,
      name: 'Номер профиля',
      color: COLORS.text,
      fontName: FONTS.bold,
      fontSize: 46,
      width: 100,
      lineHeight: 52,
    }),
  );
  card.appendChild(portrait);
  card.appendChild(
    createText({
      content: coach.role,
      name: 'Роль',
      fontName: FONTS.bold,
      fontSize: 24,
      width: 362,
      lineHeight: 30,
      letterSpacing: -0.4,
    }),
  );
  card.appendChild(
    createText({
      content: coach.specialization,
      name: 'Специализация',
      color: COLORS.accent,
      fontName: FONTS.semiBold,
      fontSize: 13,
      width: 362,
      lineHeight: 18,
    }),
  );
  card.appendChild(
    createText({
      content: coach.description,
      name: 'Описание тренера',
      color: COLORS.secondary,
      fontSize: 14,
      width: 362,
      lineHeight: 22,
    }),
  );
  card.appendChild(createDivider(362));
  card.appendChild(
    createText({
      content: coach.experience,
      name: 'Опыт',
      fontName: FONTS.medium,
      fontSize: 14,
      width: 362,
      lineHeight: 20,
    }),
  );
  return card;
}

function createCoachesSection(): FrameNode {
  const section = createVerticalFrame(
    '03 — Тренерский состав',
    1440,
    64,
    80,
    solidPaint(COLORS.page),
  );
  section.paddingTop = 112;
  section.paddingBottom = 112;
  section.appendChild(
    createSectionHeader(
      'ТРЕНЕРСКИЙ СОСТАВ',
      'Опыт, который превращается в уверенность.',
      'Специалисты по конкуру, выездке и базовой подготовке выстраивают программу под цели каждой пары.',
    ),
  );
  const row = createHorizontalFrame('Карточки тренеров', CONTENT_WIDTH, 25, 0);
  COACHES.forEach((coach: CoachContent, index: number): void => {
    row.appendChild(createCoachCard(coach, index));
  });
  section.appendChild(row);
  return section;
}

function createLogisticsItem(item: LogisticsContent): FrameNode {
  const card = createVerticalFrame(
    `Логистика — ${item.label}`,
    719,
    12,
    22,
    solidPaint('#101612'),
    18,
  );
  card.strokes = [solidPaint(COLORS.border)];
  card.strokeWeight = 1;
  card.appendChild(
    createText({
      content: item.label,
      name: 'Параметр',
      color: COLORS.accent,
      fontName: FONTS.semiBold,
      fontSize: 10,
      width: 675,
      lineHeight: 14,
      letterSpacing: 1.4,
    }),
  );
  card.appendChild(
    createText({
      content: item.value,
      name: 'Значение',
      fontName: FONTS.semiBold,
      fontSize: 17,
      width: 675,
      lineHeight: 23,
    }),
  );
  card.appendChild(
    createText({
      content: item.description,
      name: 'Описание',
      color: COLORS.secondary,
      fontSize: 13,
      width: 675,
      lineHeight: 20,
    }),
  );
  return card;
}

function createContactsSection(): FrameNode {
  const section = createVerticalFrame(
    '04 — Контакты и логистика',
    1440,
    64,
    80,
    solidPaint('#101612'),
  );
  section.paddingTop = 112;
  section.paddingBottom = 112;
  section.appendChild(
    createSectionHeader(
      'КОНТАКТЫ И ЛОГИСТИКА',
      'Удобный заезд. Спокойное размещение.',
      'Согласуем визит, подготовим территорию к прибытию коневоза и ответим на вопросы по постою.',
    ),
  );

  const contactCard = createHorizontalFrame(
    'Контактная карточка',
    CONTENT_WIDTH,
    40,
    40,
    solidPaint(COLORS.card),
    30,
  );
  applyCardStyle(contactCard);

  const contacts = createVerticalFrame('Основные контакты', 400, 20, 0);
  contacts.appendChild(
    createText({
      content: 'СЛКС Тамбов',
      name: 'Название клуба',
      fontName: FONTS.bold,
      fontSize: 30,
      width: 400,
      lineHeight: 38,
      letterSpacing: -0.8,
    }),
  );
  contacts.appendChild(
    createText({
      content: 'г. Тамбов, ул. Бастионная,\nд. 22А, стр. 2',
      name: 'Адрес',
      color: COLORS.secondary,
      fontSize: 16,
      width: 400,
      lineHeight: 25,
    }),
  );
  contacts.appendChild(
    createText({
      content: '+7 (915) 672-00-30\n+7 (902) 936-47-27',
      name: 'Телефоны',
      fontName: FONTS.semiBold,
      fontSize: 18,
      width: 400,
      lineHeight: 28,
    }),
  );
  contacts.appendChild(createButton('Связаться с клубом', 260));

  const logistics = createVerticalFrame('Параметры логистики', 719, 16, 0);
  for (const item of LOGISTICS) logistics.appendChild(createLogisticsItem(item));

  contactCard.appendChild(contacts);
  contactCard.appendChild(createVerticalDivider(430));
  contactCard.appendChild(logistics);
  section.appendChild(contactCard);
  return section;
}

function createFooter(): FrameNode {
  const footer = createHorizontalFrame(
    '05 — Footer',
    1440,
    24,
    80,
    solidPaint(COLORS.page),
  );
  footer.paddingTop = 54;
  footer.paddingBottom = 54;
  footer.counterAxisAlignItems = 'CENTER';
  footer.strokes = [solidPaint(COLORS.border)];
  footer.strokeTopWeight = 1;
  footer.appendChild(
    createText({
      content: 'СЛКС Тамбов',
      name: 'Бренд',
      fontName: FONTS.semiBold,
      fontSize: 17,
      width: 240,
      lineHeight: 22,
    }),
  );
  footer.appendChild(createSpacer(596));
  footer.appendChild(
    createText({
      content: 'Союз любителей конного спорта · 2026',
      name: 'Копирайт',
      color: COLORS.secondary,
      fontSize: 13,
      width: 420,
      lineHeight: 18,
      textAlign: 'RIGHT',
    }),
  );
  return footer;
}

async function preloadFonts(): Promise<void> {
  await Promise.all([
    figma.loadFontAsync(FONTS.regular),
    figma.loadFontAsync(FONTS.medium),
    figma.loadFontAsync(FONTS.semiBold),
    figma.loadFontAsync(FONTS.bold),
  ]);
}

function findPreviousOutputs(): FrameNode[] {
  return figma.currentPage.children.filter(
    (node: SceneNode): node is FrameNode =>
      node.type === 'FRAME' && node.getPluginData('owner') === PLUGIN_OWNER,
  );
}

function createRootFrame(): FrameNode {
  const root = createVerticalFrame(
    FRAME_NAME,
    1440,
    0,
    0,
    solidPaint(COLORS.page),
  );
  root.clipsContent = true;
  root.setPluginData('owner', PLUGIN_OWNER);
  root.setPluginData('schemaVersion', '3');
  root.setRelaunchData({ open: 'Открыть генератор лендинга' });
  root.appendChild(createHeroSection());
  root.appendChild(createPackagesSection());
  root.appendChild(createCoachesSection());
  root.appendChild(createContactsSection());
  root.appendChild(createFooter());
  return root;
}

async function generateLanding(): Promise<FrameNode> {
  await fontsReady;
  const previous = findPreviousOutputs();
  const position = previous[0]
    ? { x: previous[0].x, y: previous[0].y }
    : {
        x: Math.round(figma.viewport.center.x - 720),
        y: Math.round(figma.viewport.center.y - 360),
      };

  let root: FrameNode | null = null;
  try {
    root = createRootFrame();
    root.x = position.x;
    root.y = position.y;
    previous.forEach((node: FrameNode): void => node.remove());
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    return root;
  } catch (error: unknown) {
    root?.remove();
    throw error;
  }
}

function isUiMessage(message: unknown): message is UiMessage {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false;
  }
  if (message.type === 'generate-landing') return true;
  return (
    message.type === 'resize-ui' &&
    'height' in message &&
    typeof message.height === 'number' &&
    Number.isFinite(message.height)
  );
}

function postToUi(message: SandboxMessage): void {
  figma.ui.postMessage(message);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}

figma.root.setRelaunchData({ open: 'Открыть генератор лендинга' });
figma.showUI(__html__, { width: UI_WIDTH, height: 420, themeColors: true });

const fontsReady: Promise<void> = preloadFonts();
void fontsReady
  .then((): void => postToUi({ type: 'fonts-ready' }))
  .catch((error: unknown): void => {
    postToUi({ type: 'error', message: getErrorMessage(error) });
  });

figma.ui.onmessage = async (message: unknown): Promise<void> => {
  if (!isUiMessage(message)) {
    figma.notify('Плагин получил неизвестное сообщение.', { error: true });
    return;
  }

  if (message.type === 'resize-ui') {
    figma.ui.resize(
      UI_WIDTH,
      Math.max(260, Math.min(560, Math.round(message.height))),
    );
    return;
  }

  postToUi({ type: 'generation-started' });
  try {
    const frame = await generateLanding();
    postToUi({ type: 'generation-complete', frameName: frame.name });
    figma.notify('Структура конного клуба создана.');
  } catch (error: unknown) {
    const messageText = getErrorMessage(error);
    postToUi({ type: 'error', message: messageText });
    figma.notify(`Не удалось создать структуру: ${messageText}`, {
      error: true,
    });
  }
};
