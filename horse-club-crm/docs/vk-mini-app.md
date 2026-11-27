# VK Mini App 6781503

URL запуска: https://horseclub68.ru/vk-app/

На сервере задайте VK_MINI_APP_ID=6781503 и VK_MINI_APP_SECRET (защищённый ключ приложения VK). Пересоберите backend и tma, перезапустите backend и Caddy. docker-compose.prod.yml передаёт обе переменные. Миграция Prisma не нужна.

POST /api/auth/vk-mini-app принимает launchParams (исходную строку query). Проверяются HMAC-SHA256/base64url, уникальность параметров, App ID, числовой user ID и vk_ts (24 часа, затем требуется повторный запуск). Параметры launch не сохраняются. JWT клиента ограничен audience client-tma; каждая операция проверяет актуальную привязку и отсутствие архива. JWT сотрудников использует существующий tokenVersion и CRM RBAC. Сотрудникам выдаётся cookie CRM при запросе на crm.horseclub68.ru.

UNLINKED возвращает vkUserId. POST /api/auth/vk-mini-app/link принимает launchParams, phone и code (4 цифры). Используется существующий VkLinkService: код выдаёт администратор из карточки клиента, срок 5 минут, лимит попыток, транзакция Serializable и контроль конфликтов. Ввод одного телефона без подтверждения не допускается: подписанные launch-параметры не подтверждают владение телефоном. Сотрудников привязывает администратор существующими средствами CRM.

Telegram SDK и его авторизация сохранены. Общий bundle использует относительные пути для /tma/ и /vk-app/. CSP и разрешение iframe VK ограничены /vk-app/. Официальный VK Bridge: https://github.com/VKCOM/vk-bridge . После добавления SDK лимит JS+CSS увеличен со 160 до 176 КБ; фактический размер около 165 КБ.

Проверки: backend lint/typecheck/build; 997 тестов passed, 28 skipped. Frontend lint/typecheck/build; 261 тест passed. TMA lint/typecheck/build и тест изоляции прошли. Четыре новых backend-теста проверяют подписи, timingSafeEqual, сортировку и HTTP-эндпоинт. Статический аудит всего существующего интерфейса: docs/vk-ui-audit.json (замечания требуют отдельной задачи).

Playwright: CLI ???????? ??? ?????? ?? ??????? ?????????, ? ??? ????? ??? ?????? ???????. ???????? ???????????; ?????????? ???????? VK ? Telegram ???????? ?????????????. ???????? ???????? tma/e2e/vk.spec.ts.
