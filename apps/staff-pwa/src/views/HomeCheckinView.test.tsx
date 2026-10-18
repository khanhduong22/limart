import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HomeCheckinView } from "./HomeCheckinView";
import { useHomeCheckinStore } from "@/stores/useHomeCheckinStore";
import { StaffHomeData } from "@/lib/api-client";

// Mock dependencies
const mockMutate = vi.fn();
let mockSwrData: { success: boolean; data: StaffHomeData } | undefined;

vi.mock("@/lib/api-query", () => ({
  useAppQuery: () => ({
    data: mockSwrData,
    mutate: mockMutate,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    getIPStatus: vi.fn().mockResolvedValue({
      isAllowed: true,
      locationName: "LimArt Store Test",
      ip: "192.168.1.1",
    }),
    getTodayUserShiftDuties: vi.fn().mockResolvedValue({
      success: true,
      data: [],
    }),
    performCheckIn: vi.fn().mockResolvedValue({
      success: true,
      message: "Chấm công thành công!",
    }),
    rollGacha: vi.fn().mockResolvedValue({
      success: true,
      reward: { name: "10 điểm thưởng" },
    }),
  };
});

describe("HomeCheckinView Integration", () => {
  beforeEach(() => {
    useHomeCheckinStore.getState().reset();
    mockMutate.mockClear();
  });

  const baseHomeData: StaffHomeData = {
    user: {
      id: "usr-001",
      name: "Nguyễn Văn Đạt",
      role: "STAFF",
      email: "dat@limart.vn",
      staffTasksAllowed: true,
    },
    streak: 12,
    swapCount: 2,
    announcements: [],
    rejectedTasksCount: 0,
    rejectedTasks: [],
    stats: {
      totalHours: 35.5,
      totalSalary: 1250000,
      daysWorked: 8,
      lateCount: 0,
      latePenaltyHours: 0,
      latePenaltyAmount: 0,
    },
    todayCheckins: [],
    todayShift: {
      id: 10,
      start: "2026-10-12T08:30:00.000Z",
      end: "2026-10-12T17:30:00.000Z",
    },
    todayDuties: [],
    hasCheckedInToday: false,
    specialUsers: [],
    activeUsers: [],
    isViewAsMode: false,
    ipStatus: {
      isAllowed: true,
      locationName: "LimArt Store",
      ip: "192.168.1.1",
    },
  };

  it("renders user greeting, name, and streak count properly", () => {
    mockSwrData = {
      success: true,
      data: baseHomeData,
    };

    render(<HomeCheckinView />);

    expect(screen.getByText("Chấm Công")).toBeDefined();
    expect(screen.getByText("Nguyễn Văn Đạt")).toBeDefined();
    expect(screen.getByText("🔥 12")).toBeDefined();
    expect(screen.getByText("🎁 2 kèo thơm")).toBeDefined();
    expect(screen.getByText("📍 Vào Ca (Check-in)")).toBeDefined();
    // NotificationOptInCard moved to Profile tab to keep home view clean
    expect(screen.queryByTestId("notification-opt-in-card")).toBeNull();
    expect(screen.queryByText("Thông Báo Nhắc Ca Tự Động")).toBeNull();
    // Functional menu grid & gacha removed to keep home view clean
    expect(screen.queryByTestId("home-nav-grid")).toBeNull();
    expect(screen.queryByText("Bảng Vàng & Khen Thưởng")).toBeNull();
  });

  it("renders checkin timer card when user has active check-in today", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockSwrData = {
      success: true,
      data: {
        ...baseHomeData,
        hasCheckedInToday: true,
        todayCheckins: [
          {
            id: "chk-01",
            type: "checkin",
            timestamp: oneHourAgo,
            note: "Vào ca đúng giờ",
          },
        ],
      },
    };

    render(<HomeCheckinView />);

    expect(screen.getByText("🟢 Đang làm việc")).toBeDefined();
    expect(screen.getByText("Thời gian làm việc ca này")).toBeDefined();
    expect(screen.getByText("Vào ca lúc:")).toBeDefined();
    expect(screen.getByText("Dự kiến tan:")).toBeDefined();
  });

  it("renders PartnerWelcomeBanner instead of checkin buttons when role is PARTNER", () => {
    mockSwrData = {
      success: true,
      data: {
        ...baseHomeData,
        user: {
          id: "partner-007",
          name: "Lê Thị Thảo (WFH)",
          role: "PARTNER",
          email: "thao@partner.vn",
        },
      },
    };

    render(<HomeCheckinView />);

    expect(screen.getByText("Chào mừng Đối tác LimArt!")).toBeDefined();
    expect(screen.getByText("💼 Vào Sàn việc (WFH)")).toBeDefined();
    expect(screen.getByText("📦 Báo cáo Đóng gói")).toBeDefined();
    // Regular check-in button should NOT be present for partner
    expect(screen.queryByText("📍 Vào Ca (Check-in)")).toBeNull();
  });

  it("renders Admin View Mode banner with Exit button when isViewAsMode is true", () => {
    mockSwrData = {
      success: true,
      data: {
        ...baseHomeData,
        isViewAsMode: true,
      },
    };

    render(<HomeCheckinView />);

    expect(screen.getByText("Chế độ xem quản trị viên")).toBeDefined();
    expect(screen.getByText(/Đang xem:/)).toBeDefined();
    expect(screen.getByText("Thoát")).toBeDefined();
  });

  it("renders LateWarningBanner when late count is greater than 0", () => {
    mockSwrData = {
      success: true,
      data: {
        ...baseHomeData,
        stats: {
          ...baseHomeData.stats,
          lateCount: 3,
          latePenaltyHours: 2.0,
          latePenaltyAmount: 50000,
        },
      },
    };

    render(<HomeCheckinView />);

    expect(screen.getByText("Cảnh báo đi trễ")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText(/lần trong tháng này/)).toBeDefined();
  });

  it("triggers rejected tasks modal when clicking alert banner", async () => {
    mockSwrData = {
      success: true,
      data: {
        ...baseHomeData,
        rejectedTasksCount: 1,
        rejectedTasks: [
          {
            id: "task-rej-1",
            type: "STAFF_TASK",
            title: "Chụp ảnh sản phẩm gốm",
            reason: "Hình ảnh bị thiếu ánh sáng và sai góc",
            date: new Date().toISOString(),
            link: "/tasks",
          },
        ],
      },
    };

    render(<HomeCheckinView />);

    // Alert banner should appear
    expect(screen.getByText("Yêu cầu sửa đổi công việc")).toBeDefined();
    expect(screen.getByText("Xem chi tiết & sửa ngay")).toBeDefined();

    // Click banner action to open modal
    fireEvent.click(screen.getByText("Xem chi tiết & sửa ngay"));

    expect(useHomeCheckinStore.getState().showRejectedModal).toBe(true);

    // Modal should now display the rejected task details
    await waitFor(() => {
      expect(screen.getByText("Chụp ảnh sản phẩm gốm")).toBeDefined();
      expect(screen.getByText("Hình ảnh bị thiếu ánh sáng và sai góc")).toBeDefined();
    });
  });
});
