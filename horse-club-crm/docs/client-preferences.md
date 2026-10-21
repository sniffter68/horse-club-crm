# Тренер и лошадь клиента по умолчанию

В карточке клиента и общей форме создания/редактирования доступны поля «Тренер по умолчанию» и «Лошадь по умолчанию». Селекторы используют общие Ant Design Form/Select и существующую тему шторки. Пустой вариант и очистка сохраняются как `null`; ошибка сохранения оставляет введённые значения. Ошибка загрузки справочников отображается с повторной попыткой.

API `POST /api/clients`, `PATCH /api/clients/:id` принимает опциональные UUID `preferredTrainerId`, `preferredHorseId`. Пропущенные поля сохраняют текущий выбор, `null` сбрасывает, пустая строка преобразуется в `undefined` до валидации. Список, карточка и результат сохранения включают `preferredTrainer` и `preferredHorse` с `id`, `name`. Связи индексированы; физическое удаление ресурса сбрасывает предпочтение через `ON DELETE SET NULL`.

При создании занятия и бронирования значения подставляются при выборе клиента. Автоматически выбранные значения следуют смене клиента, в том числе очищаются у клиента без предпочтений. Ручное изменение или очистка сохраняются до закрытия формы; исходный выбор из фильтра расписания также сохраняется. При редактировании существующего занятия предпочтения не применяются. В групповом занятии общий тренер берётся у первого участника, лошадь — индивидуально у каждого.

Автоподстановка допускает активных тренеров и активных доступных лошадей со здоровым статусом. Обычные проверки занятости, нагрузки, отдыха и веса всадника продолжают выполняться при бронировании. Запросы карточек отменяются при смене клиента; поздние ответы не заменяют ручной выбор.

Миграция: `backend/prisma/migrations/20261021190000_client_preferred_trainer_and_horse/migration.sql`. Локальный `prisma migrate dev --create-only` завершился ошибкой schema engine при подключении к PostgreSQL `127.0.0.1:5433`; SQL сформирован командой `prisma migrate diff` между исходной и изменённой схемой. Prisma Client сгенерирован. На сервере перед запуском обновлённого API требуется `npx prisma migrate deploy` из `backend/`.

Проверки: `backend/test/client-preferences.test.cjs`, `frontend/src/pages/clients/preferredResources.test.ts`, `frontend/e2e/client-preferences.spec.ts`. Browser mock-сценарии покрывают обе формы, смену клиента, ручной выбор, поздний ответ API, недоступные ресурсы, ошибку сохранения и сброс в карточке; ширины 1440 и 390 px.

Статический premium-аудит сохранён в `docs/client-preferences-premium-audit.json`. Он возвращает 200 замечаний: 172 проверки `form.novalidate-missing` и 28 `ownership.native-select-conflict`. Регулярные выражения аудитора принимают `Form.Item` за HTML form, а импортированный Ant Design `Select` — за native select. Изменённые формы используют существующие владельцы Ant Design и `noValidate` на родительских формах; эти предупреждения не являются результатами браузерной проверки.

## Результаты проверки, 21.10.2026

| Проверка | Результат |
| --- | --- |
| `npm run typecheck`, backend и frontend | Успешно |
| `npm run lint`, backend и frontend | Без ошибок; три прежних предупреждения backend в dashboard/vet/audit тестах |
| `npm run build`, backend и frontend | Успешно |
| `npm test`, backend | 485 успешно, 17 PostgreSQL-сценариев пропущены, ошибок нет |
| `npm test`, frontend | 142 успешно, 11 файлов |
| `prisma generate`, `prisma validate` | Успешно |
| Browser mock: предпочтения, entity-edit, triad-booking | Проверены 44 уникальных сценария. Общий запуск: 40 успешных и 4 ошибки fixtures. После исправления выбора клиента в тестовом helper и добавления справочников в entity-edit повторены все 9 клиентских сценариев: 9 успешных |
| `git diff --check` | Без ошибок |

Команды браузера: `npx playwright test --project=mock client-preferences.spec.ts entity-edit.spec.ts triad-booking.spec.ts`; повтор исправленных fixtures — `npx playwright test --project=mock client-preferences.spec.ts entity-edit.spec.ts -g client --output test-results/preferences-final`. Скриншоты форм: `frontend/test-results/client-preferences-1440.png`, `frontend/test-results/client-preferences-390.png`.
