import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import BackupManager from "./BackupManager";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("BackupManager — Excel Backup & Surgical Per-Tenant Snapshot", () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = window.location;
  const store = new Map<string, string>();

  const setHostname = (hostname: string, search = "") => {
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: {
        ...originalLocation,
        hostname,
        search,
      },
    });
  };

  beforeEach(() => {
    store.clear();
    setHostname("limart.khanhdp.com");
    Object.defineProperty(window, "localStorage", {
      writable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, val: string) => store.set(key, String(val)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    });
    window.localStorage.setItem("auth_token", "test-admin-jwt");
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
    store.clear();
  });

  it("renders both cards without #tenant-select on Production (limart.khanhdp.com) and calls /api/admin/tenants/backup?scope=all", async () => {
    const mockSnapshot = {
      tenantId: "limart",
      scope: "all",
      exportedAt: "2026-10-16T07:00:00.000Z",
      checksum:
        "a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123",
      data: { workShifts: [] },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSnapshot,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { container } = render(<BackupManager />);

    // 1. Existing Excel Backup section remains intact
    const excelSection = container.querySelector("#backup-data-section");
    expect(excelSection).not.toBeNull();
    expect(screen.getByText("Sao lưu dữ liệu")).toBeDefined();
    expect(screen.getByText("📥 Tải về bản Backup (.xlsx)")).toBeDefined();

    // 2. Tenant Snapshot section renders without cross-shop dropdown (#tenant-select)
    expect(container.querySelector("#tenant-snapshot-section")).not.toBeNull();
    expect(container.querySelector("#tenant-select")).toBeNull();
    expect(
      screen.getByText(
        "🛡️ Sao lưu & Khôi phục Phẫu thuật theo Cửa hàng (Tenant Snapshot)"
      )
    ).toBeDefined();
    expect(
      screen.getByText("📦 Tải Snapshot Cửa hàng (.json)")
    ).toBeDefined();
    expect(
      screen.getByText("♻️ Khôi phục Phẫu thuật từ file Snapshot (.json)")
    ).toBeDefined();
    expect(
      screen.getByText("♻️ Xác nhận Khôi phục vào Cửa hàng")
    ).toBeDefined();

    const downloadBtn = screen.getByText("📦 Tải Snapshot Cửa hàng (.json)");
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/tenants/backup?scope=all",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
          headers: expect.objectContaining({
            Authorization: "Bearer test-admin-jwt",
          }),
        })
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Đã xuất gói Snapshot kèm chữ ký SHA-256 thành công!"
      );
    });
  });

  it("previews uploaded snapshot JSON metadata and posts { snapshot } to /api/admin/tenants/restore on confirm", async () => {
    const sampleSnapshot = {
      tenantId: "limart",
      scope: "schedule",
      exportedAt: "2026-10-16T07:15:00.000Z",
      checksum:
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      data: {
        workShifts: [{ id: "ws-1" }, { id: "ws-2" }],
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        restored: { workShifts: 2, shiftDuties: 1 },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<BackupManager />);

    const fileInput = screen.getByLabelText(
      /File Snapshot \(\.json\)/i
    ) as HTMLInputElement;

    const jsonFile = new File(
      [JSON.stringify(sampleSnapshot)],
      "tenant-snapshot-limart-schedule.json",
      { type: "application/json" }
    );

    fireEvent.change(fileInput, { target: { files: [jsonFile] } });

    const previewBadge = await screen.findByTestId("snapshot-preview-badge");
    expect(previewBadge).toBeDefined();
    expect(previewBadge.textContent).toContain("limart");
    expect(previewBadge.textContent).toContain("schedule");
    expect(previewBadge.textContent).toContain("2026-10-16T07:15:00.000Z");
    expect(previewBadge.textContent).toContain("9f86d081884c7d65...");

    const restoreBtn = screen.getByText("♻️ Xác nhận Khôi phục vào Cửa hàng");
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/tenants/restore",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-admin-jwt",
          }),
          body: JSON.stringify({
            snapshot: sampleSnapshot,
          }),
        })
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Khôi phục dữ liệu cửa hàng thành công (workShifts: 2, shiftDuties: 1)!"
      );
    });
  });

  it("returns null (completely hidden) on the Public Demo host (limart2.khanhdp.com)", () => {
    setHostname("limart2.khanhdp.com");

    const { container } = render(<BackupManager />);
    expect(container.firstChild).toBeNull();
    expect(container.querySelector("#backup-data-section")).toBeNull();
    expect(container.querySelector("#tenant-snapshot-section")).toBeNull();
  });
});

