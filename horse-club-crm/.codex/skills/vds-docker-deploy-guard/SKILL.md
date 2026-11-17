---
name: vds-docker-deploy-guard
description: Правила сборки статики, настройки Caddy и деплоя Horse Club CRM на продакшен-сервер vds18772.
---
# Правила сборки и деплоя на vds18772
- Статика фронтенда собирается в rontend/dist и монтируется в Caddy как /var/www/crm-dist.
- В docker/Caddyfile для index.html всегда сохраняй заголовок Cache-Control "no-cache".
- Перед любым запуском docker compose ... run --rm --build migrate на продакшене обязательно снимай дамп БД через pg_dump в /tmp/.
- Не добавляй новые npm-зависимости без явной необходимости и проверки обеих сборок (ackend и rontend).
