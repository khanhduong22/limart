import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CarryingHistoryList,
  type CarryingHistoryItem,
} from "./CarryingHistoryList";

describe("CarryingHistoryList Component", () => {
  const mockApprovedItem: CarryingHistoryItem = {
    id: "hist-1",
    status: "APPROVED",
    quantity: 3,
    finalAmount: 15,
    unitPrice: 5000,
    createdAt: "2026-10-14T01:00:00.000Z",
    submittedAt: "2026-10-14T01:00:00.000Z",
    taskDefinition: {
      id: "def-1",
      name: "Bưng thùng sữa lên lầu 1",
      unit: "thùng",
      baseReward: 5000,
    },
    note: "Đã hoàn thành trước ca trưa",
  };

  const mockPendingItem: CarryingHistoryItem = {
    id: "hist-2",
    status: "PENDING",
    quantity: 2,
    unitPrice: 3000,
    createdAt: "2026-10-14T02:00:00.000Z",
    submittedAt: "2026-10-14T02:00:00.000Z",
    taskDefinition: {
      id: "def-2",
      name: "Bưng kiện quần áo kho lầu 2",
      unit: "kiện",
      baseReward: 3000,
    },
  };

  const mockRejectedItem: CarryingHistoryItem = {
    id: "hist-3",
    status: "REJECTED",
    quantity: 1,
    unitPrice: 10000,
    createdAt: "2026-10-14T03:00:00.000Z",
    submittedAt: "2026-10-14T03:00:00.000Z",
    taskDefinition: {
      id: "def-3",
      name: "Bưng két bia lên lầu",
      unit: "két",
      baseReward: 10000,
    },
    rejectReason: "Ảnh chụp bằng chứng bị mờ, không thấy số phòng",
    evidenceLink: "https://photos.example.com/evidence-123.jpg",
  };

  it("renders loading state when isLoading is true", () => {
    render(
      <CarryingHistoryList
        history={[]}
        isLoading={true}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Đang tải lịch sử...")).toBeDefined();
  });

  it("renders empty state when history list is empty", () => {
    render(
      <CarryingHistoryList
        history={[]}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(
      screen.getByText("Chưa có lượt khai báo bưng hàng nào")
    ).toBeDefined();
    expect(
      screen.getByText("Hãy chuyển sang tab Bảng Quy Đổi Điểm để gửi báo cáo nhé!")
    ).toBeDefined();
  });

  it("renders approved item with points badge and note", () => {
    render(
      <CarryingHistoryList
        history={[mockApprovedItem]}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Bưng thùng sữa lên lầu 1")).toBeDefined();
    expect(screen.getByText("+15 điểm bưng")).toBeDefined();
    expect(screen.getByText(/3 thùng/i)).toBeDefined();
    expect(screen.getByText(/Đã hoàn thành trước ca trưa/i)).toBeDefined();
  });

  it("renders pending item with awaiting badge", () => {
    render(
      <CarryingHistoryList
        history={[mockPendingItem]}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Bưng kiện quần áo kho lầu 2")).toBeDefined();
    expect(screen.getByText("Đang chờ duyệt")).toBeDefined();
    expect(screen.getByText(/2 kiện/i)).toBeDefined();
  });

  it("renders rejected item with reason and evidence link", () => {
    render(
      <CarryingHistoryList
        history={[mockRejectedItem]}
        isLoading={false}
        onOpenModal={vi.fn()}
      />
    );

    expect(screen.getByText("Bưng két bia lên lầu")).toBeDefined();
    expect(screen.getByText("Bị từ chối")).toBeDefined();
    expect(
      screen.getByText("Ảnh chụp bằng chứng bị mờ, không thấy số phòng")
    ).toBeDefined();
    const link = screen.getByRole("link", { name: "https://photos.example.com/evidence-123.jpg" });
    expect(link.getAttribute("href")).toBe("https://photos.example.com/evidence-123.jpg");
    expect(screen.getByRole("button", { name: "Khai báo nộp lại" })).toBeDefined();
  });

  it("calls onOpenModal when re-submitting a rejected item with taskDef", () => {
    const onOpenModalMock = vi.fn();
    render(
      <CarryingHistoryList
        history={[mockRejectedItem]}
        isLoading={false}
        onOpenModal={onOpenModalMock}
      />
    );

    const reSubmitBtn = screen.getByRole("button", { name: "Khai báo nộp lại" });
    fireEvent.click(reSubmitBtn);

    expect(onOpenModalMock).toHaveBeenCalledTimes(1);
    expect(onOpenModalMock).toHaveBeenCalledWith({
      id: "def-3",
      name: "Bưng két bia lên lầu",
      title: "Bưng két bia lên lầu",
      baseReward: 10000,
      unit: "két",
    });
  });

  it("calls onSwitchTab when re-submitting a rejected item without taskDef", () => {
    const onOpenModalMock = vi.fn();
    const onSwitchTabMock = vi.fn();

    const itemWithoutDef: CarryingHistoryItem = {
      id: "hist-orphan",
      status: "REJECTED",
      quantity: 1,
      unitPrice: 5000,
      createdAt: "2026-10-14T03:00:00.000Z",
    };

    render(
      <CarryingHistoryList
        history={[itemWithoutDef]}
        isLoading={false}
        onOpenModal={onOpenModalMock}
        onSwitchTab={onSwitchTabMock}
      />
    );

    const reSubmitBtn = screen.getByRole("button", { name: "Khai báo nộp lại" });
    fireEvent.click(reSubmitBtn);

    expect(onOpenModalMock).not.toHaveBeenCalled();
    expect(onSwitchTabMock).toHaveBeenCalledTimes(1);
  });
});
