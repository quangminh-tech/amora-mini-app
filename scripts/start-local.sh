#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then python3 scripts/init-env.py; fi
docker compose config --quiet
docker compose up --build -d
docker compose ps
printf '\nMở http://localhost:3000. Xem BOOTSTRAP_EMAIL và BOOTSTRAP_PASSWORD trong .env.\n'
