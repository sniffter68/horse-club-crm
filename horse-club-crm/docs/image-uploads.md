# Загрузка фотографий: запуск и деплой

`POST /api/upload/image` принимает multipart/form-data с единственным полем `file`.
Нужна действующая сессия CRM (HttpOnly cookie; также поддерживается Bearer JWT).
Для cookie-запросов действует существующая проверка Origin. Разрешены JPEG, PNG и WebP,
до 5 МиБ (5 242 880 байт); проверяются MIME-тип и сигнатура содержимого.
Ответ 201: `{ "url": "/uploads/<uuid>.png" }`. Ошибки: 400 — формат/отсутствующий файл,
401 — авторизация, 413 — превышен размер. Расширение выбирается по MIME, имя пользователя не используется.
Загрузка сама по себе не меняет карточку: полученный путь сохраняется в `imageUrl` при нажатии «Сохранить».
Фотографии доступны публично по `GET /uploads/<filename>` и предназначены для публикации на сайте.

## Локально

Бэкенд сохраняет файлы в `uploads` относительно рабочей директории процесса.
При запуске из `backend` это `backend/uploads`. Каталог создаётся автоматически и исключён из Git и Docker build context.
Базовый `docker-compose.yml` запускает только PostgreSQL; локальный backend работает на хосте,
поэтому volume для него там не нужен. Оба Vite-сервера проксируют `/api` и `/uploads` на порт 3000.

## Production

1. Сохранить обычный `.env.production`; новых секретов или миграций БД не требуется.
   Собирать CRM с `VITE_API_URL=/api`, лендинг с `VITE_API_URL=/api` (настройка по умолчанию).
   Лендинг также понимает `VITE_API_BASE_URL`, имеющий приоритет: это полный префикс API,
   например `https://api.example.com/api`; `/uploads/...` разрешается относительно его origin.
   Для отдельного API-домена необходимо настроить CORS и CSP connect-src; рекомендуемый деплой использует
   прокси на каждом домене и не требует этих изменений.
2. Из корня проекта выполнить (в Windows использовать `npm.cmd`):

   ```sh
   npm --prefix frontend ci
   npm --prefix landing ci
   npm run build:frontends
   docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   docker compose --env-file .env.production -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```

3. `backend_uploads:/app/uploads` хранит изображения независимо от пересборки контейнера.
   Dockerfile создаёт каталог с владельцем `node`, поэтому процесс без root может писать в volume
   при `read_only: true`. Новый volume получает эти права при первом создании.
   Уже существующий volume должен также быть доступен UID/GID 1000:1000.
4. Проверить в CRM создание/редактирование лошади, тренера и услуги: выбрать фото, дождаться
   предпросмотра, сохранить карточку. Проверить путь `/uploads/...` на доменах CRM, API и лендинга,
   затем публичную карточку. Caddy проксирует этот путь до SPA fallback; авторизация для чтения не нужна.
5. Пересоздать backend и проверить, что фото по прежнему URL доступно.

## Хранение и резервные копии

Volume необходимо включить в резервное копирование отдельно от PostgreSQL. Например, экспорт из работающего backend:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T backend tar -C /app/uploads -czf - . > uploads-backup.tar.gz
```

Использовать shell с бинарно-безопасным перенаправлением (Bash или PowerShell 7.4+).
Для восстановления распаковать архив в этот же volume с владельцем 1000:1000 до запуска приложения.
Не использовать `docker compose down -v` для обычного обновления: он удаляет и файлы, и БД.
При отмене формы, замене ссылки или удалении карточки старые файлы остаются в хранилище;
автоматическая очистка не реализована. Прежде чем удалять файл вручную, проверить ссылки во всех трёх каталогах.

## Проверки

```sh
npm --prefix backend run test
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix landing run build
# Для CRM Playwright предварительно запустить Vite на localhost:5173:
npm --prefix frontend run test:e2e:mock -- public-content.spec.ts
# Лендинг запускает собственный Vite:
npm --prefix landing run test:e2e -- public-content.spec.ts
```

Новые backend HTTP-тесты используют временный каталог и реальную JWT-стратегию с тестовой границей БД.
Проверяются авторизация, Origin, MIME/сигнатура, размер, уникальные имена, записанные байты и публичная раздача.
