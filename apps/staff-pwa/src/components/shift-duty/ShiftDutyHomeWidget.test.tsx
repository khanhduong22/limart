import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ShiftDutyHomeWidget from "./ShiftDutyHomeWidget";

vi.mock("@/lib/api-client", () => ({
  toggleCompleteShiftDuty: vi.fn().mockResolvedValue({ success: true, data: { isCompleted: true } }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ShiftDutyHomeWidget", () => {
  const mockCurrentUserId = "user-1";

  const mockActiveUsers = [
    {
      id: "user-1",
      name: "Nguyễn Văn Bạn",
      email: "ban@limart.vn",
      duties: [
        {
          id: "duty-1",
          title: "Sắp xếp kệ màu nước",
          isCompleted: false,
        },
      ],
    },
    {
      id: "user-2",
      name: "Trần Thị Lan",
      email: "lan@limart.vn",
      duties: [
        {
          id: "duty-2",
          title: "Đóng gói đơn hoạ cụ Shopee",
          description: "Gói kỹ cọ và hũ màu Acrylic",
          isCompleted: false,
        },
        {
          id: "duty-3",
          title: "Kiểm đếm giấy can vẽ",
          isCompleted: true,
        },
      ],
    },
  ];

  it("calculates otherDutyUsers correctly excluding current user and displays count in Tab 2", async () => {
    render(
      <ShiftDutyHomeWidget
        currentUserId={mockCurrentUserId}
        duties={mockActiveUsers[0].duties}
        activeUsers={mockActiveUsers}
      />
    );

    // Open detail dialog
    const openBtn = screen.getByText("Xem chi tiết");
    fireEvent.click(openBtn);

    // Tab 1 should show 1 duty for current user
    expect(await screen.findByText("Việc của tôi (1)")).toBeDefined();

    // Tab 2 should only count user-2 (count = 1) instead of all users (2)
    expect(screen.getByText("Cả ca làm (1)")).toBeDefined();
  });

  it("renders only colleagues with duties today with status icons and duty details in Tab 2", async () => {
    render(
      <ShiftDutyHomeWidget
        currentUserId={mockCurrentUserId}
        duties={mockActiveUsers[0].duties}
        activeUsers={mockActiveUsers}
      />
    );

    fireEvent.click(screen.getByText("Xem chi tiết"));

    // Switch to Tab 2
    fireEvent.click(await screen.findByText("Cả ca làm (1)"));

    // Colleague name and duties count
    expect(screen.getByText("Trần Thị Lan")).toBeDefined();
    expect(screen.getByText("2 nhiệm vụ")).toBeDefined();
    expect(screen.getByText("1/2 hoàn thành")).toBeDefined();

    // Colleague's duties
    expect(screen.getByText("Đóng gói đơn hoạ cụ Shopee")).toBeDefined();
    expect(screen.getByText("Gói kỹ cọ và hũ màu Acrylic")).toBeDefined();
    expect(screen.getByText("Kiểm đếm giấy can vẽ")).toBeDefined();

    // Status badges
    expect(screen.getByText("Đang chờ")).toBeDefined();
    expect(screen.getByText("Đã xong")).toBeDefined();

    // Current user should NOT be rendered in Tab 2
    expect(screen.queryByText("Nguyễn Văn Bạn")).toBeNull();
  });

  it("displays friendly message when no colleagues have duties today", async () => {
    // Only current user has duties
    const usersWithOnlyMe = [mockActiveUsers[0]];

    render(
      <ShiftDutyHomeWidget
        currentUserId={mockCurrentUserId}
        duties={mockActiveUsers[0].duties}
        activeUsers={usersWithOnlyMe}
      />
    );

    fireEvent.click(screen.getByText("Xem chi tiết"));
    fireEvent.click(await screen.findByText("Cả ca làm (0)"));

    expect(
      screen.getByText("Hôm nay chưa có đồng nghiệp nào được giao nhiệm vụ ca trực.")
    ).toBeDefined();
  });
});
