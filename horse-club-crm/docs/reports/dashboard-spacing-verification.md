# Вертикальные отступы /dashboard

Проверено 21.11.2026.

`AdminDashboardPage` использует один вертикальный стек `.admin-workspace.gap-6` с шагом 24px (CSS-эквивалент Tailwind gap-6 в текущем frontend). Удалены внешние отступы KPI и журнала, обнулён нижний отступ баннера в этом стеке. Убран контейнер, дублировавший `id="pending-leads"` существующей карточки.

Playwright: `npm.cmd --prefix frontend run test:e2e:mock -- dashboard.spec.ts --grep "dashboard shift journal"` — 3/3 passed. На ширинах 1440, 1024 и 390px все четыре зазора между баннером, KPI, колонками, журналом и заявками равны 24px при свёрнутом и раскрытом журнале. Проверены минимальный зазор 16px, разница зазоров вокруг журнала <=2px, клавиатурное раскрытие и отсутствие горизонтального переполнения. Скриншоты desktop/mobile просмотрены.

Проверки через npm.cmd (npm.ps1 блокируется политикой PowerShell):

- frontend: lint, typecheck, build — успешно; test — 23 файла, 191 тест успешно.
- backend: lint — без ошибок, 3 предупреждения в неизменённых тестах; typecheck, build — успешно; test — 826 успешно, 24 пропущены, 0 ошибок.
- `git diff --check` — успешно.
- Дополнительный strict UI-аудит: 246 статических замечаний в проекте; в изменённых AdminDashboard.tsx и workspace.css замечаний нет. JSON: `docs/reports/dashboard-spacing-premium-audit.json`. Замечания вне задачи отступов не исправлялись.

Схема БД не изменялась, миграция Prisma не требуется.
