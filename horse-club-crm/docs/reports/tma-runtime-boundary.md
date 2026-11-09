# TMA: защита от runtime-ошибок

Дата: 09.11.2026.

Добавлен корневой классовый ErrorBoundary: сообщение, стек, кнопка перезагрузки. Обращение к Telegram защищено проверкой window; вызовы ready/expand, MainButton/BackButton, closing confirmation, theme events и haptic перехватывают исключения SDK. BackButton опционален; requestContact вызывается только при типе function. Проверка версии SDK также не прерывает рендер.

Сохранён порог 150 000 байт: production не подключает React DevTools, отключён полифилл modulepreload (у TMA один entry без динамических импортов). Development сохраняет DevTools. Итог: JS + CSS 149 996 байт, gzip 50 016 байт. Запас до порога — 4 байта.

Проверки:

- TMA: `npm.cmd --prefix tma run build` (включая typecheck), `run lint`, `test` — успешно, 1 unit test.
- Playwright: 12/12 mobile Chromium сценариев. Добавлены render failure → сообщение/стек → reload, отсутствие BackButton, исключения native bridge; существующие contact/manual fallback и booking сценарии проходят. Аварийный экран проверен визуально на узкой ширине, горизонтальная прокрутка ограничена pre.
- Стандартный порт 5175 занят; использована временная конфигурация порта 5185. Первый прогон завершил все сценарии, но завис при остановке webServer в Windows; повтор без управления webServer завершился кодом 0 (12 passed). Временная конфигурация удалена.
- Backend: typecheck, lint, build, test — успешно; 728 passed, 20 skipped (PostgreSQL), 0 failed. Линтер: 4 существующих предупреждения, 0 ошибок.
- Frontend: typecheck, lint, build, test — успешно; 20 файлов, 165 passed.
- Статический UI audit strict: 0 findings, результат в `tma-runtime-ui-audit.json`.

Миграции Prisma не требуются. Реальный Telegram WebView на устройстве не проверялся; SDK моделируется в браузерных тестах. ErrorBoundary обрабатывает ошибки React-дерева, а исключения обработчиков native bridge перехватываются отдельно.
