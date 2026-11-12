# Self-hosted backup and restore

The scripts back up both transactional PostgreSQL data and ClickHouse telemetry. They briefly stop the API, ingestion service, and queue workers so the two snapshots represent a consistent application point in time. The web dashboard remains available during backup but API requests will be unavailable briefly.

## Backup

Ensure the Compose stack is running and the host has enough free disk space. Run:

```sh
bash scripts/self-hosted/backup.sh
```

Artifacts are written to the repository-root `backups/` directory by default:

- `postgres-<timestamp>.dump` and `clickhouse-<timestamp>.tar.gz`: plaintext PostgreSQL and ClickHouse archives when encryption is not configured.
- The same archive names with an additional `.age` suffix when `AGE_RECIPIENT` is configured; only the encrypted artifacts are retained.
- SHA-256 checksum files for both archives.
- A JSON manifest with timestamp and restore command.

You can choose another directory with `BACKUP_DIR=/secure/path`. Files are created with restrictive permissions. For client-side encryption at rest, install [age](https://age-encryption.org/) on the host and set `AGE_RECIPIENT` to the recipient public key before running the backup. The script encrypts both archives before calculating checksums and removes the plaintext copies. Keep the matching private identity outside the server and outside the backup directory. For an encrypted restore, set `AGE_IDENTITY=/secure/path/backup-identity.txt` when running the restore command. If `AGE_RECIPIENT` is unset, backups remain plaintext; protect the backup directory and encrypt before off-site transfer. The scripts read the optional `AGE_RECIPIENT`, `AGE_IDENTITY`, `BACKUP_RETENTION_DAYS`, `RCLONE_REMOTE`, and `RCLONE_CONFIG` values from the root `.env` file without executing/sourcing it; exported shell variables take precedence.

For encrypted off-site copies, configure `RCLONE_REMOTE` to an `rclone` destination such as `r2:bucket/jerico` and install `rclone` on the host. The backup script refuses remote uploads unless `AGE_RECIPIENT` is configured, uploads the encrypted archives/checksums/manifest with immutable destinations, and runs a remote download comparison before reporting success. Keep any `RCLONE_CONFIG` file outside the repository with mode `0600` or `0400`. Restore automatically downloads the selected timestamp from the configured remote when the local manifest, archives, or checksum files are missing. Set `RESTORE_FROM_REMOTE=1` to force-refresh the selected files from the remote even when local copies exist, which is useful when local artifacts are suspected to be corrupted. Configure remote lifecycle/retention rules separately; `BACKUP_RETENTION_DAYS` only prunes local copies.

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
- Encryption is optional and uses age when `AGE_RECIPIENT` is configured. Protect the private identity separately; losing it makes encrypted backups unrecoverable.
- Local backup pruning is opt-in: set `BACKUP_RETENTION_DAYS` in `.env` to a value from 1 to 3650. The default `0` disables deletion. After a successful backup, older manifest-backed artifacts and their checksums are removed. This does not prune off-site copies or orphaned files without a manifest.
- A full disaster recovery plan should also preserve the `.env` secrets and Caddy's `jerico-caddy-data` volume (ACME certificates/state). Store secrets separately and securely.
- Docker, ClickHouse backup/restore, PostgreSQL restore, and full application recovery have not yet been executed in this repository environment. Treat the scripts as an implementation, not a verified recovery guarantee.

## Scheduled backups with systemd

Optional systemd units are provided under `infrastructure/self-hosted/systemd/`. They run the same backup script daily at 02:30 UTC with a randomized delay and persistent catch-up after downtime.

1. Install the repository at `/opt/jerico` (or edit `WorkingDirectory` and `ExecStart` in the service unit for your installation path).
2. Ensure the `jerico` service account owns the repository `.env` and can write to `backups/`; add it to the Docker group so it can control the Compose stack.
3. Install and enable the units:

   `sudo install -m 0644 infrastructure/self-hosted/systemd/jerico-backup.service /etc/systemd/system/`

   `sudo install -m 0644 infrastructure/self-hosted/systemd/jerico-backup.timer /etc/systemd/system/`

   `sudo systemctl daemon-reload && sudo systemctl enable --now jerico-backup.timer`

4. Check the next run with `systemctl list-timers jerico-backup.timer` and inspect logs with `journalctl -u jerico-backup.service`.

The timer does not configure off-site storage or remote retention by itself. Those remain controlled by `RCLONE_REMOTE`, age encryption, and storage-provider lifecycle policy. The backup service runs with a restrictive umask and systemd hardening; review the service account and Docker socket access for your host.
