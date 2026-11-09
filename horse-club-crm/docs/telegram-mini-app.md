# Telegram Mini App и бот

## Состав

- `backend/src/modules/telegram-bot/`: grammY polling, `/start`, TelegramAuthGuard, клиентские API.
- `tma/`: отдельный React + TypeScript + Tailwind SPA, без Refine/Ant Design и без изменения зависимостей/маршрутов CRM и лендинга.
- Production-артефакты: `frontend/dist/tma/`; сборка TMA выполняется **после** сборки CRM. Оба deploy-скрипта обновлены.
- `docker/Caddyfile`: отдельный `/tma` SPA fallback, Telegram SDK разрешён в CSP; разрешение встраивания ограничено Telegram и только TMA.

## Конфигурация и выпуск

1. На сервере применить `npx prisma migrate deploy` из backend: миграция `20261108000000_telegram_mini_app` добавляет Telegram ID/username клиента, ключ повторной отправки и аудит согласия на Booking. Prisma Client сгенерирован локально.
2. Указать `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBAPP_URL=https://crm.horseclub68.ru/tma` в production `.env`. Если VDS не достигает `api.telegram.org:443`, указать `TELEGRAM_API_ROOT=https://<доверенный-прокси>`; Compose передаёт все три переменные backend. При пустом токене бот отключён, TMA API отвечает 503.
3. У бота в BotFather настроить домен/кнопку Mini App на этот HTTPS URL. `/start` уже отправляет inline web_app кнопку в личном чате.
4. Выполнить `npm --prefix tma ci` и `npm --prefix tma run build` после `npm --prefix frontend run build`. Обычный deploy делает это автоматически.
5. Запускать только одну polling-реплику backend. Для нескольких реплик нужен отдельный polling worker или webhook-режим.
6. Проверить `/start` и WebApp на реальном Telegram, включая системный выбор даты/тренера и нативную нижнюю кнопку.

### Обход блокировки Telegram на VDS

`TELEGRAM_API_ROOT` — корень Bot API без `/bot<TOKEN>` и без `/getMe`. grammY сам добавляет `/bot<TOKEN>/<method>` ([документация](https://grammy.dev/ref/core/apiclientoptions#apiroot)). Допускается префикс пути прокси. Пустое значение сохраняет стандартный Telegram API. Прокси должен пересылать методы и тела POST на `https://api.telegram.org`, поддерживать long polling и быть доступным из backend-контейнера. Использовать доверенный HTTPS-прокси: через него проходит токен бота; не записывать полный URL запросов в access logs. Размещение прокси на том же заблокированном VDS без другого исходящего маршрута проблему не решает.

После настройки `.env.production` выполнить из корня проекта на VDS (Ubuntu). Для сборки backend должен присутствовать подготовленный каталог `.deploy/prisma/` с Linux-движками, как в существующем процессе выпуска:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --wait backend
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T backend node < scripts/check-telegram.cjs
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=50 backend
```

Smoke check выполняет `getMe` через настроенный API root с таймаутом 10 секунд, проверяет health=200 и TMA без подписи=401; токен и исходные сетевые ошибки не выводит. Ожидаемый лог запуска — `Telegram bot polling started`. Polling запускается без ожидания в Nest lifecycle: недоступность Telegram не задерживает HTTP API CRM.

Готовый код Cloudflare Worker: `deploy/cloudflare-tg-proxy.js` (ES module). При отдельном выпуске Worker добавить secret `TELEGRAM_BOT_TOKEN` с тем же значением, что у backend, через Cloudflare Dashboard → Settings → Variables and Secrets ([документация](https://developers.cloudflare.com/workers/configuration/secrets/)). Worker разрешает только этот токен, фиксированный Telegram upstream и GET/POST, сохраняет POST body и query, не следует redirect и не выводит ошибки с токеном. Не включать логирование URL входящих запросов. До выпуска Worker `TELEGRAM_API_ROOT=` оставить пустым; после выпуска поставить его HTTPS origin без завершающего `/` и пересоздать backend командой выше. До этого исходящая блокировка VDS сохраняется.

Статику собрать в порядке CRM → TMA, иначе сборка CRM удалит `dist/tma`. Если менялся Caddyfile, перезагрузить Caddy: `docker compose --env-file .env.production -f docker-compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`. Затем проверить `/tma/` (HTML), каждый JS/CSS из HTML (200 с корректным MIME), `/tma/my-bookings` (SPA fallback) и `/api/tma/services` (JSON 401 без initData) на CRM-домене. API-домен должен отдавать тот же 401 по `/api/tma/services`. Проверка без подписи подтверждает маршрутизацию и защиту; успешную авторизацию и запись проверять открытием Mini App через Telegram.

## API

Все маршруты требуют заголовок `X-Telegram-Init-Data` с исходной строкой `Telegram.WebApp.initData`.

| Метод и путь | Поведение |
| --- | --- |
| `GET /api/tma/services` | Опубликованные услуги с фактическими ценами, consentVersion |
| `GET /api/tma/slots?date=YYYY-MM-DD&serviceId=UUID` | Слоты через 30 минут и доступные публичные активные тренеры; без serviceId выбирается первая опубликованная услуга |
| `POST /api/tma/bookings` | `{serviceId, trainerId, startTime, phone, requestId, consentAccepted:true, consentVersion}` |
| `GET /api/tma/my-bookings?offset=0&limit=20` | Только записи своего клиента, bounded pagination и hasMore |
| `POST /api/tma/bookings/:id/cancel-request` | Только своя предстоящая запись; флаг запроса отмены, без отмены занятия/финансов |

Каталог предлагает четыре фильтра формата из задачи, а услуги и цены берёт из CRM. Фильтры сопоставляют публичные названия услуг; если подходящей услуги нет, запись в этом формате недоступна. Для названий вне этих форматов есть «Все занятия».

## Идентичность и целостность

Подпись проверяется HMAC-SHA256: секрет `HMAC(key="WebAppData", data=token)`, затем подпись отсортированных декодированных пар без `hash`. Сравнение constant-time. Дубликаты полей, неправильные user/auth_date, подпись и данные старше часа отклоняются. Будущая auth_date допускает лишь 30 секунд рассинхронизации часов. Токен и initData не логируются и не сохраняются в браузере.

Client upsert выполняется по уникальному подписанному Telegram ID; административная JWT-сессия не создаётся. Применяется включённость SCHEDULE и владение clientId; клиентские операции не дают доступ к CRM и её staff RBAC. Архивный профиль не восстанавливается автоматически. Дополнительно ограничены запросы на Telegram ID: 10 запросов слотов и 60 остальных в минуту в единственной backend-реплике.

По задаче владельца от 09.11.2026 при оформлении нормализованный телефон связывает существующую карточку без Telegram ID с текущим пользователем. ID и username переносятся с созданного guard профиля внутри транзакции; карточки и их история не удаляются. Другой Telegram ID у владельца номера отклоняется с HTTP 400; архивная карточка недоступна. При отсутствии владельца номера заполняется уже созданный guard профиль. Имя берётся из подписи при создании клиента; имя существующей карточки не перезаписывается. Ручной ввод номера также допускает автопривязку согласно задаче владельца и не доказывает владение номером. Кнопка SDK заполняет телефон из `requestContact`; отказ или недоступность SDK оставляют ручной ввод, серверный verified-флаг не создаётся.

Создание идёт через существующий LessonsService внутри Serializable-транзакции с повтором при конфликте сериализации. Сервис повторно проверяет опубликованность услуги/тренера, московское расписание, ёмкость тренера и занятость клиента. Сохраняются существующие начисления и финансовые правила. Лошадь и манеж назначает администратор после согласования — TMA не обещает конкретную лошадь или площадку; при назначении действуют существующие ограничения здоровья/нагрузки.

requestId имеет уникальный индекс; повтор после сетевого сбоя возвращает первоначальную запись только её владельцу. Новый слот начинает новое оформление. Согласие хранится с версией и timestamp на записи. Юридические ссылки переиспользуют действующие документы лендинга. Запрос отмены сохраняет резервацию и деньги до обработки администратором существующим процессом CRM.

## Размер и совместимость

Порог проверяется скриптом `tma/scripts/check-size.cjs`: **сумма всех несжатых JS + CSS строго меньше 150 000 байт**. Текущий результат: 149 988 байт; gzip — 49 702 байта. HTML и отдельно загружаемый официальный Telegram SDK не входят в JS/CSS-бандл. React 17.0.2 закреплён только внутри TMA ради этого строгого бюджета; CRM продолжает использовать свой React 19. Дизайн/поведение описаны в `tma/DESIGN.md` и `tma/UX-CONTRACT.md`.

## Проверка

- backend: typecheck, lint без ошибок (3 существующих предупреждения вне Telegram), build; 707 passed, 20 PostgreSQL-тестов skipped.
- frontend: typecheck, lint, build; 20 файлов, 165 passed.
- TMA: typecheck, lint, build с проверкой размера; unit isolation test passed.
- Playwright по production-бандлу: 4 passed. Запись/двойное нажатие, повтор с тем же requestId после 503, отмена, пустые слоты, загрузка/ошибка/повтор, клавиатура, BackButton, тема Telegram и узкий viewport.
- Строгий UI-аудит: `docs/reports/telegram-ui-audit.json`, 0 ошибок. DESIGN.md lint: 0 ошибок; токены текстовых цветов имеют диагностические предупреждения о ссылках из components.
- Prisma Client generated; миграция не применялась к production из локальной среды.
- Caddy/Docker не установлены локально: runtime-валидация Caddy и живой bot token не проверены. Нужен smoke test после серверного выпуска.
