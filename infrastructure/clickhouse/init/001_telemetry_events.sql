CREATE DATABASE IF NOT EXISTS jerico;

CREATE TABLE IF NOT EXISTS jerico.telemetry_events
(
  timestamp DateTime64(3, 'UTC'),
  accepted_at DateTime64(3, 'UTC'),
  organization_id String,
  project_id String,
  environment_id String,
  credential_id String,
  request_id String,
  event_type LowCardinality(String),
  name String,
  message String,
  value Nullable(Float64),
  attributes String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (organization_id, project_id, environment_id, timestamp, event_type)
TTL timestamp + INTERVAL 90 DAY DELETE;
