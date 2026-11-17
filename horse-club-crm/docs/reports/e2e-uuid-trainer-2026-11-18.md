# E2E: UUID и рабочее место тренера — 18.11.2026

## Причины исходных девяти падений

Шесть сценариев `cash-desk.spec.ts` использовали `c1`, `c2`, `s1`, которые
отклоняет проверка UUID в форме оплаты:

- cash payment and book refresh: 1440 и 390 px;
- uncertain response preserves payload and operation key on retry;
- noncash SBP skips cash input and trainer cannot access cash desk;
- quick client creation preserves payment and selects new client: 1440 и 390 px.

Три сценария `stall-map.spec.ts` ожидали desktop-карту после входа TRAINER:

- service card is neutral and read-only access hides constructor and building mutations;
- trainer can read rations and print but cannot mutate;
- narrow layout, building filter, keyboard selection and focus restoration.

## Исправления

- Фикстуры и связанные URL/ожидаемые payload используют детерминированные UUID v4.
  Невалидные ID оставлены только в отрицательных сценариях.
- Карта конюшни проверяется под MANAGER с READ_ONLY; другие сценарии просмотра
  конюшни и ветеринарии — под STABLE_WORKER. Ограничения TRAINER проверяются
  через реальный маршрут `/trainer`.
- Проверены общая шахматка, отсутствие управления чужими занятиями, COMPLETED
  и NO_SHOW, сохранение заметки после ошибки, повтор и блокировка двойной отправки.
  Для TRAINER проверяются редиректы девяти маршрутов, отсутствие финансовых
  запросов и переполнения страницы при 390×844.
- Workspace и Telegram-сценарии включены в общий mock-проект Playwright.
- При расширении прогона актуализированы устаревшие точки входа: новый
  `/workspace/admin-summary`, общая форма записи, расширенное бронирование
  из ресурсного слота и финансовые действия через текущие разделы.
- Дополнены обязательные поля моков: корпус денника, вместимость тренера,
  отдых и AVAILABLE-нагрузка лошади. Посторонние загрузки в карточке лошади
  изолированы моками. В Playwright-сценариях нет `waitForTimeout`.
- Проверка CSP лендинга учитывает отдельные политики Telegram: проверяется
  единственная общая политика, импортируемая лендингом.
- У табеля с новой колонкой начислений проверяются собственная прокрутка,
  фиксированные сотрудник/действия и отсутствие переполнения документа.

Продакшен-код, права доступа, финансовые операции и схема Prisma не изменены.
Новая миграция Prisma и регенерация клиента для этой задачи не требуются.

## Воспроизведение

Из `frontend/`, при запущенном Vite на 127.0.0.1:5173:

```powershell
$env:CRM_TEST_BASE_URL = 'http://127.0.0.1:5173'
npm.cmd run test:e2e:mock -- --workers=3 --retries=0
```

Live/операционный reset требуют отдельной базы и явно запускаются отдельно;
сброс данных и применение миграций в этой задаче не выполнялись.

## Итоговые проверки

| Проверка | Результат |
| --- | --- |
| Полный CRM mock, включая workspace и trainer TMA | **419 passed, 0 failed, 0 skipped, 0 flaky** |
| Конфигурация итогового прогона | `--workers=4 --retries=0`; 429,8 с |
| Frontend: основной Playwright-проект лендинга | 8 passed |
| Отдельное приложение landing | 71 passed, 1 существующий live-тест skipped (нужна БД) |
| Backend: typecheck, lint, build | Пройдены; 0 ошибок линтера, 3 существующих предупреждения в тестах |
| Frontend: typecheck, lint, build | Пройдены |
| Backend: npm test | 796 passed, 0 failed, 21 skipped из-за внешней PostgreSQL/интеграционной среды |
| Frontend: npm test | 177 passed |
| git diff --check | Пройден |

Итоговый CRM-прогон: 18.11.2026, 00:18:45–00:25:55 МСК. JSON Playwright
сохранён локально в `frontend/test-results/e2e-final-results.json` (игнорируемый
генерируемый артефакт). Тесты не отключались и не переводились в skip ради
прохождения. Изменения схемы БД и продакшен-исходников отсутствуют.
