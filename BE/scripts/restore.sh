#!/usr/bin/env bash
#
# VoltReport — MySQL restore from a backup produced by backup.sh.
#
# Usage:
#   ./restore.sh <path-to-backup.sql.gz>     # restore a specific file
#   ./restore.sh --latest                    # restore the newest daily backup
#   ./restore.sh --list                      # list available backups
#
# SAFETY: restoring OVERWRITES the target database. The script requires an
# interactive confirmation unless FORCE=1 is set. It takes a safety dump of the
# current database first (pre-restore snapshot) so a bad restore is reversible.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${BE_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${BE_DIR}/.env"
  set +a
fi

parse_database_url() {
  local url="${DATABASE_URL:-}"
  url="${url#mysql://}"
  local creds="${url%%@*}"
  local hostpart="${url#*@}"
  DB_USER="${DB_USER:-${creds%%:*}}"
  local pass="${creds#*:}"
  [[ "$pass" == "$creds" ]] && pass=""
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

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup.sql.gz> | --latest | --list"
  exit 1
fi

if [[ "$1" == "--list" ]]; then
  log "Available backups under ${BACKUP_ROOT}:"
  find "${BACKUP_ROOT}" -name 'voltreport-*.sql.gz' -printf '%TY-%Tm-%Td %TH:%TM  %10s  %p\n' 2>/dev/null \
    | sort -r || echo "  (none found)"
  exit 0
fi

if [[ "$1" == "--latest" ]]; then
  BACKUP_FILE="$(find "${BACKUP_ROOT}/daily" -name 'voltreport-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)"
  [[ -z "${BACKUP_FILE}" ]] && { log "ERROR: no backups found in ${BACKUP_ROOT}/daily"; exit 1; }
else
  BACKUP_FILE="$1"
fi

[[ -f "${BACKUP_FILE}" ]] || { log "ERROR: backup file not found: ${BACKUP_FILE}"; exit 1; }

log "Verifying archive integrity..."
gzip -t "${BACKUP_FILE}" || { log "ERROR: corrupt archive: ${BACKUP_FILE}"; exit 1; }

log "About to restore '${DB_NAME}' on ${DB_HOST}:${DB_PORT} from:"
log "    ${BACKUP_FILE}"
log "*** THIS WILL OVERWRITE THE CURRENT DATABASE ***"

if [[ "${FORCE:-0}" != "1" ]]; then
  read -r -p "Type the database name '${DB_NAME}' to confirm: " CONFIRM
  [[ "${CONFIRM}" == "${DB_NAME}" ]] || { log "Aborted."; exit 1; }
fi

export MYSQL_PWD="${DB_PASS:-}"

# ── Pre-restore safety snapshot of the current state ──────────────────────────
mkdir -p "${BACKUP_ROOT}/pre-restore"
SAFETY="${BACKUP_ROOT}/pre-restore/voltreport-pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
log "Taking safety snapshot of current DB -> ${SAFETY}"
mysqldump --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" \
  --single-transaction --quick --routines --triggers --events \
  --default-character-set=utf8mb4 "${DB_NAME}" | gzip -9 > "${SAFETY}" \
  || log "WARN: safety snapshot failed (DB may be empty/new) — continuing"

# ── Restore ───────────────────────────────────────────────────────────────────
log "Restoring..."
mysql --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" \
  -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

gunzip -c "${BACKUP_FILE}" | mysql --host="${DB_HOST}" --port="${DB_PORT}" \
  --user="${DB_USER}" "${DB_NAME}"

unset MYSQL_PWD
log "Restore completed successfully. Safety snapshot kept at: ${SAFETY}"
