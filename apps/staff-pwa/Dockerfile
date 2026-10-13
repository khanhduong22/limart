# Multi-stage Dockerfile for @checkin/staff-pwa
# Stage 1: Build static assets using Vite PWA
FROM oven/bun:1-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace configurations
COPY package.json bun.lock* tsconfig.base.json ./
COPY apps/staff-pwa/package.json ./apps/staff-pwa/
COPY packages/ ./packages/

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source code
COPY apps/staff-pwa/ ./apps/staff-pwa/

# Build shared packages first, then build Vite PWA bundle
RUN bun --filter @checkin/shared build 2>/dev/null || true
RUN bun --filter @checkin/spa-version-guard build 2>/dev/null || true
RUN bun --filter @checkin/deferred-telemetry build 2>/dev/null || true
RUN bun --filter @checkin/staff-pwa build

# Stage 2: Serve static files with Nginx Alpine (~15MB RAM footprint)
FROM nginx:1.27-alpine AS runner

# Copy custom Nginx configuration with strict PWA caching rules
COPY apps/staff-pwa/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets
COPY --from=builder /app/apps/staff-pwa/dist /usr/share/nginx/html

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3002/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
