# ⏱️ LimArt Checkin App

> Hệ thống chấm công, quản lý ca làm việc, bảng lương (Payroll), giao việc (Task Marketplace & KPI), và Gamification nội bộ dành riêng cho **LimArt**.

---

## 🌟 Tổng Quan Hệ Thống & Môi Trường

Hệ thống hiện đang vận hành song song trên hạ tầng **Contabo VPS** (`144.91.88.242`) với reverse proxy **Caddy 2** và mạng nội bộ Docker `ops_bridge`.

| Môi Trường | Domain | Kiến Trúc | Container Hoạt Động | Database | Nhánh Git |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 🚀 **Production** | [limart.khanhdp.com](https://limart.khanhdp.com)<br>[limart2.khanhdp.com](https://limart2.khanhdp.com) (Canary) | Monorepo 3-Tier (Hono API + Vite Admin SPA + Vite Staff PWA) | `limart-api` (Port 4000)<br>`limart-admin` (Port 3001)<br>`limart-staff` (Port 3002) | PostgreSQL 17 (`limart-db:5432`) | `main` |
| 📦 **Legacy V1 Archive** | N/A | Next.js 16 Standalone (Decommissioned) | None (Đã khai tử hoàn toàn container `checkin-app`) | N/A | `backup/legacy-v1-main` |

### 🛠️ Dịch Vụ Hỗ Trợ (Shared Backing Services)
- 🗄️ **PostgreSQL 17** (`limart-db`): Cơ sở dữ liệu chính tích hợp sao lưu tự động WAL & Point-in-Time Recovery qua **pgBackRest** (`checkin_pgbackrest_data`).
- ⚡ **Valkey 8 Cache** (`limart-valkey`): Bộ nhớ đệm tốc độ cao (tương thích Redis), phân bổ 64MB LRU memory.
- 🔍 **Meilisearch** (`meilisearch`): Công cụ tìm kiếm nhân viên, tác vụ tiếng Việt không dấu siêu tốc (<50ms).
- 🌐 **Caddy 2 Reverse Proxy** (`caddy`): Quản lý SSL Cloudflare Origin CA, định tuyến traffic và forward real IP (`Cf-Connecting-Ip`).

---

## 📚 Tài Liệu Trọng Tâm (Core Documentation)

- 🤖 **[AGENTS.md](file:///Users/kido/checkin-app/AGENTS.md)**: Bản đồ hạ tầng, topology dịch vụ, quy tắc an toàn bảo vệ maintainer, lệnh chẩn đoán & phục hồi sự cố khẩn cấp (PITR).
- 🚀 **[DEPLOY.md](file:///Users/kido/checkin-app/DEPLOY.md)**: Chi tiết cấu hình CI/CD GitHub Actions, quy trình deploy Staging Blue-Green và Production.
- 📐 **[ADR 004](file:///Users/kido/checkin-app/docs/adr/0004-bun-migration-and-deferred-telemetry.md)**: Quyết định kiến trúc chuyển đổi toàn diện Bun 1.3, Deferred Telemetry (0ms TBT), và Server-Timing APM.

---

## 💻 Cấu Trúc Dự Án (Monorepo)

```
checkin-app/
├── apps/
│   ├── admin-spa/            # Web quản trị dành cho Admin (Vite + React SPA)
│   ├── api/                  # Backend REST API hiệu năng cao (Bun 1.3 + Hono, Port 4000)
│   └── staff-pwa/            # Ứng dụng PWA dành cho nhân viên chấm công (Vite + React PWA)
├── packages/
│   ├── audit-trail/          # Thư viện ghi vết kiểm toán mật mã SHA-256 (@checkin/audit-trail)
│   ├── db/                   # Prisma Client, schema và cấu hình kết nối DB dùng chung (@checkin/db)
│   ├── deferred-telemetry/   # Zero-TBT interaction-driven deferred telemetry & analytics (@checkin/deferred-telemetry)
│   ├── shared/               # Kiểu dữ liệu (Types), DTOs, hằng số và tiện ích dùng chung (@checkin/shared)
│   ├── spa-version-guard/    # Tự động đồng bộ phiên bản SPA và xoá cache client (@checkin/spa-version-guard)
│   └── zero-downtime-deploy/ # Bộ điều phối deploy Blue-Green và Graceful Shutdown
├── docs/
│   └── adr/                  # Kiến trúc & Quyết định kỹ thuật (Architecture Decision Records)
├── prisma/                   # Root Prisma schema
├── docker/                   # Dockerfile tùy chỉnh (PostgreSQL 17 + pgBackRest)
├── scripts/                  # Scripts deploy, backup, sync database
├── .agent/                   # Cấu hình AI Agent (Rules, Skills, Workflows)
├── docker-compose.yml        # Docker Compose chuẩn cho Monorepo 3-Tier (Production & Local)
├── docker-compose.staging.yml# Docker Compose cho Staging Canary v2
└── docker-compose.monorepo.yml# Mirror đồng bộ với docker-compose.yml (Hỗ trợ CI/CD)
```

---

## 🚀 Hướng Dẫn Phát Triển Cục Bộ (Local Development)

### 1. Yêu Cầu Cài Đặt
- **Bun**: v1.3+ (`curl -fsSL https://bun.sh/install | bash`)
- **Node.js**: v20+ / **pnpm**: v10+ (Hỗ trợ kép)
- **Docker & Docker Compose**: (Tùy chọn nếu chạy DB cục bộ)

### 2. Cài Đặt Dependencies
```bash
bun install
# hoặc pnpm install
```

### 3. Cấu Hình Môi Trường (.env)
Sao chép `.env.example` thành `.env.local` hoặc `.env`:
```bash
cp .env.example .env.local
```

### 4. Khởi Chạy Local Dev
- **Chạy toàn bộ Monorepo v2**:
  ```bash
  bun run dev
  # hoặc pnpm dev
  ```
- **Chạy riêng từng ứng dụng**:
  ```bash
  bun --filter @checkin/api dev       # Chạy API backend (Port 4000)
  bun --filter @checkin/admin-spa dev # Chạy Admin SPA (Port 3001)
  bun --filter @checkin/staff-pwa dev # Chạy Staff PWA (Port 3002)
  ```

---

## 🧪 Kiểm Thử (Testing)

Trước khi commit hoặc deploy, luôn đảm bảo tất cả test cases đều pass:

```bash
# Chạy toàn bộ test suites trong monorepo (Bun / Vitest Turbo cache)
bun test
pnpm test

# Chạy test riêng cho từng package
bun test packages/deferred-telemetry
pnpm --filter @checkin/api test
pnpm --filter @checkin/admin-spa test
pnpm --filter @checkin/staff-pwa test
pnpm --filter @checkin/shared test
pnpm --filter @checkin/audit-trail test

# Chạy End-to-End (E2E) tests với Playwright
npm run test:e2e
```

---

## 🔄 Quy Trình Triển Khai (CI/CD Deployment)

Mọi hoạt động triển khai đều được tự động hóa qua **GitHub Actions** (Trunk-based workflow):
1. **Pipeline Thống Nhất (`.github/workflows/deploy-monorepo.yml`)**: Kích hoạt khi push/merge commit vào nhánh `main`.
2. **Quy trình triển khai**:
   - Tự động phát hiện thay đổi theo app/package để build ảnh Docker tương ứng.
   - Chạy test toàn bộ monorepo (`pnpm test`).
   - Push ảnh Docker lên GHCR và SSH kích hoạt Blue-Green atomic zero-downtime swap trên VPS (`scripts/deploy-monorepo.sh`).
   - Đảm bảo không gián đoạn dịch vụ dù chỉ 1 giây.

> ⚠️ **LƯU Ý QUAN TRỌNG**:
> - Tuyệt đối không tự ý build thủ công trên VPS qua SSH.
> - Tuyệt đối KHÔNG chạy `prisma migrate reset` hoặc xóa volume `checkin_pgdata`.
> - Xem chi tiết tại [AGENTS.md](file:///Users/kido/checkin-app/AGENTS.md) và [DEPLOY.md](file:///Users/kido/checkin-app/DEPLOY.md).

---

## 🛡️ Hỗ Trợ & Giám Sát (Monitoring)

- 📊 **CPU / RAM / Disk Telemetry**: [Beszel Hub](https://beszel.khanhdp.com)
- 📜 **Xem Docker Logs Trực Tiếp**: [Dozzle](https://dozzle.khanhdp.com)
- 🚨 **Cảnh Báo Uptime / Downtime**: [Uptime Kuma](https://kuma.khanhdp.com)
