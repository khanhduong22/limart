#!/bin/bash
# ==============================================================================
# pgBackRest Point-in-Time Recovery (PITR) & Time Travel Restore Script
# Usage:
#   Time Travel to exact second:
#     ./scripts/pgbackrest-restore.sh --time "2026-10-05 14:30:00"
#   Restore latest backup:
#     ./scripts/pgbackrest-restore.sh --latest
#   Restore specific backup set:
#     ./scripts/pgbackrest-restore.sh --set 20261005-031500F
# ==============================================================================

set -euo pipefail

CONTAINER="limart-db"
STANZA="checkin"
DB_USER="kido"
DB_NAME="checkin_db"
FORCE=false
RESTORE_TYPE="default"
TARGET_VAL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --time)
      RESTORE_TYPE="time"
      TARGET_VAL="$2"
      shift 2
      ;;
    --set)
      RESTORE_TYPE="set"
      TARGET_VAL="$2"
      shift 2
      ;;
    --latest)
      RESTORE_TYPE="latest"
      shift 1
      ;;
    --force)
      FORCE=true
      shift 1
      ;;
    --help|-h)
      echo "Usage:"
      echo "  $0 --time 'YYYY-MM-DD HH:MM:SS'   (Point-in-Time Recovery / Time Travel)"
      echo "  $0 --set <backup-label>           (Restore specific backup set with --delta)"
      echo "  $0 --latest                       (Restore the newest available backup)"
      echo "  $0 --force                        (Skip interactive confirmation)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ "$RESTORE_TYPE" = "default" ]; then
  echo "Error: Must specify either --time 'YYYY-MM-DD HH:MM:SS', --set <label>, or --latest"
  exit 1
fi

echo "========================================================================"
echo "          PGBACKREST TIME TRAVEL & DATABASE RESTORE"
echo "========================================================================"
echo " Target Container : $CONTAINER"
echo " Stanza           : $STANZA"
echo " Target Database  : $DB_NAME"
echo " Restore Type     : $RESTORE_TYPE"
[ -n "$TARGET_VAL" ] && echo " Target Value     : $TARGET_VAL"
echo "========================================================================"

if [ "$FORCE" != "true" ]; then
  echo ""
  echo "WARNING: This operation will rewind/overwrite database '$DB_NAME'."
  read -rp "To proceed, type 'CONFIRM': " CONFIRM_INPUT
  if [ "$CONFIRM_INPUT" != "CONFIRM" ]; then
    echo "Aborted by user."
    exit 1
  fi
fi

echo "[1/4] Stopping application services to drain active connections..."
docker stop limart-api limart-admin limart-staff 2>/dev/null || true

echo "[2/4] Stopping PostgreSQL inside $CONTAINER..."
docker exec -u postgres "$CONTAINER" pg_ctl -D /var/lib/postgresql/data stop -m fast 2>/dev/null || true

echo "[3/4] Executing pgBackRest restore..."
RESTORE_CMD=("pgbackrest" "--stanza=$STANZA" "--delta" "--log-level-console=info")

if [ "$RESTORE_TYPE" = "time" ]; then
  RESTORE_CMD+=("--type=time" "--target=$TARGET_VAL")
elif [ "$RESTORE_TYPE" = "set" ]; then
  RESTORE_CMD+=("--set=$TARGET_VAL")
elif [ "$RESTORE_TYPE" = "latest" ]; then
  RESTORE_CMD+=("--type=default")
fi

docker exec -u postgres "$CONTAINER" "${RESTORE_CMD[@]} restore"

echo "[4/4] Starting PostgreSQL and bringing up application stack..."
docker restart "$CONTAINER"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  sleep 1
done

echo "Restarting application containers..."
docker start limart-api limart-admin limart-staff 2>/dev/null || true

USER_COUNT=$(docker exec -u postgres "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM \"User\";" 2>/dev/null || echo "0")
echo "========================================================================"
echo " Restore completed successfully!"
echo " Current User Count: $USER_COUNT"
echo "========================================================================"
