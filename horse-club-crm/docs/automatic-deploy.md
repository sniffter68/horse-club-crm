# Автоматический деплой

При push в `main` workflow `.github/workflows/deploy.yml` подключается к серверу по SSH (порт 22), обновляет `/opt/horse-club-crm/horse-club-crm` и запускает существующий `deploy.sh`. Деплои выполняются последовательно; текущий запуск не отменяется новым push.

В текущем checkout корень Git — `HorseCRM2026`, поэтому workflow расположен в `HorseCRM2026/.github/workflows/deploy.yml`, на уровень выше папки приложения `horse-club-crm`. GitHub читает workflow только из корня Git. Локальный скрипт определяет этот корень автоматически.

В GitHub → Settings → Secrets and variables → Actions добавьте repository secrets:

- `HOST` — адрес боевого сервера.
- `USERNAME` — SSH-пользователь с правами на каталог проекта и Docker.
- `SSH_KEY` — приватный SSH-ключ; соответствующий публичный ключ должен быть в `authorized_keys` пользователя сервера.

Сервер должен иметь доступ к репозиторию для `git pull origin main` и настроенное окружение для `deploy.sh`, включая `.env.production`. Результат деплоя смотрите во вкладке Actions: успешный push означает отправку кода, завершение деплоя подтверждается успешным workflow.

Workflow обновляет сервер через `git pull --ff-only origin main`. Дата (Europe/Moscow), фактический коммит на сервере и результат выполнения выводятся в журнал Actions. При сбое workflow и `deploy.sh` останавливаются с ненулевым кодом и показывают команду и строку ошибки. Итоговый статус и коммит, вызвавший запуск, также доступны в Summary запуска (при накоплении push он может отличаться от коммита, фактически полученного сервером).

После успешного `./deploy.sh` workflow добавляет строку в `/opt/horse-club-crm/horse-club-crm/docs/deploy_history.log`. Файл исключен из Git, сохраняется между деплоями; посмотреть историю можно командой `tail -n 20 docs/deploy_history.log` на сервере. Прямой запуск `deploy.sh` выводит статус в консоль; постоянную историю ведет workflow.

Из PowerShell в корне проекта:

```powershell
.\scripts\deploy-commit.ps1 -Message "Обновить расписание и карту денников"
```

Если локальная политика PowerShell запрещает запуск `.ps1`, можно разрешить выполнение только для отдельного процесса:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-commit.ps1 -Message "Обновить расписание и карту денников"
```

Скрипт работает только в ветке `main`, добавляет все изменения через `git add .`, создаёт коммит и отправляет его в `origin main`. При ошибке любой Git-команды выполнение прекращается, исходная рабочая папка восстанавливается.

`scripts/deploy-commit.ps1` хранится в UTF-8 с BOM для Windows PowerShell 5.1. Скрипт задает UTF-8 для вывода Git и консоли, определяет корень репозитория относительно своей папки и использует `-LiteralPath` для путей с кириллицей, пробелами и квадратными скобками.
