# Проверка регистрации TelegramBotModule — 2026-11-10

В текущей рабочей копии AppModule уже безусловно импортирует TelegramBotModule.
Все четыре доменных сервиса, guard, TmaBookingService и три контроллера зарегистрированы.
PrismaModule, BookingsModule, LessonsModule, AuthModule и TelegramDeliveryModule импортированы.
Экспортировать TelegramBotService для его создания Nest не требуется.

ConfigModule не используется и @nestjs/config не установлен. Production Compose передает
TELEGRAM_BOT_TOKEN через environment; сервис читает process.env в onModuleInit.
Локальный start:dev использует node --env-file=.env. Новые зависимости не добавлялись.

Добавлен лог `Telegram bot module initialized` в lifecycle hook модуля.
Добавлен mock-тест: импорт из AppModule, разрешение зависимостей реального TelegramBotModule,
вызов lifecycle Nest, наличие логов модуля и безопасного отключения при отсутствии токена.
Существовавшие до задачи изменения polling и Compose сохранены.

Проверки:
- backend: typecheck, lint, build — успешно; lint: три существующих предупреждения в тестах.
- backend npm test: 757 passed, 20 skipped, 0 failed; новый тест после изоляции AUTH_OPTIONS повторно прошел.
- frontend: typecheck, lint, build — успешно; npm test: 165 passed.
- Playwright mock telegram-link.spec.ts: 8 passed.

Схема Prisma не менялась; миграция и повторная генерация клиента не требуются.
Production не изменялся. Отсутствие регистрации модуля в развернутом образе нужно проверять на VDS;
это не подтверждено состоянием текущего исходного кода.
