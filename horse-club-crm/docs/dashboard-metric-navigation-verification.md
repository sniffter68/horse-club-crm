# Переходы из карточек дашборда — 26.10.2026

Все четыре карточки используют React Router Link, общий `dashboard-metric-link`, стрелку в заголовке и существующие пастельные поверхности. Переходы: `/schedule`, `/cash-desk`, `/horses`, `/staff`. Сохранены проверки canRead; вложенных интерактивных элементов нет. Focus-visible, hover/active, сдвиг стрелки на 3px и prefers-reduced-motion проверены браузером.

- Frontend: `npm run typecheck`, `npm run lint` (Oxlint), `npm test`, `npm run build` — успешно, 150 unit-тестов в 14 файлах.
- Backend: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — успешно, 570 тестов прошли, 17 PostgreSQL-сценариев пропущены без тестовой БД. Oxlint сообщил 3 существующих предупреждения в тестах, ошибок нет.
- `npm run test:e2e:mock -- dashboard.spec.ts` — 31 сценарий прошёл в Edge. Новые сценарии проверяют переходы клавиатурой на 1440px и кликом по телу карточки на 390px, видимость стрелок, hover, focus-visible и reduced motion. Существующий сценарий проверяет переход в кассу; регрессии включают READ_ONLY/HIDDEN/выключенные модули, ошибки сохранения и московские даты при America/New_York.
- `python scripts/audit-ui.py . --mode strict --output docs/dashboard-metric-navigation-audit.json` — 0 замечаний. Использован существующий JSX-aware адаптер; прямой HTML-токенизатор upstream даёт 197 ложных срабатываний на Ant Design.
- `git diff --check` — успешно. Скриншоты `frontend/test-results/dashboard-metric-cards-1440.png` и `dashboard-metric-cards-390.png` просмотрены.

Браузерные тесты используют подменённый API. Изменений схемы БД нет, миграция Prisma не требуется.
