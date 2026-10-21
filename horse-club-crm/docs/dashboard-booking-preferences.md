# Предпочтения клиента в быстрой записи с дашборда

Дата проверки: 21.10.2026.

`frontend/src/pages/dashboard/QuickActions.tsx`, компонент `LessonDrawer`, использует общий `schedule/useClientPreferences.ts`, как обе формы расписания. Карточка выбранного клиента загружается независимо от услуги и возможности оплаты абонементом. Ошибка загрузки отображается с кнопкой повтора. При смене клиента запрос отменяется; результат применяется только для текущего клиента.

Автоматические значения следуют предпочтениям нового клиента; отсутствие предпочтений очищает автоматический выбор. Ручной выбор тренера/лошади и ручная очистка лошади сохраняются до закрытия формы. UUID, активность тренера и здоровье лошади проверяются общим хуком. Проверки доступности и дневной нагрузки продолжают блокировать неподходящие записи.

## Проверки

- Frontend: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build` — успешно; 142 unit-теста.
- Backend: те же команды — успешно; 485 тестов прошли, 17 PostgreSQL-тестов пропущены. Линтер содержит три прежних предупреждения в тестах, ошибок нет.
- Playwright: `npx.cmd playwright test --project=mock e2e/dashboard.spec.ts e2e/client-preferences.spec.ts --output test-results/dashboard-preferences` — 27 успешно, два новых сценария потребовали исправления helper: ожидание завершения закрытия Select перед открытием следующего.
- Повтор после исправления helper и расширения проверки ручной очистки: `npx.cmd playwright test --project=mock e2e/dashboard.spec.ts --grep 'dashboard booking applies|dashboard delayed' --output test-results/dashboard-preferences-final` — все 3 успешно. Все 29 уникальных сценариев двух файлов успешно проверены с учётом повтора.
- Сценарии дашборда включают автоподстановку до выбора услуги, смену клиента, отсутствие предпочтений, ручной выбор и очистку, отправку выбранных ресурсов, поздний/устаревший ответ API, неактивного тренера и лечение лошади, ошибку и повтор загрузки. Проверены ширины 1440 и 390 px, открытие Select с клавиатуры и Escape.
- `python scripts/audit-ui.py . --mode strict --output docs/dashboard-booking-preferences-audit.json` — без замечаний.
- `git diff --check` — без ошибок.

Скриншоты: `frontend/test-results/dashboard-booking-defaults-1440.png`, `frontend/test-results/dashboard-booking-defaults-390.png`.

Схема БД и backend не изменены; новая миграция Prisma не требуется. Используется существующий API предпочтений клиента.
