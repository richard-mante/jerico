#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/compose.self-hosted.yaml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="${BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

[[ ! -L "$ROOT/.env" ]] || { echo ".env must not be a symbolic link." >&2; exit 1; }

read_dotenv() {
  local key="$1"
  local value=""
  if [[ -f "$ROOT/.env" ]]; then
    value="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ROOT/.env")"
  fi
  if [[ "$value" == \"*\" ]]; then value="${value:1:-1}"; fi
  if [[ "$value" == \'*\' ]]; then value="${value:1:-1}"; fi
  printf '%s' "$value"
}

if [[ ! "${AGE_RECIPIENT+x}" && -f "$ROOT/.env" ]]; then AGE_RECIPIENT="$(read_dotenv AGE_RECIPIENT)"; fi
if [[ ! "${BACKUP_RETENTION_DAYS+x}" && -f "$ROOT/.env" ]]; then BACKUP_RETENTION_DAYS="$(read_dotenv BACKUP_RETENTION_DAYS)"; fi
if [[ ! "${RCLONE_REMOTE+x}" && -f "$ROOT/.env" ]]; then RCLONE_REMOTE="$(read_dotenv RCLONE_REMOTE)"; fi
if [[ ! "${RCLONE_CONFIG+x}" && -f "$ROOT/.env" ]]; then RCLONE_CONFIG="$(read_dotenv RCLONE_CONFIG)"; fi
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-0}"
if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS > 3650 )); then
  echo "BACKUP_RETENTION_DAYS must be 0 (disabled) or an integer from 1 to 3650." >&2
  exit 2
fi

if [[ ! "$STAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "BACKUP_TIMESTAMP must use YYYYMMDDTHHMMSSZ." >&2
  exit 2
fi

umask 077
if [[ -n "${AGE_RECIPIENT:-}" ]] && ! command -v age >/dev/null 2>&1; then
  echo "AGE_RECIPIENT is set but the age command is not installed." >&2
  exit 1
fi
if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  [[ -n "${AGE_RECIPIENT:-}" ]] || { echo "Off-site backups require AGE_RECIPIENT so remote archives are encrypted." >&2; exit 1; }
  command -v rclone >/dev/null 2>&1 || { echo "RCLONE_REMOTE is set but rclone is not installed." >&2; exit 1; }
  if [[ -n "${RCLONE_CONFIG:-}" ]]; then
    [[ -f "$RCLONE_CONFIG" && ! -L "$RCLONE_CONFIG" ]] || { echo "RCLONE_CONFIG must point to a regular config file." >&2; exit 1; }
    config_mode="$(stat -c "%a" "$RCLONE_CONFIG")"
    [[ "$config_mode" == "600" || "$config_mode" == "400" ]] || { echo "RCLONE_CONFIG must have mode 0600 or 0400." >&2; exit 1; }
    export RCLONE_CONFIG
  fi
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

if (( RETENTION_DAYS > 0 )); then
  while IFS= read -r -d '' manifest; do
    name="$(basename "$manifest")"
    old_stamp="${name#manifest-}"
    old_stamp="${old_stamp%.json}"
    if [[ "$old_stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
      rm -f -- \
        "$BACKUP_DIR/manifest-$old_stamp.json" \
        "$BACKUP_DIR/postgres-$old_stamp.dump" \
        "$BACKUP_DIR/postgres-$old_stamp.dump.sha256" \
        "$BACKUP_DIR/postgres-$old_stamp.dump.age" \
        "$BACKUP_DIR/postgres-$old_stamp.dump.age.sha256" \
        "$BACKUP_DIR/clickhouse-$old_stamp.tar.gz" \
        "$BACKUP_DIR/clickhouse-$old_stamp.tar.gz.sha256" \
        "$BACKUP_DIR/clickhouse-$old_stamp.tar.gz.age" \
        "$BACKUP_DIR/clickhouse-$old_stamp.tar.gz.age.sha256"
    fi
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'manifest-????????T??????Z.json' -mtime "+$RETENTION_DAYS" -print0)
fi

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  remote_files=("$POSTGRES_FILE" "$POSTGRES_FILE.sha256" "$CLICKHOUSE_FILE" "$CLICKHOUSE_FILE.sha256" "manifest-$STAMP.json")
  for file in "${remote_files[@]}"; do
    rclone copyto --immutable "$BACKUP_DIR/$file" "$RCLONE_REMOTE/$file"
  done
  rclone check "$BACKUP_DIR" "$RCLONE_REMOTE" --one-way --download \
    --include "manifest-$STAMP.json" \
    --include "$POSTGRES_FILE" --include "$POSTGRES_FILE.sha256" \
    --include "$CLICKHOUSE_FILE" --include "$CLICKHOUSE_FILE.sha256"
  echo "Encrypted off-site backup verified at $RCLONE_REMOTE."
fi

echo "Backup completed: $BACKUP_DIR/manifest-$STAMP.json"
