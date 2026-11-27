# Автоматический выбор кабинета VK / Telegram — 27.11.2026

После входа VK и привязки по нативному номеру CLIENT открывает кабинет всадника,
TRAINER — своё расписание и посещаемость, ADMIN/MANAGER — расписание клуба.
Заглушка «Кабинет сотрудника / Открыть CRM» удалена. Рабочий интерфейс персонала
переиспользует `frontend/src/tma/TrainerScheduleView.tsx` из Telegram.

VK остаётся на своём origin: `/vk-app/` и `/vk-app/staff/`. Отдельная сборка
персонала создаётся командой `frontend build`; Caddy обслуживает её с VK CSP.
Подписанные launchParams повторно проверяются после загрузки рабочего bundle;
JWT не передаётся через URL/storage. API с horseclub68.ru идёт на CRM origin
с Bearer-токеном и работает без cookies.

Ответ VK сохраняет legacy `role` / `access_token`, добавляет совместимые поля
сессии `token`, `miniAppRole`, `trainerId`, `user.name`, `accessLevel`.
Сотрудники получают отдельную scoped-сессию audience=trainer-tma с VK-привязкой.
Каждый запрос проверяет привязку, tokenVersion, активность и права SCHEDULE.
CRM JWT и клиентский JWT не открывают scoped API персонала.

## Проверки

| Проект | Проверка | Результат |
| --- | --- | --- |
| backend | lint / typecheck / build | Пройдены; 3 прежних предупреждения lint, ошибок нет |
| backend | npm test | 1004 passed, 28 skipped |
| frontend | lint / typecheck / build | Пройдены; Vite предупреждает о размере рабочего bundle |
| frontend | npm test | 262 passed |
| tma | lint / typecheck / build | Пройдены; JS+CSS 166374 байт при лимите 176000 |
| tma | npm test | 10 passed |
| tma | Playwright, Edge, 390×844 | 44 passed, включая 16 VK-сценариев |
| tma | Статический premium-аудит | 0 findings |

E2E запускался с `TMA_E2E_PORT=5177`. У старого Telegram-теста исправлен
жёстко заданный порт: ожидаемый URL теперь строится из Playwright baseURL.

VK-покрытие: CLIENT/TRAINER/ADMIN/MANAGER после обычного входа и phone-link;
отсутствие заглушки, нового окна и перехода на CRM origin; READ_ONLY и
восстановление истёкшей сессии; отметка посещаемости; ошибка, pending,
отказ согласия, повтор и клавиатура; реальные production-origin URL с
mock API и отсутствием cookies. HTTP-тест backend использует настоящую
подпись JWT, CORS preflight, scoped guard, RBAC, отзыв сессии и mock Prisma.
Скриншоты рабочих кабинетов проверены визуально.

## Развёртывание

Изменений схемы Prisma нет, миграция и генерация клиента не требуются.
Порядок: сборки backend → frontend → tma, затем перезапуск backend и Caddy
с обновлённым `docker/Caddyfile`. Штатный `deploy.sh` уже использует этот порядок.
Развёртывание в рамках задачи не выполнялось. Проверка настоящего согласия
в VK и серверной PostgreSQL остаётся проверкой после развёртывания; локальные
сценарии используют mock VK Bridge/API/Prisma.
