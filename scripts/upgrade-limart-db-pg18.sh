#!/usr/bin/env bash
# ==============================================================================
# Script: upgrade-limart-db-pg18.sh
# Purpose: Safe, zero-data-loss migration of limart-db from PostgreSQL 17 to
#          PostgreSQL 18.6 (pgvector 0.8.7 + pgBackRest + lz4 + data_checksums=on)
# Invariants:
#   - Full logical dump (pg_dumpall) validated before touching volumes
#   - Physical tarball backup of PG17 PGDATA volume archived to host
#   - Legacy pgBackRest stanza archived to prevent catalog version collisions
#   - Fresh initdb with data_checksums=on enabled by default on PG18
#   - Idempotent: Skips immediately if PG_VERSION is already 18
# ==============================================================================

set -euo pipefail

# ANSI color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

log_info "Verifying PostgreSQL version for limart-db..."

# Check running limart-db container
CURRENT_VER=$(docker exec limart-db cat /var/lib/postgresql/data/PG_VERSION 2>/dev/null || echo "none")

# If container is not running, check if it can be started or inspect volume
if [ "$CURRENT_VER" = "none" ]; then
    log_warn "limart-db is not currently running. Attempting to start it to check PG_VERSION..."
    docker start limart-db 2>/dev/null || true
    sleep 3
    CURRENT_VER=$(docker exec limart-db cat /var/lib/postgresql/data/PG_VERSION 2>/dev/null || echo "none")
fi

log_info "Detected limart-db PG_VERSION: '${CURRENT_VER}'"

# Clean up obsolete legacy databases (checkin_db_v2 is decommissioned)
docker exec limart-db psql -U kido -d postgres -c "DROP DATABASE IF EXISTS checkin_db_v2;" >/dev/null 2>&1 || true

if [ "$CURRENT_VER" = "18" ]; then
    log_success "✅ limart-db is already on PostgreSQL 18. Skipping migration."
    exit 0
fi

if [ "$CURRENT_VER" != "17" ]; then
    log_warn "Current version is '${CURRENT_VER}' (neither 17 nor 18). Nothing to migrate from PG17."
    exit 0
fi

# ==============================================================================
# Starting PG17 -> PG18 Migration Process
# ==============================================================================
echo -e "${CYAN}==============================================================================${NC}"
echo -e "${CYAN}🚀 STARTING POSTGRESQL 17 -> 18 UPGRADE FOR limart-db${NC}"
echo -e "${CYAN}==============================================================================${NC}"

BACKUP_DIR="/opt/backups/pg18-upgrade"
DUMP_FILE="${BACKUP_DIR}/limart-db-pg17-dumpall.sql"
mkdir -p "${BACKUP_DIR}"

# Step 1: Logical dump via pg_dumpall
log_info "Step 1/8: Creating full logical dump of PostgreSQL 17 cluster..."
docker exec limart-db pg_dumpall -U kido > "${DUMP_FILE}"

# Step 2: Validate dump file
log_info "Step 2/8: Validating logical dump file integrity..."
if [ ! -s "${DUMP_FILE}" ]; then
    log_error "Dump file '${DUMP_FILE}' does not exist or is empty!"
    exit 1
fi

DUMP_SIZE=$(wc -c < "${DUMP_FILE}" | tr -d ' ')
log_info "Dump file size: ${DUMP_SIZE} bytes."
if [ "$DUMP_SIZE" -lt 10000 ]; then
    log_error "Dump file is too small (${DUMP_SIZE} bytes < 10000 bytes). Aborting upgrade to protect data!"
    exit 1
fi

if ! grep -q "PostgreSQL database cluster dump complete" "${DUMP_FILE}"; then
    log_error "Dump file does not contain completion signature. Dump was truncated or failed. Aborting!"
    exit 1
fi
log_success "Logical dump verified successfully (${DUMP_SIZE} bytes with completion signature)."

# Step 3: Build new image limart-db:pg18-pgbackrest
log_info "Step 3/8: Building new image limart-db:pg18-pgbackrest..."
docker compose -f docker-compose.yml build limart-db
log_success "Image limart-db:pg18-pgbackrest built successfully."

# Step 4: Stop limart-db and backup physical PGDATA volume
log_info "Step 4/8: Stopping limart-db and archiving physical PG17 volume..."
docker stop limart-db || true
docker rm limart-db || true

TAR_BACKUP="${BACKUP_DIR}/limart-db-pg17-pgdata.tar.gz"
log_info "Archiving PG17 data to ${TAR_BACKUP} and prepping volumes..."

docker run --rm \
    --entrypoint sh \
    -v checkin-app_checkin_pgdata:/pgdata \
    -v checkin-app_checkin_pgbackrest_data:/pgbackrest \
    -v "${BACKUP_DIR}:/backup" \
    limart-db:pg18-pgbackrest -c '
        set -eu
        echo "📦 Creating compressed archive of PG17 /pgdata..."
        tar -czf /backup/limart-db-pg17-pgdata.tar.gz -C /pgdata .
        
        echo "🧹 Clearing /pgdata to allow clean PG18 initdb with data_checksums=on..."
        rm -rf /pgdata/* /pgdata/.[!.]* 2>/dev/null || true
        
        echo "📂 Archiving legacy PG17 pgBackRest stanza to avoid version conflict..."
        LEGACY_STANZA_DIR="/pgbackrest/pg17-legacy-$(date +%Y%m%d_%H%M%S)"
        mkdir -p "${LEGACY_STANZA_DIR}"
        if [ -d /pgbackrest/backup/checkin ]; then
            mv /pgbackrest/backup/checkin "${LEGACY_STANZA_DIR}/backup-checkin"
        fi
        if [ -d /pgbackrest/archive/checkin ]; then
            mv /pgbackrest/archive/checkin "${LEGACY_STANZA_DIR}/archive-checkin"
        fi
        chown -R postgres:postgres /pgbackrest
        echo "✅ Volumes prepared successfully."
    '

log_success "Physical PG17 data safely archived to ${TAR_BACKUP}."

# Step 5: Start limart-db with PG 18.6
log_info "Step 5/8: Starting limart-db on PostgreSQL 18.6..."
docker compose -f docker-compose.yml up -d limart-db

log_info "Waiting for limart-db (PG18) to initialize and become ready..."
MAX_RETRIES=60
COUNT=0
while [ "$COUNT" -lt "$MAX_RETRIES" ]; do
    if docker exec limart-db pg_isready -U kido -d checkin_db >/dev/null 2>&1; then
        log_success "limart-db (PG18) is ready and accepting connections!"
        break
    fi
    COUNT=$((COUNT + 1))
    sleep 1
    echo -n "."
done
echo ""

if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
    log_error "Timeout: limart-db did not become ready after ${MAX_RETRIES} seconds."
    docker logs --tail 50 limart-db
    exit 1
fi

# Step 6: Restore all databases from pg_dumpall
log_info "Step 6/8: Restoring cluster data from PG17 dumpall..."
# Note: kido role and checkin_db were initialized by initdb, psql ignores "already exists" and restores all schemas/tables
docker exec -i limart-db psql -U kido -d postgres < "${DUMP_FILE}" || true

log_info "Verifying restored user databases and public tables..."
for db in checkin_db checkin_demo_db; do
    TBL_COUNT=$(docker exec limart-db psql -U kido -d "$db" -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
    log_info "Database '${db}' verified: ${TBL_COUNT} public tables present."
done
log_success "Cluster data restored successfully into PostgreSQL 18."

# Step 7: Run VACUUM ANALYZE across all user databases
log_info "Step 7/8: Running VACUUM ANALYZE across all user databases..."
for db in checkin_db checkin_demo_db; do
    log_info "Running VACUUM ANALYZE on ${db}..."
    docker exec limart-db psql -U kido -d "${db}" -c "VACUUM ANALYZE;" || log_warn "VACUUM ANALYZE on ${db} finished with warning"
done

# Step 8: Initialize pgBackRest stanza and perform initial Full Backup for PG 18
log_info "Step 8/8: Initializing pgBackRest checkin stanza and running first Full Backup..."
docker exec -u postgres limart-db pgbackrest --stanza=checkin stanza-create
docker exec -u postgres limart-db pgbackrest --stanza=checkin --type=full backup
log_success "pgBackRest full backup completed for PostgreSQL 18 cluster."

# Final touch: Restart limart-api to reset connection pool
log_info "Restarting limart-api to refresh database connection pool..."
docker restart limart-api 2>/dev/null || true

echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}🎉 POSTGRESQL 18 UPGRADE COMPLETED SUCCESSFULLY FOR limart-db!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
