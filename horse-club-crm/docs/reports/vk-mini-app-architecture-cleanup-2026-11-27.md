# VK Mini App: архитектурная очистка — 27.11.2026

## Причины и границы подтверждения

Проверены tma/src, frontend/src, backend/src, docker/Caddyfile, package.json,
vite-конфигурации, deploy.sh, deploy-native.cjs, docker-compose.prod.yml и backend Dockerfile.

Подтверждённая по исходникам цепочка: tma App → POST auth/vk-mini-app →
window.location.replace(/vk-app/staff/) → отдельный frontend vk-main →
TrainerScheduleView → useTelegramWebApp → vkStaffBootstrap → второй POST.
CLIENT/UNLINKED из второго bundle возвращались location.replace на /vk-app/.
Токен первого входа терялся: только launch params переносились между документами.
Раздельные сборки и ветви Caddy создавали зависимость от правильной выкладки двух entry.
RootRoutes обычной CRM не обслуживал /vk-app/: отдельный HTML-entry обходил его.

Зависание вне VK: isVk определял платформу по пути, даже без подписанных параметров,
и ожидал Bridge до 10 секунд. При роли персонала клиентский экран оставался loading,
пока загружался второй документ; первый bootstrap не передавал ему готовую сессию.
Старый vkAuthenticate не учитывал signal владельца; повтор/размонтирование могли оставить
запрос работающим. Таймаут Bridge не сбрасывал rejected/pending initialized для повтора.
Вызовы персонального tmaRequest, кроме bootstrap, не имели общего таймаута; зависший API
мог удерживать загрузку. AbortSignal.any/timeout зависели от версии WebView.
В vk-main и кабинете персонала отсутствовал ErrorBoundary: ошибка рендера/модуля оставляла
пустой root. Клиентский boundary существовал только в отдельном tma bundle.

Это доказанные механизмы отказа в репозитории. Серверные логи/живой iframe vk.ru не
снимались, поэтому конкретное исключение ранее развёрнутой версии не объявляется
установленным. Production-причины дополнительно проверяются после выкладки.

## Реализация

- Один frontend VK SPA с base=/vk-app/, отдельным entry VkMiniApp и единственным bootstrap.
  CLIENT/UNLINKED переиспользуют исходники tma App; TRAINER/ADMIN/STAFF получают готовую
  scoped-сессию в TrainerScheduleView. Переходов между VK-бандлами больше нет.
- Phone-link сразу выбирает кабинет в том же документе; Bearer остаётся в памяти.
  Vite alias/dedupe исключают второй React runtime при переиспользовании React 17 исходников
  tma в React 19 VK entry. tma переведён на поддерживаемый React 17 automatic JSX runtime.
- Вне VK инструкция появляется до Bridge/API. Bridge — 10 секунд, auth/phone — 15,
  API вместе с чтением body — 20, lazy-модуль персонала — 15. withDeadline использует
  AbortController и таймер с очисткой, без зависимости от AbortSignal.any/timeout в VK-пути.
  Ошибка Bridge сбрасывает инициализацию для повтора. Размонтирование отменяет auth/API.
- ErrorBoundary защищает оба кабинета и lazy import. Повтор рендера/модуля перезагружает
  тот же URL; ошибки сети/401 имеют явный повтор входа. Автоматического auth-цикла нет.
  Цвета/компоненты существующих кабинетов сохранены; тема персонала и CRM-токены подключены.
- Caddy отдаёт /vk-app/index.html для всех VK-путей, без отдельного staff handler.
  VK frame-ancestors содержит vk.com, *.vk.com, m.vk.com, vk.ru, *.vk.ru, *.vk-apps.com.
  X-Frame-Options снимается только в Mini App; обычные страницы сохраняют DENY.
- deploy.sh/deploy-native.cjs устанавливают frontend и tma до сборки frontend; frontend build
  создаёт единый VK entry, tma build обновляет только Telegram dist/tma. Корневой
  build:frontends включает tma. Второй VK entry и preview-подмена VK на tma удалены.
  Документация обновлена. Backend Dockerfile/compose уже используют нужные пути и VK env.

## VK ID и архив

В реальной схеме Client использует deletedAt, StaffProfile — isActive (у User нет deletedAt).
При soft delete клиента очищаются vkId/vkUserId/vkScreenName и неотправленные VK-уведомления.
При архивировании сотрудника очищаются User.vkId/vkUserId, связанный Trainer.vkId;
существующее отключение доступа и tokenVersion сохраняется. История не удаляется.

assertAvailable проверяет архивность всех найденных владельцев. Старые архивные привязки
освобождаются до нового назначения внутри той же Serializable-транзакции, затем поиск
повторяется: одного фильтра deletedAt=null недостаточно, поскольку UNIQUE-индекс продолжает
содержать старое значение. Активный конфликт по-прежнему даёт 409. Ошибка последующей записи
откатывает освобождение; прежние retry P2034/P2002 сохраняются. Восстановление карточки
не возвращает старую VK-привязку. Схема не менялась: миграция и prisma generate не нужны.

## Проверки

Результаты финальных запусков и ограничения приведены ниже; логи сохранены рядом.

- backend: typecheck/build/lint — без ошибок, 3 прежних предупреждения lint в тестах;
  npm test — 1009 passed, 28 skipped, 0 failed (1037 всего).
- frontend: typecheck/lint/build — без ошибок; Vite предупреждает о размере рабочего chunk.
  npm test — 262 passed (34 файла).
- tma: typecheck/lint/build — без ошибок; Telegram JS+CSS 170590 байт, лимит 176000.
  npm test — 15 passed, включая deadline, отмену запросов и контракт Caddy/единой сборки.
- Playwright: production bundles, Edge Chromium, 390×844; mock Bridge/API/Prisma.
  Покрытие: все роли в iframe, один auth и неизменный URL, CLIENT/phone-link/TRAINER/ADMIN/
  MANAGER, READ_ONLY, согласие/отказ, ошибочный API, Bridge timeout с повтором, render boundary,
  отсутствие launch params напрямую и в iframe, истечение клиентской и staff-сессий;
  также полный существующий Telegram-набор. Результат: 53 passed; отдельно frontend trainer-tma — 18 passed.
- Unit backend покрывает повторную привязку после архива клиента и сотрудника, живые
  конфликты, очистку полей/очереди при soft delete; существующий lifecycle-тест проверяет
  очистку VK у связанного Trainer при архивировании StaffProfile.
- Статический premium-аудит tma: 0 замечаний. Общий строгий аудит CRM: 287 замечаний
  в существующих формах/селектах вне этой задачи; это отдельный известный долг, не успешная
  общепроектная UI-сертификация. Редизайн этих экранов не выполнялся.

Первый браузерный прогон подхватил старый preview с прежней маршрутизацией. Конфигурация
больше не переиспользует неизвестный сервер. На этой Windows остановка дочернего preview
из Playwright задерживала завершение; финальный прогон использует явно запущенный чистый
preview и TMA_E2E_EXTERNAL_SERVER=1. Production-origin тесты по-прежнему проверяют CORS/Bearer.

Развёртывание не выполнялось. Caddy/Docker отсутствуют локально: конфигурация покрыта
regression-тестом по исходнику, но caddy validate и реальные HTTP-заголовки требуют сервера.
Реальное VK-согласие и PostgreSQL проверяются после штатного deploy; локально использованы
моки. Исторический отчёт vk-mini-app-role-routing-2026-11-27.md описывает предыдущую схему.

Итоговые браузерные проверки: 53 passed (tma, включая VK iframe),
18 passed (frontend trainer-tma, Telegram-персонал). Логи:
vk-cleanup-browser-verified.log и vk-cleanup-staff-telegram-browser.log.
При визуальной проверке исправлен конфликт цвета body между CRM и tma;
VK document теперь явно наследует существующие --tma-* цвета. Проверка цветов
клиентского кабинета добавлена в браузерный тест, токены/палитра не менялись.


