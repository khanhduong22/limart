import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PackingHistoryList,
  type PackingHistoryItem,
} from "./PackingHistoryList";

describe("PackingHistoryList Component", () => {
  const mockApprovedItem: PackingHistoryItem = {
    id: "hist-1",
    status: "APPROVED",
    quantity: 5,
    finalAmount: 15,
    unitPrice: 3000,
    createdAt: "2026-10-14T01:00:00.000Z",
    submittedAt: "2026-10-14T01:00:00.000Z",
    taskDefinition: {
      id: "def-1",
      name: "Đóng gói đơn Shopee Hỏa Tốc",
      unit: "đơn",
      baseReward: 3000,
    },
    note: "Đã giao đơn vị vận chuyển trước 11h",
  };

  const mockPendingItem: PackingHistoryItem = {
    id: "hist-2",
    status: "PENDING",
    quantity: 10,
    unitPrice: 2000,
    createdAt: "2026-10-14T02:00:00.000Z",
    submittedAt: "2026-10-14T02:00:00.000Z",
    taskDefinition: {
      id: "def-2",
      name: "Đóng gói bọc xốp chống sốc",
      unit: "kiện",
      baseReward: 2000,
    },
  };

  const mockRejectedItem: PackingHistoryItem = {
    id: "hist-3",
    status: "REJECTED",
    quantity: 2,
    unitPrice: 5000,
    createdAt: "2026-10-14T03:00:00.000Z",
    submittedAt: "2026-10-14T03:00:00.000Z",
    taskDefinition: {
      id: "def-3",
      name: "Đóng thùng carton lớn",
      unit: "thùng",
      baseReward: 5000,
    },
    rejectReason: "Thiếu ảnh chụp niêm phong thùng hàng",
    evidenceLink: "https://photos.example.com/pack-123.jpg",
  };

  it("renders loading state when isLoading is true", () => {
    render(
      <PackingHistoryList
        history={[]}
        isLoading={true}
        onOpenModal={vi.fn()}
        onSwitchToPricelist={vi.fn()}
      />
    );

    expect(screen.getByText("Đang tải lịch sử...")).toBeDefined();
  });

  it("renders empty state when history list is empty", () => {
    render(
      <PackingHistoryList
        history={[]}
        isLoading={false}
        onOpenModal={vi.fn()}
        onSwitchToPricelist={vi.fn()}
      />
    );

    expect(
      screen.getByText("Chưa có lượt khai báo đóng gói nào")
    ).toBeDefined();
    expect(
      screen.getByText("Hãy chuyển sang tab Bảng Giá Điểm để gửi báo cáo nhé!")
    ).toBeDefined();
  });

  it("renders approved item with points badge and note", () => {
    render(
      <PackingHistoryList
        history={[mockApprovedItem]}
        isLoading={false}
        onOpenModal={vi.fn()}
        onSwitchToPricelist={vi.fn()}
      />
    );

    expect(screen.getByText("Đóng gói đơn Shopee Hỏa Tốc")).toBeDefined();
    expect(screen.getByText("+15 điểm")).toBeDefined();
    expect(screen.getByText(/5 đơn/i)).toBeDefined();
    expect(
      screen.getByText(/Đã giao đơn vị vận chuyển trước 11h/i)
    ).toBeDefined();
  });

  it("renders pending and submitted status badges correctly", () => {
    const { rerender } = render(
      <PackingHistoryList
        history={[mockPendingItem]}
        isLoading={false}
        onOpenModal={vi.fn()}
        onSwitchToPricelist={vi.fn()}
      />
    );

    expect(screen.getByText("Đang chờ duyệt")).toBeDefined();
    expect(screen.getByText(/10 kiện/i)).toBeDefined();

    const submittedItem: PackingHistoryItem = {
      ...mockPendingItem,
      id: "hist-sub",
      status: "SUBMITTED",
    };

    rerender(
      <PackingHistoryList
        history={[submittedItem]}
        isLoading={false}
        onOpenModal={vi.fn()}
        onSwitchToPricelist={vi.fn()}
      />
    );

    expect(screen.getByText("Đang chờ duyệt")).toBeDefined();
  });

  it("renders rejected item with reason, evidence link, and resubmit button", () => {
    render(
      <PackingHistoryList
        history={[mockRejectedItem]}
        isLoading={false}
        onOpenModal={vi.fn()}
        onSwitchToPricelist={vi.fn()}
      />
    );

    expect(screen.getByText("Bị từ chối")).toBeDefined();
    expect(screen.getByText("Lý do từ chối:")).toBeDefined();
    expect(
      screen.getByText("Thiếu ảnh chụp niêm phong thùng hàng")
    ).toBeDefined();
    expect(
      screen.getByText("https://photos.example.com/pack-123.jpg")
    ).toBeDefined();
    expect(screen.getByText("Khai báo nộp lại")).toBeDefined();
  });

  it("calls onOpenModal when clicking resubmit on rejected item with taskDefinition", () => {
    const onOpenModalMock = vi.fn();
    render(
      <PackingHistoryList
        history={[mockRejectedItem]}
        isLoading={false}
        onOpenModal={onOpenModalMock}
        onSwitchToPricelist={vi.fn()}
      />
    );

    const resubmitBtn = screen.getByText("Khai báo nộp lại");
    fireEvent.click(resubmitBtn);

    expect(onOpenModalMock).toHaveBeenCalledWith({
      id: "def-3",
      name: "Đóng thùng carton lớn",
      title: "Đóng thùng carton lớn",
      baseReward: 5000,
      unit: "thùng",
    });
  });

  it("calls onSwitchToPricelist when clicking resubmit on rejected item without taskDefinition", () => {
    const onSwitchToPricelistMock = vi.fn();
    const rejectedWithoutDef: PackingHistoryItem = {
      id: "hist-no-def",
      status: "REJECTED",
      quantity: 1,
      unitPrice: 1000,
      createdAt: "2026-10-14T03:00:00.000Z",
    };

    render(
      <PackingHistoryList
        history={[rejectedWithoutDef]}
        isLoading={false}
        onOpenModal={vi.fn()}
        onSwitchToPricelist={onSwitchToPricelistMock}
      />
    );

    const resubmitBtn = screen.getByText("Khai báo nộp lại");
    fireEvent.click(resubmitBtn);

    expect(onSwitchToPricelistMock).toHaveBeenCalled();
  });

  it("falls back to default title and unit when taskDefinition properties are missing", () => {
    const genericItem: PackingHistoryItem = {
      id: "hist-gen",
      status: "APPROVED",
      quantity: 1,
      unitPrice: 1000,
      createdAt: "2026-10-14T04:00:00.000Z",
    };

    render(
      <PackingHistoryList
        history={[genericItem]}
        isLoading={false}
        onOpenModal={vi.fn()}
        onSwitchToPricelist={vi.fn()}
      />
    );

    expect(screen.getByText("Khai báo đóng gói")).toBeDefined();
    expect(screen.getByText(/1 đơn/i)).toBeDefined();
  });
});
