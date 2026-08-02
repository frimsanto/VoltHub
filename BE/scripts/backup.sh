#!/usr/bin/env bash
#
# VoltReport — MySQL automated backup with tiered retention.
#
# Creates a gzipped mysqldump every run and rotates copies into daily / weekly /
# monthly tiers:
#   - daily   : kept 7 days
#   - weekly  : kept 30 days  (snapshot taken on Sundays)
#   - monthly : kept 90 days  (snapshot taken on the 1st of the month)
#
# Connection details are read from DATABASE_URL (parsed) or the individual
# DB_* env vars below. Designed to be run from cron, e.g. daily at 02:00:
#   0 2 * * *  /opt/voltreport/BE/scripts/backup.sh >> /var/log/voltreport-backup.log 2>&1
#
# Usage:
#   ./backup.sh                 # back up the DB (uses .env / DATABASE_URL)
#   BACKUP_ROOT=/data ./backup.sh
#   ./backup.sh --with-uploads  # also archive the uploads/ directory
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Load .env if present (without overriding already-exported vars) ────────────
if [[ -f "${BE_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${BE_DIR}/.env"
  set +a
fi

# ── Resolve connection details ────────────────────────────────────────────────
# Prefer explicit DB_* vars; otherwise parse DATABASE_URL
#   mysql://user:pass@host:port/dbname?params
parse_database_url() {
  local url="${DATABASE_URL:-}"
  url="${url#mysql://}"
  local creds="${url%%@*}"
  local hostpart="${url#*@}"
  DB_USER="${DB_USER:-${creds%%:*}}"
  local pass="${creds#*:}"
  [[ "$pass" == "$creds" ]] && pass=""        # no password segment
  DB_PASS="${DB_PASS:-${pass}}"
  local hostport="${hostpart%%/*}"
  DB_HOST="${DB_HOST:-${hostport%%:*}}"
  local port="${hostport#*:}"
  [[ "$port" == "$hostport" ]] && port="3306"
  DB_PORT="${DB_PORT:-${port}}"
  local dbname="${hostpart#*/}"
  dbname="${dbname%%\?*}"
  DB_NAME="${DB_NAME:-${dbname}}"
}
parse_database_url

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-voltreport}"

BACKUP_ROOT="${BACKUP_ROOT:-${BE_DIR}/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DAY_OF_WEEK="$(date +%u)"   # 1=Mon .. 7=Sun
DAY_OF_MONTH="$(date +%d)"

# Retention (days)
RETAIN_DAILY="${RETAIN_DAILY:-7}"
RETAIN_WEEKLY="${RETAIN_WEEKLY:-30}"
RETAIN_MONTHLY="${RETAIN_MONTHLY:-90}"

mkdir -p "${BACKUP_ROOT}/daily" "${BACKUP_ROOT}/weekly" "${BACKUP_ROOT}/monthly"

DAILY_FILE="${BACKUP_ROOT}/daily/voltreport-${TIMESTAMP}.sql.gz"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Dump ──────────────────────────────────────────────────────────────────────
log "Starting backup of '${DB_NAME}' on ${DB_HOST}:${DB_PORT} as ${DB_USER}"

# MYSQL_PWD avoids leaking the password in the process list.
export MYSQL_PWD="${DB_PASS:-}"

mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" | gzip -9 > "${DAILY_FILE}"

unset MYSQL_PWD

SIZE="$(du -h "${DAILY_FILE}" | cut -f1)"
log "Daily backup written: ${DAILY_FILE} (${SIZE})"

# Integrity check: gzip must decompress cleanly.
if ! gzip -t "${DAILY_FILE}"; then
  log "ERROR: integrity check failed for ${DAILY_FILE}"
  exit 1
fi
log "Integrity check OK"

# ── Promote to weekly / monthly tiers ─────────────────────────────────────────
if [[ "${DAY_OF_WEEK}" == "7" ]]; then
  cp "${DAILY_FILE}" "${BACKUP_ROOT}/weekly/voltreport-${TIMESTAMP}.sql.gz"
  log "Weekly snapshot created"
fi
if [[ "${DAY_OF_MONTH}" == "01" ]]; then
  cp "${DAILY_FILE}" "${BACKUP_ROOT}/monthly/voltreport-${TIMESTAMP}.sql.gz"
  log "Monthly snapshot created"
fi

# ── Optional: archive uploaded files ──────────────────────────────────────────
if [[ "${1:-}" == "--with-uploads" ]]; then
  UPLOAD_DIR_PATH="${BE_DIR}/${UPLOAD_DIR:-uploads}"
  if [[ -d "${UPLOAD_DIR_PATH}" ]]; then
    UPLOADS_FILE="${BACKUP_ROOT}/daily/uploads-${TIMESTAMP}.tar.gz"
    tar -czf "${UPLOADS_FILE}" -C "${BE_DIR}" "${UPLOAD_DIR:-uploads}"
    log "Uploads archived: ${UPLOADS_FILE}"
  else
    log "WARN: uploads dir not found at ${UPLOAD_DIR_PATH}, skipping"
  fi
fi

# ── Prune old backups by tier ─────────────────────────────────────────────────
prune() {
  local dir="$1" days="$2"
  find "${dir}" -type f -name '*.gz' -mtime "+${days}" -print -delete | while read -r f; do
    log "Pruned (>${days}d): ${f}"
  done
}
prune "${BACKUP_ROOT}/daily"   "${RETAIN_DAILY}"
prune "${BACKUP_ROOT}/weekly"  "${RETAIN_WEEKLY}"
prune "${BACKUP_ROOT}/monthly" "${RETAIN_MONTHLY}"

log "Backup completed successfully"
