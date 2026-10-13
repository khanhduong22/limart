# 🚀 Deployment & Operations Guide (3-Tier Monorepo)

Tài liệu này cung cấp toàn bộ kiến trúc, quy trình triển khai (CI/CD), quản lý biến môi trường, bảo vệ cơ sở dữ liệu và cẩm nang vận hành cho hệ thống **LimArt Checkin App** trên **Contabo VPS**.

---

## 🏗️ 1. Kiến Trúc Hạ Tầng & Topology Hệ Thống

Hệ thống hoạt động trên máy chủ **Contabo VPS** (`144.91.88.242`), toàn bộ container dùng chung Docker external network `ops_bridge` và được reverse proxy qua **Caddy 2**:

```mermaid
graph TD
    User["👤 Khách hàng / Nhân viên / Quản lý"] --> CF["Cloudflare Full Strict SSL + Proxy"]
    CF --> Caddy["🌐 Caddy 2 Reverse Proxy (ops_bridge)"]
    
    subgraph Production ["🚀 Production: limart.khanhdp.com (Canary: limart2)"]
        Caddy -->|"/api/* & /health*"| Api["limart-api (:4000)"]
        Caddy -->|"/admin*"| Admin["limart-admin (:3001)"]
        Caddy -->|"/*"| Staff["limart-staff (:3002)"]
    end

    subgraph BackingServices ["🗄️ Dịch Vụ Dùng Chung (ops_bridge)"]
        Api --> DB[("limart-db (PostgreSQL 17 :5432)")]
        Api --> Cache[("limart-valkey (Valkey 8 :6389->6379)")]
        Api --> Search[("meilisearch (:7700)")]
        DB -.-> Backup[("pgBackRest Continuous WAL & Backups")]
    end
```

### Chi Tiết Cấu Hình Môi Trường:

| Thuộc tính | 🚀 Production / Canary | 📦 Legacy Monolith (Khai tử) |
| :--- | :--- | :--- |
| **Domain** | `https://limart.khanhdp.com`<br>`https://limart2.khanhdp.com` (Canary) | N/A (Đã decommissioned) |
| **Thư mục VPS** | `/opt/limart` (hoặc symlink `/opt/checkin-app`) | N/A |
| **Git Branch** | `main` (Trunk-based development) | `backup/legacy-v1-main` |
| **Workflow CI/CD** | `.github/workflows/deploy-monorepo.yml` | Đã gỡ bỏ (`deploy.yml` cũ) |
| **Docker Compose** | `docker-compose.yml` *(chính)*<br>`docker-compose.monorepo.yml` *(mirror đồng bộ)* | Đã thay thế hoàn toàn |
| **Active Containers** | `limart-api` (:4000, Bun `oven/bun:1-alpine`)<br>`limart-admin` (:3001)<br>`limart-staff` (:3002)<br>`limart-db` (:5432)<br>`limart-valkey` (:6389) | `checkin-app` (**Đã xóa khỏi VPS**) |
| **Chiến lược Deploy** | **Blue-Green Atomic Container Swap** (Zero-Downtime) | Không còn áp dụng |

---

## 🔄 2. Quy Trình Triển Khai Tự Động (CI/CD Pipeline)

> [!IMPORTANT]
> **Tuyệt đối không tự ý build image hoặc chạy `docker compose up` thủ công qua SSH trên VPS.**
> Mọi thay đổi code đều phải commit lên GitHub nhánh `main` để kích hoạt pipeline tự động, bảo đảm quy trình kiểm thử (Unit test + Build test).

### Quy trình triển khai Trunk-based (`deploy-monorepo.yml`)
1. **Kiểm tra local trước khi push (Bun / pnpm)**:
   ```bash
   bun test # hoặc pnpm test
   bun run build # kiểm tra build
   docker compose config >/dev/null
   ```
2. **Commit và Push lên nhánh `main` (Quy tắc 1 Conventional Commit)**:
   ```bash
   git add -A
   git commit -m "feat/fix/chore: <mô tả chuẩn conventional commit>"
   git push origin main
   ```
3. **Pipeline GitHub Actions tự động thực thi**:
   - **Path Filtering**: Tự động phát hiện app/package nào thay đổi (`api`, `admin-spa`, `staff-pwa`).
   - **Quality Gate**: Chạy test toàn bộ monorepo (`bun test` / `pnpm test`) và build packages dùng chung.
   - **Build & Push GHCR**: Đóng gói Docker image song song (`oven/bun:1-alpine` cho API) và push lên GitHub Container Registry (`ghcr.io/khanhduong22/limart/*`).
   - **Blue-Green Container Swap**: SSH vào VPS gọi `scripts/deploy-monorepo.sh deploy`:
     - Khởi chạy candidate container `limart-api_next` (Bun runtime port 4000).
     - Chờ healthcheck `/health` phản hồi `status: ok` (tối đa 45s).
     - Hoán đổi atomic tên container và binding port 4000 với zero-downtime.
     - Drain kết nối container cũ (`limart-api_old`) trong 3 giây rồi dừng.
     - Cập nhật các container frontend SPA Nginx (`limart-admin`, `limart-staff`) và reload Caddy reverse proxy (`caddy reload`).

---

## 🛠️ 3. Quản Lý Biến Môi Trường & GitHub Secrets

Toàn bộ biến môi trường production được quản lý tập trung tại **GitHub Actions Repository Secrets** và tự động sinh file `.env` trên VPS khi deploy:

| Tên Secret | Mục Đích | Giá Trị Mẫu / Chú Thích |
| :--- | :--- | :--- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL 17 | `postgresql://kido:...@limart-db:5432/checkin_db?sslmode=disable&connection_limit=10&pool_timeout=15` |
| `NEXTAUTH_SECRET` | Secret mã hoá JWT token phiên đăng nhập | Khóa ngẫu nhiên 32+ ký tự |
| `NEXTAUTH_URL` | Domain chính thức của Production | `https://limart.khanhdp.com` |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID từ Google Cloud Console | Dùng đăng nhập Google OAuth |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret | Dùng đăng nhập Google OAuth |
| `GEMINI_API_KEY` | Khóa API Gemini cho AI Assistant (Capy) | Google AI Studio key |
| `RESEND_API_KEY` | Khóa API gửi email thông báo | Khóa Resend |
| `EMAIL_FROM` | Địa chỉ email người gửi | `LimArt <no-reply@khanhdp.com>` |
| `CRON_SECRET` | Secret xác thực các API Cron tự động | Dùng cho cron triggers |
| `VPS_HOST` | Địa chỉ IP máy chủ Contabo | `144.91.88.242` |
| `SSH_USER` | Tên người dùng SSH | `root` |
| `SSH_PRIVATE_KEY` | Private SSH key kết nối VPS | Ed25519 / RSA key |

---

## 🛡️ 4. An Toàn Cơ Sở Dữ Liệu & pgBackRest

### A. Những Điều TUYỆT ĐỐI CẤM (Safety Invariants):
- 🚫 **CẤM** chạy `prisma migrate reset` hoặc `prisma db push --force-reset` trên production.
- 🚫 **CẤM** xoá volume `checkin-app_checkin_pgdata` hoặc chạy `docker volume prune -a` trên VPS.
- 🚫 Mọi thay đổi schema đều phải backward-compatible và đồng bộ qua `bun run db:push` hoặc `pnpm prisma db push --skip-generate`.

### B. Cơ Chế Sao Lưu pgBackRest & Khôi Phục Điểm Thời Gian (PITR)
- Container `limart-db` tự động ghi nhận **WAL archives** liên tục vào volume `checkin_pgbackrest_data`.
- Cho phép phục hồi dữ liệu về bất kỳ thời điểm nào trong quá khứ (**Point-in-Time Recovery - PITR**):
  ```bash
  ssh contabo "cd /opt/limart && ./scripts/pgbackrest-restore.sh --time 'YYYY-MM-DD HH:MM:SS'"
  ```
- Kiểm tra sức khỏe backup:
  ```bash
  ssh contabo "docker exec -u postgres limart-db pgbackrest --stanza=checkin info"
  ```

---

## 🔍 5. Kiểm Tra Trạng Thái & Xem Logs Nhanh

Khi cần kiểm tra trạng thái hoặc tìm nguyên nhân lỗi, chỉ cần thực hiện các lệnh **Read-Only** an toàn sau:

### Kiểm tra tình trạng hoạt động (Health check):
```bash
# Kiểm tra Prod HTTP headers & Server-Timing latency breakdown
curl -sI https://limart.khanhdp.com | head -n 5
curl -sI https://limart.khanhdp.com/api/shifts | grep -i server-timing

# Kiểm tra Prod API Health JSON
curl -s https://limart.khanhdp.com/health

# Kiểm tra Canary API Health JSON
curl -s https://limart2.khanhdp.com/health

# Kiểm tra phiên bản triển khai
curl -s https://limart.khanhdp.com/version.json
```

### Xem logs trực tiếp qua terminal (Dùng SSH alias `ssh contabo`):
```bash
# Xem 100 dòng log gần nhất của API
ssh contabo "docker logs --tail 100 -f limart-api"

# Xem logs của Admin SPA
ssh contabo "docker logs --tail 100 -f limart-admin"

# Xem logs của Staff PWA
ssh contabo "docker logs --tail 100 -f limart-staff"

# Xem logs của Database
ssh contabo "docker logs --tail 50 limart-db"

# Xem logs của Cache Valkey
ssh contabo "docker logs --tail 50 limart-valkey"
```

### Xem trực quan qua giao diện web:
- **Dozzle (Xem live logs)**: [https://dozzle.khanhdp.com](https://dozzle.khanhdp.com) (Lọc các container `limart-*`)
- **Beszel (Xem RAM, CPU)**: [https://beszel.khanhdp.com](https://beszel.khanhdp.com)
- **Uptime Kuma (Uptime monitor)**: [https://kuma.khanhdp.com](https://kuma.khanhdp.com)

---

## 🚑 6. Xử Lý Khẩn Cấp (Emergency Playbook)

### Kịch bản 1: Container Monorepo bị treo / không phản hồi
Nếu web báo 502 Bad Gateway:
```bash
ssh contabo "docker restart limart-api limart-admin limart-staff"
```

### Kịch bản 2: Caddy Reverse Proxy không nhận route mới
```bash
ssh contabo "docker exec caddy caddy reload --config /etc/caddy/Caddyfile"
```

### Kịch bản 3: Rollback phiên bản trước trên Production
1. Vào tab **Actions** trên GitHub repository: `https://github.com/khanhduong22/checkin-app/actions`.
2. Chọn workflow chạy thành công gần nhất trước đó.
3. Nhấn **Re-run all jobs** để deploy lại bản ổn định.
