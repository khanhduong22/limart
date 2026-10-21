#!/usr/bin/env bash
# ==============================================================================
# Script: sync-demo-documents.sh
# Purpose: Idempotent synchronization of RAG knowledge base (Document + DocumentChunk)
#          from checkin_db (Production) to checkin_demo_db (Public Demo Sandbox)
#          with automated phone number masking (0905330729 -> 0905.xxx.xxx)
#          and halfvec(3072) HNSW + tsvector GIN index verification.
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

FORCE_SYNC="${1:-false}"

# Ensure limart-db container is running
if ! docker inspect limart-db >/dev/null 2>&1; then
    log_warn "Container 'limart-db' not found. Skipping demo document sync."
    exit 0
fi

if [ "$(docker inspect -f '{{.State.Running}}' limart-db 2>/dev/null)" != "true" ]; then
    log_warn "Container 'limart-db' is not running. Skipping demo document sync."
    exit 0
fi

# Ensure both databases exist
if ! docker exec limart-db psql -U kido -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'checkin_db'" 2>/dev/null | grep -q 1; then
    log_warn "Production database 'checkin_db' does not exist. Skipping."
    exit 0
fi

if ! docker exec limart-db psql -U kido -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'checkin_demo_db'" 2>/dev/null | grep -q 1; then
    log_warn "Demo database 'checkin_demo_db' does not exist yet. Skipping."
    exit 0
fi

log_info "Inspecting RAG knowledge base in checkin_db and checkin_demo_db..."

PROD_DOCS=$(docker exec limart-db psql -U kido -d checkin_db -t -c 'SELECT count(*) FROM "Document";' 2>/dev/null | tr -d ' ' || echo "0")
PROD_CHUNKS=$(docker exec limart-db psql -U kido -d checkin_db -t -c 'SELECT count(*) FROM "DocumentChunk";' 2>/dev/null | tr -d ' ' || echo "0")
DEMO_DOCS=$(docker exec limart-db psql -U kido -d checkin_demo_db -t -c 'SELECT count(*) FROM "Document";' 2>/dev/null | tr -d ' ' || echo "0")
DEMO_CHUNKS=$(docker exec limart-db psql -U kido -d checkin_demo_db -t -c 'SELECT count(*) FROM "DocumentChunk";' 2>/dev/null | tr -d ' ' || echo "0")
DEMO_PHONE_LEAKS=$(docker exec limart-db psql -U kido -d checkin_demo_db -t -c "SELECT count(*) FROM \"DocumentChunk\" WHERE content LIKE '%0905330729%';" 2>/dev/null | tr -d ' ' || echo "0")

log_info "Current counts:"
log_info "  • checkin_db      : ${PROD_DOCS} Documents, ${PROD_CHUNKS} DocumentChunks"
log_info "  • checkin_demo_db : ${DEMO_DOCS} Documents, ${DEMO_CHUNKS} DocumentChunks (${DEMO_PHONE_LEAKS} phone leaks)"

# Idempotency Gate:
# Sync if --force, or demo chunks < 40, or demo count does not match prod count, or phone leak exists
NEEDS_SYNC=false

if [ "${FORCE_SYNC}" = "--force" ] || [ "${FORCE_SYNC}" = "force" ]; then
    NEEDS_SYNC=true
    log_info "Sync triggered by --force flag."
elif [ "${PROD_CHUNKS}" -gt 0 ] && [ "${DEMO_CHUNKS}" -lt 40 ]; then
    NEEDS_SYNC=true
    log_info "Sync triggered: checkin_demo_db has only ${DEMO_CHUNKS} DocumentChunks (< 40 threshold)."
elif [ "${DEMO_PHONE_LEAKS}" -gt 0 ]; then
    NEEDS_SYNC=true
    log_info "Sync triggered: checkin_demo_db contains ${DEMO_PHONE_LEAKS} unmasked phone number(s)."
elif [ "${PROD_DOCS}" -gt 0 ] && [ "${DEMO_DOCS}" -ne "${PROD_DOCS}" ]; then
    NEEDS_SYNC=true
    log_info "Sync triggered: Document count mismatch (${DEMO_DOCS} demo vs ${PROD_DOCS} prod)."
elif [ "${PROD_CHUNKS}" -gt 0 ] && [ "${DEMO_CHUNKS}" -ne "${PROD_CHUNKS}" ]; then
    NEEDS_SYNC=true
    log_info "Sync triggered: DocumentChunk count mismatch (${DEMO_CHUNKS} demo vs ${PROD_CHUNKS} prod)."
fi

if [ "${NEEDS_SYNC}" != "true" ]; then
    log_success "✅ checkin_demo_db is already in sync with checkin_db (${DEMO_DOCS} docs, ${DEMO_CHUNKS} chunks, 0 leaks). Skipping."
    exit 0
fi

echo -e "${CYAN}==============================================================================${NC}"
echo -e "${CYAN}🚀 STARTING RAG SYNC: checkin_db -> checkin_demo_db (Masked 0905330729)${NC}"
echo -e "${CYAN}==============================================================================${NC}"

# Step 1: Ensure vector extension exists in checkin_demo_db
docker exec limart-db psql -U kido -d checkin_demo_db -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 || true

# Step 2: Clean slate truncate in checkin_demo_db
log_info "Step 1/5: Truncating existing Document and DocumentChunk in checkin_demo_db..."
docker exec limart-db psql -U kido -d checkin_demo_db -c 'TRUNCATE TABLE "DocumentChunk", "Document" CASCADE;' >/dev/null

# Step 3: Stream Document with phone masking
log_info "Step 2/5: Copying Document records with phone masking (0905330729 -> 0905.xxx.xxx)..."
docker exec limart-db psql -U kido -d checkin_db -c '\copy (SELECT id, title, path, regexp_replace(content, '\''0905330729'\'', '\''0905.xxx.xxx'\'', '\''g'\''), "createdAt", "updatedAt", "tenantId" FROM "Document") TO STDOUT' \
    | docker exec -i limart-db psql -U kido -d checkin_demo_db -c '\copy "Document" (id, title, path, content, "createdAt", "updatedAt", "tenantId") FROM STDIN'

# Step 4: Stream DocumentChunk with phone masking & vector(3072) embeddings
log_info "Step 3/5: Copying DocumentChunk records with vector(3072) embeddings & phone masking..."
docker exec limart-db psql -U kido -d checkin_db -c '\copy (SELECT id, "documentId", regexp_replace(content, '\''0905330729'\'', '\''0905.xxx.xxx'\'', '\''g'\''), embedding, "createdAt" FROM "DocumentChunk") TO STDOUT' \
    | docker exec -i limart-db psql -U kido -d checkin_demo_db -c '\copy "DocumentChunk" (id, "documentId", content, embedding, "createdAt") FROM STDIN'

# Step 5: Ensure HNSW halfvec(3072) and GIN tsvector indexes exist
log_info "Step 4/5: Rebuilding/Verifying halfvec(3072) HNSW and tsvector GIN indexes in checkin_demo_db..."
docker exec limart-db psql -U kido -d checkin_demo_db -c '
  CREATE INDEX IF NOT EXISTS "idx_document_chunk_halfvec_hnsw" ON "DocumentChunk" USING hnsw (((embedding)::halfvec(3072)) halfvec_cosine_ops);
  CREATE INDEX IF NOT EXISTS "idx_document_chunk_tsvector" ON "DocumentChunk" USING gin (to_tsvector('\''simple'\'', content));
  CREATE INDEX IF NOT EXISTS "idx_document_chunk_content_gin" ON "DocumentChunk" USING gin (to_tsvector('\''simple'\'', content));
  CREATE TABLE IF NOT EXISTS "SemanticQaCache" (
    "id" TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT '\''limart'\'',
    "normalizedQuery" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sources" JSONB,
    "embedding" vector,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "idx_semantic_qa_cache_halfvec_hnsw" ON "SemanticQaCache" USING hnsw (((embedding)::halfvec(3072)) halfvec_cosine_ops);
' >/dev/null

# Step 6: Invalidate demo Valkey cache & warm up Meilisearch
log_info "Step 5/5: Clearing demo Valkey caches & syncing Meilisearch..."
if docker inspect limart-valkey >/dev/null 2>&1 && [ "$(docker inspect -f '{{.State.Running}}' limart-valkey 2>/dev/null)" = "true" ]; then
    docker exec limart-valkey valkey-cli -n 2 EVAL "local keys = redis.call('keys', 'meta:documents:*') for i=1,#keys,5000 do redis.call('del', unpack(keys, i, math.min(i+4999, #keys))) end return #keys" 0 >/dev/null 2>&1 || true
    docker exec limart-valkey valkey-cli -n 2 EVAL "local keys = redis.call('keys', 'capy:*') for i=1,#keys,5000 do redis.call('del', unpack(keys, i, math.min(i+4999, #keys))) end return #keys" 0 >/dev/null 2>&1 || true
    log_info "Flushed demo metadata & RAG caches in Valkey DB 2."
fi

# Configure Meilisearch filterableAttributes and sync documents if limart-demo-api is running
if docker inspect limart-demo-api >/dev/null 2>&1 && [ "$(docker inspect -f '{{.State.Running}}' limart-demo-api 2>/dev/null)" = "true" ]; then
    log_info "Triggering Meilisearch document index update via limart-demo-api..."
    docker exec limart-demo-api bun -e "
      (async () => {
        try {
          const { Meilisearch } = require('meilisearch');
          const host = process.env.MEILISEARCH_HOST || 'http://meilisearch:7700';
          const apiKey = process.env.MEILISEARCH_KEY || '';
          const client = new Meilisearch({ host, apiKey, timeout: 3000 });
          const index = client.index('documents');
          await index.updateSettings({
            filterableAttributes: ['tenantId'],
            searchableAttributes: ['title', 'content', 'path']
          }).catch(() => {});
          
          const { prisma } = require('@checkin/db');
          const docs = await prisma.document.findMany();
          if (docs.length > 0) {
            await index.addDocuments(docs.map(d => ({
              id: d.id,
              path: d.path,
              title: d.title,
              content: d.content,
              tenantId: d.tenantId || 'limart'
            })), { primaryKey: 'id' }).catch(() => {});
          }
        } catch {}
      })().then(() => process.exit(0)).catch(() => process.exit(0));
    " >/dev/null 2>&1 || true
    
    # Warm up document cache
    docker exec limart-demo-api wget -q -O /dev/null http://127.0.0.1:4010/api/documents >/dev/null 2>&1 || true
fi

# Final Verification
FINAL_DEMO_DOCS=$(docker exec limart-db psql -U kido -d checkin_demo_db -t -c 'SELECT count(*) FROM "Document";' 2>/dev/null | tr -d ' ' || echo "0")
FINAL_DEMO_CHUNKS=$(docker exec limart-db psql -U kido -d checkin_demo_db -t -c 'SELECT count(*) FROM "DocumentChunk";' 2>/dev/null | tr -d ' ' || echo "0")
FINAL_PHONE_LEAKS=$(docker exec limart-db psql -U kido -d checkin_demo_db -t -c "SELECT count(*) FROM \"DocumentChunk\" WHERE content LIKE '%0905330729%';" 2>/dev/null | tr -d ' ' || echo "0")
FINAL_MASKED_COUNT=$(docker exec limart-db psql -U kido -d checkin_demo_db -t -c "SELECT count(*) FROM \"DocumentChunk\" WHERE content LIKE '%0905.xxx.xxx%';" 2>/dev/null | tr -d ' ' || echo "0")

echo -e "${GREEN}==============================================================================${NC}"
log_success "DEMO RAG KNOWLEDGE BASE SYNC COMPLETE!"
echo -e "${GREEN}==============================================================================${NC}"
echo -e "  • Synced Documents     : ${FINAL_DEMO_DOCS}/${PROD_DOCS}"
echo -e "  • Synced DocumentChunks : ${FINAL_DEMO_CHUNKS}/${PROD_CHUNKS}"
echo -e "  • Leaked phone numbers : ${FINAL_PHONE_LEAKS} (Target: 0)"
echo -e "  • Masked phone numbers : ${FINAL_MASKED_COUNT} (Expected: 2)"

if [ "${FINAL_PHONE_LEAKS}" -ne 0 ]; then
    log_error "SECURITY VIOLATION: Found ${FINAL_PHONE_LEAKS} unmasked phone number(s) in checkin_demo_db!"
    exit 1
fi

if [ "${FINAL_DEMO_CHUNKS}" -lt 40 ]; then
    log_error "VERIFICATION FAILED: checkin_demo_db DocumentChunks (${FINAL_DEMO_CHUNKS}) < 40!"
    exit 1
fi

log_success "Verification passed: All checks green."
