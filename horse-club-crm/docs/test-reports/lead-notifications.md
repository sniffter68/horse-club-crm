# Проверка уведомлений о заявках — 2026-10-21

Реализованы защищённый SSE `lead:created`, глобальная подписка ADMIN, Notifications API, собственный тихий сигнал, toast с переходом к заявкам и управление разрешением/звуком в шапке. Миграции Prisma и установка зависимостей не требуются.

| Проверка | Результат |
|---|---|
| backend `npm run typecheck` | успешно |
| frontend `npm run typecheck` | успешно |
| backend и frontend `npm run build` | успешно |
| frontend `npm run lint` (Oxlint) | успешно |
| backend `npm run lint` | script отсутствует в исходном package.json; вместо него выполнен `frontend/node_modules/.bin/oxlint.cmd backend/src`, без ошибок |
| backend `npm test` | 450 passed, 17 skipped (PostgreSQL-сценарии), 0 failed |
| frontend `npm test` | 134 passed, 0 failed |
| Playwright `lead-conversion.spec.ts` + `lead-notifications.spec.ts` | 8 passed |
| Playwright `dashboard.spec.ts` + `lead-notifications.spec.ts` | 22 passed; всего 26 разных E2E-сценариев с предыдущим прогоном |
| Strict premium UI audit | 187 замечаний в существующих файлах; в изменённых исходниках замечаний нет. JSON: `lead-notifications-ui-audit.json` |
| `git diff --check` | успешно |

В PowerShell использован `npm.cmd`, поскольку выполнение `npm.ps1` запрещено политикой среды.

Автотесты браузера используют настоящий EventSource, но перехватывают Notification/Audio и эмулируют `visibilityState=hidden`. Проверены запрос разрешения только по клику, единственное оповещение при повторном событии, вызов фокуса, переход из системного уведомления/toast, настройка звука после reload, запрет push, восстановление после autoplay rejection, отсутствие подписки MANAGER. Мобильный снимок: `lead-notifications-mobile.png`.

Реальные системные баннеры Windows и активация окна требуют ручной приёмки: Playwright принудительно эмулирует фокус; попытки другой вкладки/сворачивания не дали native hidden, подключение отдельного Edge без этих переопределений завершилось тайм-аутом. Эти пункты DoD не отмечены как выполненные. Порядок проверки и эксплуатационные ограничения: `../lead-notifications.md`.
