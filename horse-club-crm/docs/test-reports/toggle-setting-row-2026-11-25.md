# Компактный ToggleSettingRow — 25.11.2026

- Общие стили: Switch 38×22 px, бегунок 18×18 px, отступы строки и дочернего блока 10px 14px, зазор 12px. Сохранены анимация Ant Design, тематические цвета, label, фокус и disabled.
- Разметка компонента уже обеспечивает связь label/Switch и условное раскрытие; изменения TSX не потребовались.
- Компонентные тесты дополнены проверками закрытого раскрытия и наследования/переопределения disabled.
- E2E проверяет реальные размеры и положение бегунка в обоих состояниях, отступы, отсутствие переполнения, клик по отступу label, клавиатуру, сохранение и восстановление после ошибки. Скриншоты просмотрены: десктоп 1440px, мобильный 390px; светлая форма и тёмная шторка.

## Проверки

Команды запускались через npm.cmd/npx.cmd: PowerShell блокирует npm.ps1 политикой исполнения.

- `npm --prefix frontend run lint`: успешно.
- `npm --prefix frontend run typecheck`: успешно.
- `npm --prefix frontend run build`: успешно.
- `npm --prefix frontend test`: 26 файлов, 219 тестов успешно.
- `npm --prefix backend run lint`: успешно, 3 предупреждения в существующих тестах.
- `npm --prefix backend run typecheck`: успешно.
- `npm --prefix backend run build`: успешно.
- `npm --prefix backend test`: 933 успешно, 27 пропущено, 0 ошибок.
- Из frontend: `npx playwright test --config=playwright.crm.config.ts --project=mock horse-service-availability.spec.ts`: 6 успешно; CRM_TEST_BASE_URL=http://localhost:5174.
- Статический аудит frontend-design-premium в strict-режиме: 264 общепроектных замечания вне изменяемого компонента; отчёт `toggle-setting-row-audit.json`. Аудит целиком не прошёл; эти замечания не исправлялись в рамках изменения пропорций.

Миграция Prisma и генерация клиента не требуются: схема БД не менялась.
