#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/compose.self-hosted.yaml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="${1:-}"

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

if [[ ! "${AGE_IDENTITY+x}" && -f "$ROOT/.env" ]]; then AGE_IDENTITY="$(read_dotenv AGE_IDENTITY)"; fi
if [[ ! "${RCLONE_REMOTE+x}" && -f "$ROOT/.env" ]]; then RCLONE_REMOTE="$(read_dotenv RCLONE_REMOTE)"; fi
if [[ ! "${RCLONE_CONFIG+x}" && -f "$ROOT/.env" ]]; then RCLONE_CONFIG="$(read_dotenv RCLONE_CONFIG)"; fi
RESTORE_FROM_REMOTE="${RESTORE_FROM_REMOTE:-0}"
[[ "$RESTORE_FROM_REMOTE" == "0" || "$RESTORE_FROM_REMOTE" == "1" ]] || { echo "RESTORE_FROM_REMOTE must be 0 or 1." >&2; exit 2; }
[[ "$RESTORE_FROM_REMOTE" != "1" || -n "${RCLONE_REMOTE:-}" ]] || { echo "RESTORE_FROM_REMOTE=1 requires RCLONE_REMOTE." >&2; exit 2; }

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

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  if [[ "$RESTORE_FROM_REMOTE" == "1" || ! -f "$BACKUP_DIR/manifest-$STAMP.json" || ( ! -f "$POSTGRES_FILE" && ! -f "$POSTGRES_FILE.age" ) || ( ! -f "$POSTGRES_FILE.sha256" && ! -f "$POSTGRES_FILE.age.sha256" ) || ( ! -f "$CLICKHOUSE_FILE" && ! -f "$CLICKHOUSE_FILE.age" ) || ( ! -f "$CLICKHOUSE_FILE.sha256" && ! -f "$CLICKHOUSE_FILE.age.sha256" ) ]]; then
    command -v rclone >/dev/null 2>&1 || { echo "RCLONE_REMOTE is set but rclone is not installed." >&2; exit 1; }
    if [[ -n "${RCLONE_CONFIG:-}" ]]; then
      [[ -f "$RCLONE_CONFIG" && ! -L "$RCLONE_CONFIG" ]] || { echo "RCLONE_CONFIG must point to a regular config file." >&2; exit 1; }
      config_mode="$(stat -c "%a" "$RCLONE_CONFIG")"
      [[ "$config_mode" == "600" || "$config_mode" == "400" ]] || { echo "RCLONE_CONFIG must have mode 0600 or 0400." >&2; exit 1; }
      export RCLONE_CONFIG
    fi
    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"
    rclone copy "$RCLONE_REMOTE" "$BACKUP_DIR" \
      --include "manifest-$STAMP.json" \
      --include "postgres-$STAMP.dump*" \
      --include "clickhouse-$STAMP.tar.gz*" \
      --ignore-times
  fi
fi
if [[ -f "$POSTGRES_FILE.age" && -f "$CLICKHOUSE_FILE.age" ]]; then
  POSTGRES_FILE="$POSTGRES_FILE.age"
  CLICKHOUSE_FILE="$CLICKHOUSE_FILE.age"
  if [[ -z "${AGE_IDENTITY:-}" ]]; then
    echo "AGE_IDENTITY must point to the private age identity used for this backup." >&2
    exit 1
  fi
  if ! command -v age >/dev/null 2>&1; then
    echo "The age command is required to decrypt this backup." >&2
    exit 1
  fi
  [[ -f "$AGE_IDENTITY" && ! -L "$AGE_IDENTITY" ]] || { echo "AGE_IDENTITY must be an existing regular private-key file." >&2; exit 1; }
  identity_mode="$(stat -c "%a" "$AGE_IDENTITY")"
  [[ "$identity_mode" == "600" || "$identity_mode" == "400" ]] || { echo "AGE_IDENTITY must have mode 0600 or 0400." >&2; exit 1; }
fi
MANIFEST_FILE="$BACKUP_DIR/manifest-$STAMP.json"
[[ -f "$MANIFEST_FILE" ]] || { echo "Missing backup manifest: $MANIFEST_FILE" >&2; exit 1; }
grep -Fq "\"createdAt\": \"$STAMP\"" "$MANIFEST_FILE" || { echo "Backup manifest timestamp does not match $STAMP." >&2; exit 1; }
grep -Fq '"format": "Jerico self-hosted backup v1"' "$MANIFEST_FILE" || { echo "Unsupported or invalid backup manifest format." >&2; exit 1; }
grep -Fq "\"postgres\": \"$(basename "$POSTGRES_FILE")\"" "$MANIFEST_FILE" || { echo "PostgreSQL archive does not match the backup manifest." >&2; exit 1; }
grep -Fq "\"clickhouse\": \"$(basename "$CLICKHOUSE_FILE")\"" "$MANIFEST_FILE" || { echo "ClickHouse archive does not match the backup manifest." >&2; exit 1; }
if [[ "$POSTGRES_FILE" == *.age ]]; then
  grep -Fq '"encryption": "age"' "$MANIFEST_FILE" || { echo "Encrypted artifacts do not match the backup manifest." >&2; exit 1; }
else
  grep -Fq '"encryption": "none"' "$MANIFEST_FILE" || { echo "Plaintext artifacts do not match the backup manifest." >&2; exit 1; }
fi

for file in "$POSTGRES_FILE" "$CLICKHOUSE_FILE" "$POSTGRES_FILE.sha256" "$CLICKHOUSE_FILE.sha256"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing backup artifact: $file" >&2
    exit 1
  fi
done
(
  cd "$BACKUP_DIR"
  sha256sum -c "$(basename "$POSTGRES_FILE").sha256"
  sha256sum -c "$(basename "$CLICKHOUSE_FILE").sha256"
)

RESTORE_TMP=""
if [[ "$POSTGRES_FILE" == *.age ]]; then
  RESTORE_TMP="$(mktemp -d)"
  chmod 700 "$RESTORE_TMP"
  trap 'rm -rf "$RESTORE_TMP"' EXIT
  age --decrypt --identity "$AGE_IDENTITY" --output "$RESTORE_TMP/postgres.dump" "$POSTGRES_FILE"
  age --decrypt --identity "$AGE_IDENTITY" --output "$RESTORE_TMP/clickhouse.tar.gz" "$CLICKHOUSE_FILE"
  POSTGRES_FILE="$RESTORE_TMP/postgres.dump"
  CLICKHOUSE_FILE="$RESTORE_TMP/clickhouse.tar.gz"
fi

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
