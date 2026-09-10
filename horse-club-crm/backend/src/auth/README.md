# Авторизация

`AuthModule` подключён в `AppModule`. Установлены зависимости NestJS, Passport,
JWT, bcrypt и типы TypeScript; версии закреплены в `package-lock.json`.

## Контракт Prisma

Код использует `@prisma/client` (Prisma 6, стандартный генератор `prisma-client-js`).
В доступной рабочей папке исходная схема отсутствует. Для сборки требуется
сгенерированный клиент с моделью `User`: `id` (String или Int), уникальным `email`,
`passwordHash`, `role`, и enum `Role` со значениями ADMIN, MANAGER, TRAINER.
Остальные обязательные поля модели должны иметь значения по умолчанию либо
должны быть добавлены в DTO и операцию создания после восстановления схемы.

## Запуск

Перед запуском передайте `JWT_SECRET` через окружение: случайный секрет не менее
32 байт. Например, секрет можно сгенерировать командой
`node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"`.
Не храните рабочий секрет в репозитории. `.env.example` содержит только шаблон;
приложение самостоятельно `.env` не загружает. Используйте окружение контейнера
или `node --env-file=.env dist/main.js`.

`npm run typecheck` проверяет типы, `npm run build` собирает приложение,
`npm start` запускает его. Сборка требует восстановленной схемы и генерации
Prisma Client. Первый ADMIN должен быть создан доверенным seed-процессом.

## HTTP

- `POST /api/auth/login`: `{ "email": "...", "password": "..." }`;
  ответ `{ "access_token": "..." }`, неверные учётные данные — HTTP 401.
- `POST /api/auth/register`: `{ "email": "...", "password": "...", "role": "TRAINER" }`;
  доступ только ADMIN с Bearer JWT; возвращаются только `id`, `email`, `role`.
  Пароль — минимум 12 символов, максимум 72 UTF-8 байта.
- `GET /api/auth/me`: текущие `id`, `email`, `role`; требуется Bearer JWT.

Для защиты контроллера подключите `AuthModule` в его модуль и используйте
`@UseGuards(JwtAuthGuard, RolesGuard)` вместе с `@Roles(Role.ADMIN, Role.MANAGER)`.
`@CurrentUser() user: AuthUser` получает пользователя из проверенного токена.
Один `@Roles()` без гардов не включает авторизацию.

JWT подписывается HS256, содержит `sub`, `email`, `role`, `iat`, `exp` и действует
7 дней. Роль читается из токена: изменения роли в БД не отзывают ранее выданный
токен. `.addBearerAuth()` документирует схему, проверку выполняет `JwtAuthGuard`.

## Проверки

`npm run test:unit` транспилирует код без проверки типов и запускает шесть тестов
с подменой границы Prisma, поскольку исходная схема недоступна. Тесты используют
настоящие bcrypt, JWT/Passport, ValidationPipe и RolesGuard. Это отдельная проверка
поведения, которая не заменяет `npm run typecheck` и интеграционные тесты с PostgreSQL.
