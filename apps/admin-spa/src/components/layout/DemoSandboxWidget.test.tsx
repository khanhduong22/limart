import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { DemoSandboxWidget } from "./DemoSandboxWidget";
import AdminNavLinks from "./AdminNavLinks";
import { AdminGuard } from "./AdminGuard";
import {
  DEFAULT_DEMO_MODULES,
  DEMO_MODULES_STORAGE_KEY,
  getDemoModules,
  isLikelyDemoHost,
  setDemoModules,
} from "@/lib/demo-mode";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

describe("Super App Demo Studio & Dynamic Module Filtering", () => {
  const originalFetch = globalThis.fetch;
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(window, "localStorage", {
      writable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, val: string) => store.set(key, String(val)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    });
    setDemoModules(DEFAULT_DEMO_MODULES);
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders null when /api/demo/status returns enabled: false (Production)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enabled: false }),
    } as any);

    const { container } = render(<DemoSandboxWidget />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/demo/status",
        expect.any(Object)
      );
    });

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/Super App Demo Studio/i)).toBeNull();
  });

  it("renders floating pill when demo status is enabled and opens studio panel on click", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enabled: true,
        role: "ADMIN",
        modules: DEFAULT_DEMO_MODULES,
      }),
    } as any);

    render(<DemoSandboxWidget />);

    const pill = await screen.findByText(/🧩 Super App Demo Studio/i);
    expect(pill).toBeDefined();
    expect(screen.getByText("6/6 Modules")).toBeDefined();

    // Open studio panel
    fireEvent.click(pill);

    expect(
      screen.getByText("DemoMart — Hệ Điều Hành Bán Lẻ Modular")
    ).toBeDefined();
    expect(
      screen.getByText("Dữ liệu nhân sự & lương đã được ẩn danh tự động")
    ).toBeDefined();
    expect(screen.getByText("👑 Chủ Shop (Admin)")).toBeDefined();
    expect(screen.getByText("📋 Quản Lý Ca (Partner)")).toBeDefined();
    expect(screen.getByText("👷 Nhân Viên (Staff PWA)")).toBeDefined();
  });

  it("toggles module switches in DemoSandboxWidget and immediately hides/shows links in AdminNavLinks", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/demo/status") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            enabled: true,
            role: "ADMIN",
            modules: DEFAULT_DEMO_MODULES,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    });

    render(
      <MemoryRouter>
        <AdminNavLinks />
        <DemoSandboxWidget />
      </MemoryRouter>
    );

    const pill = await screen.findByText(/🧩 Super App Demo Studio/i);
    fireEvent.click(pill);

    // Initially all modules are visible in AdminNavLinks
    expect(screen.getByText("Bảng Lương")).toBeDefined();
    expect(screen.getByText("Duyệt WFH & Đóng gói")).toBeDefined();
    expect(screen.getByText("Manager Tasks")).toBeDefined();
    expect(screen.getByText("Công việc và KPI")).toBeDefined();
    expect(screen.getByText("Vòng quay")).toBeDefined();
    expect(screen.getByText("Bảng thành tích")).toBeDefined();
    expect(screen.getByText("Trợ lí Capy")).toBeDefined();

    // Toggle off Payroll module
    const payrollSwitch = screen.getByRole("switch", {
      name: "Tính lương tự động & VietQR",
    });
    fireEvent.click(payrollSwitch);

    // AdminNavLinks immediately hides "Bảng Lương"
    expect(screen.queryByText("Bảng Lương")).toBeNull();
    expect(getDemoModules().payroll).toBe(false);
    expect(
      JSON.parse(window.localStorage.getItem(DEMO_MODULES_STORAGE_KEY) || "{}")
        .payroll
    ).toBe(false);
    expect(screen.getAllByText("5/6 Modules").length).toBeGreaterThan(0);

    // Toggle off Gamification module -> hides both "Vòng quay" and "Bảng thành tích"
    const gamificationSwitch = screen.getByRole("switch", {
      name: "Gamification (Gacha & Vòng quay)",
    });
    fireEvent.click(gamificationSwitch);

    expect(screen.queryByText("Vòng quay")).toBeNull();
    expect(screen.queryByText("Bảng thành tích")).toBeNull();
    expect(screen.getAllByText("4/6 Modules").length).toBeGreaterThan(0);

    // Toggle Payroll back ON -> "Bảng Lương" reappears immediately
    fireEvent.click(payrollSwitch);
    expect(screen.getByText("Bảng Lương")).toBeDefined();
  });

  it("switches roles (PARTNER & USER) and resets demo data with toast notification", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/demo/status") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ enabled: true, role: "ADMIN" }),
        };
      }
      if (url === "/api/demo/switch-role") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, token: "demo-jwt-partner" }),
        };
      }
      if (url === "/api/demo/reset") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    globalThis.fetch = fetchMock as any;

    const navigateSpy = vi.fn();
    render(<DemoSandboxWidget onNavigate={navigateSpy} />);

    const pill = await screen.findByText(/🧩 Super App Demo Studio/i);
    fireEvent.click(pill);

    // Switch to PARTNER
    const partnerBtn = screen.getByText(/📋 Quản Lý Ca \(Partner\)/i);
    fireEvent.click(partnerBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/demo/switch-role",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ role: "PARTNER" }),
        })
      );
      expect(navigateSpy).toHaveBeenCalledWith("/staff-tasks");
      expect(window.localStorage.getItem("auth_token")).toBe(
        "demo-jwt-partner"
      );
    });

    // Click Reset Demo Data button
    const resetBtn = screen.getByText(/🔄 Random lại Lương & Tên NV/i);
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/demo/reset",
        expect.objectContaining({ method: "POST" })
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Đã random lại tên & mức lương nhân viên mới!"
      );
    });
  });

  it("auto-switches to ADMIN in AdminGuard when demo mode is enabled", async () => {
    let currentRole = "USER";
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/me")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            user: {
              id: "demo-1",
              name:
                currentRole === "ADMIN"
                  ? "Nguyễn Minh Khôi (Chủ Shop Demo)"
                  : "Nhân viên Demo",
              role: currentRole,
            },
          }),
        };
      }
      if (url === "/api/demo/status") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ enabled: true }),
        };
      }
      if (url === "/api/demo/switch-role") {
        currentRole = "ADMIN";
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            ok: true,
            token: "demo-admin-jwt",
            user: {
              id: "demo-admin",
              name: "Nguyễn Minh Khôi (Chủ Shop Demo)",
              role: "ADMIN",
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      };
    }) as any;

    const testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={testQueryClient}>
        <AdminGuard>
          <div data-testid="protected-admin-view">Admin Dashboard Content</div>
        </AdminGuard>
      </QueryClientProvider>
    );

    const protectedView = await screen.findByTestId("protected-admin-view");
    expect(protectedView).toBeDefined();
    expect(window.localStorage.getItem("auth_token")).toBe("demo-admin-jwt");
  });

  it("validates isLikelyDemoHost helper", () => {
    expect(typeof isLikelyDemoHost()).toBe("boolean");
  });
});
