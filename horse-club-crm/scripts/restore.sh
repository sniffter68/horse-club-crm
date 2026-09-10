#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 1 ]]; then echo "Usage: $0 /path/to/backup.dump" >&2; exit 2; fi
dump=$(realpath -- "$1")
[[ -f "$dump" && -r "$dump" && -s "$dump" ]] || { echo 'Dump is missing, unreadable or empty' >&2; exit 1; }
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
compose=(docker compose --env-file "${ENV_FILE:-.env.production}" -f "${COMPOSE_FILE:-docker-compose.prod.yml}")
# Validate the archive before any destructive database operation.
"${compose[@]}" exec -T postgres pg_restore --list < "$dump" > /dev/null
if [[ ${RESTORE_CONFIRM:-} != YES ]]; then
  read -r -p 'This replaces data in the configured database. Type RESTORE: ' answer
  [[ "$answer" == RESTORE ]] || exit 1
fi
"${compose[@]}" exec -T postgres sh -c 'exec pg_restore --clean --if-exists --exit-on-error --single-transaction --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$dump"
echo 'Restore completed'
