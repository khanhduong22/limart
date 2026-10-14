import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import DefaultCheckinHistoryTable, { CheckinHistoryTable } from "./CheckinHistoryTable";

describe("CheckinHistoryTable Component", () => {
  const mockCheckin = {
    id: "checkin-1",
    type: "checkin",
    timestamp: new Date(2026, 9, 14, 8, 15, 0).toISOString(),
    note: "Đến đúng ca",
  };

  const mockLateCheckin = {
    id: "checkin-2",
    type: "checkin",
    timestamp: new Date(2026, 9, 14, 9, 30, 0).toISOString(),
    note: "Kẹt xe",
  };

  const mockCheckout = {
    id: "checkout-1",
    type: "checkout",
    timestamp: new Date(2026, 9, 14, 18, 0, 0).toISOString(),
  };

  const mockEarlyCheckout = {
    id: "checkout-2",
    type: "checkout",
    timestamp: new Date(2026, 9, 14, 16, 0, 0).toISOString(),
    note: "Xin phép về sớm",
  };

  it("exports both default and named export identically", () => {
    expect(DefaultCheckinHistoryTable).toBe(CheckinHistoryTable);
  });

  it("renders loading state when isLoading is true", () => {
    render(<CheckinHistoryTable history={[]} isLoading={true} />);
    expect(screen.getByText("Đang tải lịch sử chấm công...")).toBeDefined();
    expect(screen.queryByText("Chưa có dữ liệu chấm công nào.")).toBeNull();
  });

  it("renders empty state when history is empty and not loading", () => {
    render(<CheckinHistoryTable history={[]} isLoading={false} />);
    expect(screen.getByText("Chi tiết từng lượt (0)")).toBeDefined();
    expect(screen.getByText("Chưa có dữ liệu chấm công nào.")).toBeDefined();
  });

  it("handles null/undefined history gracefully without throwing", () => {
    // @ts-expect-error testing invalid prop
    render(<CheckinHistoryTable history={null} isLoading={false} />);
    expect(screen.getByText("Chi tiết từng lượt (0)")).toBeDefined();
    expect(screen.getByText("Chưa có dữ liệu chấm công nào.")).toBeDefined();
  });

  it("renders history list items with correct titles and count", () => {
    render(
      <CheckinHistoryTable
        history={[mockCheckin, mockCheckout]}
        isLoading={false}
      />
    );

    expect(screen.getByText("Chi tiết từng lượt (2)")).toBeDefined();
    expect(screen.getByText("Check-in")).toBeDefined();
    expect(screen.getByText("Check-out")).toBeDefined();
    expect(screen.getByText("Đến đúng ca")).toBeDefined();
  });

  it("renders status badge 'Đi muộn' for late check-in", () => {
    render(
      <CheckinHistoryTable
        history={[mockLateCheckin]}
        isLoading={false}
      />
    );

    expect(screen.getByText("Đi muộn")).toBeDefined();
    expect(screen.getByText("Kẹt xe")).toBeDefined();
  });

  it("renders status badge 'Về sớm' for early checkout", () => {
    render(
      <CheckinHistoryTable
        history={[mockEarlyCheckout]}
        isLoading={false}
      />
    );

    expect(screen.getByText("Về sớm")).toBeDefined();
    expect(screen.getByText("Xin phép về sớm")).toBeDefined();
  });

  it("handles fallback timestamp when h.timestamp is undefined", () => {
    const invalidItem = {
      id: "inv-1",
      type: "checkin",
      timestamp: undefined,
    };

    render(
      <CheckinHistoryTable
        history={[invalidItem]}
        isLoading={false}
      />
    );

    expect(screen.getByText("Check-in")).toBeDefined();
  });
});
