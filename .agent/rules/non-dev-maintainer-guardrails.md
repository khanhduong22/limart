---
trigger: always
description: Mandatory guardrails and guidelines when assisting a non-dev maintainer to ensure safety, clarity, and zero production disruption.
---

# 🛡️ Non-Dev Maintainer Safety & Interaction Guardrails

> [!IMPORTANT]
> This repository is currently maintained and operated by a **non-developer maintainer** alongside AI agents.
> All AI assistants (Antigravity, Claude, Cursor, Copilot) MUST strictly adhere to these behavioral protocols.

---

## 1. Communication & Tone Protocol

1. **Clear, Supportive Vietnamese by Default**:
   - Always communicate explanations, summaries, and instructions in clear, friendly, and non-intimidating Vietnamese.
   - Avoid overly dense dev jargon where simple language suffices (e.g. explain "Reverse Proxy" as "Cổng điều hướng truy cập", "Volume" as "Thư mục lưu trữ dữ liệu an toàn trên máy chủ").
2. **Explain "The Why" & "Risk Level" First**:
   - Before proposing any command or code change, clearly state:
     - 🎯 **Mục đích**: Thay đổi này để làm gì?
     - ⚠️ **Mức độ rủi ro**: Thấp (an toàn) / Trung bình (cần kiểm tra) / Cao (chạm vào database/production).
     - 🔍 **Cách kiểm tra lại**: Làm sao để biết thay đổi đã thành công?
3. **Copy-Pasteable Commands**:
   - Always provide exact, copy-pasteable terminal commands. Do not tell the maintainer to "configure X in nginx" without giving the exact config snippet or file path.


---

## 2. Zero-Destructive Action Policy (Strict Invariants)

The AI agent is **STRICTLY PROHIBITED** from executing or instructing the maintainer to execute any of the following:

| Cấm Tuyệt Đối | Lý Do & Hậu Quả | Thay Thế An Toàn |
| :--- | :--- | :--- |
| 🚫 `prisma migrate reset`<br>🚫 `prisma db push --force-reset` | Xóa sạch toàn bộ dữ liệu lịch sử chấm công, tính lương và tài khoản. | Dùng `prisma db push --skip-generate` để thêm trường mới an toàn. |
| 🚫 `docker volume rm checkin_pgdata`<br>🚫 `docker volume prune -a` | Phá hủy volume lưu trữ database PostgreSQL. | Giữ nguyên volume, chỉ khởi động lại container bằng `docker restart`. |
| 🚫 `rm -rf` trên các thư mục code/data quan trọng | Nguy cơ xóa nhầm mã nguồn hoặc file sao lưu. | Chỉ sửa từng file cụ thể được chỉ định. |
| 🚫 Chạy build Docker thủ công trên VPS qua SSH | Làm nghẽn CPU/RAM VPS gây sập các ứng dụng khác. | Luôn đẩy commit lên GitHub để GitHub Actions tự động build và deploy. |

---

## 3. Evidence-First & Testing Gate

1. **Run Tests Before Claiming Victory**:
   - Never tell the maintainer "Đã sửa xong!" mà chưa chạy lệnh test thực tế (`pnpm test` hoặc `npm run test`).
   - Luôn hiển thị kết quả test thực tế trong câu trả lời (ví dụ: `25 test files passed, 239 passed`).
2. **Staging-First Testing Pattern**:
   - Khuyến khích kiểm tra giao diện và tính năng mới trên **Staging Canary** (`https://limart2.khanhdp.com`) trước khi gộp vào nhánh chính `main` của **Production** (`https://limart.khanhdp.com`).
3. **No Blind Hacks / No Symptom Patching**:
   - Sửa lỗi tận gốc tại nguyên nhân cốt lõi (Root cause), không chắp vá tạm thời bằng `@ts-ignore` hoặc khối `catch {}` rỗng nuốt lỗi.

---

## 4. Emergency Action Reference

Khi maintainer báo hệ thống gặp sự cố khẩn cấp:
- **Web báo 502 / Treo**: Khuyên dùng lệnh an toàn `ssh contabo "docker restart checkin-app caddy"`.
- **Xem lỗi**: Hướng dẫn mở giao diện web Dozzle tại [dozzle.khanhdp.com](https://dozzle.khanhdp.com).
- **Rollback nhanh**: Hướng dẫn vào tab GitHub Actions và nhấn "Re-run all jobs" của bản chạy thành công trước đó.
- Xem chi tiết tại [docs/060-Manuals/NON_DEV_MAINTAINER_GUIDE.md](file:///Users/kido/checkin-app/docs/060-Manuals/NON_DEV_MAINTAINER_GUIDE.md).
