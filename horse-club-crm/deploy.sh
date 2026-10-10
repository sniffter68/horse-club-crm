#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
ENV_FILE="${ENV_FILE:-.env.production}"
compose=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

echo "===> 1. Checking production configuration..."
"${compose[@]}" config --quiet

echo "===> 2. Building frontend dist..."
npm --prefix frontend ci
npm --prefix frontend run build

echo "===> 2.1. Building landing dist..."
npm --prefix landing ci
npm --prefix landing run build

echo "===> 3. Building backend, applying migrations and waiting for health..."
"${compose[@]}" up -d --build --wait backend

echo "===> 4. Recreating Caddy with current frontend and landing dist..."
"${compose[@]}" up -d --force-recreate caddy
echo "===> Deployment complete."
