#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/compose.self-hosted.yaml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="${1:-}"

if [[ ! "$STAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "Usage: CONFIRM_DESTRUCTIVE_RESTORE=YES bash scripts/self-hosted/restore.sh YYYYMMDDTHHMMSSZ" >&2
  exit 2
fi
if [[ "${CONFIRM_DESTRUCTIVE_RESTORE:-}" != "YES" ]]; then
  echo "Restore replaces the current PostgreSQL and ClickHouse databases." >&2
  echo "Set CONFIRM_DESTRUCTIVE_RESTORE=YES after verifying the backup and recovery plan." >&2
  exit 2
fi

POSTGRES_FILE="$BACKUP_DIR/postgres-$STAMP.dump"
CLICKHOUSE_FILE="$BACKUP_DIR/clickhouse-$STAMP.tar.gz"
for file in "$POSTGRES_FILE" "$CLICKHOUSE_FILE" "$POSTGRES_FILE.sha256" "$CLICKHOUSE_FILE.sha256"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing backup artifact: $file" >&2
    exit 1
  fi
done
(
  cd "$BACKUP_DIR"
  sha256sum -c "postgres-$STAMP.dump.sha256"
  sha256sum -c "clickhouse-$STAMP.tar.gz.sha256"
)

compose=(docker compose -f "$COMPOSE_FILE")

# Keep the application offline while replacing both stores.
"${compose[@]}" stop web api ingest queue-worker caddy
"${compose[@]}" up -d postgres clickhouse

until "${compose[@]}" exec -T postgres pg_isready -U jerico -d postgres >/dev/null 2>&1; do sleep 2; done
until "${compose[@]}" exec -T clickhouse sh -c \
  'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --query "SELECT 1"' >/dev/null 2>&1; do sleep 2; done

"${compose[@]}" exec -T postgres dropdb --if-exists --maintenance-db=postgres -U jerico jerico
"${compose[@]}" exec -T postgres createdb --maintenance-db=postgres -U jerico jerico
"${compose[@]}" exec -T postgres pg_restore -U jerico -d jerico --no-owner --clean --if-exists < "$POSTGRES_FILE"

"${compose[@]}" exec -T clickhouse sh -c 'mkdir -p /var/lib/clickhouse/backups && chown clickhouse:clickhouse /var/lib/clickhouse/backups'
"${compose[@]}" exec -T clickhouse tar -C /var/lib/clickhouse/backups -xzf - < "$CLICKHOUSE_FILE"
"${compose[@]}" exec -T clickhouse sh -c \
  'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --query "$1"' \
  sh "DROP DATABASE IF EXISTS jerico"
"${compose[@]}" exec -T clickhouse sh -c \
  'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --query "$1"' \
  sh "RESTORE DATABASE jerico FROM Disk('backups', '$STAMP')"

# Apply migrations introduced after the backup was created, then bring the
# application services back. The dashboard and Caddy are started last.
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d api ingest queue-worker
"${compose[@]}" up -d web caddy

echo "Restore completed from backup $STAMP."
