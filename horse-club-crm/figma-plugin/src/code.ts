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
  color: string;
  fontName?: FontName;
  fontSize: number;
  width: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: HorizontalTextAlignment;
  opacity?: number;
}

interface InfrastructureCardContent {
  badge: string;
  title: string;
  description: string;
  specs: ReadonlyArray<readonly [string, string]>;
  gradient: readonly [string, string];
}

interface ServiceCardContent {
  category: string;
  title: string;
  price: string;
  description: string;
}

const PLUGIN_OWNER = 'slks-tambov-landing-builder';
const FRAME_NAME = 'СЛКС Тамбов — Лендинг';
const UI_WIDTH = 360;
const PAGE = { width: 1440, height: 4510 } as const;

const COLORS = {
  background: '#0B0C0E',
  surface: '#121614',
  surfaceElevated: '#171C19',
  text: '#F5F7F6',
  textMuted: '#A8AFAB',
  textDim: '#737B77',
  accent: '#AEC7B8',
  accentDark: '#173A2D',
  warm: '#C8B98A',
  white: '#FFFFFF',
} as const;

const INTER_REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const INTER_BOLD: FontName = { family: 'Inter', style: 'Bold' };

const INFRASTRUCTURE_CARDS: ReadonlyArray<InfrastructureCardContent> = [
  {
    badge: 'ТРЕНИРОВКИ В ЛЮБОЙ СЕЗОН',
    title: 'Манеж со специализированным грунтом',
    description: 'Подготовленное покрытие бережёт суставы лошади и даёт всаднику уверенную опору.',
    specs: [['Формат', 'Крытый'], ['Грунт', 'Профессиональный'], ['Сезон', 'Круглый год']],
    gradient: ['#25362F', '#0E1713'],
  },
  {
    badge: 'ЗАБОТА 24 / 7',
    title: 'Комфортная конюшня и индивидуальный рацион',
    description: 'Просторные денники, ежедневный выгул и программа кормления под потребности каждой лошади.',
    specs: [['Денники', 'Просторные'], ['Рацион', 'Индивидуальный'], ['Выгул', 'Ежедневный']],
    gradient: ['#3A3025', '#18130F'],
  },
  {
    badge: 'ДЕТЯМ С 3 ЛЕТ',
    title: 'Пони-клуб для первых уверенных шагов',
    description: 'Мягкое знакомство с лошадьми, занятия в игровой форме и безопасность рядом с тренером.',
    specs: [['Возраст', 'От 3 лет'], ['Формат', 'Индивидуально'], ['Темп', 'Бережный']],
    gradient: ['#30334A', '#141522'],
  },
];

const SERVICES: ReadonlyArray<ServiceCardContent> = [
  { category: 'ОБУЧЕНИЕ', title: 'Разовое занятие с тренером', price: '2 000 ₽ / 45 мин', description: 'Персональное знакомство с верховой ездой и базовой техникой.' },
  { category: 'РЕГУЛЯРНО', title: 'Регулярные тренировки', price: '1 800 ₽ / 45 мин', description: 'Системная программа развития навыков для детей и взрослых.' },
  { category: 'ДЕТЯМ', title: 'Катание в поводу', price: '1 500 ₽ / 20 мин', description: 'Безопасная первая встреча ребёнка с лошадью рядом с инструктором.' },
  { category: 'БАЛАНС', title: 'Гимнастика на лошади', price: 'По запросу', description: 'Упражнения для осанки, координации, доверия и чувства равновесия.' },
  { category: 'ВПЕЧАТЛЕНИЯ', title: 'Фотосессии с лошадьми', price: 'По запросу', description: 'Атмосферная съёмка на территории клуба с подготовленной лошадью.' },
  { category: 'ВЛАДЕЛЬЦАМ', title: 'Постой частных лошадей', price: 'По согласованию', description: 'Денник, выгул, кормление и внимательный ежедневный уход.' },
];

function hexToRgb(hex: string): RGB {
  const normalized = hex.trim().replace(/^#/, '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((character: string): string => `${character}${character}`).join('')
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Некорректный HEX-цвет: ${hex}`);
  }
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16) / 255,
    g: Number.parseInt(expanded.slice(2, 4), 16) / 255,
    b: Number.parseInt(expanded.slice(4, 6), 16) / 255,
  };
}

function hexToRgba(hex: string, alpha = 1): RGBA {
  return { ...hexToRgb(hex), a: Math.max(0, Math.min(1, alpha)) };
}

function solidPaint(hex: string, opacity = 1): SolidPaint {
  return { type: 'SOLID', color: hexToRgb(hex), opacity };
}

function gradientPaint(from: string, to: string): GradientPaint {
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: [
      { position: 0, color: hexToRgba(from) },
      { position: 1, color: hexToRgba(to) },
    ],
  };
}

function createFrameNode(name: string, width: number, height: number, fill: Paint, cornerRadius = 0): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, height);
  frame.fills = [fill];
  frame.cornerRadius = cornerRadius;
  frame.clipsContent = true;
  return frame;
}

function createTextNode(options: TextOptions): TextNode {
  const node = figma.createText();
  node.name = options.name;
  node.fontName = options.fontName ?? INTER_REGULAR;
  node.fontSize = options.fontSize;
  node.characters = options.content;
  node.fills = [solidPaint(options.color)];
  node.lineHeight = { unit: 'PIXELS', value: options.lineHeight ?? Math.round(options.fontSize * 1.2) };
  node.letterSpacing = { unit: 'PIXELS', value: options.letterSpacing ?? 0 };
  node.textAlignHorizontal = options.textAlign ?? 'LEFT';
  node.opacity = options.opacity ?? 1;
  node.textAutoResize = 'HEIGHT';
  node.resize(options.width, Math.max(1, node.height));
  return node;
}

function appendAt(parent: FrameNode, node: SceneNode, x: number, y: number): void {
  parent.appendChild(node);
  node.x = x;
  node.y = y;
}

function applyGlassStyle(frame: FrameNode): void {
  frame.fills = [solidPaint(COLORS.surfaceElevated, 0.82)];
  frame.strokes = [solidPaint(COLORS.white, 0.1)];
  frame.strokeWeight = 1;
  frame.effects = [
    { type: 'DROP_SHADOW', color: hexToRgba('#000000', 0.28), offset: { x: 0, y: 18 }, radius: 42, spread: 0, visible: true, blendMode: 'NORMAL' },
    { type: 'BACKGROUND_BLUR', blurType: 'NORMAL', radius: 24, visible: true },
  ];
}

function createPill(label: string, width: number, background: string, foreground: string): FrameNode {
  const pill = createFrameNode(`Кнопка — ${label}`, width, 52, solidPaint(background), 999);
  pill.layoutMode = 'HORIZONTAL';
  pill.primaryAxisAlignItems = 'CENTER';
  pill.counterAxisAlignItems = 'CENTER';
  pill.primaryAxisSizingMode = 'FIXED';
  pill.counterAxisSizingMode = 'FIXED';
  pill.appendChild(createTextNode({ content: label, name: 'Текст кнопки', color: foreground, fontName: INTER_BOLD, fontSize: 15, width: width - 32, lineHeight: 20, textAlign: 'CENTER' }));
  return pill;
}

function createSectionHeading(parent: FrameNode, eyebrow: string, title: string, description: string, y: number): void {
  appendAt(parent, createTextNode({ content: eyebrow, name: 'Надзаголовок секции', color: COLORS.accent, fontName: INTER_BOLD, fontSize: 13, width: 360, lineHeight: 18, letterSpacing: 2.2 }), 80, y);
  appendAt(parent, createTextNode({ content: title, name: 'Заголовок секции', color: COLORS.text, fontName: INTER_BOLD, fontSize: 52, width: 760, lineHeight: 58, letterSpacing: -1.8 }), 80, y + 42);
  appendAt(parent, createTextNode({ content: description, name: 'Описание секции', color: COLORS.textMuted, fontSize: 18, width: 440, lineHeight: 28 }), 920, y + 48);
}

function createNavbar(): FrameNode {
  const navbar = createFrameNode('Навигация', 1000, 72, solidPaint(COLORS.surfaceElevated, 0.84), 999);
  applyGlassStyle(navbar);
  const logo = createFrameNode('Логотип', 44, 44, gradientPaint('#315B49', '#183226'), 14);
  appendAt(navbar, logo, 14, 14);
  appendAt(logo, createTextNode({ content: 'СЛ', name: 'Монограмма', color: COLORS.white, fontName: INTER_BOLD, fontSize: 13, width: 32, lineHeight: 16, textAlign: 'CENTER' }), 6, 14);
  appendAt(navbar, createTextNode({ content: 'СЛКС Тамбов', name: 'Название бренда', color: COLORS.text, fontName: INTER_BOLD, fontSize: 16, width: 150, lineHeight: 20 }), 72, 26);
  ['Клуб', 'Услуги', 'Контакты'].forEach((item: string, index: number): void => {
    appendAt(navbar, createTextNode({ content: item, name: `Ссылка — ${item}`, color: COLORS.textMuted, fontSize: 15, width: 100, lineHeight: 20, textAlign: 'CENTER' }), 330 + index * 120, 26);
  });
  appendAt(navbar, createPill('Записаться', 150, COLORS.white, COLORS.background), 834, 10);
  return navbar;
}

function createHeroSection(): FrameNode {
  const section = createFrameNode('01 — Hero', PAGE.width, 980, gradientPaint('#101512', COLORS.background));
  const glow = figma.createEllipse();
  glow.name = 'Мягкое свечение';
  glow.resize(720, 720);
  glow.fills = [solidPaint('#204B38', 0.18)];
  glow.effects = [{ type: 'LAYER_BLUR', blurType: 'NORMAL', radius: 120, visible: true }];
  appendAt(section, glow, 820, 70);
  appendAt(section, createNavbar(), 220, 28);
  appendAt(section, createTextNode({ content: 'ТАМБОВ · УЛ. БАСТИОННАЯ, 22А СТР. 2', name: 'География', color: COLORS.warm, fontName: INTER_BOLD, fontSize: 13, width: 520, lineHeight: 20, letterSpacing: 2.4 }), 80, 210);
  appendAt(section, createTextNode({ content: 'Искусство\nбыть в седле', name: 'Главный заголовок', color: COLORS.text, fontName: INTER_BOLD, fontSize: 102, width: 760, lineHeight: 100, letterSpacing: -4.2 }), 72, 288);
  const media = createFrameNode('Фотография — всадник и лошадь', 500, 580, gradientPaint('#3E4C45', '#121715'), 40);
  media.strokes = [solidPaint(COLORS.white, 0.1)];
  media.strokeWeight = 1;
  appendAt(section, media, 860, 180);
  const mediaCircle = figma.createEllipse();
  mediaCircle.name = 'Световой акцент';
  mediaCircle.resize(360, 360);
  mediaCircle.fills = [gradientPaint('#A9BBAF', '#35483E')];
  appendAt(media, mediaCircle, 70, 70);
  appendAt(media, createTextNode({ content: 'ФОТО\nЛОШАДИ И ВСАДНИКА', name: 'Подпись изображения', color: COLORS.white, fontName: INTER_BOLD, fontSize: 20, width: 280, lineHeight: 28, letterSpacing: 1.4, textAlign: 'CENTER', opacity: 0.86 }), 110, 220);
  appendAt(section, createTextNode({ content: 'Семейный конный клуб для детей и взрослых. Обучение верховой езде, конкур и забота о каждой лошади.', name: 'Подзаголовок', color: COLORS.textMuted, fontSize: 20, width: 570, lineHeight: 31 }), 80, 660);
  appendAt(section, createPill('Записаться на занятие', 240, COLORS.white, COLORS.background), 80, 784);
  appendAt(section, createPill('Узнать о клубе', 190, COLORS.surfaceElevated, COLORS.text), 336, 784);
  return section;
}

function createInfrastructureCard(content: InfrastructureCardContent, index: number): FrameNode {
  const card = createFrameNode(`Инфраструктура ${index + 1} — ${content.title}`, 400, 650, solidPaint(COLORS.surface, 0.96), 28);
  card.strokes = [solidPaint(COLORS.white, 0.1)];
  card.strokeWeight = 1;
  const visual = createFrameNode('Изображение', 368, 230, gradientPaint(content.gradient[0], content.gradient[1]), 20);
  appendAt(card, visual, 16, 16);
  appendAt(visual, createTextNode({ content: content.badge, name: 'Бейдж', color: COLORS.white, fontName: INTER_BOLD, fontSize: 11, width: 300, lineHeight: 16, letterSpacing: 1.4, opacity: 0.8 }), 20, 190);
  appendAt(card, createTextNode({ content: content.title, name: 'Название', color: COLORS.text, fontName: INTER_BOLD, fontSize: 25, width: 344, lineHeight: 31, letterSpacing: -0.5 }), 28, 276);
  appendAt(card, createTextNode({ content: content.description, name: 'Описание', color: COLORS.textMuted, fontSize: 15, width: 344, lineHeight: 23 }), 28, 370);
  content.specs.forEach((spec: readonly [string, string], specIndex: number): void => {
    const x = 28 + specIndex * 116;
    appendAt(card, createTextNode({ content: spec[0], name: `Характеристика — ${spec[0]}`, color: COLORS.textDim, fontSize: 11, width: 100, lineHeight: 16 }), x, 510);
    appendAt(card, createTextNode({ content: spec[1], name: `Значение — ${spec[1]}`, color: COLORS.text, fontName: INTER_BOLD, fontSize: 12, width: 104, lineHeight: 17 }), x, 534);
  });
  return card;
}

function createInfrastructureSection(): FrameNode {
  const section = createFrameNode('02 — Инфраструктура', PAGE.width, 1200, solidPaint(COLORS.background));
  createSectionHeading(section, 'ИНФРАСТРУКТУРА', 'Пространство, где растут всадники.', 'Всё необходимое для безопасных занятий, спортивного роста и внимательного ухода за лошадьми.', 110);
  INFRASTRUCTURE_CARDS.forEach((card: InfrastructureCardContent, index: number): void => {
    appendAt(section, createInfrastructureCard(card, index), 80 + index * 432, 360);
  });
  return section;
}

function createServiceCard(content: ServiceCardContent, index: number): FrameNode {
  const card = createFrameNode(`Услуга ${index + 1} — ${content.title}`, 400, 270, solidPaint(COLORS.surface, 0.94), 24);
  card.strokes = [solidPaint(COLORS.white, 0.09)];
  card.strokeWeight = 1;
  appendAt(card, createTextNode({ content: content.category, name: 'Категория', color: COLORS.accent, fontName: INTER_BOLD, fontSize: 10, width: 160, lineHeight: 14, letterSpacing: 1.5 }), 26, 25);
  appendAt(card, createTextNode({ content: content.title, name: 'Название услуги', color: COLORS.text, fontName: INTER_BOLD, fontSize: 22, width: 348, lineHeight: 28, letterSpacing: -0.4 }), 26, 58);
  appendAt(card, createTextNode({ content: content.description, name: 'Описание услуги', color: COLORS.textMuted, fontSize: 14, width: 348, lineHeight: 21 }), 26, 124);
  appendAt(card, createTextNode({ content: content.price, name: 'Стоимость', color: COLORS.warm, fontName: INTER_BOLD, fontSize: 17, width: 230, lineHeight: 22 }), 26, 220);
  appendAt(card, createTextNode({ content: 'Выбрать  →', name: 'Действие', color: COLORS.text, fontName: INTER_BOLD, fontSize: 13, width: 100, lineHeight: 18, textAlign: 'RIGHT' }), 274, 222);
  return card;
}

function createServicesSection(): FrameNode {
  const section = createFrameNode('03 — Услуги', PAGE.width, 1150, gradientPaint('#0E1210', '#111713'));
  createSectionHeading(section, 'УСЛУГИ', 'Ваш путь в конном спорте.', 'Выберите формат знакомства с лошадьми или регулярную программу тренировок.', 105);
  SERVICES.forEach((service: ServiceCardContent, index: number): void => {
    appendAt(section, createServiceCard(service, index), 80 + (index % 3) * 432, 340 + Math.floor(index / 3) * 300);
  });
  return section;
}

function createContactItem(label: string, value: string): FrameNode {
  const item = createFrameNode(`Контакт — ${label}`, 500, 92, solidPaint(COLORS.surface, 0.6), 18);
  item.strokes = [solidPaint(COLORS.white, 0.08)];
  item.strokeWeight = 1;
  appendAt(item, createTextNode({ content: label, name: 'Подпись', color: COLORS.textDim, fontSize: 11, width: 440, lineHeight: 16, letterSpacing: 1.2 }), 22, 17);
  appendAt(item, createTextNode({ content: value, name: 'Значение', color: COLORS.text, fontName: INTER_BOLD, fontSize: 16, width: 450, lineHeight: 22 }), 22, 46);
  return item;
}

function createInputField(label: string, placeholder: string): FrameNode {
  const field = createFrameNode(`Поле — ${label}`, 520, 78, solidPaint(COLORS.background, 0.72), 16);
  field.strokes = [solidPaint(COLORS.white, 0.1)];
  field.strokeWeight = 1;
  appendAt(field, createTextNode({ content: label, name: 'Label', color: COLORS.textDim, fontSize: 10, width: 470, lineHeight: 14, letterSpacing: 1.1 }), 20, 14);
  appendAt(field, createTextNode({ content: placeholder, name: 'Placeholder', color: COLORS.textMuted, fontSize: 15, width: 470, lineHeight: 20 }), 20, 42);
  return field;
}

function createContactsSection(): FrameNode {
  const section = createFrameNode('04 — Контакты и запись', PAGE.width, 1000, solidPaint(COLORS.background));
  createSectionHeading(section, 'КОНТАКТЫ', 'Приезжайте знакомиться.', 'Расскажем о клубе, подберём тренера и удобное время для первого занятия.', 100);
  const contacts = createFrameNode('Контактная информация', 500, 420, solidPaint(COLORS.background, 0));
  appendAt(section, contacts, 80, 350);
  appendAt(contacts, createContactItem('АДРЕС', 'г. Тамбов, ул. Бастионная, д. 22А, стр. 2'), 0, 0);
  appendAt(contacts, createContactItem('ТЕЛЕФОН', '+7 (915) 672-00-30'), 0, 108);
  appendAt(contacts, createContactItem('РЕЖИМ РАБОТЫ', 'Ежедневно с 09:00 до 19:00'), 0, 216);
  appendAt(contacts, createPill('Открыть сообщество VK', 250, COLORS.accentDark, COLORS.text), 0, 340);
  const form = createFrameNode('Форма быстрой записи', 600, 560, solidPaint(COLORS.surfaceElevated, 0.84), 32);
  applyGlassStyle(form);
  appendAt(section, form, 760, 300);
  appendAt(form, createTextNode({ content: 'Быстрая запись', name: 'Заголовок формы', color: COLORS.text, fontName: INTER_BOLD, fontSize: 30, width: 520, lineHeight: 38, letterSpacing: -0.8 }), 40, 38);
  appendAt(form, createTextNode({ content: 'Оставьте контакты — администратор поможет выбрать формат.', name: 'Описание формы', color: COLORS.textMuted, fontSize: 14, width: 500, lineHeight: 21 }), 40, 86);
  appendAt(form, createInputField('ИМЯ', 'Как к вам обращаться'), 40, 145);
  appendAt(form, createInputField('ТЕЛЕФОН', '+7 (___) ___-__-__'), 40, 239);
  appendAt(form, createInputField('УСЛУГА', 'Разовое занятие с тренером  ·  ↓'), 40, 333);
  appendAt(form, createPill('Отправить заявку', 520, COLORS.white, COLORS.background), 40, 449);
  return section;
}

function createFooter(): FrameNode {
  const footer = createFrameNode('05 — Footer', PAGE.width, 180, solidPaint('#090B0A'));
  footer.strokes = [solidPaint(COLORS.white, 0.08)];
  footer.strokeTopWeight = 1;
  appendAt(footer, createTextNode({ content: 'СЛКС Тамбов', name: 'Бренд', color: COLORS.text, fontName: INTER_BOLD, fontSize: 18, width: 220, lineHeight: 24 }), 80, 74);
  appendAt(footer, createTextNode({ content: 'Союз любителей конного спорта  ·  Тамбов  ·  2026', name: 'Копирайт', color: COLORS.textDim, fontSize: 13, width: 500, lineHeight: 20, textAlign: 'RIGHT' }), 860, 76);
  return footer;
}

async function preloadFonts(): Promise<void> {
  await Promise.all([figma.loadFontAsync(INTER_REGULAR), figma.loadFontAsync(INTER_BOLD)]);
}

function findPreviousOutputs(): FrameNode[] {
  return figma.currentPage.children.filter((node: SceneNode): node is FrameNode => node.type === 'FRAME' && node.getPluginData('owner') === PLUGIN_OWNER);
}

async function generateLanding(): Promise<FrameNode> {
  await fontsReady;
  const previous = findPreviousOutputs();
  const position = previous[0]
    ? { x: previous[0].x, y: previous[0].y }
    : { x: Math.round(figma.viewport.center.x - PAGE.width / 2), y: Math.round(figma.viewport.center.y - 360) };
  let pageFrame: FrameNode | null = null;
  try {
    pageFrame = createFrameNode(FRAME_NAME, PAGE.width, PAGE.height, solidPaint(COLORS.background));
    pageFrame.x = position.x;
    pageFrame.y = position.y;
    pageFrame.setPluginData('owner', PLUGIN_OWNER);
    pageFrame.setPluginData('schemaVersion', '2');
    pageFrame.setRelaunchData({ open: 'Открыть генератор лендинга' });
    appendAt(pageFrame, createHeroSection(), 0, 0);
    appendAt(pageFrame, createInfrastructureSection(), 0, 980);
    appendAt(pageFrame, createServicesSection(), 0, 2180);
    appendAt(pageFrame, createContactsSection(), 0, 3330);
    appendAt(pageFrame, createFooter(), 0, 4330);
    previous.forEach((node: FrameNode): void => node.remove());
    figma.currentPage.selection = [pageFrame];
    figma.viewport.scrollAndZoomIntoView([pageFrame]);
    return pageFrame;
  } catch (error: unknown) {
    pageFrame?.remove();
    throw error;
  }
}

function isUiMessage(message: unknown): message is UiMessage {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false;
  if (message.type === 'generate-landing') return true;
  return message.type === 'resize-ui' && 'height' in message && typeof message.height === 'number' && Number.isFinite(message.height);
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
void fontsReady.then((): void => postToUi({ type: 'fonts-ready' })).catch((error: unknown): void => postToUi({ type: 'error', message: getErrorMessage(error) }));

figma.ui.onmessage = async (message: unknown): Promise<void> => {
  if (!isUiMessage(message)) {
    figma.notify('Плагин получил неизвестное сообщение.', { error: true });
    return;
  }
  if (message.type === 'resize-ui') {
    figma.ui.resize(UI_WIDTH, Math.max(260, Math.min(560, Math.round(message.height))));
    return;
  }
  postToUi({ type: 'generation-started' });
  try {
    const frame = await generateLanding();
    postToUi({ type: 'generation-complete', frameName: frame.name });
    figma.notify('Лендинг СЛКС Тамбов создан.');
  } catch (error: unknown) {
    const messageText = getErrorMessage(error);
    postToUi({ type: 'error', message: messageText });
    figma.notify(`Не удалось создать лендинг: ${messageText}`, { error: true });
  }
};
