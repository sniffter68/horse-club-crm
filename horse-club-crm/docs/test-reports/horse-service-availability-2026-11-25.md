# Тумблеры доступности лошадей — отчёт проверки

Дата: 25.11.2026. Правила и API: [horse-service-availability.md](../horse-service-availability.md).

## Результат

Добавлены ToggleSettingRow (named export, строгий TypeScript без any), четыре сохраняемых флага Horse с DEFAULT true, форма создания/редактирования и мягкие бейджи просмотра. LessonDrawer и TriadBookingModal помечают отключённые направления в выборе лошади и выводят предупреждение. Availability получает совместимые дополнительные поля. Старые блокировки нагрузки и занятости сохранены.

Категории Service в БД нет: направление определяется по названию и maxCapacity; для Booking используется дисциплина. Это сопоставление документировано и покрыто тестами. Запрет направления является мягким предупреждением, а не блокировкой записи.

## Команды

Все восемь обязательных команд выполнены успешно через npm.cmd (PowerShell запрещает npm.ps1):

- npm --prefix backend run lint — 0 ошибок; 3 существующих предупреждения в audit-http-20261019.cjs, vet-records.test.cjs, dashboard.test.cjs.
- npm --prefix backend run typecheck — успешно.
- npm --prefix backend run build — успешно.
- npm --prefix backend test — 933 passed, 27 skipped, 0 failed (960 всего).
- npm --prefix frontend run lint — успешно.
- npm --prefix frontend run typecheck — успешно, включая Playwright TypeScript.
- npm --prefix frontend run build — успешно.
- npm --prefix frontend test — 26 файлов, 219 passed, 0 failed.

Prisma: npx prisma generate в backend — Prisma Client 6.19.3 сгенерирован успешно.

Playwright: horse-service-availability.spec.ts — 6/6; horse-workload.spec.ts — 9/9. Проверены клик по label, Space, сохранение true/false, повтор после HTTP 500 без потери данных, создание с четырьмя true по умолчанию, бейджи после сохранения, обе темы, ширина 390/1440, отсутствие горизонтального переполнения формы и pageerror. Регрессии расписания проверены на 320/768/1280, включая смену услуги и запроса serviceDirection, ограничения нагрузки, загрузку, ошибку API и устаревший ответ.

## Статический и визуальный аудит

Выполнен audit_project.py --mode strict. Сырой парсер сообщает 264 ошибки: все классифицированы существующим scripts/classify-ui-audit.ts как ложные срабатывания на Ant Design Form.Item, generic Form<T> и authored Select. Непросмотренных замечаний — 0; форм без noValidate — 0 из 32. Сырой strict-отчёт сам по себе не зелёный; результат подтверждён AST-классификацией и браузерными проверками. Данные: horse-toggles-ui-audit.json и horse-toggles-ui-classified.json в этой папке.

Скриншоты просмотрены, исправлены контраст включённого Switch на тёмной плашке и вторичный текст шторки:

- [Создание, светлая тема](horse-service-create-light.png).
- [Создание, тёмная тема](horse-service-create-dark.png).
- [Шторка, телефон](horse-service-toggles-dark-390.png).

## Миграция

SQL подготовлен вручную: backend/prisma/migrations/20261125120000_horse_service_availability/migration.sql. Локальная БД не изменялась; реальные PostgreSQL-проверки в этом задании не запускались. До запуска обновлённого backend на сервере выполнить `npx prisma migrate deploy`. Существующие лошади получат все четыре значения true.
