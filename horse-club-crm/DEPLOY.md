# Первый запуск на Ubuntu VPS

## 1. Подготовьте сервер и DNS

Создайте DNS-записи `A`/`AAAA` для доменов лендинга, CRM и API, направленные на VPS. Откройте входящие TCP-порты 80 и 443, а также UDP 443. Установите Git, Docker Engine и Docker Compose v2 по официальной инструкции Docker. Для сборки статических приложений установите Node.js 24 LTS.

```bash
git clone https://example.com/your-org/horse-club-crm.git
cd horse-club-crm
```

Замените URL репозитория на фактический адрес.

## 2. Создайте production-окружение

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
openssl rand -hex 48
nano .env.production
```

Первое случайное значение используйте одновременно в `POSTGRES_PASSWORD` и в password-компоненте `DATABASE_URL`. Второе запишите в `JWT_SECRET`. Адрес PostgreSQL внутри Compose — `postgres:5432`; корректный пример URL уже есть в шаблоне. Замените все VK-значения данными сообщества и задайте реальные `LANDING_SITE`, `CRM_SITE`, `API_SITE`. Значения из `.env.production.example` публичны и предназначены только для проверки синтаксиса.

## 3. Соберите CRM и лендинг

Оба клиента обращаются к API через относительный `/api`; Caddy проксирует его на том же домене. Это не требует CORS и сохраняет отдельный API-домен для внешних интеграций:

```bash
npm --prefix frontend ci
npm --prefix landing ci
VITE_API_URL=/api npm run build:frontends
test -f frontend/dist/index.html
test -f landing/dist/index.html
```

Каталоги `frontend/dist` и `landing/dist` монтируются в Caddy только для чтения.

## 4. Проверьте конфигурацию и запустите сервисы

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Compose ожидает готовность PostgreSQL, запускает одноразовый сервис `migrate` с `prisma migrate deploy` и только после успешных миграций запускает backend. Для ручного повторного применения миграций используйте:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

Для восстановления неработающего backend или применения миграций до его запуска используйте одноразовый сервис из того же исходного кода: `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate`.

Не запускайте production-сид: он содержит тестовую учётную запись. Для существующей базы, ранее созданной через `prisma db push`, сначала проверьте и зафиксируйте baseline миграций на копии базы.

## 5. Проверьте HTTPS и маршруты

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=200 caddy
curl --fail --show-error https://api.example.com/api/health
curl --fail --show-error --head https://crm.example.com/login
curl --fail --show-error --head https://club.example.com/
```

В логах Caddy должны отсутствовать ошибки ACME; сертификаты и конфигурация сохраняются в volumes `caddy_data` и `caddy_config`. Ответ healthcheck должен содержать `status: ok` и `database: connected`. CRM должна открыть SPA-маршрут `/login`, лендинг — главную страницу. Замените домены в командах на production-значения.

Если сертификат не выпущен, проверьте DNS, доступность портов 80/443 и отсутствие другого сервиса на этих портах:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs caddy
sudo ss -lntup | grep -E ':(80|443)\\b'
```

## 6. Финальная проверка и эксплуатация

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend migrate
./scripts/backup.sh
```

Сервисы `postgres`, `backend` и `caddy` должны быть Healthy/Up, а `migrate` — завершиться с кодом 0. Настройте ежедневный запуск `scripts/backup.sh`, храните дополнительную копию вне VPS и проверьте восстановление на отдельной базе. Подробности находятся в `PRODUCTION.md`.
