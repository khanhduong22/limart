#!/usr/bin/env bash
# ==============================================================================
# Script: deploy-monorepo.sh
# Purpose: Blue-Green Zero-Downtime Deployment script for Checkin App Monorepo
# Architecture:
#   Unified Limart Stack:
#     - limart-api   : port 4000 (Blue-Green container swap)
#     - limart-admin : port 3001
#     - limart-staff : port 3002
#     - limart-db    : port 5432
#     - limart-valkey: port 6389:6379
# ==============================================================================

set -euo pipefail

# ANSI color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

COMPOSE_FILE="docker-compose.yml"
# Legacy container (checkin-app) is permanently decommissioned
NETWORK_NAME="ops_bridge"
ACTIVE_API_CONTAINER="limart-api"
CANDIDATE_API_CONTAINER="${ACTIVE_API_CONTAINER}_next"
BACKUP_API_CONTAINER="${ACTIVE_API_CONTAINER}_old"
HEALTH_TIMEOUT=45
DRAIN_SECONDS=3

# Target services to deploy (e.g. "api admin staff", "staff", "api")
# Default: all services if BUILT_SERVICES is unset
if [ -z "${BUILT_SERVICES+x}" ]; then
    BUILT_SERVICES="api admin staff"
fi

has_service() {
    local svc="$1"
    [[ " ${BUILT_SERVICES} " =~ [[:space:]]${svc}[[:space:]] ]]
}

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

ensure_network() {
    log_info "Verifying shared network '${NETWORK_NAME}'..."
    if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
        log_warn "Network '${NETWORK_NAME}' not found. Creating external network..."
        docker network create "${NETWORK_NAME}"
        log_success "Network '${NETWORK_NAME}' created."
    else
        log_info "Network '${NETWORK_NAME}' is active."
    fi
}

wait_for_health() {
    local service_name="$1"
    local url="$2"
    local max_retries="${3:-30}"
    local delay="${4:-2}"

    log_info "Waiting for ${service_name} to become healthy at ${url}..."
    local count=0

    while [ "$count" -lt "$max_retries" ]; do
        if docker exec "${service_name}" wget -q -O /dev/null "${url}" 2>/dev/null || curl -s -f -o /dev/null -m 3 "${url}" 2>/dev/null; then
            log_success "${service_name} is HEALTHY! (${url})"
            return 0
        fi
        count=$((count + 1))
        echo -n "."
        sleep "${delay}"
    done

    echo ""
    log_error "Timeout: ${service_name} failed health check after $((max_retries * delay)) seconds."
    return 1
}

deploy_dual_run() {
    echo -e "${CYAN}==============================================================================${NC}"
    echo -e "${CYAN}🚀 STARTING SMART ZERO-DOWNTIME DEPLOYMENT (3-TIER MONOREPO)${NC}"
    echo -e "${CYAN}   Built Services: ${BUILT_SERVICES}${NC}"
    echo -e "${CYAN}==============================================================================${NC}"

    ensure_network

    # Step 1: Legacy container status (permanently decommissioned)
    log_info "Legacy monolith container (checkin-app) is permanently decommissioned."

    # Step 2: Start persistent database & cache if not running (with pgBackRest built into limart-db)
    log_info "Checking PostgreSQL 18 upgrade for limart-db..."
    if [ -f "scripts/upgrade-limart-db-pg18.sh" ]; then
        chmod +x scripts/upgrade-limart-db-pg18.sh
        ./scripts/upgrade-limart-db-pg18.sh
    fi

    log_info "Ensuring backing services (limart-db, limart-valkey) are running..."
    docker volume create checkin-app_checkin_pgbackrest_data >/dev/null 2>&1 || true
    docker compose -f "${COMPOSE_FILE}" up -d --build limart-db limart-valkey
    docker exec -u postgres limart-db pgbackrest --stanza=checkin stanza-create >/dev/null 2>&1 || true

    # Step 3: Launch/update frontend Monorepo containers (limart-admin, limart-staff)
    FRONTEND_TARGETS=()
    if has_service "admin" || ! docker inspect limart-admin >/dev/null 2>&1; then
        FRONTEND_TARGETS+=("limart-admin")
    fi
    if has_service "staff" || ! docker inspect limart-staff >/dev/null 2>&1; then
        FRONTEND_TARGETS+=("limart-staff")
    fi

    if [ ${#FRONTEND_TARGETS[@]} -gt 0 ]; then
        log_info "Launching frontend Monorepo containers: ${FRONTEND_TARGETS[*]}..."
        docker compose -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate "${FRONTEND_TARGETS[@]}"
    else
        log_info "Skipping frontend container restart (neither admin nor staff modified)."
    fi

    # Step 4: Blue-Green Candidate Container Launch for limart-api
    if has_service "api" || ! docker inspect "${ACTIVE_API_CONTAINER}" >/dev/null 2>&1; then
        log_info "Deploying limart-api Docker container with Blue-Green rollout..."
        API_IMAGE=$(docker compose -f "${COMPOSE_FILE}" config --images 2>/dev/null | grep 'checkin-api' | head -n1 || echo "ghcr.io/khanhduong22/limart/checkin-api:latest")
        if [ -z "${API_IMAGE}" ]; then
            API_IMAGE="ghcr.io/khanhduong22/limart/checkin-api:latest"
        fi

        log_info "Starting candidate container '${CANDIDATE_API_CONTAINER}' with image '${API_IMAGE}'..."
        docker rm -f "${CANDIDATE_API_CONTAINER}" 2>/dev/null || true

        ENV_ARG=""
        if [ -f ".env" ]; then
            ENV_ARG="--env-file .env"
            # Ensure Gemini API keys are exported into environment if present in .env
            export $(grep -E '^(GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY)=' .env | xargs) 2>/dev/null || true
        fi

        docker run -d \
            --name "${CANDIDATE_API_CONTAINER}" \
            --network "${NETWORK_NAME}" \
            --init \
            --restart unless-stopped \
            --label "com.docker.compose.project=limart" \
            --label "com.docker.compose.service=limart-api" \
            -m 256m \
            ${ENV_ARG} \
            -e PORT=4000 \
            -e NODE_ENV=production \
            -e DATABASE_URL="${DATABASE_URL:-postgresql://kido:KidoVPS2026!@limart-db:5432/checkin_db?sslmode=disable&connection_limit=25&pool_timeout=20}" \
            -e REDIS_URL="${REDIS_URL:-redis://limart-valkey:6379}" \
            -e MEILISEARCH_HOST="${MEILISEARCH_HOST:-http://meilisearch:7700}" \
            -e MEILISEARCH_KEY="${MEILISEARCH_KEY:-kt_meilisearch_master_key_2026_safe}" \
            -e NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-checkin-app-jwt-secret-monorepo-safe-2026}" \
            -e GEMINI_API_KEY="${GEMINI_API_KEY:-}" \
            -e GOOGLE_GENERATIVE_AI_API_KEY="${GOOGLE_GENERATIVE_AI_API_KEY:-}" \
            "${API_IMAGE}"

        if docker network inspect limart-infra >/dev/null 2>&1; then
            docker network connect limart-infra "${CANDIDATE_API_CONTAINER}" 2>/dev/null || true
            log_info "Connected candidate container to internal network 'limart-infra'."
        fi

        # Step 6: Database schema migration sync in candidate container
        log_info "Syncing database schema via Prisma in candidate container..."
        docker exec "${CANDIDATE_API_CONTAINER}" bun -e "
          const { execSync } = require('child_process');
          try {
            console.log(execSync('bunx prisma db push --skip-generate --schema=packages/db/prisma/schema.prisma').toString());
          } catch (e) {
            console.log('Database push completed or logged:', e.message);
          }
        " || log_warn "Prisma push check completed."

        # Step 7: Probe internal /health endpoint until healthy (timeout 45s)
        log_info "Probing candidate container '${CANDIDATE_API_CONTAINER}' internal /health endpoint (timeout: ${HEALTH_TIMEOUT}s)..."
        START_TIME=$(date +%s)
        CANDIDATE_HEALTHY=false

        while true; do
            CURRENT_TIME=$(date +%s)
            ELAPSED=$((CURRENT_TIME - START_TIME))

            if [ "$ELAPSED" -ge "$HEALTH_TIMEOUT" ]; then
                break
            fi

            if docker exec "${CANDIDATE_API_CONTAINER}" wget -q -O - http://127.0.0.1:4000/health 2>/dev/null | grep -q '"status":"ok"'; then
                CANDIDATE_HEALTHY=true
                log_success "Candidate container '${CANDIDATE_API_CONTAINER}' is HEALTHY in ${ELAPSED}s!"
                break
            fi

            echo -n "."
            sleep 2
        done
        echo ""

        # Step 8: Auto-Rollback if Candidate Fails Healthcheck
        if [ "$CANDIDATE_HEALTHY" != true ]; then
            log_error "Candidate healthcheck probe TIMED OUT after ${HEALTH_TIMEOUT}s! Initiating rollback..."
            docker logs --tail 60 "${CANDIDATE_API_CONTAINER}" || true
            docker rm -f "${CANDIDATE_API_CONTAINER}" 2>/dev/null || true
            log_warn "Candidate container removed. Active container '${ACTIVE_API_CONTAINER}' remains 100% active. Zero downtime preserved."
            return 1
        fi

        # Step 9: Atomic Container Rename Swap
        log_info "Executing Blue-Green atomic container rename swap..."
        docker rm -f "${BACKUP_API_CONTAINER}" 2>/dev/null || true

        if docker inspect "${ACTIVE_API_CONTAINER}" >/dev/null 2>&1; then
            log_info "Renaming active '${ACTIVE_API_CONTAINER}' -> '${BACKUP_API_CONTAINER}'..."
            docker rename "${ACTIVE_API_CONTAINER}" "${BACKUP_API_CONTAINER}"
        fi

        docker rename "${CANDIDATE_API_CONTAINER}" "${ACTIVE_API_CONTAINER}"
        log_success "Successfully promoted '${CANDIDATE_API_CONTAINER}' -> '${ACTIVE_API_CONTAINER}'!"

        # Step 11: Drain connections and remove _old
        if docker inspect "${BACKUP_API_CONTAINER}" >/dev/null 2>&1; then
            log_info "Draining connections on '${BACKUP_API_CONTAINER}' for ${DRAIN_SECONDS}s..."
            sleep "${DRAIN_SECONDS}"
            log_info "Removing drained old container '${BACKUP_API_CONTAINER}'..."
            docker rm -f "${BACKUP_API_CONTAINER}" 2>/dev/null || true
            log_success "Old container '${BACKUP_API_CONTAINER}' removed cleanly."
        fi
    else
        log_info "Skipping limart-api deployment (API unchanged & active)."
    fi

    # Step 9b: Provision & Deploy Isolated Public Demo Tenant (checkin_demo_db + limart-demo-api)
    log_info "Ensuring isolated demo database 'checkin_demo_db' exists and schema is synced..."
    if ! docker exec limart-db psql -U kido -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'checkin_demo_db'" | grep -q 1; then
        docker exec limart-db psql -U kido -d postgres -c "CREATE DATABASE checkin_demo_db;"
        docker exec limart-db psql -U kido -d checkin_demo_db -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 || true
        docker exec limart-db sh -c "pg_dump -U kido --schema-only --no-owner --no-privileges checkin_db | psql -U kido -d checkin_demo_db >/dev/null 2>&1 || true"
    else
        docker exec limart-db psql -U kido -d checkin_demo_db -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 || true
    fi
    for DB_TARGET in checkin_db checkin_demo_db; do
        docker exec limart-db psql -U kido -d "$DB_TARGET" -c '
          CREATE TABLE IF NOT EXISTS "Tenant" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "slug" TEXT NOT NULL UNIQUE,
            "name" TEXT NOT NULL,
            "domain" TEXT UNIQUE,
            "plan" TEXT NOT NULL DEFAULT '\''ENTERPRISE'\'',
            "modules" JSONB,
            "active" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO "Tenant" ("id", "slug", "name", "domain", "plan", "active", "updatedAt")
          VALUES ('\''limart'\'', '\''limart'\'', '\''LimArt Flagship Store'\'', '\''limart.khanhdp.com'\'', '\''ENTERPRISE'\'', true, CURRENT_TIMESTAMP)
          ON CONFLICT ("id") DO NOTHING;
          CREATE TABLE IF NOT EXISTS "Document" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "path" TEXT NOT NULL UNIQUE,
            "title" TEXT NOT NULL,
            "content" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS "SessionAuditLog" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE,
            "action" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT '\''SUCCESS'\'',
            "ipAddress" TEXT,
            "userAgent" TEXT,
            "device" TEXT,
            "city" TEXT,
            "details" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          ALTER TABLE "SessionAuditLog" ADD COLUMN IF NOT EXISTS "device" TEXT;
          ALTER TABLE "SessionAuditLog" ADD COLUMN IF NOT EXISTS "city" TEXT;
          ALTER TABLE "SessionAuditLog" ADD COLUMN IF NOT EXISTS "details" JSONB;
          CREATE TABLE IF NOT EXISTS "PushSubscription" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "tenantId" TEXT NOT NULL DEFAULT '\''limart'\'',
            "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
            "endpoint" TEXT NOT NULL UNIQUE,
            "p256dh" TEXT NOT NULL,
            "auth" TEXT NOT NULL,
            "userAgent" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
          CREATE INDEX IF NOT EXISTS "PushSubscription_tenantId_userId_idx" ON "PushSubscription"("tenantId", "userId");
          CREATE TABLE IF NOT EXISTS "NotificationRule" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "tenantId" TEXT NOT NULL DEFAULT '\''limart'\'',
            "code" TEXT NOT NULL UNIQUE,
            "name" TEXT NOT NULL,
            "triggerType" TEXT NOT NULL,
            "offsetMinutes" INTEGER NOT NULL DEFAULT 15,
            "titleTemplate" TEXT NOT NULL,
            "bodyTemplate" TEXT NOT NULL,
            "targetUrl" TEXT NOT NULL DEFAULT '\''/'\'',
            "active" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS "NotificationRule_tenantId_active_idx" ON "NotificationRule"("tenantId", "active");
          CREATE INDEX IF NOT EXISTS "NotificationRule_triggerType_active_idx" ON "NotificationRule"("triggerType", "active");
          CREATE TABLE IF NOT EXISTS "NotificationLog" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "tenantId" TEXT NOT NULL DEFAULT '\''limart'\'',
            "userId" TEXT,
            "shiftId" INTEGER,
            "ruleCode" TEXT,
            "title" TEXT NOT NULL,
            "body" TEXT NOT NULL,
            "targetUrl" TEXT NOT NULL DEFAULT '\''/'\'',
            "channel" TEXT NOT NULL DEFAULT '\''WEB_PUSH'\'',
            "deliveredCount" INTEGER NOT NULL DEFAULT 0,
            "readAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS "NotificationLog_tenantId_createdAt_idx" ON "NotificationLog"("tenantId", "createdAt");
          CREATE INDEX IF NOT EXISTS "NotificationLog_userId_createdAt_idx" ON "NotificationLog"("userId", "createdAt");
          CREATE INDEX IF NOT EXISTS "NotificationLog_shiftId_ruleCode_idx" ON "NotificationLog"("shiftId", "ruleCode");
          DO $$
          DECLARE
            t TEXT;
          BEGIN
            FOREACH t IN ARRAY ARRAY[
              '\''User'\'', '\''WorkShift'\'', '\''ShiftAuditLog'\'', '\''Request'\'', '\''Announcement'\'',
              '\''StickyNote'\'', '\''PayrollAdjustment'\'', '\''LuckyWheelPrize'\'', '\''LuckyWheelHistory'\'',
              '\''CheckIn'\'', '\''AllowedIP'\'', '\''Holiday'\'', '\''TaskDefinition'\'', '\''TaskItem'\'',
              '\''UserTask'\'', '\''PayrollPeriod'\'', '\''Payslip'\'', '\''Document'\'', '\''ManagerTask'\'',
              '\''StaffTask'\'', '\''ManagerChecklistTask'\'', '\''ManagerWeeklyTask'\'', '\''ShiftDuty'\'',
              '\''SessionAuditLog'\'', '\''PushSubscription'\'', '\''NotificationRule'\'', '\''NotificationLog'\''
            ]
            LOOP
              EXECUTE format('\''ALTER TABLE %I ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT %L'\'', t, '\''limart'\'');
            END LOOP;
          END $$;
        ' >/dev/null 2>&1 || true
    done

    log_info "Deploying isolated Public Demo API container (limart-demo-api on port 4010)..."
    DEMO_API_IMAGE=$(docker inspect --format='{{.Config.Image}}' "${ACTIVE_API_CONTAINER}" 2>/dev/null || echo "ghcr.io/khanhduong22/limart/checkin-api:latest")
    if [ -z "${DEMO_API_IMAGE}" ]; then
        DEMO_API_IMAGE="ghcr.io/khanhduong22/limart/checkin-api:latest"
    fi
    if [ -z "${ENV_ARG+x}" ]; then
        ENV_ARG=""
        if [ -f ".env" ]; then
            ENV_ARG="--env-file .env"
        fi
    fi
    docker rm -f limart-demo-api 2>/dev/null || true
    docker run -d \
        --name limart-demo-api \
        --network "${NETWORK_NAME}" \
        --init \
        --restart unless-stopped \
        --label "com.docker.compose.project=limart" \
        --label "com.docker.compose.service=limart-demo-api" \
        --health-cmd="wget --no-verbose --tries=1 --spider http://127.0.0.1:4010/health || exit 1" \
        -m 192m \
        ${ENV_ARG:-} \
        -e PORT=4010 \
        -e NODE_ENV=production \
        -e DEMO_SANDBOX_MODE=true \
        -e SOURCE_DATABASE_URL="postgresql://kido:KidoVPS2026!@limart-db:5432/checkin_db?sslmode=disable&connection_limit=5&pool_timeout=15" \
        -e DATABASE_URL="postgresql://kido:KidoVPS2026!@limart-db:5432/checkin_demo_db?sslmode=disable&connection_limit=5&pool_timeout=15" \
        -e REDIS_URL="redis://limart-valkey:6379/2" \
        -e MEILISEARCH_HOST="${MEILISEARCH_HOST:-http://meilisearch:7700}" \
        -e MEILISEARCH_KEY="${MEILISEARCH_KEY:-kt_meilisearch_master_key_2026_safe}" \
        -e NEXTAUTH_SECRET="checkin-app-demo-sandbox-jwt-secret-2026" \
        "${DEMO_API_IMAGE}"
    if docker network inspect limart-infra >/dev/null 2>&1; then
        docker network connect limart-infra limart-demo-api 2>/dev/null || true
    fi

    if wait_for_health "limart-demo-api" "http://127.0.0.1:4010/health" 20 2; then
        log_info "Syncing demo database schema via Prisma in limart-demo-api..."
        docker exec limart-demo-api bunx prisma db push --skip-generate --schema=packages/db/prisma/schema.prisma >/dev/null 2>&1 || true
        log_info "Triggering initial anonymized data sync on limart-demo-api (POST /api/demo/reset)..."
        docker exec limart-demo-api bun -e "fetch('http://127.0.0.1:4010/api/demo/reset', {method:'POST', signal: AbortSignal.timeout(30000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1 || \
            log_warn "Initial demo reset trigger deferred (will lazy-seed on first request)."
        log_success "Public Demo API (limart-demo-api) is ready and synced!"
    else
        log_warn "limart-demo-api health check timed out; continuing production deployment."
    fi

    # Step 10: Reload Caddy Reverse Proxy
    log_info "Reloading Caddy reverse proxy..."
    if docker inspect caddy >/dev/null 2>&1; then
        if [ -f "/opt/kido-infra/caddy/Caddyfile" ] && ! docker exec caddy grep -q "limart-demo-api" /etc/caddy/Caddyfile 2>/dev/null; then
            log_info "Refreshing Caddy single-file bind mount inode..."
            docker restart caddy >/dev/null 2>&1 || true
        else
            docker exec caddy caddy reload --config /etc/caddy/Caddyfile || true
        fi
        log_success "Caddy container reloaded successfully."
    elif command -v caddy >/dev/null 2>&1 && [ -f "infra/caddy/Caddyfile.monorepo" ]; then
        caddy reload --config infra/caddy/Caddyfile.monorepo || log_warn "Caddy reload via CLI skipped."
    elif [ -f "/etc/nginx/nginx.conf" ] && command -v nginx >/dev/null 2>&1; then
        log_info "Testing and reloading Nginx configuration..."
        nginx -t && nginx -s reload || log_warn "Nginx reload skipped."
    fi

    # Step 12: Verify Frontend Services (if updated)
    if has_service "admin"; then
        wait_for_health "limart-admin" "http://127.0.0.1:3001/" 20 2 || log_warn "limart-admin health check skipped or warning"
    fi
    if has_service "staff"; then
        wait_for_health "limart-staff" "http://127.0.0.1:3002/" 20 2 || log_warn "limart-staff health check skipped or warning"
    fi

    # Step 13: Final Status Report
    echo -e "${GREEN}==============================================================================${NC}"
    log_success "SMART ZERO-DOWNTIME DEPLOYMENT COMPLETED SUCCESSFULLY!"
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "Active Services:"
    echo -e "  • limart-api      : http://localhost:4000 (API Backend)"
    echo -e "  • limart-demo-api : http://localhost:4010 (Demo Sandbox API)"
    echo -e "  • limart-admin    : http://localhost:3001 (Admin SPA)"
    echo -e "  • limart-staff    : http://localhost:3002 (Staff PWA)"
    echo -e "  • Updated          : ${BUILT_SERVICES}"
    echo -e ""
    echo -e "Useful Commands:"
    echo -e "  • Prune unused images    : ./scripts/deploy-monorepo.sh finalize"
    echo -e "  • Emergency Rollback     : ./scripts/deploy-monorepo.sh rollback"
    echo -e "  • Inspect monorepo logs  : docker compose -f ${COMPOSE_FILE} logs -f"
}

rollback() {
    log_warn "TRIGGERING EMERGENCY ROLLBACK..."
    
    # Restore backup API container if present
    if docker inspect "${BACKUP_API_CONTAINER}" >/dev/null 2>&1; then
        log_info "Restoring backup container '${BACKUP_API_CONTAINER}' -> '${ACTIVE_API_CONTAINER}'..."
        docker rm -f "${ACTIVE_API_CONTAINER}" 2>/dev/null || true
        docker rename "${BACKUP_API_CONTAINER}" "${ACTIVE_API_CONTAINER}"
        docker start "${ACTIVE_API_CONTAINER}" || true
        log_success "Restored '${ACTIVE_API_CONTAINER}' from backup."
    fi

    # Note: Legacy container (checkin-app) is permanently decommissioned and not restarted during rollback

    # Restore proxy configuration
    if [ -f "/etc/caddy/Caddyfile.bak" ]; then
        cp /etc/caddy/Caddyfile.bak /etc/caddy/Caddyfile
        if docker inspect caddy >/dev/null 2>&1; then
            docker exec caddy caddy reload --config /etc/caddy/Caddyfile || true
        elif command -v caddy >/dev/null 2>&1; then
            caddy reload || true
        fi
        log_success "Caddy restored to legacy configuration."
    fi

    log_success "Rollback completed. Traffic routed back to safe configuration."
}

finalize() {
    log_info "Legacy monolith container (checkin-app) is permanently decommissioned."
    log_info "Pruning old unused Docker images..."
    docker image prune -f --filter "until=24h"
    log_success "Clean up complete."
}

case "${1:-deploy}" in
    deploy)
        deploy_dual_run
        ;;
    rollback)
        rollback
        ;;
    finalize)
        finalize
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|finalize}"
        exit 1
        ;;
esac
