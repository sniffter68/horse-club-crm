---
version: alpha
name: "СЛКС · Запись в Telegram"
colors:
  background: "#F7F4F0"
  surface: "#FFFFFF"
  text: "#3A2F2B"
  primary: "#234D3C"
  hint: "#6C655F"
  success: "#3E5F48"
typography:
  sans:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  display:
    fontFamily: "Georgia, serif"
rounded:
  DEFAULT: "0.75rem"
  card: "1rem"
spacing:
  page: "1.25rem"
  control: "3rem"
components:
  choice:
    rounded: "1rem"
---

## Overview

Посетители КСК «СЛКС» выбирают занятие с телефона внутри Telegram. Спокойная клубная приёмная, узнаваемый наборный знак СЛКС, зелёный цвет конного поля. Выразительность сосредоточена в заголовке и знаке, расписание остаётся простым. Общие с CRM бумажный фон, цвет текста и Georgia; без загрузки Ant Design/Refine. Без внешних шрифтов, фотографий и декоративной анимации.

## Colors

Runtime-владелец — `src/styles.css`, токены `--tma-*`. Цвета Telegram `bg_color`, `text_color`, `button_color`, `button_text_color`, `hint_color`, `secondary_bg_color` имеют приоритет через `applyTheme` в `src/telegram.ts`. Светлая и тёмная темы имеют локальные fallback. Статусы — мягкие бейджи с текстом. Выбор отмечается рамкой и `aria-pressed`.

## Typography

Georgia только в заголовке и знаке клуба; системный sans для чтения и форм. Русская локаль, рубли, григорианский календарь и Europe/Moscow.

## Layout

Одна колонка до 576px, отступ 20px, нативные Telegram MainButton/BackButton. Календарь и выбор тренера используют системные date/select — системный popup допустим в мобильном WebView. Документ прокручивается естественно; нижний safe area учитывается.

## Elevation & Depth

Без теней на поверхностях; рамка выделяет выбор. Нет маркетинговых градиентов и тяжёлых изображений.

## Shapes

Контролы 12px, карточки 16px. Минимум 44px для кнопок.

## Components

Общие владельцы TMA: `App.tsx` — выбор/оформление, `MyBookings` — история/отмена, `useTelegramNavigation` — нижняя кнопка и назад, `api.ts` — транспорт/ошибки/форматирование. Различие с CRM намеренное: отдельный пользовательский SPA без административных зависимостей. Семантические HTML-контролы вместо импорта CRM-примитивов.

## Do's and Don'ts

Сохранять ввод при ошибке, блокировать повторную отправку, обновлять слоты при смене даты с отменой старого запроса. Не выдавать отсутствие ошибки за подтверждение администратором. Не назначать лошадь автоматически. Не хранить initData в URL или storage.
