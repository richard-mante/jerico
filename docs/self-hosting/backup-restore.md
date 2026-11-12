# Self-hosted backup and restore

The scripts back up both transactional PostgreSQL data and ClickHouse telemetry. They briefly stop the API, ingestion service, and queue workers so the two snapshots represent a consistent application point in time. The web dashboard remains available during backup but API requests will be unavailable briefly.

## Backup

Ensure the Compose stack is running and the host has enough free disk space. Run:

```sh
bash scripts/self-hosted/backup.sh
```

Artifacts are written to the repository-root `backups/` directory by default:

- `postgres-<timestamp>.dump`: PostgreSQL custom-format dump.
- `clickhouse-<timestamp>.tar.gz`: ClickHouse native database backup archive.
- SHA-256 checksum files for both archives.
- A JSON manifest with timestamp and restore command.

You can choose another directory with `BACKUP_DIR=/secure/path`. Files are created with restrictive permissions. Backups contain credentials, configuration, and customer telemetry: encrypt them before off-site transfer, restrict access, and apply your own retention policy.

The ClickHouse server is configured with a local backup disk at `/var/lib/clickhouse/backups`. The backup archive is also copied to the host backup directory, so the host artifact remains available independently of the container volume.

## Restore

Restore is destructive: it replaces the current PostgreSQL and ClickHouse databases. First verify the backup files and checksums, then stop any external writers. Run:

```sh
CONFIRM_DESTRUCTIVE_RESTORE=YES bash scripts/self-hosted/restore.sh 20261112T210000Z
```

Replace the timestamp with the exact backup timestamp. The script:

1. Verifies the PostgreSQL and ClickHouse archive checksums.
2. Stops web/API/ingest/worker/proxy services.
3. Recreates the PostgreSQL database and restores its custom-format dump.
4. Restores the ClickHouse database from its native backup.
5. Applies migrations that may have been added after the backup.
6. Starts the API, ingestion, workers, dashboard, and Caddy.

The restore script intentionally requires `CONFIRM_DESTRUCTIVE_RESTORE=YES`. Keep a separate copy of the backup outside the host before starting a restore.

## Recovery limitations

- A backup is only as good as its off-site copy and restore drill. Schedule regular restore exercises on a separate host.
- These scripts do not encrypt backups. Use encrypted disks or encrypt archives before uploading to object storage.
- The scripts do not automatically prune old backups; configure an explicit retention policy for the backup directory.
- A full disaster recovery plan should also preserve the `.env` secrets and Caddy's `jerico-caddy-data` volume (ACME certificates/state). Store secrets separately and securely.
- Docker, ClickHouse backup/restore, PostgreSQL restore, and full application recovery have not yet been executed in this repository environment. Treat the scripts as an implementation, not a verified recovery guarantee.
