# Проверка Telegram Mini App тренера — 11.11.2026

Изменения: `docs/trainer-tma.md`. Среда: Windows, локальная сборка, Edge headless; Telegram SDK и API в браузерных сценариях замоканы. Серверная БД не требуется для этих тестов.

| Проверка | Результат |
| --- | --- |
| Backend `npm run typecheck` | Успешно |
| Backend `npm run lint` | Успешно; три прежних предупреждения в dashboard.test.cjs, audit-http-20261019.cjs, vet-records.test.cjs |
| Backend `npm run build` | Успешно |
| Backend `npm test` | 769 успешно, 21 пропущен, 0 ошибок |
| Новые backend HTTP/mock-тесты | 7 успешно; входят в полный набор |
| Frontend `npm run typecheck` | Успешно, включая конфигурацию и сценарии Playwright TMA |
| Frontend `npm run lint` | Успешно, без предупреждений |
| Frontend `npm run build` | Успешно |
| Frontend `npm test` | 175 тестов в 22 файлах, успешно |
| Playwright `playwright.tma.config.ts` | 10 сценариев успешно |
| Регрессия CRM `module-access.spec.ts` | 8 сценариев успешно |
| Существующий клиентский `tma`: `npm run build` | Успешно; JS+CSS 149979 байт, gzip 49996 байт |
| `git diff --check` | Успешно |
| Premium static audit | 215 замечаний существующих экранов; 0 замечаний в новых файлах TMA |

API-тесты проверяют HMAC, срок initData, неподписанный/подменённый ввод, NOT_LINKED, неактивность профиля, scoped JWT, запрет TMA JWT в CRM, запрет CRM JWT в TMA, отзыв по tokenVersion, московские границы суток, сортировку, DTO/UUID, принадлежность занятия/участника, ADMIN, READ_ONLY/HIDDEN и отключение модуля. Отдельно проверяется повторная авторизация внутри транзакции замены лошади.

Браузерные сценарии проверяют ready/expand, отсутствие CRM-sidebar, московское время, недельную навигацию и счётчики, сохранение статуса, обе причины завершения, замену лошади с конфликтом и повтором, сохранение выбора, клавиатуру и возврат фокуса после быстрого Escape, 320/375 px, тёмную тему, READ_ONLY, отсутствие привязки, ошибку входа, ошибку/повтор чтения, пустой день и истечение сессии. Скриншоты просмотрены: `test-results/tma-mobile.png`, `test-results/tma-mobile-dark.png`, `test-results/tma-horse-sheet.png`.

Артефакты: `test-results/tma-backend-test.log`, `test-results/tma-frontend-test.log`, `test-results/tma-frontend-build.log`, `test-results/tma-e2e.log`, `test-results/tma-crm-regression.log`, `test-results/tma-premium-audit.json`.

Миграция Prisma и генерация клиента не нужны: схема не менялась. Развёртывание не выполнялось. Caddy/Docker CLI в локальной среде отсутствуют, поэтому новая конфигурация маршрута проверена по коду, без `caddy validate`. Проверка настоящего Telegram на iOS/Android и интеграция с серверной БД остаются проверками после выкладки.
