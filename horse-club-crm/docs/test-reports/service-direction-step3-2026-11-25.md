# Шаг 3: направление и групповой формат услуг

Дата: 25.11.2026.

## Реализация

- Service.serviceDirection — nullable Prisma enum с ключами флагов Horse. Старые услуги остаются NULL, API поддерживает legacy-клиентов и частичные PATCH.
- Направление независимо от формата. Единственный источник группового формата — maxCapacity: 1 индивидуально, 2–1000 группа. Отдельного isGroup нет.
- Форма в EntryOverlay drawer поверх списка: направление, ToggleSettingRow, раскрываемая вместимость (по умолчанию 4), пояснение действующего биллинга isPerPerson. В списке — направление и мягкий бейдж формата.
- LessonDrawer использует явное направление и передаёт проверенный serviceId. API availability загружает услугу в транзакции и выбирает явное направление раньше name/capacity fallback и query-подсказок. Предупреждение остаётся мягким.
- TriadBookingModal создаёт самостоятельный Booking по дисциплине, без Service; прежнее сопоставление дисциплины сохранено.

## Проверки

Все обязательные команды завершились с кодом 0 (в Windows использованы npm.cmd / npx.cmd из-за запрета PowerShell-скриптов):

| Проект | lint | typecheck | build | test |
| --- | --- | --- | --- | --- |
| backend | успешно, 3 существующих предупреждения | успешно | успешно | 949 passed, 27 skipped, 0 failed |
| frontend | успешно | успешно | успешно | 27 файлов, 222 passed |

`npx.cmd prisma generate` — успешно, Prisma Client 6.19.3.

Backend-тесты service-direction.test.cjs: валидация enum/вместимости, создание группы, частичное обновление, переход к индивидуальному формату, явный приоритет направления, legacy fallback, 404 неизвестной услуги в availability.

Браузерные тесты — 3 passed:

- service-direction.spec.ts: 390 px, тёмная тема; 1440 px, светлая тема. Выбор направления с клавиатуры, переключение группы, значение 4, ошибка пустой вместимости и aria-invalid, сохранение 6, загрузка сохранённых полей, выключение группы до 1, сохранение ввода после 500 и успешный повтор, отсутствие горизонтального переполнения и pageerror.
- lesson-payments.spec.ts, `lesson horse warnings follow explicit service direction before name and capacity`: противоречащие названию явные направления, смена услуги и предупреждения, параметры serviceId/serviceDirection.

Команда браузерной проверки:

```text
npx.cmd playwright test --config=playwright.crm.config.ts --project=service-direction --project=mock service-direction.spec.ts lesson-payments.spec.ts --grep "service direction"
```

Скриншоты: service-direction-group-390.png, service-direction-group-1440.png в этой папке.

Дополнительный общий strict-аудит frontend-design-premium не проходит: 273 замечания сканера, включая ложные срабатывания на Ant Design Form.Item и Select как на нативные формы/select. Это не ошибка lint/typecheck/build/test; результат сохранён локально в service-direction-premium-audit.json (шаблон *audit*.json исключён существующим .gitignore). Общая очистка этих замечаний не входит в текущую задачу.

## Миграция

Перед обновлением backend применить `backend/prisma/migrations/20261125140000_service_direction/migration.sql` на сервере. SQL допускает повторный запуск через psql, не изменяет старые направления. Для штатного развёртывания — `npx prisma migrate deploy`; при ручном применении согласовать историю миграций Prisma.

Локальная PostgreSQL и сервер не изменялись. Пропущенные 27 тестов требуют PostgreSQL; фактическое применение и повторное применение SQL к БД в этой сессии не проверялись.
