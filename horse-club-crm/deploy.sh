#!/usr/bin/env bash
set -Eeuo pipefail

export TZ=Europe/Moscow
trap 'status=$?; printf "Deployment failed: %s - commit %s - %s:%s - command: %s - exit %s\n" "$(date --iso-8601=seconds)" "${deploy_commit:-unknown}" "${BASH_SOURCE[0]}" "$LINENO" "$BASH_COMMAND" "$status" >&2; exit "$status"' ERR

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
deploy_commit=$(git rev-parse --short HEAD)
echo "Deployment started: $(date --iso-8601=seconds) - commit $deploy_commit"
ENV_FILE="${ENV_FILE:-.env.production}"
# Respect COMPOSE_FILE and Compose's default discovery. A database-only host must
# never be switched to a new Compose project (and an empty database volume).
compose=(docker compose)
if [[ -f "$ENV_FILE" ]]; then compose+=(--env-file "$ENV_FILE"); fi
# Preserve an already running full-stack production project.
if [[ -z "${COMPOSE_FILE:-}" && -f "$ENV_FILE" ]] &&
   docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps --status running --services 2>/dev/null | grep -qx backend; then
  compose+=(-f docker-compose.prod.yml)
fi

echo "===> 1. Checking production configuration..."
"${compose[@]}" config --quiet
services=$("${compose[@]}" config --services)
if ! grep -qx postgres <<< "$services"; then
  echo 'Compose must define the postgres service.' >&2
  exit 1
fi
if ! grep -qx backend <<< "$services"; then
  echo 'Database-only Compose detected; deploying application through its host process manager.'
  node scripts/deploy-native.cjs "${compose[@]:1}"
  exit 0
fi
"${compose[@]}" config --format json | node scripts/check-public-leads-config.cjs

echo "===> 2. Building frontend dist..."
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix tma ci
npm --prefix tma run build

echo "===> 2.1. Building landing dist..."
npm --prefix landing ci
"${compose[@]}" config --format json | node scripts/build-landing.cjs

echo "===> 3. Applying migrations in a disposable container..."
"${compose[@]}" up -d --wait postgres
"${compose[@]}" run --rm --build migrate

echo "===> 3.0. Building backend and waiting for health..."
"${compose[@]}" up -d --build --wait backend

echo "===> 3.1. Checking running public lead endpoint (without storing a test application)..."
"${compose[@]}" exec -T backend node <<'NODE'
const { randomUUID } = require('node:crypto');
(async () => {
  if (process.env.PUBLIC_LEADS_ENABLED !== 'true') throw new Error('Running backend has PUBLIC_LEADS_ENABLED != true');
  const response = await fetch('http://127.0.0.1:3000/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ name: 'Deployment probe', phone: '+79991234567', direction: 'Выездка', source: 'landing',
      consentAccepted: true, consentVersion: `probe-${randomUUID()}` }),
  });
  const body = await response.json();
  // A deliberately stale consent reaches the service but cannot create a DB record or VK notification.
  if (response.status !== 400 || body.message !== 'Текст согласия обновился. Обновите страницу и подтвердите актуальную редакцию') {
    throw new Error(`Public lead smoke check failed: HTTP ${response.status}; ${JSON.stringify(body)}`);
  }
  console.log('Running backend accepts the browser DTO and public leads are enabled.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE

echo "===> 4. Recreating Caddy with current frontend and landing dist..."
"${compose[@]}" up -d --force-recreate caddy
echo "===> 5. Checking health, VK schema and authenticated settings endpoint..."
"${compose[@]}" exec -T backend node < scripts/check-deployed-api.cjs
echo "Deployment successful: $(date --iso-8601=seconds) - commit $deploy_commit"
