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

clickhouse-client --host "$host" --user "$user" --password "$password" --query "CREATE TABLE IF NOT EXISTS jerico.retention_policy (policy_name LowCardinality(String), log_days UInt16, event_days UInt16, applied_at DateTime64(3, 'UTC')) ENGINE = ReplacingMergeTree(applied_at) ORDER BY policy_name"
current_policy="$(clickhouse-client --host "$host" --user "$user" --password "$password" --query "SELECT concat(toString(log_days), char(9), toString(event_days)) FROM jerico.retention_policy WHERE policy_name = 'telemetry_events' ORDER BY applied_at DESC LIMIT 1 FORMAT TSVRaw")"
expected_policy="$(printf '%s\t%s' "$log_days" "$event_days")"
if [ "$current_policy" = "$expected_policy" ]; then
  echo "ClickHouse telemetry retention policy is already current (logs=$log_days days, events=$event_days days)."
  exit 0
fi

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
clickhouse-client --host "$host" --user "$user" --password "$password" --query "INSERT INTO jerico.retention_policy (policy_name, log_days, event_days, applied_at) VALUES ('telemetry_events', $log_days, $event_days, now64(3))"
echo "Applied ClickHouse telemetry retention policy (logs=$log_days days, other events=$event_days days)."
