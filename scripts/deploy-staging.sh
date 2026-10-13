#!/usr/bin/env bash
# ==============================================================================
# Script: deploy-staging.sh
# Purpose: Autonomous deploy script for Staging Canary (limart2.khanhdp.com)
# Architecture: Smart Selective Blue-Green Atomic Swap for Zero-Downtime Deployment
# ==============================================================================

set -euo pipefail

STAGING_DIR="/opt/limart"
CADDYFILE="/opt/kido-infra/caddy/Caddyfile"
NETWORK_NAME="ops_bridge"
ACTIVE_CONTAINER="limart-api"
CANDIDATE_CONTAINER="${ACTIVE_CONTAINER}_next"
BACKUP_CONTAINER="${ACTIVE_CONTAINER}_old"
HEALTH_TIMEOUT=45
DRAIN_SECONDS=3

# Target services to pull & restart (e.g. "api admin staff", "staff", "api")
# Default: all services if BUILT_SERVICES is unset
if [ -z "${BUILT_SERVICES+x}" ]; then
    BUILT_SERVICES="api admin staff"
fi

has_service() {
    local svc="$1"
    [[ " ${BUILT_SERVICES} " =~ [[:space:]]${svc}[[:space:]] ]]
}

echo "=================================================================="
echo "🚀 [STAGING DEPLOY] Initializing Smart Zero-Downtime Staging Deployment"
echo "   Active Container:    ${ACTIVE_CONTAINER}"
echo "   Candidate Container: ${CANDIDATE_CONTAINER}"
echo "   Backup Container:    ${BACKUP_CONTAINER}"
echo "   Network:             ${NETWORK_NAME}"
echo "   Built Services:      ${BUILT_SERVICES}"
echo "=================================================================="

# 1. Ensure staging directory exists
mkdir -p "${STAGING_DIR}"
cd "${STAGING_DIR}"

# Auto-source production environment file if present on VPS (provides GOOGLE_CLIENT_ID/SECRET without repo secrets)
if [ -f "/opt/limart/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source /opt/limart/.env
    set +a
elif [ -f "/opt/checkin-app/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source /opt/checkin-app/.env
    set +a
fi

# 2. Ensure shared network exists
if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
    echo "[STAGING DEPLOY] Creating docker network '${NETWORK_NAME}'..."
    docker network create "${NETWORK_NAME}"
fi

# 3. Download or sync staging compose file
if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -sSLf -H "Authorization: token $GITHUB_TOKEN" "https://raw.githubusercontent.com/khanhduong22/limart/main/docker-compose.staging.yml" -o docker-compose.yml
else
    curl -sSLf "https://raw.githubusercontent.com/khanhduong22/limart/main/docker-compose.staging.yml" -o docker-compose.yml
fi

# 4. Pull pre-built staging images from GHCR
echo "[STAGING DEPLOY] Logging into GHCR if credentials present..."
if [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-khanhduong22}" --password-stdin
fi

PULL_TARGETS=()
if has_service "api"; then PULL_TARGETS+=("limart-api"); fi
if has_service "admin"; then PULL_TARGETS+=("limart-admin"); fi
if has_service "staff"; then PULL_TARGETS+=("limart-staff"); fi

if [ ${#PULL_TARGETS[@]} -gt 0 ]; then
    echo "[STAGING DEPLOY] Pulling updated staging images: ${PULL_TARGETS[*]}..."
    docker compose pull "${PULL_TARGETS[@]}"
else
    echo "[STAGING DEPLOY] No updated service images to pull."
fi

# 5. Launch/update frontend static containers (limart-admin, limart-staff)
FRONTEND_TARGETS=()
if has_service "admin" || ! docker inspect limart-admin >/dev/null 2>&1; then
    FRONTEND_TARGETS+=("limart-admin")
fi
if has_service "staff" || ! docker inspect limart-staff >/dev/null 2>&1; then
    FRONTEND_TARGETS+=("limart-staff")
fi

if [ ${#FRONTEND_TARGETS[@]} -gt 0 ]; then
    echo "[STAGING DEPLOY] Launching frontend containers: ${FRONTEND_TARGETS[*]}..."
    docker compose up -d --no-deps "${FRONTEND_TARGETS[@]}"
else
    echo "[STAGING DEPLOY] Skipping frontend container restart (neither admin nor staff modified)."
fi

# 6. Blue-Green Zero-Downtime Rollout for limart-api (Only if API changed or active container missing)
if has_service "api" || ! docker inspect "${ACTIVE_CONTAINER}" >/dev/null 2>&1; then
    echo "[STAGING DEPLOY] Processing blue-green deployment for limart-api..."
    API_IMAGE=$(docker compose config --images 2>/dev/null | grep 'checkin-api' | head -n1 || echo "ghcr.io/khanhduong22/limart/checkin-api:staging")
    if [ -z "${API_IMAGE}" ]; then
        API_IMAGE="ghcr.io/khanhduong22/limart/checkin-api:staging"
    fi

    # 7. Blue-Green Candidate Container Launch for limart-api
    echo "[STAGING DEPLOY] Starting candidate container '${CANDIDATE_CONTAINER}' using image '${API_IMAGE}'..."
    docker rm -f "${CANDIDATE_CONTAINER}" 2>/dev/null || true

    docker run -d \
      --name "${CANDIDATE_CONTAINER}" \
      --network "${NETWORK_NAME}" \
      --init \
      --restart unless-stopped \
      --label "com.docker.compose.project=limart" \
      --label "com.docker.compose.service=limart-api" \
      -e PORT=4000 \
      -e NODE_ENV=production \
      -e DATABASE_URL="postgresql://kido:KidoVPS2026!@limart-db:5432/checkin_db?sslmode=disable&connection_limit=10&pool_timeout=15" \
      -e REDIS_URL="redis://limart-valkey:6379" \
      -e MEILISEARCH_HOST="http://meilisearch:7700" \
      -e MEILISEARCH_KEY="kt_meilisearch_master_key_2026_safe" \
      -e NEXTAUTH_SECRET="checkin-app-jwt-secret-monorepo-safe-2026" \
      -e GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" \
      -e GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}" \
      -e ADMIN_PIN="${ADMIN_PIN:-2202}" \
      -e CRON_SECRET="${CRON_SECRET:-a21e2ad85126de9699d09872a2034011}" \
      -m 256m \
      "${API_IMAGE}"

    # 8. Verify database connection in candidate container (Production Dual-Run Safety: NO auto db push)
    echo "[STAGING DEPLOY] Verifying database connection in candidate container..."
    docker exec "${CANDIDATE_CONTAINER}" node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.\$queryRaw\`SELECT 1\`.then(() => {
      console.log('✅ Database connection to checkin_db verified successfully.');
      process.exit(0);
    }).catch((err) => {
      console.error('❌ Database connection check failed:', err.message);
      process.exit(1);
    });
    " || true

    # 9. Healthcheck probe candidate container (Timeout: 45s)
    echo "[STAGING DEPLOY] Probing candidate container internal /health endpoint (timeout: ${HEALTH_TIMEOUT}s)..."
    START_TIME=$(date +%s)
    CANDIDATE_HEALTHY=false

    while true; do
      CURRENT_TIME=$(date +%s)
      ELAPSED=$((CURRENT_TIME - START_TIME))

      if [ "$ELAPSED" -ge "$HEALTH_TIMEOUT" ]; then
        break
      fi

      if docker exec "${CANDIDATE_CONTAINER}" wget -q -O - http://127.0.0.1:4000/health 2>/dev/null | grep -q '"status":'; then
        CANDIDATE_HEALTHY=true
        echo "✅ [STAGING DEPLOY] Candidate container '${CANDIDATE_CONTAINER}' is HEALTHY in ${ELAPSED}s!"
        break
      fi

      echo "⏳ [STAGING DEPLOY] Waiting for candidate /health... (${ELAPSED}s/${HEALTH_TIMEOUT}s)"
      sleep 2
    done

    # 10. Auto-Rollback if Candidate Fails Healthcheck
    if [ "$CANDIDATE_HEALTHY" != true ]; then
      echo "❌ [STAGING DEPLOY] Candidate healthcheck probe TIMED OUT after ${HEALTH_TIMEOUT}s! Initiating rollback..."
      echo "[STAGING DEPLOY] Capturing candidate logs before aborting:"
      docker logs --tail 60 "${CANDIDATE_CONTAINER}" || true

      echo "🛡️ [STAGING DEPLOY] Purging candidate container '${CANDIDATE_CONTAINER}'..."
      docker rm -f "${CANDIDATE_CONTAINER}" 2>/dev/null || true

      echo "✅ [STAGING DEPLOY] Candidate discarded. Active container '${ACTIVE_CONTAINER}' remains 100% active. Zero downtime preserved."
      exit 1
    fi

    # 11. Atomic Container Rename Swap
    echo "🔄 [STAGING DEPLOY] Executing atomic container rename swap..."
    docker rm -f "${BACKUP_CONTAINER}" 2>/dev/null || true

    if docker inspect "${ACTIVE_CONTAINER}" >/dev/null 2>&1; then
      echo "[STAGING DEPLOY] Renaming active '${ACTIVE_CONTAINER}' -> '${BACKUP_CONTAINER}'..."
      docker rename "${ACTIVE_CONTAINER}" "${BACKUP_CONTAINER}"
    fi

    echo "[STAGING DEPLOY] Promoting candidate '${CANDIDATE_CONTAINER}' -> '${ACTIVE_CONTAINER}'..."
    docker rename "${CANDIDATE_CONTAINER}" "${ACTIVE_CONTAINER}"
    echo "✅ [STAGING DEPLOY] Successfully promoted '${CANDIDATE_CONTAINER}' to '${ACTIVE_CONTAINER}'!"

    # 13. Drain in-flight connections on old container and cleanup
    if docker inspect "${BACKUP_CONTAINER}" >/dev/null 2>&1; then
      echo "⏳ [STAGING DEPLOY] Draining in-flight requests on '${BACKUP_CONTAINER}' for ${DRAIN_SECONDS}s..."
      sleep "${DRAIN_SECONDS}"
      echo "🧹 [STAGING DEPLOY] Removing drained backup container '${BACKUP_CONTAINER}'..."
      docker rm -f "${BACKUP_CONTAINER}" 2>/dev/null || true
    fi
else
    echo "[STAGING DEPLOY] Skipping API deployment (limart-api unchanged & already active)."
fi

# 12. Configure & Reload Caddy Reverse Proxy
if [ -f "${CADDYFILE}" ]; then
  if ! grep -q "limart2.khanhdp.com" "${CADDYFILE}"; then
    echo "[STAGING DEPLOY] Appending limart2.khanhdp.com block to Caddyfile..."
    printf '\nlimart2.khanhdp.com {\n\timport cf_ssl\n\timport no_robots\n\thandle /api/* {\n\t\treverse_proxy limart-api:4000\n\t}\n\thandle /health* {\n\t\treverse_proxy limart-api:4000\n\t}\n\thandle /admin* {\n\t\treverse_proxy limart-admin:3001\n\t}\n\thandle /* {\n\t\treverse_proxy limart-staff:3002\n\t}\n}\n' >> "${CADDYFILE}"
  fi
fi

echo "🌐 [STAGING DEPLOY] Gracefully reloading Caddy reverse proxy..."
if docker inspect caddy >/dev/null 2>&1; then
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile || true
fi

echo "=================================================================="
echo "🎉 [STAGING DEPLOY] Smart Zero-Downtime Deployment to limart2.khanhdp.com completed successfully!"
echo "   Updated Services: ${BUILT_SERVICES}"
echo "=================================================================="
