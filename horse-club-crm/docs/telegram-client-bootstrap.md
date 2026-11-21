# Клиентский вход Telegram Mini App

`/tma`, `/tma/`, `/tma/index.html` обслуживаются клиентским бандлом из `frontend/dist/tma`. `/tma/trainer` продолжает открывать CRM-бандл персонала. Caddy запрещает кэширование Mini App HTML. SDK Telegram уже подключён в `tma/index.html` до модуля приложения.

`POST /api/tma/bootstrap` возвращает 200 после проверки подписи: `CLIENT` с профилем, clientId и JWT с audience `client-tma`, либо `UNLINKED_CLIENT` с `needsPhoneLink: true`. Некорректная подпись остаётся 401. Источник initData: `Authorization: tma …`, `X-Telegram-Init-Data`, затем тело `{ initData }`. Учётная запись сотрудника для клиента не нужна; персонал сохраняет прежний приоритет в bootstrap.

Клиент определяется по `telegramUserId` или `telegramChatId`, только среди неархивных карточек. Запрос собственного контакта не создаёт карточку. Привязка телефона подтверждается собственным контактом в чате бота; произвольный введённый номер не даёт доступ к чужому кабинету. Отвязка очищает оба Telegram ID клиента.

Общий `resolveTelegramBotToken` используется поллингом, доставкой уведомлений, bootstrap и guard. Источник: запись `TelegramIntegrationSettings` с id=1, затем `TELEGRAM_BOT_TOKEN`. Настройки хранятся в `encryptedConfig`: JSON `{ "botToken": "…" }`, зашифрованный AES-256-GCM; base64 от `iv(12) + authTag(16) + ciphertext`, ключ SHA-256 от `horsecrm:telegram-settings:v1:${JWT_SECRET}`. Используется отдельный от VK домен ключа; повреждённые настройки не скрываются переходом на другой токен. Секреты не возвращаются в bootstrap и не пишутся в журнал. UI редактирования интеграции этой задачей не добавляется.

Перед запуском нового backend необходимо применить миграцию `20261121000000_telegram_client_identity` на сервере (`npx prisma migrate deploy`). Она добавляет nullable `Client.telegramChatId`, уникальный индекс и таблицу настроек; существующие данные не переписывает. Prisma Client сгенерирован локально. Пересобрать frontend, затем tma (его сборка пишет в `frontend/dist/tma`), развернуть backend и обновлённый Caddyfile. Проверить реальное открытие на телефоне после деплоя.

Регрессии: `backend/test/telegram-client-bootstrap.test.cjs`, `backend/test/client-miniapp.test.cjs`, `backend/test/trainer-tma.test.cjs`, `tma/e2e/rider.spec.ts`. Используются подписанные initData пользователя 1808998846 и mock Prisma без сотрудника, отдельно для каждого поля; браузер проверяет отложенный SDK, отсутствие CRM-логина, непривязанный профиль, ошибки/повтор, восстановление после 401.
