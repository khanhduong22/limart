import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StaffTasksView } from "./StaffTasksView";
import { useStaffTasksStore, StaffTask } from "@/stores/useStaffTasksStore";
import * as apiClient from "@/lib/api-client";

// Router mock
const mockPush = vi.fn();
vi.mock("@/lib/router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Sonner mock
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Query mock
const mockMutate = vi.fn();
let mockSwrResponse: any;

vi.mock("@/lib/api-query", () => ({
  useAppQuery: () => ({
    data: mockSwrResponse?.data,
    error: mockSwrResponse?.error,
    mutate: mockMutate,
    isLoading: mockSwrResponse?.isLoading ?? false,
  }),
}));

// API client mock
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    toggleStaffTaskStatus: vi.fn().mockResolvedValue({ success: true }),
  };
});

describe("StaffTasksView Integration", () => {
  beforeEach(() => {
    useStaffTasksStore.getState().reset();
    mockMutate.mockClear();
    mockPush.mockClear();
    vi.clearAllMocks();
  });

  const mockTasks: StaffTask[] = [
    {
      id: "task-1",
      title: "Soát đơn hàng Shopee",
      description: "Kiểm tra 50 đơn hàng tồn kho",
      status: "TODO",
      priority: "HIGH",
      deadline: "2026-10-25T17:00:00Z",
    },
    {
      id: "task-2",
      title: "Đóng gói hàng gửi ViettelPost",
      description: "Đóng 20 kiện hàng gửi khách tỉnh",
      status: "DOING",
      priority: "NORMAL",
      deadline: "2026-10-25T18:00:00Z",
    },
    {
      id: "task-3",
      title: "Kiểm kê két tiền sáng",
      description: "Đếm tiền két và bàn giao ca",
      status: "DONE",
      priority: "LOW",
      evidenceLink: "https://photos.app.goo.gl/test",
      notes: "Đã khớp 100%",
    },
    {
      id: "task-4",
      title: "Chụp ảnh sản phẩm bộ màu mới",
      description: "Bộ sưu tập màu nước mùa thu",
      status: "APPROVED",
      priority: "URGENT",
      evidenceLink: "https://photos.app.goo.gl/colors",
    },
  ];

  const mockStats = {
    monthly: {
      total: 4,
      doing: 1,
      pendingReview: 1,
      approved: 1,
      overdue: 0,
      completionRate: 0.25,
    },
    weekly: {
      total: 4,
      doing: 1,
      pendingReview: 1,
      approved: 1,
      overdue: 0,
      completionRate: 0.25,
    },
  };

  it("renders 403 Forbidden access denied when user is not allowed", () => {
    mockSwrResponse = {
      data: {
        success: false,
        allowed: false,
      },
    };

    render(<StaffTasksView />);

    expect(screen.getByText("Không có quyền truy cập")).toBeDefined();
    expect(
      screen.getByText(/Bạn không có quyền truy cập vào mục/)
    ).toBeDefined();

    const backHomeBtn = screen.getByText("Quay lại trang chủ");
    fireEvent.click(backHomeBtn);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("renders Monthly KPI overview card with metrics and rate percentage", async () => {
    mockSwrResponse = {
      data: {
        success: true,
        allowed: true,
        data: {
          tasks: mockTasks,
          stats: mockStats,
        },
      },
    };

    render(<StaffTasksView />);

    expect(screen.getByText("Công Việc & KPI")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("Hiệu Suất Tháng")).toBeDefined();
      expect(screen.getByText("25%")).toBeDefined();
      expect(screen.getByText("1 / 4 Việc")).toBeDefined();
      expect(screen.getAllByText("Chờ duyệt").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Đã duyệt").length).toBeGreaterThanOrEqual(1);
    }, { timeout: 4000 });
  });

  it("filters tasks properly when switching tabs (TODO, DOING, DONE, APPROVED)", () => {
    mockSwrResponse = {
      data: {
        success: true,
        allowed: true,
        data: {
          tasks: mockTasks,
          stats: mockStats,
        },
      },
    };

    render(<StaffTasksView />);

    // Initially ALL tab: all 4 tasks rendered
    expect(screen.getByText("Soát đơn hàng Shopee")).toBeDefined();
    expect(screen.getByText("Đóng gói hàng gửi ViettelPost")).toBeDefined();
    expect(screen.getByText("Kiểm kê két tiền sáng")).toBeDefined();
    expect(screen.getByText("Chụp ảnh sản phẩm bộ màu mới")).toBeDefined();

    // Click "Cần làm" tab button
    fireEvent.click(screen.getByRole("button", { name: "Cần làm" }));
    expect(useStaffTasksStore.getState().filter).toBe("TODO");
    expect(screen.getByText("Soát đơn hàng Shopee")).toBeDefined();
    expect(screen.queryByText("Đóng gói hàng gửi ViettelPost")).toBeNull();

    // Click "Đang làm" tab button
    fireEvent.click(screen.getByRole("button", { name: "Đang làm" }));
    expect(useStaffTasksStore.getState().filter).toBe("DOING");
    expect(screen.getByText("Đóng gói hàng gửi ViettelPost")).toBeDefined();
    expect(screen.queryByText("Soát đơn hàng Shopee")).toBeNull();

    // Click "Chờ duyệt" tab button
    fireEvent.click(screen.getByRole("button", { name: "Chờ duyệt" }));
    expect(useStaffTasksStore.getState().filter).toBe("DONE");
    expect(screen.getByText("Kiểm kê két tiền sáng")).toBeDefined();
    expect(screen.queryByText("Đóng gói hàng gửi ViettelPost")).toBeNull();

    // Click "Đã duyệt" tab button
    fireEvent.click(screen.getByRole("button", { name: "Đã duyệt" }));
    expect(useStaffTasksStore.getState().filter).toBe("APPROVED");
    expect(screen.getByText("Chụp ảnh sản phẩm bộ màu mới")).toBeDefined();
    expect(screen.queryByText("Kiểm kê két tiền sáng")).toBeNull();
  }, 15000);

  it("starts a task (TODO -> DOING) on clicking 'Bắt đầu làm'", async () => {
    mockSwrResponse = {
      data: {
        success: true,
        allowed: true,
        data: {
          tasks: [mockTasks[0]],
          stats: mockStats,
        },
      },
    };

    render(<StaffTasksView />);

    const startBtn = screen.getByText("Bắt đầu làm");
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(apiClient.toggleStaffTaskStatus).toHaveBeenCalledWith("task-1", {
        status: "DOING",
      });
      expect(mockMutate).toHaveBeenCalled();
    });
  });

  it("opens submit modal for DOING task, updates form fields, and submits successfully", async () => {
    mockSwrResponse = {
      data: {
        success: true,
        allowed: true,
        data: {
          tasks: [mockTasks[1]], // DOING task
          stats: mockStats,
        },
      },
    };

    render(<StaffTasksView />);

    // Click "Báo hoàn thành" on DOING card
    const submitBtn = screen.getByText("Báo hoàn thành");
    fireEvent.click(submitBtn);

    // Modal should be opened
    expect(useStaffTasksStore.getState().finishingTask?.id).toBe("task-2");
    expect(screen.getByText(/Báo cáo hoàn thành:/)).toBeDefined();

    // Fill evidence link and note
    const linkInput = screen.getByPlaceholderText(/https:\/\/drive.google.com/);
    fireEvent.change(linkInput, {
      target: { value: "https://photos.app.goo.gl/viettelpost-proof" },
    });

    const noteTextarea = screen.getByPlaceholderText(/Mô tả kết quả đã làm/);
    fireEvent.change(noteTextarea, {
      target: { value: "Đã dán tem và gửi ViettelPost thành công" },
    });

    // Submit form
    const submitReportBtn = screen.getByText("Gửi kết quả");
    fireEvent.click(submitReportBtn);

    await waitFor(() => {
      expect(apiClient.toggleStaffTaskStatus).toHaveBeenCalledWith("task-2", {
        status: "DONE",
        evidenceLink: "https://photos.app.goo.gl/viettelpost-proof",
        note: "Đã dán tem và gửi ViettelPost thành công",
      });
      expect(mockMutate).toHaveBeenCalled();
      expect(useStaffTasksStore.getState().finishingTask).toBeNull();
    });
  });

  it("opens and closes task detail modal", () => {
    mockSwrResponse = {
      data: {
        success: true,
        allowed: true,
        data: {
          tasks: [mockTasks[0]],
          stats: mockStats,
        },
      },
    };

    render(<StaffTasksView />);

    // Click task title to open detail modal
    fireEvent.click(screen.getByText("Soát đơn hàng Shopee"));

    expect(useStaffTasksStore.getState().viewingTask?.id).toBe("task-1");
    expect(screen.getByText("Nội dung chi tiết công việc:")).toBeDefined();
    expect(screen.getAllByText("Kiểm tra 50 đơn hàng tồn kho").length).toBeGreaterThanOrEqual(1);

    // Close detail modal
    fireEvent.click(screen.getByText("Đóng"));
    expect(useStaffTasksStore.getState().viewingTask).toBeNull();
  });
});
