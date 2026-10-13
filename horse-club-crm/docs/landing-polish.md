# Лендинг: каталог, заявка, производительность и проверки

## Поведение

- Общие `CatalogPhoto`/`CatalogBadges` и CSS-карточки используют фото 4:3, `object-fit: cover`, стабильную геометрию, перенос длинных слов и равную высоту карточек в ряду. Кнопки выбора находятся снизу. Описания в превью занимают 3–4 строки; полные тексты доступны через раскрытие услуги или диалог лошади/тренера.
- Выбор карточки переводит к форме и фокусирует её заголовок. Услуга выбирается автоматически, реальный UUID отправляется как `serviceId`. Лошадь и тренер видны отдельными удаляемыми метками и добавляются к `notes` заявки. Комментарий и контакты пользователя сохраняются при выборе и ошибке API. Перед отправкой проверяется общий лимит комментария 2000 символов.
- `catalogFormat.ts` переводит известные legacy-коды в русские подписи; неизвестные технические коды не публикуются. Поля в Prisma являются свободным текстом, русский редакционный текст сохраняется. Цены форматируются через `Intl.NumberFormat('ru-RU')`, длительность — в минутах.
- Меню и подробности используют native `dialog`: инертный фон, фокус внутри окна, Escape и возврат к открывшей кнопке. Плавное движение отключается при `prefers-reduced-motion`.

## Изображения и CSP

- Caddy использует единственный общий CSP для API, CRM и лендинга: `img-src 'self' data: https:`. HTTPS-фото с `api.horseclub68.ru` и внешних CDN разрешены; HTTP-фото на HTTPS-сайте нужно заменить на HTTPS во избежание mixed content. `/uploads/*` проксируется на каждом домене до SPA fallback.
- UUID-файлы имеют `Cache-Control: public, max-age=31536000, immutable`: заменённая фотография получает новый URL. Не перезаписывать существующие UUID-файлы вручную.
- Новые фото из CRM уменьшаются браузером до 1600 px по длинной стороне и кодируются в WebP с качеством 82%, если результат меньше оригинала. Маленькие файлы остаются исходными. Ограничение исходного файла 5 МиБ и серверная валидация сохраняются. Старые файлы автоматически не перекодируются.
- Hero использует оптимизированный WebP того же прозрачного всадника (~139 КБ вместо 1,35 МБ PNG), логотип — WebP 96 px (~3,5 КБ вместо 242 КБ). Все картинки ниже первого экрана имеют lazy loading и async decoding. Hero загружается eagerly с высоким приоритетом и явными размерами.
- Tailwind обновлён до v4 с Vite-плагином; существующая тема подключается через `@config`. Устаревшая уязвимая цепочка glob/selector зависимостей удалена.
- Крупный CRM-бандл разделён на кешируемые чанки в `frontend/vite.config.ts`, React runtime остаётся единым. `strictExecutionOrder: true` обязателен для корректной инициализации библиотек при таком разбиении. Проверка production-preview выполняется теми же Playwright-сценариями через `CRM_TEST_BASE_URL=http://127.0.0.1:5175`.

## SEO и деплой

`landing/index.html` содержит русские title/description, OpenGraph, locale `ru_RU`, canonical и preview image для домена `https://club.horseclub68.ru` из `.env.production.example`. Для другого домена обновить canonical, `og:url` и абсолютный `og:image` перед сборкой.

Выполнить `npm ci` в `landing` после обновления lockfile, пересобрать оба frontend, обновить backend (cache headers) и перезагрузить Caddy. Новых миграций БД нет. Команды Compose — в [image-uploads.md](image-uploads.md).

## Проверки

```sh
npm --prefix landing run lint
npm --prefix landing run typecheck
npm --prefix landing run build
npm --prefix landing run test:e2e
npm --prefix landing audit
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test
npm run audit:ui
python scripts/test_audit_ui.py
python scripts/audit-ui.py . --mode strict
python scripts/audit-ui.py landing --mode strict
```

В Windows использовать `npm.cmd`. Аудитор берётся из установленного frontend-design-premium; при другом расположении передать `--auditor PATH_TO_audit_project.py`. Адаптер исправляет распознавание JSX, не отключая правила. Оригинальный HTML-парсер ошибочно считает Ant `Form.Item` формой и Ant `Select` нативным select. Тест адаптера проверяет, что реальные нативные нарушения по-прежнему приводят к ошибкам аудита.

Playwright проверяет production-сборку, axe WCAG A/AA, ширины 320/390/768/1440, длинный текст, вертикальные фото, клавиатуру/диалоги/меню, передачу выбранных карточек в заявку, ошибки и повторы, а также CSP из реального Caddyfile. CSP-тест воспроизводит заголовок в браузере; он не заменяет `caddy validate` и smoke-проверку работающего reverse proxy на сервере. Live-тест требует `RUN_LANDING_LIVE=true` и настроенную БД; по умолчанию пропущен.
