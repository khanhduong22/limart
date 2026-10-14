import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ShiftDutyDetailsModal, { ShiftDutyDetailsModalProps } from "./ShiftDutyDetailsModal";

describe("ShiftDutyDetailsModal", () => {
  const mockSetModalOpen = vi.fn();
  const mockSetActiveTab = vi.fn();
  const mockHandleToggleDuty = vi.fn();

  const mockMyDuties = [
    {
      id: "duty-1",
      title: "Sắp xếp kệ màu nước",
      description: "Kiểm tra các khay màu Winsor & Newton",
      isCompleted: false,
    },
    {
      id: "duty-2",
      title: "Vệ sinh quầy thu ngân",
      isCompleted: true,
    },
  ];

  const mockTeammateDuties = [
    {
      id: "user-2",
      name: "Trần Thị Lan",
      email: "lan@limart.vn",
      duties: [
        {
          id: "duty-3",
          title: "Đóng gói đơn hoạ cụ Shopee",
          description: "Gói kỹ cọ và hũ màu Acrylic",
          isCompleted: false,
        },
        {
          id: "duty-4",
          title: "Kiểm đếm giấy can vẽ",
          isCompleted: true,
        },
      ],
    },
  ];

  const defaultProps: ShiftDutyDetailsModalProps = {
    modalOpen: true,
    setModalOpen: mockSetModalOpen,
    activeTab: "MY_DUTIES",
    setActiveTab: mockSetActiveTab,
    myDuties: mockMyDuties,
    teammateDuties: mockTeammateDuties,
    completedCount: 1,
    totalMyDuties: 2,
    totalTeamDuties: 2,
    togglingId: null,
    handleToggleDuty: mockHandleToggleDuty,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders MY_DUTIES tab with user duties and descriptions", () => {
    render(<ShiftDutyDetailsModal {...defaultProps} />);

    expect(screen.getByText("Danh sách nhiệm vụ ca trực")).toBeDefined();
    expect(screen.getByText("Việc của tôi (2)")).toBeDefined();
    expect(screen.getByText("Cả ca làm (1)")).toBeDefined();

    expect(screen.getByText("Sắp xếp kệ màu nước")).toBeDefined();
    expect(screen.getByText("Kiểm tra các khay màu Winsor & Newton")).toBeDefined();
    expect(screen.getByText("Vệ sinh quầy thu ngân")).toBeDefined();
  });

  it("toggles a duty item when clicked in MY_DUTIES tab and respects togglingId lock", () => {
    const { rerender } = render(<ShiftDutyDetailsModal {...defaultProps} />);

    const dutyItem = screen.getByText("Sắp xếp kệ màu nước");
    fireEvent.click(dutyItem);

    expect(mockHandleToggleDuty).toHaveBeenCalledTimes(1);
    expect(mockHandleToggleDuty).toHaveBeenCalledWith("duty-1");

    // When togglingId matches duty-1, clicking again should be ignored
    rerender(<ShiftDutyDetailsModal {...defaultProps} togglingId="duty-1" />);
    fireEvent.click(screen.getByText("Sắp xếp kệ màu nước"));
    expect(mockHandleToggleDuty).toHaveBeenCalledTimes(1);
  });

  it("switches between MY_DUTIES and TEAMMATES tabs and renders colleague duties", () => {
    const { rerender } = render(<ShiftDutyDetailsModal {...defaultProps} />);

    fireEvent.click(screen.getByText("Cả ca làm (1)"));
    expect(mockSetActiveTab).toHaveBeenCalledWith("TEAMMATES");

    rerender(<ShiftDutyDetailsModal {...defaultProps} activeTab="TEAMMATES" />);

    expect(screen.getByText("Trần Thị Lan")).toBeDefined();
    expect(screen.getByText("2 nhiệm vụ")).toBeDefined();
    expect(screen.getByText("1/2 hoàn thành")).toBeDefined();
    expect(screen.getByText("Đóng gói đơn hoạ cụ Shopee")).toBeDefined();
    expect(screen.getByText("Gói kỹ cọ và hũ màu Acrylic")).toBeDefined();
    expect(screen.getByText("Kiểm đếm giấy can vẽ")).toBeDefined();
    expect(screen.getByText("Đang chờ")).toBeDefined();
    expect(screen.getByText("Đã xong")).toBeDefined();
  });

  it("renders empty states for both MY_DUTIES (with teammate banner) and TEAMMATES tabs", () => {
    const { rerender } = render(
      <ShiftDutyDetailsModal
        {...defaultProps}
        myDuties={[]}
        totalMyDuties={0}
        completedCount={0}
        totalTeamDuties={2}
      />
    );

    expect(
      screen.getByText("Không có nhiệm vụ nào được giao cho bạn ca hôm nay.")
    ).toBeDefined();
    expect(screen.getByText("Xem cả ca")).toBeDefined();

    fireEvent.click(screen.getByText("Xem cả ca"));
    expect(mockSetActiveTab).toHaveBeenCalledWith("TEAMMATES");

    // Render empty TEAMMATES tab
    rerender(
      <ShiftDutyDetailsModal
        {...defaultProps}
        activeTab="TEAMMATES"
        teammateDuties={[]}
        totalTeamDuties={0}
      />
    );

    expect(
      screen.getByText("Hôm nay chưa có đồng nghiệp nào được giao nhiệm vụ ca trực.")
    ).toBeDefined();
  });

  it("closes modal when clicking Đóng button", () => {
    render(<ShiftDutyDetailsModal {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(mockSetModalOpen).toHaveBeenCalledWith(false);
  });
});
