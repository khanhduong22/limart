import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DemoSandboxWidget } from "./DemoSandboxWidget";
import { LoginView } from "../views/LoginView";
import { CheckinHeaderCard } from "./home/CheckinHeaderCard";
import CapyAssistant from "./CapyAssistant";
import { RouterProvider } from "../lib/router";
import {
  DEFAULT_DEMO_MODULES,
  DEMO_MODULES_STORAGE_KEY,
  getDemoModules,
  getEnterpriseInitials,
  isLikelyDemoHost,
  toggleDemoModule,
} from "../lib/demo-mode";

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: storageMock,
  writable: true,
  configurable: true,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: storageMock,
    writable: true,
    configurable: true,
  });
}

describe("DemoSandboxWidget & demo-mode utilities", () => {
  beforeEach(() => {
    storageMock.clear();
    vi.restoreAllMocks();
  });

  it("defaults all 6 DemoModulesConfig flags to true and toggles reactively", () => {
    const initial = getDemoModules();
    expect(initial).toEqual(DEFAULT_DEMO_MODULES);

    const afterToggle = toggleDemoModule("gamification");
    expect(afterToggle.gamification).toBe(false);
    expect(afterToggle.attendance).toBe(true);
    expect(JSON.parse(storageMock.getItem(DEMO_MODULES_STORAGE_KEY) || "{}").gamification).toBe(
      false
    );

    const restored = toggleDemoModule("gamification");
    expect(restored.gamification).toBe(true);
  });

  it("renders null when /api/demo/status returns enabled: false (Production)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    } as Response);

    const { container } = render(
      <RouterProvider>
        <DemoSandboxWidget />
      </RouterProvider>
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/demo/status",
        expect.any(Object)
      );
    });

    expect(container.querySelector('[data-testid="demo-sandbox-pill"]')).toBeNull();
  });

  it("renders floating pill and opens Demo Studio modal when enabled: true", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/demo/status")) {
        return {
          ok: true,
          json: async () => ({
            enabled: true,
            personas: [
              { id: "demo_u1", name: "NV Mẫu Minh Anh", role: "USER" },
              { id: "demo_u2", name: "NV Mẫu Hoàng Nam", role: "USER" },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    render(
      <RouterProvider>
        <DemoSandboxWidget />
      </RouterProvider>
    );

    const pill = await screen.findByTestId("demo-sandbox-pill");
    expect(pill).toBeDefined();
    expect(pill.textContent).toContain("🧩 Demo Super App");

    fireEvent.click(pill);

    expect(screen.getByText(/1\. Đổi vai trò 1-Click/i)).toBeDefined();
    expect(screen.getByText(/👑 Chủ Shop \(Mở trang Quản trị \/admin\)/i)).toBeDefined();
    expect(screen.getByText(/📋 Quản Lý Ca \(Giao việc & KPI\)/i)).toBeDefined();
    expect(screen.getByText(/👷 Nhân Viên \(Chấm công, Đóng gói, Gacha\)/i)).toBeDefined();

    // Staff personas rendered
    expect(screen.getByText("NV Mẫu Minh Anh")).toBeDefined();
    expect(screen.getByText("NV Mẫu Hoàng Nam")).toBeDefined();

    // 6 package modules rendered
    expect(screen.getByTestId("toggle-module-attendance")).toBeDefined();
    expect(screen.getByTestId("toggle-module-piecework")).toBeDefined();
    expect(screen.getByTestId("toggle-module-operations")).toBeDefined();
    expect(screen.getByTestId("toggle-module-payroll")).toBeDefined();
    expect(screen.getByTestId("toggle-module-gamification")).toBeDefined();
    expect(screen.getByTestId("toggle-module-ai_sop")).toBeDefined();
  });

  it("switches role via POST /api/demo/switch-role and saves token + profile", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/demo/status")) {
        return {
          ok: true,
          json: async () => ({
            enabled: true,
            personas: [{ id: "demo_u1", name: "NV Mẫu Minh Anh", role: "USER" }],
          }),
        } as Response;
      }
      if (url.includes("/api/demo/switch-role")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            token: "jwt_demo_partner_token",
            user: {
              id: "demo_partner_1",
              name: "Quản Lý Ca Demo",
              role: "PARTNER",
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    render(
      <RouterProvider>
        <DemoSandboxWidget />
      </RouterProvider>
    );

    const pill = await screen.findByTestId("demo-sandbox-pill");
    fireEvent.click(pill);

    const partnerBtn = screen.getByText(/📋 Quản Lý Ca \(Giao việc & KPI\)/i);
    fireEvent.click(partnerBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/demo/switch-role",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ role: "PARTNER" }),
        })
      );
    });

    expect(storageMock.getItem("limart_staff_jwt_token")).toBe("jwt_demo_partner_token");
  });

  it("toggles module switch and injects live module filter CSS rules", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, personas: [] }),
    } as Response);

    const { container } = render(
      <RouterProvider>
        <DemoSandboxWidget />
      </RouterProvider>
    );

    const pill = await screen.findByTestId("demo-sandbox-pill");
    fireEvent.click(pill);

    const gachaSwitch = screen.getByTestId("toggle-module-gamification");
    expect(gachaSwitch.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(gachaSwitch);

    expect(gachaSwitch.getAttribute("aria-checked")).toBe("false");
    const styleTag = container.querySelector('[data-testid="demo-module-filter-styles"]');
    expect(styleTag).not.toBeNull();
    expect(styleTag?.textContent).toContain("#home-gacha");
  });

  it("calls POST /api/demo/reset when clicking Random lại Lương & Tên NV", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/demo/status")) {
        return {
          ok: true,
          json: async () => ({ enabled: true, personas: [] }),
        } as Response;
      }
      if (url.includes("/api/demo/reset")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "Đã làm mới dữ liệu lương & nhân sự mẫu!",
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    render(
      <RouterProvider>
        <DemoSandboxWidget />
      </RouterProvider>
    );

    const pill = await screen.findByTestId("demo-sandbox-pill");
    fireEvent.click(pill);

    const resetBtn = screen.getByTestId("demo-reset-button");
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/demo/reset",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });

  it("renders 1-Click Demo card on LoginView when /api/demo/status is enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/demo/status")) {
        return {
          ok: true,
          json: async () => ({ enabled: true }),
        } as Response;
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ success: false }),
      } as Response;
    });

    render(
      <RouterProvider>
        <LoginView />
      </RouterProvider>
    );

    const demoCard = await screen.findByTestId("demo-login-card");
    expect(demoCard).toBeDefined();
    expect(screen.getByText(/🚀 Chế độ Trải Nghiệm Demo \(1-Click\)/i)).toBeDefined();
    expect(screen.getByText(/👑 Xem Giao Diện Chủ Shop \(Admin\)/i)).toBeDefined();
    expect(screen.getByText(/📋 Xem Giao Diện Quản Lý \(Partner\)/i)).toBeDefined();
    expect(screen.getByText(/👷 Xem Giao Diện Nhân Viên \(Staff\)/i)).toBeDefined();
  });

  it("extracts enterprise initials accurately and detects demo hosts", () => {
    expect(getEnterpriseInitials("Nguyễn Minh Khôi (Chủ Shop Demo)")).toBe("MK");
    expect(getEnterpriseInitials("Hoàng Gia Huy")).toBe("GH");
    expect(getEnterpriseInitials("Trần Bảo Ngọc (Quản Lý Ca)")).toBe("BN");
    expect(getEnterpriseInitials("")).toBe("DM");
    expect(getEnterpriseInitials(undefined)).toBe("DM");
    expect(typeof isLikelyDemoHost()).toBe("boolean");
  });

  it("renders Corporate Initials Avatar and Enterprise AI Assistant for @demomart.vn users", () => {
    const demoUser = {
      id: "demo_u1",
      name: "Nguyễn Minh Khôi (Chủ Shop Demo)",
      email: "khoi.nguyen@demomart.vn",
      role: "ADMIN",
    };

    render(
      <RouterProvider>
        <CheckinHeaderCard user={demoUser as any} />
        <CapyAssistant currentUser={demoUser} />
      </RouterProvider>
    );

    const avatar = screen.getByTestId("enterprise-initials-avatar");
    expect(avatar.textContent).toBe("MK");
    expect(screen.getByText("Trợ lý AI Quy trình (SOP)")).toBeDefined();
    expect(
      screen.getByPlaceholderText("Hỏi quy trình vận hành, nhân sự, bảng lương...")
    ).toBeDefined();
  });
});
