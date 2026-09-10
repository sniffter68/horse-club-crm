# Каталоги

Реализованы list/create/edit для clients, horses, trainers, services. Общие таблица и оболочка формы находятся в `src/pages/catalogs`, поля и колонки — в папке каждого каталога. Используются Refine List/Create/Edit/useTable/useForm и Ant Design v5.

Все списки поддерживают поиск q, серверную пагинацию и сортировку по одному полю. Состояние списка отражается в URL. Удаление требует подтверждения; ошибки API выводятся через уведомления и сообщения загрузки.

ADMIN и MANAGER могут изменять каталоги. TRAINER видит списки без medicalNotes/baseRate/price; кнопки изменения скрыты, прямые адреса форм показывают отказ в доступе. Ограничения соответствуют серверным ролям.

## Совместимость API

Для сохранения запрошенных полей расширены DTO, Prisma и разрешённые поля сортировки. Изменение схемы: `backend/prisma/migrations/20260908030000_catalog_details/migration.sql`.

Существующий `Client.name` сохранён. Новые формы передают firstName/lastName и составной name; сервер поддерживает старые запросы с name. При переносе старое полное имя целиком помещается в firstName, без автоматического угадывания фамилии. Для старых клиентов, у которых дата создания ранее не хранилась, createdAt соответствует времени добавления столбца.

`Service.name` сохранён и синхронизируется с title. Формы отправляют оба поля; старые запросы с name также поддерживаются. Денежные Decimal из Prisma читаются как строки и перед отправкой формы преобразуются в числа.

maxDailyLoad задаётся в минутах (по умолчанию 480); maxCapacity — 1; cancellationWindowHours — 24; allowMembership — true. Новые свойства каталогов сохраняются и отображаются. Этот этап не добавляет их применение к алгоритмам записи, оплаты и отмены занятий.

## Применение к существующей dev-базе

Текущая БД ранее создавалась через db push. К ней добавочные изменения уже применены без сброса данных:

```powershell
cd backend
npx.cmd prisma db execute --file prisma/migrations/20260908030000_catalog_details/migration.sql --schema prisma/schema.prisma
npx.cmd prisma generate
npm.cmd run build
```

На БД с управляемой историей Prisma используется обычный migrate deploy. Скрипт добавления полей допускает повторное выполнение; миграции не следует подменять сбросом данных.

## Проверки

Сборка и линтер frontend прошли. 8 unit-тестов frontend и 26 тестов backend прошли. Пять новых Playwright-проверок `e2e/catalogs.live.spec.ts` проверяют полный CRUD каждого каталога через реальный API и чтение под TRAINER. Проверены обязательные поля, значения по умолчанию, сохранение денежных полей при редактировании, поиск, сортировка, удаление и отсутствие console.error. Тестовые записи удаляются после проверки.

```powershell
cd frontend
npm.cmd run test:e2e
```

Backend и Vite должны быть запущены. Проверка роли TRAINER создаёт временного пользователя через Prisma из соседнего backend и удаляет его после теста; необходим настроенный `backend/.env`.

Regression: 18 existing live tests and 5 catalog live tests passed (23 total). All 21 mock scenarios passed, including the two updated pagination/401 cases on rerun. HTTP 401/403 are not retried. Test data created during validation was removed.
