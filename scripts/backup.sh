#!/usr/bin/env bash
set -euo pipefail
# Full PostgreSQL backup; run from project root. Never overwrite an older dump.
mkdir -p backups
chmod 700 backups
backup_path="backups/amora-$(date -u +%Y%m%d-%H%M%S).dump"
(umask 077; docker compose exec -T db pg_dump -U amora -d amora -Fc > "$backup_path")
test -s "$backup_path"
printf 'Đã tạo %s\n' "$backup_path"
