# Multi-stage Dockerfile for @checkin/admin-spa
# Stage 1: Build static assets using Vite
FROM oven/bun:1-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace configurations
COPY package.json bun.lock* tsconfig.base.json ./
COPY apps/admin-spa/package.json ./apps/admin-spa/
COPY packages/ ./packages/

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source code
COPY apps/admin-spa/ ./apps/admin-spa/

# Build shared packages first, then build Vite SPA bundle
RUN bun --filter @checkin/spa-version-guard build 2>/dev/null || true
RUN bun --filter @checkin/deferred-telemetry build 2>/dev/null || true
RUN bun --filter @checkin/admin-spa build

# Stage 2: Serve static files with Nginx Alpine (~15MB RAM footprint)
FROM nginx:1.27-alpine AS runner

# Copy custom Nginx configuration
COPY apps/admin-spa/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets into both root and /admin subdirectory for prefix routing
COPY --from=builder /app/apps/admin-spa/dist /usr/share/nginx/html
COPY --from=builder /app/apps/admin-spa/dist /usr/share/nginx/html/admin

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3001/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
