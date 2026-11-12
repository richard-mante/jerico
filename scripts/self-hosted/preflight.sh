#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/compose.self-hosted.yaml}"
SKIP_DNS=0

for argument in "$@"; do
  case "$argument" in
    --skip-dns) SKIP_DNS=1 ;;
    *) echo "Unknown option: $argument" >&2; exit 2 ;;
  esac
done

fail() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }
info() { echo "OK: $*"; }

for command_name in docker getent awk df ss grep getconf stat; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command '$command_name' is not installed."
done

docker info >/dev/null 2>&1 || fail "Docker daemon is not reachable for the current user."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 plugin is required."
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE. Run scripts/self-hosted/init-env.sh first."
[[ ! -L "$ENV_FILE" ]] || fail ".env must be a regular file, not a symbolic link."
[[ -f "$COMPOSE_FILE" ]] || fail "Compose file not found: $COMPOSE_FILE"

chmod 600 "$ENV_FILE"
info "Docker Engine, Compose v2, environment file, and Compose file are available."

read_env() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

require_single_value() {
  local key="$1"
  local count
  count="$(grep -cE "^${key}=" "$ENV_FILE" || true)"
  [[ "$count" == "1" ]] || fail "$key must appear exactly once in .env."
}

require_secret() {
  local key="$1"
  require_single_value "$key"
  local minimum="$2"
  local value
  value="$(read_env "$key")"
  [[ -n "$value" ]] || fail "$key is missing from .env."
  [[ "$value" != *replace-with* ]] || fail "$key still contains an example placeholder."
  [[ "$value" != *'$('* && "$value" != *'${'* ]] || fail "$key must be a literal value, not shell interpolation."
  (( ${#value} >= minimum )) || fail "$key must contain at least $minimum characters."
}

require_value() {
  local key="$1"
  require_single_value "$key"
  local value
  value="$(read_env "$key")"
  [[ -n "$value" ]] || fail "$key is missing from .env."
  [[ "$value" != *replace-with* ]] || fail "$key still contains an example placeholder."
}

for key in POSTGRES_PASSWORD CLICKHOUSE_PASSWORD QUEUE_ADMIN_TOKEN BETTER_AUTH_SECRET UPTIME_RESULTS_SECRET NOTIFICATION_DELIVERY_SECRET; do
  require_secret "$key" 32
done
require_secret WEBHOOK_ENCRYPTION_KEY 43
webhook_key="$(read_env WEBHOOK_ENCRYPTION_KEY)"
[[ "$webhook_key" =~ ^[A-Za-z0-9_-]{43}$ ]] || fail "WEBHOOK_ENCRYPTION_KEY must be an unpadded base64url encoding of exactly 32 bytes."
for key in POSTGRES_PASSWORD CLICKHOUSE_PASSWORD; do
  value="$(read_env "$key")"
  [[ "$value" =~ ^[A-Za-z0-9]{32,}$ ]] || fail "$key must use at least 32 URL-safe alphanumeric characters for the Compose DATABASE_URL."
done
for retention_key in CLICKHOUSE_LOG_RETENTION_DAYS CLICKHOUSE_EVENT_RETENTION_DAYS; do
  retention_value="$(read_env "$retention_key")"
  if [[ -n "$retention_value" ]]; then
    require_single_value "$retention_key"
    [[ "$retention_value" =~ ^[0-9]+$ ]] && (( retention_value <= 3650 )) || fail "$retention_key must be an integer between 0 and 3650."
  fi
done

queue_retention_days="$(read_env QUEUE_RETENTION_DAYS)"
if [[ -n "$queue_retention_days" ]]; then
  require_single_value QUEUE_RETENTION_DAYS
  [[ "$queue_retention_days" =~ ^[0-9]+$ ]] && (( queue_retention_days >= 1 && queue_retention_days <= 365 )) || fail "QUEUE_RETENTION_DAYS must be an integer between 1 and 365."
fi

for key in APP_DOMAIN API_DOMAIN INGEST_DOMAIN ACME_EMAIL; do
  require_value "$key"
done

if [[ -n "$(read_env AGE_RECIPIENT)" ]]; then
  require_single_value AGE_RECIPIENT
  if ! command -v age >/dev/null 2>&1; then
    fail "AGE_RECIPIENT is configured, but age is not installed on this host."
  fi
  identity_path="$(read_env AGE_IDENTITY)"
  if [[ -n "$identity_path" ]]; then
    require_single_value AGE_IDENTITY
    [[ -f "$identity_path" && ! -L "$identity_path" ]] || fail "AGE_IDENTITY must point to an existing regular private-key file."
    identity_mode="$(stat -c "%a" "$identity_path")"
    [[ "$identity_mode" == "600" || "$identity_mode" == "400" ]] || fail "AGE_IDENTITY must have mode 0600 or 0400."
  fi
fi

for optional_key in AGE_RECIPIENT AGE_IDENTITY BACKUP_RETENTION_DAYS RCLONE_REMOTE RCLONE_CONFIG; do
  optional_count="$(grep -cE "^${optional_key}=" "$ENV_FILE" || true)"
  (( optional_count <= 1 )) || fail "$optional_key must appear no more than once in .env."
done

remote_target="$(read_env RCLONE_REMOTE)"
if [[ -n "$remote_target" ]]; then
  require_single_value RCLONE_REMOTE
  [[ -n "$(read_env AGE_RECIPIENT)" ]] || fail "RCLONE_REMOTE requires AGE_RECIPIENT so off-site archives are encrypted."
  command -v rclone >/dev/null 2>&1 || fail "RCLONE_REMOTE is configured, but rclone is not installed."
  config_path="$(read_env RCLONE_CONFIG)"
  if [[ -n "$config_path" ]]; then
    require_single_value RCLONE_CONFIG
    [[ -f "$config_path" && ! -L "$config_path" ]] || fail "RCLONE_CONFIG must point to an existing regular config file."
    config_mode="$(stat -c "%a" "$config_path")"
    [[ "$config_mode" == "600" || "$config_mode" == "400" ]] || fail "RCLONE_CONFIG must have mode 0600 or 0400."
  fi
fi

docker compose -f "$COMPOSE_FILE" config --quiet || fail "Compose configuration is invalid or required environment values are missing."
info "Required secrets and Compose configuration are valid."
if [[ -z "$(read_env AGE_RECIPIENT)" ]]; then
  warn "AGE_RECIPIENT is not configured; generated backups will be plaintext."
fi

if [[ "$SKIP_DNS" -eq 0 ]]; then
  for key in APP_DOMAIN API_DOMAIN INGEST_DOMAIN; do
    domain="$(read_env "$key")"
    getent ahosts "$domain" >/dev/null 2>&1 || fail "$domain does not currently resolve. Configure DNS or rerun with --skip-dns before DNS propagation completes."
  done
  info "All three public domains resolve from this host."
else
  warn "DNS checks were skipped; Caddy cannot obtain certificates until all domains resolve to this host."
fi

for port in 80 443; do
  if ss -ltnH "sport = :$port" | grep -q .; then
    warn "TCP port $port already has a listener. Stop the conflicting service before starting Caddy."
  else
    info "TCP port $port is available."
  fi
done

cpu_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 0)"
memory_gib="$(awk '/MemTotal:/ { printf "%d", $2 / 1024 / 1024 }' /proc/meminfo)"
disk_gib="$(df -Pk "$ROOT" | awk 'END { printf "%d", $4 / 1024 / 1024 }')"

if (( cpu_count < 4 )); then warn "Detected $cpu_count CPU cores; 4 or more are recommended for a production-sized deployment."; else info "Detected $cpu_count CPU cores."; fi
if (( memory_gib < 8 )); then warn "Detected approximately ${memory_gib} GiB RAM; 8 GiB or more is recommended."; else info "Detected approximately ${memory_gib} GiB RAM."; fi
if (( disk_gib < 50 )); then warn "Detected approximately ${disk_gib} GiB free on the repository filesystem; reserve at least 50 GiB for initial database and backup growth."; else info "Detected approximately ${disk_gib} GiB free on the repository filesystem."; fi

echo
echo "Preflight completed. Warnings should be resolved or explicitly accepted before production use."
echo "Start with: docker compose -f compose.self-hosted.yaml up --build -d"
