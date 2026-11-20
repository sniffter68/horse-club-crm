# KPI-ссылки дашборда — 21.11.2026

Все четыре KPI в `/dashboard` используют React Router Link всей поверхностью: `/schedule`, `/clients`, `/schedule`, `/leads`. У расписания нет чтения URL-параметров даты/подтверждения; `/clients` по умолчанию показывает активных клиентов. Нижняя ссылка на якорь заменена подписью внутри ссылки-карточки.

Общий `crm-card-link` используется также в CashboxHeaderWidget: плавная тень, подсветка границы, сдвиг вверх на 2 px, active и focus-visible. Reduced motion отключает сдвиг. Ant Design Statistic сохраняет `tabular-nums`. Равная высота карточек и подписей проверена на 1440×844 и 390×844; на узком экране подпись резервирует место для двух строк. Обновлены DESIGN.md и UX-CONTRACT.md.

Проверки (на Windows использован `npm.cmd`):

- `npm --prefix frontend run typecheck`, `run lint`, `run build`, `test` — успешно; 191 unit-тест в 23 файлах.
- `npm --prefix backend run typecheck`, `run lint`, `run build`, `test` — успешно; 826 тестов прошли, 24 PostgreSQL-сценария пропущены без тестовой БД. Линтер: 0 ошибок, 3 существующих предупреждения в тестах.
- `npm --prefix frontend run test:e2e:mock -- dashboard.spec.ts --grep 'workspace KPI'` — 6 сценариев прошли: клик по углу и Enter для всех четырёх карточек, соответствующие URL, отсутствие вложенных кнопок/ссылок, фокус, высота, hover, reduced motion и отсутствие горизонтального переполнения.
- `npm --prefix frontend run test:e2e:mock -- dashboard.spec.ts` — итоговый полный прогон: 47 сценариев прошли (2,8 минуты). Обнаруженное первым прогоном различие высот на 390px исправлено до итогового прогона.
- `npm --prefix frontend run test:e2e:mock -- crm-update.spec.ts --grep 'cashbox links'` — 2 сценария прошли на 1440/390px, включая переход клавиатурой и восстановление после ошибки API.
- `python scripts/audit-ui.py . --mode strict --output docs/reports/dashboard-kpi-premium-audit.json` — 0 замечаний; используется существующий JSX-aware адаптер premium-аудитора.
- `git diff --check` — успешно.

Скриншоты `frontend/test-results/dashboard-kpi-cards-1440.png` и `dashboard-kpi-cards-390.png` просмотрены. E2E использует изолированные подмены API. Схема БД не изменялась; генерация Prisma Client и миграция не требуются.
