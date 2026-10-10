#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
ENV_FILE="${ENV_FILE:-.env.production}"
compose=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

echo "===> 1. Checking production configuration..."
"${compose[@]}" config --quiet
"${compose[@]}" config --format json | node scripts/check-public-leads-config.cjs

echo "===> 2. Building frontend dist..."
npm --prefix frontend ci
npm --prefix frontend run build

echo "===> 2.1. Building landing dist..."
npm --prefix landing ci
npm --prefix landing run build

echo "===> 3. Building backend, applying migrations and waiting for health..."
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
echo "===> Deployment complete."
