# Отчёт об обновлении CRM от 15.11.2026

Реализованы пять блоков задания: nullable-название и тип помещения, контролируемый выбор пола лошади, 30% тренера от Service.price, раздельные кассы со сводкой и URL-фильтрами, быстрая запись через общую шторку. Справочники и карточки показывают номер денника при отсутствии названия. Исправлено ожидание несвязанных запросов при сохранении общей шторки: Refine resourceAll вместо all.

Бизнес-решения и владельцы интерфейса: [контракт](../crm-update-2026-11-15.md). Фиксированные ставки сохранены отдельно от 30%; оплаченные ведомости не пересчитываются. Старые финансовые проводки не изменяются. В SQL сохранено распределение цены продажи абонемента; номинал применяется к разовому признанию выручки, зарплата тренера считается отдельно от номинала для всех занятий.

## Проверки

- После каждого из пяти блоков запускались генерация Prisma и сборки backend/frontend; ошибки промежуточных проверок исправлены.
- `npx.cmd prisma generate`: успешно, Prisma Client 6.19.3.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: успешно в обоих проектах. Линтер backend завершился с кодом 0 и тремя прежними предупреждениями в тестах; frontend — без предупреждений.
- `npm.cmd test` backend: 778 passed, 0 failed, 21 skipped (всего 799). PostgreSQL-сценарии требуют отдельной локальной БД; порты 5432/5433 не слушают. Миграции локально не применялись.
- `npm.cmd test` frontend: 175 passed, 22 файла.
- Браузер: Edge headless, 1440 и 390px — 23 passed. Проверены обновление касс через 30 секунд, ссылки и табы, ошибка/повтор, смена пола после очистки на странице и в шторке размещённой лошади, условная обязательность полей помещений, скидка и неизменная доля тренера, абонемент и успешное сохранение, вместимость тренера, карта денников, переселение/рокировка и READ_ONLY. Итог отдельного прогона — `test-results/crm-update-e2e-targeted.log`.
- В расширенном прогоне остаются два теста редактирования тренера в `entity-edit.spec.ts` (1440/390px), ожидающие сообщение неудачного сохранения. Логи: `crm-update-e2e-final.log`. Редактор тренера не изменялся. Два старых теста слотов в dashboard ожидают LessonDrawer после клика по сетке, хотя текущий ResourceSchedule использует QuickSlotBooking в поповере; в их моках также отсутствуют поля отдыха лошади, что вызывает Invalid time value в прежнем QuickSlotBooking. Исходный лог — `crm-update-e2e-regression.log`. Эти сценарии не объявляются прошедшими; новый QuickBookingModal использует проверенный LessonDrawer.
- Статический аудит premium: strict exit 1, 218 замечаний. В существовавшем `premium-audit.json` было 215; три добавленных — ложные совпадения анализатора для Ant Design Form.Item и Select. Существующий отчёт не перезаписывался. Полный новый JSON: `test-results/crm-update-premium-audit.json`. Массовая переработка прочих форм вне задания не выполнялась.
- `git diff --check`: успешно.

## Миграции и развёртывание

Нужно применить три новые миграции: `20261115120000_stall_optional_name`, `20261115130000_nominal_booking_revenue`, `20261115140000_cashbox_balances`. Первая безопасна при уже снятых NOT NULL и уникальном индексе. Третья сохраняет уже существующее public.v_cashbox_balances. Исторические записи не удаляются и не переписываются.

Боевые SQL-патчи известны из задания; доступа к их фактическим определениям и PostgreSQL в этой сессии не было. Проверка миграций на реальной БД остаётся серверным шагом. Ниже — команды для существующего полного Docker Compose-проекта с `.env.production` (не для хоста с одним контейнером PostgreSQL).

```bash
cd /opt/horse-club-crm/horse-club-crm
npm --prefix frontend ci
npm --prefix frontend run build
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --build migrate
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --wait backend
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --wait caddy
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Фронтенд обслуживается Caddy из смонтированного `frontend/dist`, отдельного frontend-контейнера в этом Compose нет. Для существующего штатного процесса, который сам определяет Docker/native-схему хоста, можно использовать `bash deploy.sh`. Команды в этой сессии на сервере не выполнялись.

## Точный список файлов задачи

Ниже перечислены файлы реализации, проверок и документации. Изменения TMA, Caddy и документации предыдущих задач сохранены и в этот список не включены. В DESIGN.md и UX-CONTRACT.md добавлены только пункты текущей задачи.

- `DESIGN.md`
- `UX-CONTRACT.md`
- `backend/prisma/migrations/20261115120000_stall_optional_name/migration.sql`
- `backend/prisma/migrations/20261115130000_nominal_booking_revenue/migration.sql`
- `backend/prisma/migrations/20261115140000_cashbox_balances/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/src/app.module.ts`
- `backend/src/boarding-contracts/boarding-contracts.service.ts`
- `backend/src/cashbox/cashbox.controller.ts`
- `backend/src/cashbox/cashbox.module.ts`
- `backend/src/cashbox/cashbox.service.ts`
- `backend/src/clients/clients.service.ts`
- `backend/src/horses/horses.service.ts`
- `backend/src/payments/dto/payment-query.dto.ts`
- `backend/src/payments/payments.controller.ts`
- `backend/src/payments/payments.service.ts`
- `backend/src/staff/staff.service.ts`
- `backend/src/stalls/dto/create-stall.dto.ts`
- `backend/src/stalls/neighborhood.ts`
- `backend/src/stalls/stalls.service.ts`
- `backend/test/crm-update.test.cjs`
- `backend/test/staff.postgres.test.cjs`
- `backend/test/staff.test.cjs`
- `backend/test/stall-map.test.cjs`
- `backend/test/stalls.test.cjs`
- `docs/crm-update-2026-11-15.md`
- `docs/reports/crm-update-2026-11-15.md`
- `frontend/e2e/crm-update.spec.ts`
- `frontend/e2e/dashboard.spec.ts`
- `frontend/e2e/entity-edit.spec.ts`
- `frontend/e2e/fixtures.ts`
- `frontend/playwright.crm.config.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/CashboxHeaderWidget.tsx`
- `frontend/src/components/QuickBookingModal.tsx`
- `frontend/src/dataProvider.ts`
- `frontend/src/index.css`
- `frontend/src/pages/boarding-contracts/form.tsx`
- `frontend/src/pages/boarding-contracts/list.tsx`
- `frontend/src/pages/boarding-contracts/quick.tsx`
- `frontend/src/pages/boarding-contracts/types.ts`
- `frontend/src/pages/catalogs/types.ts`
- `frontend/src/pages/clients/list.tsx`
- `frontend/src/pages/dashboard/QuickActions.tsx`
- `frontend/src/pages/horses/HorseSexSelect.tsx`
- `frontend/src/pages/horses/form.tsx`
- `frontend/src/pages/horses/list.tsx`
- `frontend/src/pages/payments/list.tsx`
- `frontend/src/pages/payments/types.ts`
- `frontend/src/pages/schedule/LessonDrawer.tsx`
- `frontend/src/pages/stable/shared.tsx`
- `frontend/src/pages/staff/forms.tsx`
- `frontend/src/pages/staff/index.tsx`
- `frontend/src/pages/staff/types.ts`
- `frontend/src/pages/stalls/form.tsx`
- `frontend/src/pages/stalls/list.tsx`
- `frontend/src/pages/stalls/map.tsx`
- `frontend/src/pages/stalls/mapTypes.ts`
- `frontend/src/pages/stalls/transfer.tsx`

Логи и статические проверки:

- `test-results/crm-update-api-test.log`
- `test-results/crm-update-backend-build.log`
- `test-results/crm-update-backend-lint.log`
- `test-results/crm-update-backend-test.log`
- `test-results/crm-update-backend-typecheck.log`
- `test-results/crm-update-domain-test.log`
- `test-results/crm-update-e2e-final.log`
- `test-results/crm-update-e2e-regression.log`
- `test-results/crm-update-e2e-targeted.log`
- `test-results/crm-update-e2e-verified.log`
- `test-results/crm-update-e2e.log`
- `test-results/crm-update-frontend-build.log`
- `test-results/crm-update-frontend-lint.log`
- `test-results/crm-update-frontend-test.log`
- `test-results/crm-update-frontend-typecheck.log`
- `test-results/crm-update-horse-drawer-e2e.log`
- `test-results/crm-update-horse-trace.log`
- `test-results/crm-update-premium-audit.json`
- `test-results/crm-update-premium-audit.log`
