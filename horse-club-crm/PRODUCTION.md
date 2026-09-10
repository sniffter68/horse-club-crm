# Запуск на Ubuntu VPS

Команды выполняются из корня `horse-club-crm`. Нужны Docker Engine с Compose v2 и Node.js 24 с npm для сборки статических приложений. PostgreSQL и API не публикуют порты хоста; снаружи доступны только Caddy 80/443.

## Настройка и первый запуск

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32  # отдельный пароль PostgreSQL
openssl rand -hex 48  # отдельный JWT_SECRET
```

Запишите значения в `.env.production`; пароль в `DATABASE_URL` должен совпадать с `POSTGRES_PASSWORD`, адрес базы внутри Docker — `postgres:5432`. Hex-значения не требуют URL-кодирования. Не используйте dev-секреты. Укажите разные домены в `LANDING_SITE`, `CRM_SITE` и `API_SITE`. Направьте их DNS A/AAAA на VPS и откройте TCP 80/443, UDP 443. Caddy автоматически получает и сохраняет HTTPS-сертификаты в именованных volumes.

Для локальной проверки задайте `LANDING_SITE=http://localhost`, `CRM_SITE=http://crm.localhost` и `API_SITE=http://api.localhost`: HTTPS при этом отключён. `/api` сохраняется при проксировании на всех доменах. CRM размещена на отдельном домене, поэтому существующие маршруты `/clients`, `/schedule` не требуют изменения base path.

```bash
npm --prefix frontend ci
npm --prefix landing ci
VITE_API_URL=/api npm run build:frontends
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml build backend migrate
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --wait
```

Сервис `migrate` выполняет `prisma migrate deploy` до запуска API. Не запускайте `prisma db push` на production. Проверено применение истории миграций к пустой PostgreSQL 17. Для существующей базы, созданной через `db push`, сначала согласуйте схему и baseline истории миграций на её копии; не отмечайте миграции выполненными вслепую.

Сид `backend/prisma/seed.cjs` создаёт администратора с общеизвестным тестовым паролем — на production его не запускайте. Перенос существующих пользователей выполняйте через проверенный дамп; для новой базы создайте администратора с индивидуальным bcrypt-хешем через контролируемую административную процедуру.

VK-параметры заполняются в `.env.production`; адрес Callback API — `https://club.example.com/api/vk/callback`. Не публикуйте `.env.production` и дампы в репозитории.

## Обновления и проверки

Перед миграциями создайте бэкап. Повторите сборку статических приложений и Docker-образов, затем `up -d --wait`. Отслеживайте `docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend migrate`. Проверка `/api/health` включает соединение с базой.

```bash
npm --prefix backend ci
npm --prefix backend run typecheck
npm --prefix backend test
npm run test:concurrency
```

Последняя команда использует реальную базу из `backend/.env` или переменной `DATABASE_URL`. Запускайте её на тестовой базе с применёнными миграциями и графиком клуба: тест создаёт собственные записи и удаляет их в `finally`. В обычном наборе тестов этот сценарий пропускается; отдельный запуск проверяет гонки за тренера, лошадь и последний остаток абонемента.

## Резервное копирование

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh
# Windows PowerShell, docker должен быть в PATH:
# ./scripts/backup.ps1
```

Дампы формата PostgreSQL custom сжаты, сохраняются в `backups/backup_YYYY-MM-DD_HH-mm-ss.dump` (UTC). Незавершённый дамп имеет расширение `.partial`; старые завершённые копии удаляются после 14 дней только после успешного нового бэкапа. PowerShell копирует бинарный поток без текстовой перекодировки. Параметры пользователя и базы берутся из окружения контейнера PostgreSQL. Bash-версия использует `flock` из Ubuntu util-linux и проверяет каталог архива перед сохранением.

Пример crontab для ежедневного запуска в 03:15 по часовому поясу VPS:

```cron
15 3 * * * /opt/horse-club-crm/scripts/backup.sh >> /var/log/horse-crm-backup.log 2>&1
```

Пользователь cron должен иметь доступ к Docker и проекту. Храните дополнительную копию за пределами VPS и периодически проверяйте восстановление. Для другого compose-файла/окружения задавайте `COMPOSE_FILE` и `ENV_FILE`.

## Восстановление

Восстановление заменяет данные целевой базы. Сначала остановите записи API, проверьте выбранное окружение и сохраните текущий бэкап.

```bash
./scripts/backup.sh
docker compose --env-file .env.production -f docker-compose.prod.yml stop backend
./scripts/restore.sh backups/backup_YYYY-MM-DD_HH-mm-ss.dump
# Подтвердите RESTORE только после проверки целевой базы.
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --wait backend
```

Скрипт проверяет существование и каталог архива, затем выполняет `pg_restore --clean --if-exists` в одной транзакции с остановкой при ошибке. Для управляемой автоматизации доступно `RESTORE_CONFIRM=YES`. Не запускайте `down -v`: эта команда удаляет постоянные данные и сертификаты.

## Результаты локальной проверки

- Реальные гонки PostgreSQL: в каждом из двух сценариев ресурса один HTTP 201 и четыре HTTP 409; при двух списаниях последний кредит списан один раз, остаток 0.
- TypeScript и обычный набор: 58 Passed, 0 Failed; отдельный DB-сценарий пропущен в обычном наборе и выполнен отдельно.
- Сборки CRM, лендинга и обоих Docker targets успешны.
- Compose и Caddy валидны; миграции применены к отдельной пустой базе, backend Healthy.
- HTTP: лендинг `/`, CRM `/clients` и `/api/health` на обоих хостах возвращают 200.
- PowerShell-бэкап восстановлен в отдельную базу PostgreSQL: 13 публичных таблиц. Bash-скрипты прошли `bash -n`; исполнение через cron на Ubuntu не проверялось.
- Реальные домены, получение публичного TLS-сертификата и запуск на VPS требуют настроенного окружения сервера.
- После совместимого override `deepmerge-ts@8.0.0` команда `npm audit` сообщает 0 уязвимостей. Сборка CRM выдаёт неблокирующее предупреждение Vite о размере основного чанка больше 500 kB.
