#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-.env.production}
compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
mkdir -p backups
exec 9>backups/.backup.lock
flock -n 9 || { echo 'A backup is already running' >&2; exit 1; }
target="backups/backup_$(date -u +%Y-%m-%d_%H-%M-%S).dump"
partial="$target.partial"
trap 'rm -f -- "$partial"' EXIT
"${compose[@]}" exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -b -v' > "$partial"
test -s "$partial"
"${compose[@]}" exec -T postgres pg_restore --list < "$partial" > /dev/null
mv -- "$partial" "$target"
find backups -maxdepth 1 -type f -name 'backup_????-??-??_??-??-??.dump' -mmin +20160 -delete
echo "Backup created: $ROOT/$target"
