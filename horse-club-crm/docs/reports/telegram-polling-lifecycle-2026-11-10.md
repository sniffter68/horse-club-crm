# Telegram polling lifecycle — 2026-11-10

Implemented explicit, cancellable webhook deletion (10 seconds) before polling,
cancellable getMe initialization (30 seconds), grammY client timeout (30 seconds),
and getUpdates long-poll timeout (20 seconds). All handlers are installed before
startup; message/callback_query update types are explicitly enabled. Username
binding calls next; private-chat filtering remains a separate middleware.

Nest initialization returns immediately. Shutdown cancels preparation, prevents
late startup and awaits bot.stop() when running. Docker allows 40 seconds for
shutdown, including grammY's final offset confirmation request. The existing
module registration, environment forwarding and Nest shutdown hooks are sufficient.

Logs include configuration presence/length, lifecycle stages, update ID/type,
error stacks, Telegram API codes and nested network causes. Raw and URL-encoded
bot tokens are redacted. Update bodies are not logged. abort-controller 3.0.0,
already installed through grammY, is declared directly for compatible signal types.

## Verification

- backend: typecheck/build passed; lint has no errors and three existing warnings
  in audit-http-20261019.cjs, vet-records.test.cjs and dashboard.test.cjs.
- backend full npm test: 755 passed, 20 skipped, no failures. An additional global
  error-handler regression was then added; all 7 lifecycle tests passed separately.
- frontend: typecheck/lint/build passed; 165 unit tests passed.
- Playwright mock Telegram linking: 8 passed, including narrow layouts and READ_ONLY.
- Existing real grammY dispatch tests cover /start, /balance, /schedule,
  /schedule tomorrow and all requested callback menu routes.
- A local HTTP proxy test verifies TELEGRAM_API_ROOT, webhook deletion and getMe
  ordering without blocking Nest startup. No real Telegram credentials were used.

No Prisma schema changes or migrations. No VDS deployment or live Telegram
verification was performed. A single backend replica should poll this token.
Pending updates are intentionally discarded on startup as requested.

On the VDS, after delivering these files and the existing build prerequisites:

```bash
cd /opt/horse-club-crm/horse-club-crm
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate backend
docker compose -f docker-compose.prod.yml logs --since=5m -f backend
```

Look for `Telegram bot polling started successfully`, then check the bot commands
and menu buttons in a private chat. The grammY onStart callback marks completed
initialization, rather than successful handling of the first real update.
