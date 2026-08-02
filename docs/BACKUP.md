# VoltReport — Database Backup & Restore

Automated MySQL backup with tiered retention, plus a guarded restore path.

| Script | Purpose |
|--------|---------|
| [`BE/scripts/backup.sh`](../BE/scripts/backup.sh)   | Dump + gzip the DB, rotate into daily/weekly/monthly, prune by retention |
| [`BE/scripts/restore.sh`](../BE/scripts/restore.sh) | Restore a chosen (or latest) backup, with a pre-restore safety snapshot |

## Prerequisites
- `mysqldump` and `mysql` clients on `PATH` (MySQL ≥ 5.7 / 8.x).
- Read access to the DB for backup; write/DDL for restore.
- Connection is auto-derived from `DATABASE_URL` in `BE/.env`, or override with
  `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`.

## Storage layout
Default root: `BE/backups/` (override with `BACKUP_ROOT`). In production use a
dedicated, **off-server** mounted volume (NAS / S3-mounted / separate disk):

```
$BACKUP_ROOT/
├── daily/        # every run            — retained 7 days
├── weekly/       # snapshot on Sundays  — retained 30 days
├── monthly/      # snapshot on the 1st  — retained 90 days
└── pre-restore/  # safety dumps taken before each restore
```
Files: `voltreport-YYYYMMDD-HHMMSS.sql.gz` (+ `uploads-*.tar.gz` with `--with-uploads`).

## Retention policy
| Tier | Taken | Kept | Override env |
|------|-------|------|--------------|
| Daily | every run | 7 days | `RETAIN_DAILY` |
| Weekly | Sundays | 30 days | `RETAIN_WEEKLY` |
| Monthly | 1st of month | 90 days | `RETAIN_MONTHLY` |

Pruning uses file mtime (`find -mtime`). Every backup is integrity-checked
(`gzip -t`) immediately after creation.

## Running a backup
```bash
chmod +x BE/scripts/*.sh           # once

BE/scripts/backup.sh               # DB only
BE/scripts/backup.sh --with-uploads   # DB + uploaded files

# custom location / retention
BACKUP_ROOT=/mnt/backups RETAIN_DAILY=14 BE/scripts/backup.sh
```

### Schedule with cron (production, daily 02:00)
```cron
0 2 * * * /opt/voltreport/BE/scripts/backup.sh --with-uploads >> /var/log/voltreport-backup.log 2>&1
```

### Windows (dev)
Run via **Git Bash** or **WSL**:
```bash
bash BE/scripts/backup.sh
```
For native scheduling use Task Scheduler invoking `bash -lc "/path/backup.sh"`.

## Restoring
```bash
BE/scripts/restore.sh --list          # show available backups
BE/scripts/restore.sh --latest        # restore newest daily backup
BE/scripts/restore.sh /mnt/backups/monthly/voltreport-20260601-020000.sql.gz
```
Restore is **destructive** — it overwrites the target DB. Safeguards:
1. Archive integrity is verified before anything is touched.
2. A **pre-restore safety snapshot** of the current DB is written to
   `pre-restore/` so a wrong restore is reversible.
3. Interactive confirmation (type the DB name). Bypass in automation with
   `FORCE=1` (use carefully).

```bash
FORCE=1 BE/scripts/restore.sh --latest   # non-interactive (e.g. DR drill)
```

## Verifying a backup (recommended monthly drill)
Restore into a throwaway database and sanity-check row counts:
```bash
DB_NAME=voltreport_verify FORCE=1 BE/scripts/restore.sh --latest
mysql -e "SELECT COUNT(*) FROM voltreport_verify.User;"
mysql -e "DROP DATABASE voltreport_verify;"
```

## Operational notes
- Passwords are passed via `MYSQL_PWD` (not argv) so they don't appear in the
  process list.
- `--single-transaction` gives a consistent snapshot on InnoDB without locking.
- Keep at least one copy **off-site**. Local-only backups do not survive a
  server/disk loss — see [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md).
