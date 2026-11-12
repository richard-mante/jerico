#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/compose.self-hosted.yaml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="${BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ ! "$STAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "BACKUP_TIMESTAMP must use YYYYMMDDTHHMMSSZ." >&2
  exit 2
fi

umask 077
if [[ -n "${AGE_RECIPIENT:-}" ]] && ! command -v age >/dev/null 2>&1; then
  echo "AGE_RECIPIENT is set but the age command is not installed." >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
compose=(docker compose -f "$COMPOSE_FILE")
restarting=0

restart_services() {
  if [[ "$restarting" == "1" ]]; then
    "${compose[@]}" start api ingest queue-worker >/dev/null
  fi
}
trap restart_services EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Pause all writers so PostgreSQL and ClickHouse snapshots represent one
# application-consistent point in time. stop_grace_period lets queue workers
# finish in-flight jobs and release leases cleanly.
restarting=1
"${compose[@]}" stop api ingest queue-worker

POSTGRES_FILE="postgres-$STAMP.dump"
CLICKHOUSE_FILE="clickhouse-$STAMP.tar.gz"

"${compose[@]}" exec -T postgres pg_dump -U jerico -d jerico -Fc > "$BACKUP_DIR/$POSTGRES_FILE"

"${compose[@]}" exec -T clickhouse sh -c 'mkdir -p /var/lib/clickhouse/backups && chown clickhouse:clickhouse /var/lib/clickhouse/backups'

"${compose[@]}" exec -T clickhouse sh -c \
  'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --query "$1"' \
  sh "BACKUP DATABASE jerico TO Disk('backups', '$STAMP')"

"${compose[@]}" exec -T clickhouse tar -C /var/lib/clickhouse/backups -czf - "$STAMP" \
  > "$BACKUP_DIR/$CLICKHOUSE_FILE"

ENCRYPTION="none"
if [[ -n "${AGE_RECIPIENT:-}" ]]; then
  age --recipient "$AGE_RECIPIENT" --output "$BACKUP_DIR/$POSTGRES_FILE.age" "$BACKUP_DIR/$POSTGRES_FILE"
  age --recipient "$AGE_RECIPIENT" --output "$BACKUP_DIR/$CLICKHOUSE_FILE.age" "$BACKUP_DIR/$CLICKHOUSE_FILE"
  rm -f "$BACKUP_DIR/$POSTGRES_FILE" "$BACKUP_DIR/$CLICKHOUSE_FILE"
  POSTGRES_FILE="$POSTGRES_FILE.age"
  CLICKHOUSE_FILE="$CLICKHOUSE_FILE.age"
  ENCRYPTION="age"
fi

(
  cd "$BACKUP_DIR"
  sha256sum "$POSTGRES_FILE" > "$POSTGRES_FILE.sha256"
  sha256sum "$CLICKHOUSE_FILE" > "$CLICKHOUSE_FILE.sha256"
)

cat > "$BACKUP_DIR/manifest-$STAMP.json" <<EOF
{
  "createdAt": "$STAMP",
  "postgres": "$POSTGRES_FILE",
  "clickhouse": "$CLICKHOUSE_FILE",
  "format": "Jerico self-hosted backup v1",
  "encryption": "${ENCRYPTION}",
  "restoreCommand": "bash scripts/self-hosted/restore.sh $STAMP"
}
EOF
chmod 600 "$BACKUP_DIR/$POSTGRES_FILE" "$BACKUP_DIR/$CLICKHOUSE_FILE" \
  "$BACKUP_DIR/$POSTGRES_FILE.sha256" "$BACKUP_DIR/$CLICKHOUSE_FILE.sha256" \
  "$BACKUP_DIR/manifest-$STAMP.json"

echo "Backup completed: $BACKUP_DIR/manifest-$STAMP.json"
