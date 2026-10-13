# Multi-stage Dockerfile for @checkin/api using Bun
# Stage 1: Build
FROM oven/bun:1-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN bun install --frozen-lockfile || bun install

COPY apps/api/ ./apps/api/
RUN bun --filter @checkin/shared build 2>/dev/null || true
RUN bun --filter @checkin/audit-trail build 2>/dev/null || true
RUN bun --filter @checkin/zero-downtime-deploy build 2>/dev/null || true
RUN bun --filter @checkin/db generate 2>/dev/null || true
RUN bun --filter @checkin/api build

# Stage 2: Runner
FROM oven/bun:1-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/ ./packages/

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

CMD ["bun", "apps/api/dist/index.js"]
