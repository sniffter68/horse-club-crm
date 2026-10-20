# Расходы кассы

Источники: задача учета расходов; `backend/src/payments/finance.controller.ts`,
`finance.service.ts`, `dto/expense.dto.ts`, миграция `20261018090000_expenses`.

## API

- `POST /api/finance/expenses`: `amount` (0.01…9999999999.99, максимум две цифры после запятой),
  `paymentMethod` (`CASH`/`CARD`), `category`, обязательное непустое `description` (до 500 символов),
  необязательные `date`, `receiptUrl` (HTTP/HTTPS), `requestId` (UUID).
  Автор берется из JWT; передать `createdById` в теле нельзя.
- `GET /api/finance/expenses`: `page`, `pageSize` (до 100), `from`, `to`, `paymentMethod`,
  `category`, `shiftId`. Ответ: `{data, total, page, pageSize}`. Отмененные записи исключены.
- `DELETE /api/finance/expenses/:id`: только ADMIN. Сохраняет запись, `cancelledAt`
  и `cancelledById`, исключает сумму из последующих расчетов. Повторная отмена безопасна.
- `GET /api/finance/summary`: обязательные `from`, `to`, необязательные `cashierId`,
  `shiftId`, `page`, `pageSize`. ADMIN/MANAGER; TRAINER всегда получает 403.
  Старый `/payments/summary` остается отчетом по доходам для существующих потребителей
  и не раскрывает расходы тренерам с разрешением на просмотр выручки.

Категории: FEED, BEDDING, VET_FARRIER, AMMUNITION, MAINTENANCE, SALARY, OTHER.
Безналичные доходы включают существующие CARD, CARD_TERMINAL, SBP и TRANSFER.

## Даты и баланс

В БД хранятся абсолютные моменты времени (`timestamptz`), в интерфейсе — Europe/Moscow.
Дата без времени означает начало московского дня; `to` без времени включает весь день.
Для ISO timestamp нужен явный UTC offset; timestamp `to` — исключительная граница.
Дата расхода по умолчанию — сейчас; запрещены даты строго позже 23:59:59.999 текущего дня
по Europe/Moscow. Более позднее время в пределах сегодняшнего дня разрешено, в том числе
при небольшом расхождении часов браузера и сервера. Выбор сегодняшней даты в форме
сохраняет текущее московское время, прошлой — начало выбранного дня.

`totalCash`, `totalCard`, `totalUnspecified`, `totalRevenue` — доходы за период;
`totalExpensesCash`, `totalExpensesCard`, `totalExpenses` — расходы за период;
`netCash`, `netCard`, `netTotal` — доходы минус расходы за период.
`balanceCash`, `balanceCard`, `balanceTotal` — накопительные остатки до `to`, включая прошлые периоды.
Неопределенные старые доходы входят в общий остаток и отдельный `balanceUnspecified`,
но не распределяются между наличными и счетом. Размен смены исключен из доходов и баланса.
При фильтре смены все суммы ограничены этой сменой. Расход привязывается к открытой смене
автора, только если его дата не раньше открытия смены.

Создание и отмена выполняются в serializable-транзакциях с повтором при конфликте сериализации;
чтение списка и пересчет используют repeatable-read снимок. Decimal сохраняет точность копеек.
Ключ `requestId` защищает от повторного списания при потере HTTP ответа.

## Установка и проверка

В окружении приложения после резервного копирования и обычной процедуры выпуска:

```powershell
cd backend
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd run build
```

Проверка на отдельной временной схеме локального PostgreSQL (не мигрирует основную схему):

```powershell
# Frontend dev server уже запущен на 5173, порт 3000 свободен.
$env:EXPENSE_TEST_PORT = '5432'
$env:EXPENSE_TEST_BROWSER = '1'
npm.cmd run test:expenses:postgres
```

Runner применяет миграции во временной схеме, проверяет БД, запускает временный backend,
выполняет настоящий вход администратора и Playwright-сценарий расхода 1500 ₽.
Временная схема и backend удаляются после проверки. Для проверки только БД уберите
`EXPENSE_TEST_BROWSER`. Права/валидация: `backend/test/expenses.test.cjs`;
desktop/mobile, фильтры, ошибки и отмена: `frontend/e2e/cash-desk.spec.ts`.

Проверено 18.10.2026: сборки и typecheck frontend/backend; frontend lint и lint новых
backend-файлов; 133 frontend unit-теста; 370 backend-тестов (14 DB-тестов
пропущены без их opt-in флагов, новый expense DB-тест выполнен отдельно); 11 браузерных сценариев кассы; отдельный PostgreSQL
integration-тест и live Playwright со входом администратора, расходом 1500 ₽,
обновлением страницы и отменой. Штатный `scripts/audit-ui.py . --mode strict` — без замечаний.
Миграции проверены только во временной схеме, основная схема приложения не изменялась.
