# Проверка скриптов деплоя — 22.10.2026

Изменены Windows-скрипт отправки коммита, серверный deploy.sh и действующий workflow в корне Git (`../.github/workflows/deploy.yml`). Схема БД не менялась, миграции не требуются. Боевой деплой и push в GitHub не выполнялись.

Проверки прошли:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File test-results/deploy-script-smoke.ps1`: настоящая проверка пути, mock-команды Git, резервный путь, кириллица/пробелы/скобки, остановка при ошибках add/commit/push и запрет другой ветки.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File test-results/deploy-commit-integration.ps1`: настоящий Git в изолированной папке с кириллицей, пробелами и скобками; commit и push в локальный bare-репозиторий, восстановление исходной папки. Тестовые репозитории удалены.
- `python test-results/deploy-shell-smoke.py`: успешный запуск и ошибки конфигурации Compose, pipeline, frontend build, backend и Caddy. Внешние команды подменены; при ошибках сохраняется ненулевой статус и отсутствует сообщение об успехе.
- Workflow разобран установленным `backend/node_modules/js-yaml`; проверены триггер main и deploy job. `bash -n` прошел для deploy.sh, SSH-скрипта и скрипта Summary, извлеченных из YAML.
- Backend: typecheck, lint, build, npm test — код 0; 485 тестов прошли, 17 пропущены. Линтер выдал 3 предупреждения в существующих тестах, ошибок нет.
- Frontend: typecheck, lint, build, npm test — код 0; 142 теста прошли.
- Playwright mock: `npm run test:e2e:mock -- --grep 'trainer read-only veterinary'` — 1 тест прошел.
- `git diff --check` — без ошибок.

Создание серверного `docs/deploy_history.log`, SSH-доступ и поведение GitHub Actions в реальном запуске проверяются при следующем боевом деплое.
