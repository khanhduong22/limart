import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RequestListClient from "./RequestListClient";
import * as apiClient from "@/lib/api-client";

// Mock router
vi.mock("@/lib/router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock api-client
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    submitRequest: vi.fn(),
  };
});

describe("RequestListClient Component", () => {
  const mockOnRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when there are no requests", () => {
    render(<RequestListClient requests={[]} onRefresh={mockOnRefresh} />);

    expect(screen.getByText("Yêu cầu / Giải trình")).toBeDefined();
    expect(
      screen.getByText("Bạn chưa có yêu cầu hay giải trình nào.")
    ).toBeDefined();
  });

  it("renders list of requests with correct status badges", () => {
    const mockRequests = [
      {
        id: "1",
        date: "2026-10-12T00:00:00.000Z",
        type: "LATE",
        reason: "Hỏng xe trên đường đến shop",
        status: "PENDING",
      },
      {
        id: "2",
        date: "2026-10-10T00:00:00.000Z",
        type: "LEAVE",
        reason: "Nghỉ ốm có giấy khám bệnh",
        status: "APPROVED",
      },
      {
        id: "3",
        date: "2026-10-08T00:00:00.000Z",
        type: "MISSING",
        reason: "Quên check-out ca chiều",
        status: "REJECTED",
      },
    ];

    render(
      <RequestListClient requests={mockRequests} onRefresh={mockOnRefresh} />
    );

    expect(screen.getByText("Xin đi muộn")).toBeDefined();
    expect(screen.getByText("Hỏng xe trên đường đến shop")).toBeDefined();
    expect(screen.getByText("Đang chờ duyệt")).toBeDefined();

    expect(screen.getByText("Xin nghỉ phép")).toBeDefined();
    expect(screen.getByText("Nghỉ ốm có giấy khám bệnh")).toBeDefined();
    expect(screen.getByText("Đã duyệt ✅")).toBeDefined();

    expect(screen.getByText("Quên Check-in/out")).toBeDefined();
    expect(screen.getByText("Quên check-out ca chiều")).toBeDefined();
    expect(screen.getByText("Từ chối ❌")).toBeDefined();
  });

  it("dynamically loads and opens CreateRequestModal when clicking Tạo yêu cầu button", async () => {
    render(<RequestListClient requests={[]} onRefresh={mockOnRefresh} />);

    // Initially modal is not in DOM
    expect(screen.queryByText("Gửi yêu cầu / giải trình")).toBeNull();

    const openBtn = screen.getByRole("button", { name: /Tạo yêu cầu/i });
    fireEvent.click(openBtn);

    // Modal loads dynamically via React.lazy and React.Suspense
    await waitFor(() => {
      expect(screen.getByText("Gửi yêu cầu / giải trình")).toBeDefined();
    }, { timeout: 4000 });

    // Close modal via Hủy
    const cancelBtn = screen.getByRole("button", { name: "Hủy" });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText("Gửi yêu cầu / giải trình")).toBeNull();
    });
  });

  it("calls onRefresh when modal submission succeeds", async () => {
    vi.mocked(apiClient.submitRequest).mockResolvedValue({
      success: true,
      message: "Success",
    });

    render(<RequestListClient requests={[]} onRefresh={mockOnRefresh} />);

    const openBtn = screen.getByRole("button", { name: /Tạo yêu cầu/i });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByText("Gửi yêu cầu / giải trình")).toBeDefined();
    });

    const reasonInput = screen.getByLabelText("Lý do cụ thể");
    fireEvent.change(reasonInput, { target: { value: "Lý do hợp lệ" } });

    const submitBtn = screen.getByRole("button", { name: "Gửi yêu cầu" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Gửi yêu cầu / giải trình")).toBeNull();
    });
  });
});
