# Проверки архива лошадей — 22.11.2026

Локальная Windows, mock API и браузер Microsoft Edge. Производственная база не изменялась.

| Проверка | Результат |
| --- | --- |
| Backend `npm run typecheck` | Успешно |
| Backend `npm run lint` | Без ошибок; три существующих предупреждения в audit-http, dashboard, vet-records |
| Backend `npm run build` | Успешно |
| Backend `npm test` | 893 passed, 26 skipped, 0 failed; PostgreSQL-сценарии требуют отдельной БД |
| Frontend `npm run typecheck` | Успешно, включая Playwright TypeScript |
| Frontend `npm run lint` | Без ошибок |
| Frontend `npm run build` | Успешно |
| Frontend `npm test` | 196 passed, 24 файла |
| Playwright mock: horse-archive, entity-edit, client-archive | 26 passed; проверки нового сценария на 1280 и 390 px |
| `npx prisma validate` | Схема валидна |
| `npx prisma generate` | Prisma Client 6.19.3 сгенерирован |
| `npx prisma migrate dev --name add_horse_soft_delete` | Ошибка schema engine при подключении к локальной PostgreSQL `127.0.0.1:5433`; SQL подготовлен вручную |

Браузер покрывает конфликт 409 и повторное удаление, сохранение истории, показ архива с клавиатуры, прямую ссылку на архивную карточку, скрытие мутаций и регрессию карточек и шторок редактирования, включая READ_ONLY.

Дополнительный общий `audit_project.py --mode strict` выполнен: 248 замечаний к общему UI-контракту проекта, в том числе ложные срабатывания на `Form.Item` как на самостоятельную форму. Они не являются ошибками npm lint и не устранялись массово в рамках этой задачи. Визуальные токены не менялись.

Перед обновлением API на сервере необходим `npx prisma migrate deploy` из `backend/`. Применение миграции и конкурентные транзакции не проверены на настоящем PostgreSQL локально.
