import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { NotificationAdminPanel } from "./NotificationAdminPanel";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("NotificationAdminPanel Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the 4 default shift reminder rules (30 phút & 15 phút before shift start and shift end) with resilient fallback", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      rules: [],
      todayShifts: [
        {
          id: "shift-1",
          userName: "Nguyễn Văn A",
          shiftTime: "08:00 - 14:00",
          hasPushSubscription: true,
        },
        {
          id: "shift-2",
          userName: "Trần Thị B",
          shiftTime: "14:00 - 22:00",
          hasPushSubscription: false,
        },
      ],
      stats: {
        totalSubscribers: 5,
      },
    });

    const { container } = render(<NotificationAdminPanel />);

    expect(
      screen.getByText("🔔 Cấu Hình Nhắc Ca Tự Động (Web Push PWA)")
    ).toBeDefined();

    // Verify 4 default rules are rendered immediately
    expect(
      screen.getByText("Nhắc trước 30 phút khi vào ca")
    ).toBeDefined();
    expect(
      screen.getByText("Nhắc trước 15 phút khi vào ca")
    ).toBeDefined();
    expect(
      screen.getByText("Nhắc trước 30 phút khi tan ca")
    ).toBeDefined();
    expect(
      screen.getByText("Nhắc trước 15 phút khi tan ca")
    ).toBeDefined();

    // Verify badges for offset minutes
    expect(
      screen.getByText("⏰ Trước giờ vào ca 30 phút")
    ).toBeDefined();
    expect(
      screen.getByText("⏰ Trước giờ vào ca 15 phút")
    ).toBeDefined();
    expect(
      screen.getByText("🏁 Trước giờ tan ca 30 phút")
    ).toBeDefined();
    expect(
      screen.getByText("🏁 Trước giờ tan ca 15 phút")
    ).toBeDefined();

    expect(container.querySelector("#shift-reminder-rules-list")).not.toBeNull();
    expect(
      container.querySelector("#today-shift-subscribers-section")
    ).not.toBeNull();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/api/notifications/admin/overview"
      );
      expect(screen.getByText("Ca trực hôm nay: 2 ca")).toBeDefined();
      expect(
        screen.getByText("Thiết bị đăng ký Push: 5 thiết bị")
      ).toBeDefined();
      expect(screen.getByText("Nguyễn Văn A")).toBeDefined();
      expect(screen.getByText("🔔 Đã bật Push")).toBeDefined();
      expect(screen.getByText("📱 Nhận trong App")).toBeDefined();
    });
  });

  it("calls POST /api/notifications/admin/dispatch-today when clicking '⚡ Bắn nhắc nhở ngay cho NV có ca hôm nay'", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(null);
    vi.mocked(api.post).mockResolvedValueOnce({ success: true, dispatched: 3 });

    render(<NotificationAdminPanel />);

    const dispatchBtn = screen.getByText(
      "⚡ Bắn nhắc nhở ngay cho NV có ca hôm nay"
    );
    fireEvent.click(dispatchBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/notifications/admin/dispatch-today",
        {}
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Đã bắn thông báo nhắc ca tới nhân viên có ca trực hôm nay!"
      );
    });
  });

  it("calls PATCH /api/notifications/admin/rules/:id/toggle when toggling a rule", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(null);
    vi.mocked(api.patch).mockResolvedValueOnce({ success: true });

    render(<NotificationAdminPanel />);

    const toggleButtons = screen.getAllByText("Bật / Tắt");
    expect(toggleButtons.length).toBe(4);

    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/api/notifications/admin/rules/SHIFT_START_30M/toggle",
        expect.objectContaining({
          enabled: false,
        })
      );
      expect(screen.getByText("Đang tắt")).toBeDefined();
    });
  });

  it("dispatches a single rule test when clicking 'Bắn thử ngay' and creates a new custom rule via inline form", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(null);
    vi.mocked(api.post).mockResolvedValue({
      id: "rule-custom-45m",
      code: "SHIFT_START_45M",
    });

    render(<NotificationAdminPanel />);

    const testButtons = screen.getAllByText("Bắn thử ngay");
    fireEvent.click(testButtons[1]);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/notifications/admin/dispatch-today",
        { ruleCode: "SHIFT_START_15M" }
      );
    });

    // Open create rule form
    fireEvent.click(screen.getByText("➕ Thêm mốc nhắc mới"));
    const nameInput = screen.getByPlaceholderText(
      "VD: Nhắc trước 45 phút khi vào ca"
    );
    fireEvent.change(nameInput, {
      target: { value: "Nhắc trước 45 phút khi vào ca" },
    });

    fireEvent.click(screen.getByText("Lưu mốc nhắc"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/notifications/admin/rules",
        expect.objectContaining({
          name: "Nhắc trước 45 phút khi vào ca",
          triggerType: "BEFORE_SHIFT_START",
        })
      );
      expect(
        screen.getByText("Nhắc trước 45 phút khi vào ca")
      ).toBeDefined();
    });
  });
});
