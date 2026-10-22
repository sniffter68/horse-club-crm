# Автоматический деплой

При push в `main` workflow `.github/workflows/deploy.yml` подключается к серверу по SSH (порт 22), обновляет `/opt/horse-club-crm/horse-club-crm` и запускает существующий `deploy.sh`. Деплои выполняются последовательно; текущий запуск не отменяется новым push.

В текущем checkout корень Git — `HorseCRM2026`, поэтому workflow расположен в `HorseCRM2026/.github/workflows/deploy.yml`, на уровень выше папки приложения `horse-club-crm`. GitHub читает workflow только из корня Git. Локальный скрипт определяет этот корень автоматически.

В GitHub → Settings → Secrets and variables → Actions добавьте repository secrets:

- `HOST` — адрес боевого сервера.
- `USERNAME` — SSH-пользователь с правами на каталог проекта и Docker.
- `SSH_KEY` — приватный SSH-ключ; соответствующий публичный ключ должен быть в `authorized_keys` пользователя сервера.

Сервер должен иметь доступ к репозиторию для `git pull origin main` и настроенное окружение для `deploy.sh`, включая `.env.production`. Результат деплоя смотрите во вкладке Actions: успешный push означает отправку кода, завершение деплоя подтверждается успешным workflow.

Из PowerShell в корне проекта:

```powershell
.\scripts\deploy-commit.ps1 -Message "Обновить расписание и карту денников"
```

Если локальная политика PowerShell запрещает запуск `.ps1`, можно разрешить выполнение только для отдельного процесса:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-commit.ps1 -Message "Обновить расписание и карту денников"
```

Скрипт работает только в ветке `main`, добавляет все изменения через `git add .`, создаёт коммит и отправляет его в `origin main`. При ошибке любой Git-команды выполнение прекращается, исходная рабочая папка восстанавливается.
