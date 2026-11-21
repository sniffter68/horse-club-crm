# Дата оборотов кассы

`GET /payments/summary` и `GET /finance/summary` принимают опциональный `dateBasis=service|payment`. Отсутствующий или пустой параметр означает `service`; неподдерживаемое значение отклоняется валидатором.

Общая функция `paymentTurnover` определяет дату поступления:

- `payment`: `COALESCE(payment.paidAt, payment.createdAt)`.
- `service`, если есть bookingId: `COALESCE(booking.lesson.startTime, booking.startTime, payment.paidAt, payment.createdAt)`.
- `service`, если нет bookingId, но есть membershipId: `COALESCE(membership.validFrom, membership.createdAt, payment.paidAt, payment.createdAt)`.
- Остальные поступления: `COALESCE(payment.paidAt, payment.createdAt)`.

SQL фильтрует только проведённые, неархивные платежи, применяет cashierId/shiftId и полуоткрытый интервал `[from, to)`. Обе выборки — суммы по методам и страница идентификаторов — используют один CTE и выполняются внутри RepeatableRead транзакции. Сортировка: эффективная дата DESC, id DESC; после загрузки связей порядок сохраняется. Суммы считаются по всему периоду, независимо от страницы. Денежная арифметика использует Prisma.Decimal.

Касса запрашивает `/finance/summary`, поэтому оба endpoint используют общий расчёт. Компактный Ant Design Segmented хранит выбор в URL; по умолчанию «По дате услуги». Текущий остаток рассчитывается прежней функцией currentCashBalance независимо от режима, периода, кассира и смены. Даты расходов и общий журнал финансовых движений остаются прежними; переключатель относится к поступлениям сводки. Границы периодов фронтенд формирует по Europe/Moscow.

Из карточки лошади удалена только легаси-секция «Журнал здоровья» под вкладками. VetJournal («Ветзаписи и паспорт» / «Календарь назначений») и отдельный маршрут `/horse-health-logs` сохранены.

Схема БД не менялась; миграция и генерация Prisma Client не требуются.

Проверки: typecheck, lint, build обоих проектов; backend npm test — 861 успешно, 26 пропущено штатными флагами интеграционных тестов PostgreSQL; frontend npm test — 191 успешно. Полный браузерный прогон `cash-desk.spec.ts` и `vet-log.spec.ts` — 59 успешно. Новые сценарии 1440/390 px проверяют переключение дат, сохранение после перезагрузки, клавиатуру, ошибку и повтор, отсутствие горизонтального переполнения, неизменность остатков и отсутствие дублирующего журнала лошади. Снимки: `docs/reports/date-basis-1440.png`, `docs/reports/date-basis-390.png`. Backend lint завершается успешно с тремя прежними предупреждениями в сторонних тестах; frontend lint без замечаний.

Статический premium-аудит: 247 замечаний, столько же в исходном `docs/reports/cash-premium-after.json`; результат — `docs/reports/date-basis-premium.json`. Полный backend-протокол — `docs/reports/date-basis-backend-tests.txt`. PostgreSQL-тест даты услуги добавлен в существующий opt-in набор `cash-desk.postgres.test.cjs`; без RUN_CASH_DESK_TESTS он пропущен.
