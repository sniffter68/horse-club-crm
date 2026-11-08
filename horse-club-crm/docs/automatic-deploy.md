# Автоматический деплой

## Отдельный шаг миграций Docker Compose

В production сервис `migrate` включён в профиль `migration`, не имеет фиксированного `container_name` и использует `restart: 'no'`. Backend зависит только от готовности PostgreSQL. Обычный `compose up` не запускает миграции.

`deploy.sh` сначала дожидается PostgreSQL, затем выполняет `docker compose run --rm --build migrate` и только после успешного завершения обновляет backend. Для ручного запуска из корня проекта:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --build migrate
```

Compose создаёт одноразовый контейнер с уникальным именем и удаляет его после завершения. При ошибке миграции `deploy.sh` завершается до обновления backend. Перед прямым запуском новой версии backend миграции нужно выполнить отдельно.

## Prisma и варианты запуска (01.11.2026)

Workflow готовит движки закреплённой в `backend/package.json` Prisma 6.19.3 на Ubuntu runner,
передаёт их в `.deploy/prisma` на VDS и проверяет SHA-256 перед запуском деплоя.
Dockerfile и установка на хосте используют эти движки и локальный CLI, без `npx`
и скачивания с `binaries.prisma.sh` на VDS. Для ручной Docker-сборки требуется
тот же каталог движков `debian-openssl-3.0.x` (Linux x64, OpenSSL 3).

`deploy.sh` учитывает `COMPOSE_FILE`; без него сохраняет уже работающий проект
`docker-compose.prod.yml`, если в нём запущен backend. Иначе используется обычное
обнаружение Compose. При наличии только PostgreSQL приложение собирается на хосте
и перезапускается через найденный PM2/systemd. Для явного выбора задайте
`PM2_BACKEND_APP` или `SYSTEMD_BACKEND_SERVICE` (с окончанием `.service`).
Фронтенд и лендинг собираются в `dist`, который обслуживает существующий веб-сервер.
Процессы других приложений не перезапускаются. Окружение backend загружается из
`backend/.env` либо `BACKEND_ENV_FILE`; требуется Node с `process.loadEnvFile` (20.12+).

Если `prisma migrate deploy` на хосте недоступен, резервный скрипт
`node scripts/migrate-vk-sql.cjs compose` применяет только
`20261101120000_vk_integration_settings` через `psql` в контейнере PostgreSQL.
Он использует реальные `POSTGRES_USER`/`POSTGRES_DB`, блокировку Prisma,
транзакцию и журнал `_prisma_migrations` с исходной SHA-256 SQL-файла.
Любые другие ожидающие миграции, незавершённые записи или несовпадение истории
останавливают восстановление. Повторное применение уже завершённой миграции безопасно.

После перезапуска проверяются health и авторизованный GET `/api/settings/vk`,
а также чтение таблицы VK через Prisma. Проверка использует существующего активного
ADMIN и JWT сроком 60 секунд в памяти процесса; токен и значения настроек не выводятся.

При push в `main` workflow `.github/workflows/deploy.yml` подключается к серверу по SSH (порт 22), обновляет `/opt/horse-club-crm/horse-club-crm` и запускает существующий `deploy.sh`. Деплои выполняются последовательно; текущий запуск не отменяется новым push.

В текущем checkout корень Git — `HorseCRM2026`, поэтому workflow расположен в `HorseCRM2026/.github/workflows/deploy.yml`, на уровень выше папки приложения `horse-club-crm`. GitHub читает workflow только из корня Git. Локальный скрипт определяет этот корень автоматически.

В GitHub → Settings → Secrets and variables → Actions добавьте repository secrets:

- `HOST` — адрес боевого сервера.
- `USERNAME` — SSH-пользователь с правами на каталог проекта и Docker.
- `SSH_KEY` — приватный SSH-ключ; соответствующий публичный ключ должен быть в `authorized_keys` пользователя сервера.

Сервер должен иметь доступ к репозиторию для `git pull origin main` и настроенное окружение для `deploy.sh`, включая `.env.production`. Результат деплоя смотрите во вкладке Actions: успешный push означает отправку кода, завершение деплоя подтверждается успешным workflow.

Workflow обновляет сервер через `git pull --ff-only origin main`. Дата (Europe/Moscow), фактический коммит на сервере и результат выполнения выводятся в журнал Actions. При сбое workflow и `deploy.sh` останавливаются с ненулевым кодом и показывают команду и строку ошибки. Итоговый статус и коммит, вызвавший запуск, также доступны в Summary запуска (при накоплении push он может отличаться от коммита, фактически полученного сервером).

После успешного `./deploy.sh` workflow добавляет строку в `/opt/horse-club-crm/horse-club-crm/docs/deploy_history.log`. Файл исключен из Git, сохраняется между деплоями; посмотреть историю можно командой `tail -n 20 docs/deploy_history.log` на сервере. Прямой запуск `deploy.sh` выводит статус в консоль; постоянную историю ведет workflow.

Из PowerShell в корне проекта:

```powershell
.\scripts\deploy-commit.ps1 -Message "Обновить расписание и карту денников"
```

Если локальная политика PowerShell запрещает запуск `.ps1`, можно разрешить выполнение только для отдельного процесса:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-commit.ps1 -Message "Обновить расписание и карту денников"
```

Скрипт работает только в ветке `main`, добавляет все изменения через `git add .`, создаёт коммит и отправляет его в `origin main`. При ошибке любой Git-команды выполнение прекращается, исходная рабочая папка восстанавливается.

`scripts/deploy-commit.ps1` хранится в UTF-8 с BOM для Windows PowerShell 5.1. Скрипт задает UTF-8 для вывода Git и консоли, определяет корень репозитория относительно своей папки и использует `-LiteralPath` для путей с кириллицей, пробелами и квадратными скобками.
