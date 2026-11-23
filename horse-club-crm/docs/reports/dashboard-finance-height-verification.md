# Естественная высота финансовой карточки

Проверено 24.11.2026.

Фактический владелец блока «Финансы за месяц» — `AdminDashboard.tsx`, стили — `workspace.css`. У `.admin-workspace-columns` установлено `align-items: start`, у `.workspace-main-card` убрана высота `100%`. Колонки сохраняют естественную высоту, мобильный breakpoint 800px не изменён.

Существующий сценарий `dashboard shift journal` обновлён: вместо требования одинаковой высоты карточек проверяет неизменную высоту финансов при переключении с пустого дня на неделю из 20 занятий. На 1440/1024px карточки выровнены сверху, расписание выше финансов; на 390px карточки идут друг под другом с зазором 24px. Проверки отступов, журнала, клавиатуры и отсутствия горизонтального переполнения сохранены.

- `npm.cmd --prefix frontend run lint`, `run typecheck`, `run build`, `test` — успешно; 25 файлов, 209 unit-тестов.
- `npm.cmd --prefix backend run lint`, `run typecheck`, `run build`, `test` — успешно; 930 тестов прошли, 27 пропущены. Линтер: 3 существующих предупреждения в неизменённых тестах.
- `npm.cmd --prefix frontend run test:e2e:mock -- dashboard.spec.ts --grep "dashboard shift journal"` с `CRM_TEST_BASE_URL=http://127.0.0.1:5174` — 3/3 успешно, ширины 1440, 1024, 390px.
- `git diff --check` — успешно.
- Дополнительный strict UI-аудит — 263 статических замечания в проекте, в изменённом CSS замечаний нет. Результат: `docs/reports/dashboard-finance-height-premium-audit.json`.

Схема БД не изменена, миграция Prisma не требуется. Существующие пользовательские изменения DESIGN.md, UX-CONTRACT.md и premium-audit.json сохранены.
