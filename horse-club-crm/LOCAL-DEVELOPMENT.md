# Локальный запуск

PostgreSQL 17 работает в контейнере `hcos_postgres`. Порт хоста — **5433**: 5432 занят локальным PostgreSQL 18. Контейнер использует отдельный том `pg_data`; локальная служба PostgreSQL не останавливалась.

```powershell
docker compose up -d postgres
cd backend
npx.cmd prisma db push
npx.cmd prisma db seed
npm.cmd run start:dev
```

`backend/.env` должен содержать DATABASE_URL для `127.0.0.1:5433/horse_club_db`, PORT=3000, CLUB_TIME_ZONE=Europe/Moscow и криптографически случайный JWT_SECRET не короче 32 байт. Файл исключён из Git. Текущий `.env` уже настроен.

Если Docker ещё не попал в PATH, его исполняемый файл в этой установке:

```powershell
& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" compose up -d postgres
```

В отдельном терминале из `frontend`:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Фронтенд: http://localhost:5173. API: http://localhost:3000/api. Учётная запись сида: `admin@test.ru` / `admin123`. Повторный сид обновляет пароль и роль этого тестового пользователя.

При работающих API и Vite:

```powershell
npm.cmd run test:e2e
```

Эта команда запускает только реальные проверки, без моков, в установленном Microsoft Edge. Старые изолированные сценарии запускаются отдельно: `npm.cmd run test:e2e:mock`.

До перехода на Docker при диагностике была создана одноимённая база и роль в локальном PostgreSQL 18. Они сохранены; текущее приложение использует только Docker на 5433.
