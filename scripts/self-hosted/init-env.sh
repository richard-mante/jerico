#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env"
EXAMPLE_FILE="$ROOT/infrastructure/self-hosted/.env.example"
WITH_AGE=0

for argument in "$@"; do
  case "$argument" in
    --with-age-backups) WITH_AGE=1 ;;
    *) echo "Unknown option: $argument" >&2; exit 2 ;;
  esac
done

command -v openssl >/dev/null 2>&1 || { echo "openssl is required to generate secrets." >&2; exit 1; }
[[ -f "$EXAMPLE_FILE" ]] || { echo "Missing environment template: $EXAMPLE_FILE" >&2; exit 1; }
[[ ! -e "$ENV_FILE" ]] || { echo "$ENV_FILE already exists; refusing to overwrite it." >&2; exit 1; }

if [[ "$WITH_AGE" -eq 1 ]]; then
  command -v age >/dev/null 2>&1 || { echo "age is required for encrypted backups." >&2; exit 1; }
  command -v age-keygen >/dev/null 2>&1 || { echo "age-keygen is required for encrypted backups." >&2; exit 1; }
fi

umask 077
cp "$EXAMPLE_FILE" "$ENV_FILE"
chmod 600 "$ENV_FILE"

set_value() {
  local key="$1"
  local value="$2"
  sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
}

set_value POSTGRES_PASSWORD "$(openssl rand -hex 32)"
set_value CLICKHOUSE_PASSWORD "$(openssl rand -hex 32)"
set_value QUEUE_ADMIN_TOKEN "$(openssl rand -hex 32)"
set_value BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
set_value UPTIME_RESULTS_SECRET "$(openssl rand -hex 32)"
set_value NOTIFICATION_DELIVERY_SECRET "$(openssl rand -hex 32)"
set_value WEBHOOK_ENCRYPTION_KEY "$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"

if [[ "$WITH_AGE" -eq 1 ]]; then
  identity_dir="${XDG_CONFIG_HOME:-$HOME/.config}/jerico"
  identity_file="$identity_dir/backup-identity.txt"
  [[ ! -e "$identity_file" ]] || { rm -f "$ENV_FILE"; echo "Refusing to overwrite existing age identity: $identity_file" >&2; exit 1; }
  mkdir -p "$identity_dir"
  chmod 700 "$identity_dir"
  age-keygen -o "$identity_file" >/dev/null
  chmod 600 "$identity_file"
  recipient="$(awk '/^# public key:/ { print $4; exit }' "$identity_file")"
  [[ "$recipient" =~ ^age1[0-9a-z]+$ ]] || { rm -f "$identity_file" "$ENV_FILE"; echo "Could not read the generated age recipient." >&2; exit 1; }
  set_value AGE_RECIPIENT "$recipient"
  set_value AGE_IDENTITY "$identity_file"
fi

echo "Created $ENV_FILE with unique generated secrets (permissions 600)."
if [[ "$WITH_AGE" -eq 1 ]]; then
  echo "Age backup encryption is enabled. Keep $identity_file outside this server and preserve a secure off-host copy."
fi
echo "Edit APP_DOMAIN, API_DOMAIN, INGEST_DOMAIN, and ACME_EMAIL before running:"
echo "  bash scripts/self-hosted/preflight.sh"
