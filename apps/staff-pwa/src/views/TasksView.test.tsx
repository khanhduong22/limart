import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { TasksView } from "./TasksView";

// Mock router and api-query
vi.mock("@/lib/router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/api-query", () => ({
  useAppQuery: () => ({
    data: { success: true, data: [] },
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

describe("TasksView: Role-Based Differentiation (USER vs PARTNER)", () => {
  it("renders warehouse quick actions (Đóng gói đơn & Bưng vác hàng) for shop staff (USER)", () => {
    render(<TasksView userRole="USER" />);

    expect(screen.getByText("Nhiệm vụ & KPI")).toBeDefined();
    expect(screen.getByText("Đóng gói đơn")).toBeDefined();
    expect(screen.getByText("Bưng vác hàng")).toBeDefined();
  });

  it("hides warehouse packing & carrying buttons for WFH PARTNER and shows KPI overview card", () => {
    render(<TasksView userRole="PARTNER" />);

    // Must NOT have warehouse tasks
    expect(screen.queryByText("Đóng gói đơn")).toBeNull();
    expect(screen.queryByText("Bưng vác hàng")).toBeNull();

    // Must have WFH task banner
    expect(
      screen.getByText("Nhiệm Vụ Được Giao & Chỉ Tiêu KPI")
    ).toBeDefined();
    expect(
      screen.getByText(/Theo dõi nhiệm vụ WFH, nội dung & hoàn thành chỉ tiêu/i)
    ).toBeDefined();
  });
});
