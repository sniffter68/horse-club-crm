# VK Mini App

Вход: https://horseclub68.ru/vk-app/ — приложение https://vk.ru/app6781503.

Единственный шлюз `frontend/src/tma/VkMiniApp.tsx` проверяет наличие vk_app_id,
vk_user_id и sign, инициализирует VK Bridge и один раз вызывает POST /api/auth/vk-mini-app.
Подпись и права проверяет backend; наличие параметров само по себе не даёт доступа.

CLIENT/UNLINKED используют существующий tma/src/App.tsx, TRAINER — своё расписание,
ADMIN/STAFF — расписание клуба из TrainerScheduleView. Готовая сессия передаётся
через props, без повторной авторизации, редиректа и переноса JWT через URL/storage.
Bearer хранится в памяти. CRM-сессия не используется; API на публичном домене
использует существующий CRM API origin и CORS.

Привязка телефона: VKWebAppGetPhoneNumber и POST /api/auth/vk-mini-app/link-by-vk.
Backend проверяет подпись телефона; результат переключает кабинет в том же документе.
Повторная авторизация нужна только по явной команде пользователя, например после 401.

Вне VK сразу появляется «Откройте приложение через VK», без Bridge/API.
Bridge ограничен 10 секундами, авторизация/согласие — 15, чтения/мутации — 20.
Загрузка модуля расписания ограничена 15 секундами. ErrorBoundary перехватывает
ошибки рендера и загрузки модуля; «Повторить» перезагружает тот же URL.
Сетевые ошибки и истечение сессии имеют явный повтор входа.

## Сборка и развёртывание

Нужны VK_MINI_APP_ID=6781503 и VK_MINI_APP_SECRET. deploy.sh и deploy-native.cjs
устанавливают зависимости frontend и tma до сборки frontend: VK entry переиспользует
исходники клиента, VK Bridge и Tailwind plugin из tma. Vite использует один React 19
runtime для VK; лёгкий Telegram bundle сохраняет React 17.

```sh
npm --prefix frontend ci
npm --prefix tma ci
npm --prefix frontend run build
npm --prefix tma run build
```

Результат: frontend/dist/vk-app/index.html и assets для всех ролей VK;
frontend/dist/tma/ — самостоятельный Telegram-клиент. Сборки с базой
/vk-app/staff/ больше нет. npm run build:frontends также собирает tma.
Backend собирается штатным Dockerfile; Caddy монтирует тот же frontend/dist.

Caddy разрешает iframe от vk.com, *.vk.com, m.vk.com, vk.ru, *.vk.ru и *.vk-apps.com
только на /vk-app/*. Здесь отсутствует X-Frame-Options; остальные обычные страницы
сохраняют DENY. Старые подпути обслуживаются тем же SPA. CSP и маршрут защищены тестом.

При архивировании Client очищаются vkId/vkUserId/vkScreenName; архивирование сотрудника
(StaffProfile.isActive=false) очищает User и связанную Trainer VK-привязку. Новое назначение
освобождает старые архивные привязки в той же Serializable-транзакции: UNIQUE-индексы
больше не мешают перепривязке. Активные дубликаты дают 409. Восстановление из архива
не возвращает прежний VK автоматически. Схема Prisma не меняется.

## Проверки

npm test в backend/frontend/tma; Playwright в tma проверяет Telegram и VK, включая
iframe для всех ролей, один bootstrap, phone-link, READ_ONLY, истечение сессии,
отсутствие launch params, ошибки, Bridge timeout и повтор.

```powershell
$env:TMA_E2E_PORT='5193'
npm --prefix tma run test:e2e -- --workers=3
```

Preview создаётся заново, чтобы не подхватить старые правила маршрутизации.
Для заранее запущенного проверенного preview есть TMA_E2E_EXTERNAL_SERVER=1.
Подробности: [отчёт](reports/vk-mini-app-architecture-cleanup-2026-11-27.md).
Реальный вход/согласие VK и HTTP-заголовки production проверяются после выкладки;
локальные тесты используют mock VK Bridge/API/Prisma.
