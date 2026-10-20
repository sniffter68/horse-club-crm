# Проверка оплаты разовых занятий — 20.10.2026

- Backend: `npm run typecheck`, `npm run build`, `npm test` — успешно, 432 passed, 17 skipped (проверки PostgreSQL), 0 failed.
- Frontend: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — успешно, 134 теста в 9 файлах.
- Prisma: Client 6.19.3 сгенерирован, `prisma validate` — успешно. Миграция к базе не применялась.
- Backend `npm run lint` — скрипт отсутствует в package.json. Вместо него выполнен установленный в frontend Oxlint для `backend/src/lessons`, `backend/src/payments/cash-desk.service.ts`, `backend/src/dashboard/dashboard.service.ts` — ошибок нет.
- Playwright Edge: `lesson-payments.spec.ts` и `dashboard.spec.ts` — 21 сценарий прошёл. В общем прогоне 20 passed и 1 failed из-за несовпадения роли в тестовой фикстуре. После исправления роли единственный упавший сценарий READ_ONLY повторно прошёл. Сценарии включают создание с предоплатой, два прихода в кассе, полную предоплату, сохранение выбора после ошибки, шторку дашборда и права доступа. API замокан.
- Визуально проверен мобильный диалог завершения: суммы, радиокнопки, действия и подсказка помещаются в 390 px; снимки 1440/390 px создаются тестами. Подтверждение открывается после закрытия карточки занятия.
- `git diff --check` — без ошибок.
- Общий strict UI-аудит: 185 замечаний, результат в `docs/lesson-payments-ui-audit.json` (локальный артефакт, исключён шаблоном `.gitignore`). Аудитор в том числе ошибочно распознаёт Ant Design `Form.Item` как отдельные формы; также сообщает нарушения в других экранах приложения. Общий аудит не объявляется пройденным. Эти замечания не устранялись массовой переработкой остальных экранов.

Перед запуском обновлённого backend на сервере нужны `npx prisma migrate deploy` и `npx prisma generate`. Проверка SQL-миграции на реальном PostgreSQL остаётся необходимой при развёртывании.
