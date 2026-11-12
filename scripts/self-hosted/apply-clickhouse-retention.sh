#!/usr/bin/env sh
set -eu

host="${CLICKHOUSE_HOST:-clickhouse}"
user="${CLICKHOUSE_USER:-default}"
password="${CLICKHOUSE_PASSWORD:?CLICKHOUSE_PASSWORD is required}"
log_days="${CLICKHOUSE_LOG_RETENTION_DAYS:-7}"
event_days="${CLICKHOUSE_EVENT_RETENTION_DAYS:-30}"

validate_days() {
  name="$1"
  value="$2"
  case "$value" in
    ''|*[!0-9]*) echo "$name must be an integer from 0 to 3650." >&2; exit 2 ;;
  esac
  [ "$value" -le 3650 ] || { echo "$name must be between 0 and 3650." >&2; exit 2; }
}

validate_days CLICKHOUSE_LOG_RETENTION_DAYS "$log_days"
validate_days CLICKHOUSE_EVENT_RETENTION_DAYS "$event_days"

attempt=0
until [ "$(clickhouse-client --host "$host" --user "$user" --password "$password" --query "EXISTS TABLE jerico.telemetry_events" 2>/dev/null || true)" = "1" ]; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || { echo "Timed out waiting for jerico.telemetry_events to be initialized." >&2; exit 1; }
  sleep 2
done

if [ "$log_days" -eq 0 ] && [ "$event_days" -eq 0 ]; then
  query="ALTER TABLE jerico.telemetry_events REMOVE TTL"
elif [ "$log_days" -gt 0 ] && [ "$event_days" -gt 0 ]; then
  query="ALTER TABLE jerico.telemetry_events MODIFY TTL timestamp + INTERVAL $log_days DAY DELETE WHERE event_type = 'log', timestamp + INTERVAL $event_days DAY DELETE WHERE event_type != 'log'"
elif [ "$log_days" -gt 0 ]; then
  query="ALTER TABLE jerico.telemetry_events MODIFY TTL timestamp + INTERVAL $log_days DAY DELETE WHERE event_type = 'log'"
else
  query="ALTER TABLE jerico.telemetry_events MODIFY TTL timestamp + INTERVAL $event_days DAY DELETE WHERE event_type != 'log'"
fi

clickhouse-client --host "$host" --user "$user" --password "$password" --query "$query"
echo "Applied ClickHouse telemetry retention policy (logs=$log_days days, other events=$event_days days)."
