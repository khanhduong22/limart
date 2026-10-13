# Project Directives & System Topology (limart)

================================================================================
1. CONTABO VPS HOST & RUNTIME TOPOLOGY
================================================================================
- **Host**: Contabo VPS (`144.91.88.242`) | SSH Alias: `ssh contabo` (User: `root`).
- **Network Driver**: Docker external bridge `ops_bridge` (all containers share this network).
- **Reverse Proxy**: Caddy 2 (`caddy:2-alpine`, `/opt/kido-infra/caddy/Caddyfile`).
- **SSL / TLS**: Cloudflare Origin CA wildcard + Cloudflare Full Strict Proxy.
- **Client IP Forwarding**: Caddy extracts `Cf-Connecting-Ip` and passes via `X-Forwarded-For` and `X-Real-IP`.

### Active Environment & Domain Inventory
| Environment | Domain / URL | Branch / Compose | Active Containers | Architecture |
| :--- | :--- | :--- | :--- | :--- |
| 🚀 **Production** | `https://limart.khanhdp.com`<br>`https://limart2.khanhdp.com` (Canary) | `main` (`/opt/limart`) | `limart-api` (:4000, Bun `oven/bun:1-alpine`)<br>`limart-admin` (:3001)<br>`limart-staff` (:3002) | Monorepo 3-Tier (Bun 1.3 + Hono REST API + Vite Admin SPA + Vite Staff PWA) |
| 🔄 **Backup Domain** | `https://limart3.khanhdp.com` | Caddy Redirect | None | Permanent HTTP 301 redirect ➔ `https://limart.khanhdp.com/` |
| 📦 **Legacy V1 Archive Branch** | N/A | `backup/legacy-v1-main` | None | Remote archive of original Next.js 16 monolith standalone |
| 🛑 **Legacy Monolith Directory** | N/A | `/opt/checkin-app -> /opt/limart` | None | **Decommissioned & Symlinked** (~280 MiB RAM saved) |

### Shared Backing Services
- 🗄️ **PostgreSQL 17** (`limart-db` on port 5432): Database `checkin_db`. Backed by volume `checkin-app_checkin_pgdata`. Continuous WAL archiving via pgBackRest into volume `checkin_pgbackrest_data`.
- ⚡ **Valkey 8 Cache** (`limart-valkey` on port 6389:6379): 64MB LRU cache, singleflight anti-stampede protection, jittered TTL.
- 🔍 **Meilisearch** (`meilisearch` on port 7700): Sub-50ms typo-tolerant search for unaccented Vietnamese names & tasks.

================================================================================
2. MONOREPO CODEBASE STRUCTURE
================================================================================
```
limart/
├── apps/
│   ├── admin-spa/            # Admin management dashboard (Vite + React SPA, Nginx container)
│   ├── api/                  # High-performance RESTful API (Bun 1.3 runtime + Hono, Port 4000)
│   └── staff-pwa/            # Staff attendance & tasks (Vite + React PWA, offline service worker)
├── packages/
│   ├── audit-trail/          # Cryptographic SHA-256 chained audit logger (@checkin/audit-trail)
│   ├── db/                   # Centralized Prisma client singleton & schema (@checkin/db)
│   ├── deferred-telemetry/   # Zero-TBT interaction-driven deferred telemetry & analytics (@checkin/deferred-telemetry)
│   ├── shared/               # Shared DTOs, types, helpers, and constants (@checkin/shared)
│   ├── spa-version-guard/    # Automatic SPA version checker, cache buster & service worker reloader (@checkin/spa-version-guard)
│   └── zero-downtime-deploy/ # Blue-green deployment swap orchestrator (@checkin/zero-downtime-deploy)
├── src/                      # Production Next.js 16 monolith application (v1)
├── prisma/                   # Root Prisma schema (mirrored to packages/db/prisma/schema.prisma)
├── scripts/                  # Deploy scripts (deploy-monorepo.sh, deploy-staging.sh, pgbackrest-*)
└── .agent/                   # AI Agent rules & skills
```

================================================================================
3. STRICT NON-DEV MAINTAINER PROTECTION INVARIANTS
================================================================================
> [!IMPORTANT]
> This repository is maintained by a **non-developer maintainer** using AI agents.
> All agents (Antigravity, Claude, Cursor) MUST adhere to these safety boundaries without exception:

1. **Clear, Supportive Vietnamese Communication**:
   - Explain what you are doing, why you are doing it, and the risk level (Thấp / Trung bình / Cao) before modifying code.
   - Avoid intimidating dev jargon. Provide exact copy-pasteable commands and verification steps.
2. **Trunk-Based Single Branch (`main` Only)**:
   - All bugfixes, new features, and automated CI/CD deployments flow strictly through the single `main` branch.
   - No separate staging branches or long-lived feature branches.
   - All PRs and feature branches are squashed and merged directly into `main`.
3. **Zero Destructive Database Resets (STRICTLY PROHIBITED)**:
   - 🚫 **NEVER** run `prisma migrate reset` or `prisma db push --force-reset`.
   - 🚫 **NEVER** run `docker volume rm checkin-app_checkin_pgdata` or `docker volume prune -a` on VPS.
   - 🚫 **NEVER** delete raw database records without explicit user confirmation.
   - All schema changes must be non-destructive and backward-compatible, executed via `pnpm prisma db push --skip-generate` in production CI/CD.
4. **Test Evidence Gate (Real Passing Test Output Required)**:
   - 🚫 **NEVER** declare a task complete or push a commit without running the native test suite (`bun test` or `pnpm test`) and displaying real passing test output in the session.
   - Never suppress errors with empty `catch {}` blocks or silence types with `@ts-ignore` or unchecked `any`.
5. **1-Commit Rule (Single Conventional Commit)**:
   - Every PR, bugfix, or feature branch merged to `main` MUST contain **EXACTLY ONE single commit** adhering to the Conventional Commits specification (e.g., `feat: Add QR code scanner`, `fix: Resolve token expiration edge case`).
   - Work-in-progress or ad-hoc commits must be squashed prior to merge.
6. **Zero Public Staff Lists & Strict Zero-Trust Auth (STRICT PRIVACY INVARIANT)**:
   - 🚫 **NEVER** expose employee account lists, search/dropdown selectors, or passwordless quick-switchers in client-facing applications or public API endpoints.
   - Staff authentication MUST strictly require verified Google OAuth credentials matching active database records.
   - Development debug shortcuts, mock accounts, or bypass logins must NEVER be committed to client code or deployed to staging/production environments.
7. **CI/CD Over Manual SSH Builds**:
   - 🚫 **NEVER** run `docker compose build` or `npm run build` on the remote VPS via SSH. Manual builds consume VPS CPU/RAM and bypass test gates.
   - Deployments must always flow through Git commits to GitHub Actions. SSH is reserved strictly for read-only diagnostics and safe container restarts.


================================================================================
4. CI/CD DEPLOYMENT WORKFLOWS
================================================================================
- **Unified Monorepo Deployment (`deploy-monorepo.yml`)**:
  - **Trunk-Based Trigger**: Push commit or merge to `main` (or manual trigger via `workflow_dispatch`).
  - **Automated Pipeline Stages**:
    1. **Path Filter Change Detection**: Detects which apps (`api`, `admin-spa`, `staff-pwa`) or packages were modified to build only affected targets.
    2. **Test & Quality Gate**: Executes monorepo unit tests (`bun test` / `pnpm test`) and verifies builds across shared packages before triggering any container builds.
    3. **Parallel Docker Image Builds**: Builds Docker images in parallel and pushes to GHCR (`ghcr.io/khanhduong22/limart/*:latest` and `:${{ github.sha }}`).
    4. **Blue-Green Zero-Downtime Container Swap on Port 4000**:
       - SSH invokes `scripts/deploy-monorepo.sh deploy`.
       - Pulls newly built GHCR images on the VPS.
       - Starts a candidate container (`limart-api_next`) alongside the live API container.
       - Probes HTTP health at `http://127.0.0.1:4000/health` (up to 45s retries).
       - Once healthy, seamlessly swaps container names and port 4000 bindings with zero dropped requests.
       - Drains connections on the old container (`limart-api_old`) for 3 seconds before stopping.
       - Replaces static SPA Nginx containers (`limart-admin`, `limart-staff`) and reloads Caddy reverse proxy (`caddy reload`).
- **Decommissioned Legacy Pipelines**:
  - Legacy standalone Next.js monolith pipeline (`deploy.yml`) is completely removed.
  - Multi-branch staging workflows consolidated into single trunk-based `main` pipeline.

================================================================================
5. ESSENTIAL COMMANDS CHEATSHEET
================================================================================

### Local Testing, Building & Development (Bun 1.3 / pnpm)
```bash
# Run unit tests across the monorepo (Bun / Vitest Turbo cached)
bun test
pnpm test

# Run tests for specific packages
bun test packages/deferred-telemetry
pnpm --filter @checkin/shared test
pnpm --filter @checkin/audit-trail test
pnpm --filter @checkin/api test
pnpm --filter @checkin/staff-pwa test

# Monorepo Build & Dependency Management
bun run build                 # Turbo monorepo build
bun install                   # Blazing-fast dependency sync (bun.lock)

# Run Playwright E2E browser tests
npm run test:e2e
```

### Read-Only Production & Staging Diagnostics (Safe to run)
```bash
# Check running Limart Monorepo containers
ssh contabo "docker ps --filter 'name=limart' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# Check memory status (Must maintain >= 2.0 GiB available)
ssh contabo "free -h"

# Inspect live logs via terminal
ssh contabo "docker logs --tail 100 -f limart-api"         # Hono API logs
ssh contabo "docker logs --tail 100 -f limart-admin"       # Admin SPA logs
ssh contabo "docker logs --tail 100 -f limart-staff"       # Staff PWA logs
ssh contabo "docker logs --tail 50 limart-db"              # PostgreSQL database logs
ssh contabo "docker logs --tail 50 limart-valkey"          # Valkey cache logs

# Probe HTTP health
curl -sI https://limart.khanhdp.com | head -n 5           # Prod HTTP status
curl -s https://limart.khanhdp.com/health                 # Prod API health JSON
curl -s https://limart2.khanhdp.com/health                # Canary API health JSON
```

### Safe Recovery & Restart Procedures
```bash
# Restart Monorepo 3-Tier containers (Safe: no data loss)
ssh contabo "docker restart limart-api limart-admin limart-staff"

# Reload Caddy Reverse Proxy
ssh contabo "docker exec caddy caddy reload --config /etc/caddy/Caddyfile"

# Emergency Rollback via GitHub Actions:
# Go to https://github.com/khanhduong22/checkin-app/actions -> Select last successful run -> Re-run all jobs
```

### pgBackRest Backup & Point-in-Time Recovery (PITR)
```bash
# Inspect backup status & WAL archive health
ssh contabo "docker exec -u postgres limart-db pgbackrest --stanza=checkin info"

# Trigger manual backup
ssh contabo "/opt/limart/scripts/pgbackrest-backup.sh incr"

# Rewind database to exact time before an accident (Time Travel)
ssh contabo "cd /opt/limart && ./scripts/pgbackrest-restore.sh --time 'YYYY-MM-DD HH:MM:SS'"
```

================================================================================
6. MASTER AGENT ORCHESTRATION & MANDATORY SUBAGENT DELEGATION
================================================================================
> [!IMPORTANT]
> **Strict Orchestrator Boundary**: The Master Agent in this repository is strictly an **Executive Assistant & Orchestrator**.
> - **The Master Agent MUST NOT** directly implement code, edit multi-line files, run deep debugging loops, or iterate tests in the master session.
> - **ALL engineering tasks** (coding, bug reproduction, refactoring, test suites, E2E browser tests, benchmarks, log tracing) **MUST BE DELEGATED TO SPECIALIZED SUBAGENTS**.
> - Rule: `.agent/rules/master-orchestration.md` | Skill: `.agent/skills/subagent-orchestrator/SKILL.md`.

- **Master Agent Responsibilities**: Planning, requirement clarification with maintainer (supportive Vietnamese), subagent supervision, auditing return payloads & diffs, cross-contract verification, and handover summaries.
- **Mandatory Real-Time ASAP Maintainer Telemetry**:
  The agent MUST report ASAP in clear, friendly Vietnamese to the maintainer:
  1. **Đang làm gì**: Tóm tắt ngắn gọn hành động cụ thể đang diễn ra.
  2. **Sắp làm gì**: Bước tiếp theo chuẩn bị thực hiện ngay sau đó.
  3. **Mức độ rủi ro**: Đánh giá rõ ràng (`Thấp` / `Trung bình` / `Cao`) kèm giải thích ngắn gọn nếu có rủi ro đến hệ thống hoặc dữ liệu.
- **Mandatory Subagent Naming**:
  ```text
  [YYYY-MM-DD HH:mm | #<issue>] <Descriptive Role>
  ```
  *(If no issue number exists, use: `[YYYY-MM-DD HH:mm] <Descriptive Role>`)*
  - **Examples**:
    * `[2026-10-07 11:45 | #3151] Group E2E Recording Specialist`
    * `[2026-10-07 11:45 | #payroll] Salary Calculation Auditor`
    * `[2026-10-07 11:45] Staging Canary Health Verifier`
    * `[2026-10-07 11:45] Valkey Cache Concurrency Benchmarker`
- **Durable Disk Handover Protocol**: Subagents execute changes and test suites directly on disk, returning structured summaries (files modified, test pass/fail counts, residual risks). The master agent verifies disk state and reports the executive summary to the maintainer.

================================================================================
7. MONOREPO AGENT HIERARCHY DIRECTORY
================================================================================
The LimArt monorepo maintains modular, service-scoped agent rule files. Each service inherits the root directives from this file (`@../../AGENTS.md`) and defines specialized operational invariants for its subsystem:

| Scope / Service File | Subsystem & Role | Tech Stack & Core Architectural Patterns |
| :--- | :--- | :--- |
| [`apps/api/AGENTS.md`](file://apps/api/AGENTS.md) | High-performance RESTful API | Hono REST API, Bun/Node.js 22, Repository Pattern, Zod OpenAPI, Valkey 8 Cache, Sentry APM |
| [`apps/admin-spa/AGENTS.md`](file://apps/admin-spa/AGENTS.md) | Management & Store Admin SPA | React 19, Vite SPA, Radix UI, Tailwind CSS, TanStack Table, Admin Auth Guards |
| [`apps/staff-pwa/AGENTS.md`](file://apps/staff-pwa/AGENTS.md) | Staff Attendance & Task PWA | React 19, Vite PWA, Offline Service Worker, QR Check-in, Webview breakout |
| [`packages/db/AGENTS.md`](file://packages/db/AGENTS.md) | Central Database & Schema Hub | Prisma Client singleton, schema integrity, zero destructive resets, pgBackRest PITR |
| [`packages/shared/AGENTS.md`](file://packages/shared/AGENTS.md) | Shared Types & Constants | Cross-package TypeScript interfaces, DTOs, Zod validation schemas, business constants |
| [`packages/audit-trail/AGENTS.md`](file://packages/audit-trail/AGENTS.md) | Cryptographic Audit Trail | Cryptographic SHA-256 chained audit logs, Merkle batch shift anchoring, fraud detection |
| [`packages/zero-downtime-deploy/AGENTS.md`](file://packages/zero-downtime-deploy/AGENTS.md) | Deployment Automation | Blue-green container swap orchestrator, HTTP socket drain, candidate health verification |
| [`packages/spa-version-guard/AGENTS.md`](file://packages/spa-version-guard/AGENTS.md) | Client Version Synchronization | SPA update version guard, proactive cache clearing, Service Worker auto-update prompt |
| [`packages/deferred-telemetry/README.md`](file://packages/deferred-telemetry/README.md) | Zero-TBT Deferred Telemetry | Interaction-driven analytics loader, 0ms TBT, lossless event queues (GA4, GTM, Clarity, Pixel, Sentry) |
