#!/bin/bash
# ==============================================================================
# pgBackRest automated backup script for LimArt Checkin App (checkin_db)
# Usage: ./scripts/pgbackrest-backup.sh [full|diff|incr]
# Schedule:
#   Sunday 03:15 AM    -> full (snapshot)
#   Mon/Wed/Fri 03:15  -> diff
#   Tue/Thu/Sat 03:15  -> incr
# ==============================================================================

set -euo pipefail

TYPE="${1:-diff}"
CONTAINER="limart-db"
STANZA="checkin"
DB_USER="kido"
DB_NAME="checkin_db"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

LOG_DIR="/var/log/pgbackrest-checkin"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/backup-$(date +%Y%m%d-%H%M%S).log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

send_slack() {
  local msg="$1"
  if [ -n "$SLACK_WEBHOOK_URL" ]; then
    python3 -c "
import urllib.request, json, sys
data = json.dumps({'text': sys.argv[1]}).encode('utf-8')
req = urllib.request.Request(sys.argv[2], data=data, headers={'Content-Type': 'application/json'})
try:
    urllib.request.urlopen(req, timeout=10)
except Exception as e:
    sys.stderr.write(f'Slack error: {e}\n')
" "$msg" "$SLACK_WEBHOOK_URL" || true
  fi
}

send_telegram() {
  local text="$1"
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    python3 -c "
import urllib.request, json, sys
data = json.dumps({'chat_id': int(sys.argv[2]), 'text': sys.argv[3]}).encode('utf-8')
url = f'https://api.telegram.org/bot{sys.argv[1]}/sendMessage'
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
try:
    urllib.request.urlopen(req, timeout=10)
except Exception as e:
    sys.stderr.write(f'Telegram error: {e}\n')
" "$TELEGRAM_BOT_TOKEN" "$TELEGRAM_CHAT_ID" "$text" || true
  fi
}

log "Starting ${TYPE} backup for stanza ${STANZA}..."

set +e
docker exec -u postgres "$CONTAINER" \
  pgbackrest --stanza="$STANZA" --type="$TYPE" --log-level-console=info backup 2>&1 | tee -a "$LOG"
EXIT_CODE=${PIPESTATUS[0]}
if [ $EXIT_CODE -ne 0 ]; then
  log "pgBackRest ${TYPE} backup FAILED with exit code ${EXIT_CODE}"
  FAIL_MSG=":rotating_light: *[checkin-app] Database Backup & Verification FAILED* (Daily Run)
• *Branch:* main / feat/monorepo-migration
• *Stanza:* ${STANZA}
• *Backup Type:* ${TYPE}
• *Error:* pgBackRest backup command failed with exit code ${EXIT_CODE}.
• *Log File:* \`${LOG}\`
• *Time:* $(date '+%Y-%m-%d %H:%M:%S')"
  send_slack "$FAIL_MSG"
  send_telegram "🔴 [LimArt Checkin] pgBackRest ${TYPE} backup FAILED (Exit ${EXIT_CODE})"
  exit $EXIT_CODE
fi

log "${TYPE} backup completed successfully on container. Fetching stats..."

# Fetch latest backup info JSON
INFO_JSON=$(docker exec -u postgres "$CONTAINER" pgbackrest --stanza="$STANZA" --output=json info 2>/dev/null || echo "[]")

BACKUP_DETAILS=$(python3 -c '
import sys, json, datetime

try:
    data = json.loads(sys.argv[1])
    stanza = data[0]
    backups = stanza.get("backup", [])
    if not backups:
        print("NO_BACKUP")
        sys.exit(0)
    latest = backups[-1]
    label = latest.get("label", "unknown")
    btype = latest.get("type", "unknown").upper()
    size_bytes = latest.get("info", {}).get("repository", {}).get("size", 0)
    size_mb = f"{size_bytes / (1024*1024):.2f} MB"
    db_size_bytes = latest.get("info", {}).get("size", 0)
    db_size_mb = f"{db_size_bytes / (1024*1024):.2f} MB"
    
    stop_ts = latest.get("timestamp", {}).get("stop", 0)
    stop_dt = datetime.datetime.fromtimestamp(stop_ts).strftime("%Y-%m-%d %H:%M:%S")
    
    wal_min = stanza.get("archive", [{}])[0].get("min", "N/A")
    wal_max = stanza.get("archive", [{}])[0].get("max", "N/A")
    
    print(f"{label}|{btype}|{size_mb}|{db_size_mb}|{stop_dt}|{wal_min} .. {wal_max}")
except Exception as e:
    print(f"ERROR|{e}")
' "$INFO_JSON")

IFS='|' read -r BACKUP_LABEL BACKUP_TYPE_NAME BACKUP_SIZE DB_SIZE BACKUP_TIME WAL_RANGE <<< "$BACKUP_DETAILS"

# Query table statistics
USER_COUNT=$(docker exec -u postgres "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM \"User\";" 2>/dev/null || echo "0")
CHECKIN_COUNT=$(docker exec -u postgres "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM \"CheckIn\";" 2>/dev/null || echo "0")
SHIFT_COUNT=$(docker exec -u postgres "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM \"WorkShift\";" 2>/dev/null || echo "0")

STORAGE_PATH="/var/lib/docker/volumes/checkin-app_checkin_pgbackrest_data/_data"
STORAGE_USAGE=$(du -sh "$STORAGE_PATH" 2>/dev/null | awk '{print $1}' || echo "N/A")

SUCCESS_MSG=":white_check_mark: *[checkin-app] pgBackRest Backup PASSED* (Daily Run)
• *Stanza:* $STANZA
• *Repository Type:* posix (Local Contabo Storage: \`$STORAGE_PATH\` - Total: $STORAGE_USAGE)
• *Backup Type:* $BACKUP_TYPE_NAME ($TYPE)
• *Backup Label:* \`$BACKUP_LABEL\`
• *Last Backup Time:* $BACKUP_TIME
• *Database Size:* $DB_SIZE (Compressed Backup: $BACKUP_SIZE)
• *Live Metrics:* 👤 Staff: $USER_COUNT, ⏱️ CheckIns: $CHECKIN_COUNT, 📅 WorkShifts: $SHIFT_COUNT
• *Quick Restore:* \`docker exec -u postgres limart-db pgbackrest --stanza=checkin --set=$BACKUP_LABEL --delta restore\`
• *Continuous WAL Stream (PITR):* \`$WAL_RANGE\`"

send_slack "$SUCCESS_MSG"
send_telegram "✅ [LimArt Checkin] pgBackRest $BACKUP_TYPE_NAME backup completed: $BACKUP_LABEL ($BACKUP_SIZE)"
log "Backup process finished successfully."

# Rotate old logs (>30 days)
find "$LOG_DIR" -name "backup-*.log" -mtime +30 -delete 2>/dev/null || true

exit 0
