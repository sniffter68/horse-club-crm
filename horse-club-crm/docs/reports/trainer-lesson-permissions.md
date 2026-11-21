# Права создания занятий тренерами — 22.11.2026

Добавлены `lessonCreateOwn` и `lessonCreateAny` в Prisma RoleAccess, DTO и типы backend/frontend. Оба права по умолчанию включены; ADMIN сохраняет полный доступ. Сохранение `lessonCreateAny=true` автоматически включает `lessonCreateOwn`.

Проверка прав выполняется в LessonsService. При разрешении любого тренера сохраняется выбранный `trainerId`, иначе требуется собственная привязка. Запрет обоих прав возвращает 403. Сохранены транзакция создания, аудит фактического автора и выбранного тренера, проверка ресурсов, запрет финансовых параметров и безопасный trainerLessonView.

Настройки используют существующие Switch и подтверждение сохранения; общая шторка записи разрешает выбор тренера по политике. Кнопка учитывает доступ FULL к расписанию; изменение прав обновляется по событию `role-access-changed`. Telegram-шахматка проверена отдельно.

## Проверки

| Проверка | Результат |
| --- | --- |
| `npx prisma generate` в backend | Успешно, Prisma Client 6.19.3 |
| `npm --prefix backend run typecheck` | Успешно |
| `npm --prefix frontend run typecheck` | Успешно |
| `npm --prefix backend run lint` | Ошибок нет; 3 существующих предупреждения в audit-http-20261019.cjs, vet-records.test.cjs, dashboard.test.cjs |
| `npm --prefix frontend run lint` | Успешно |
| `npm --prefix backend run build` | Успешно |
| `npm --prefix frontend run build` | Успешно |
| `npm --prefix backend test` | 872 прошли, 26 пропущены, ошибок нет |
| `npm --prefix frontend test` | 191 прошёл, 23 файла |
| Playwright mock: workspace.spec.ts, role-access.spec.ts | 31 прошёл, Edge, ширина 375/390/1280/1440 px |
| Статический premium UI audit, strict | 247 замечаний по проекту; на затронутых исходниках 13 до и 13 после, новых нет. Включает ложные срабатывания на Ant Design Form.Item/Select |
| `git diff --check` | Ошибок нет |

Браузерные сценарии проверяют создание своего и чужого занятия, быстрый ввод клиента и абонемент, ошибку 409 и повтор, выбор тренера клавиатурой, зависимость переключателей, сохранение настроек, отзыв прав и ошибку их загрузки, READ_ONLY, адаптивность и Telegram-версию. Снимки мобильной шторки и настроек просмотрены.

## Развёртывание

Нужна миграция `20261122120000_add_trainer_lesson_create_permissions`: выполнить `npx prisma migrate deploy` в backend на сервере перед запуском новой версии. Миграция подготовлена SQL-файлом; к серверной базе в этой задаче не применялась. Проверки PostgreSQL, отмеченные как skipped, не заменяют серверное применение миграции.
