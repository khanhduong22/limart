import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportsPage } from "./ReportsPage";
import * as adminQueryModule from "@/hooks/useAdminQuery";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ReportsPage Performance & CLS Audit", () => {
  it("renders leaderboard cards and summary stats without layout shifting images", async () => {
    vi.spyOn(adminQueryModule, "useAdminQuery").mockReturnValue({
      data: {
        totalPayrollCost: 25000000,
        totalHoursAll: 1500,
        totalEmployeeCount: 15,
        topHardworking: [
          { id: "u-1", name: "Nguyễn Văn Chăm", totalHours: 145, daysWorked: 26 },
        ],
        topDiscipline: [
          {
            user: { id: "u-2", name: "Trần Kỷ Luật", image: null },
            totalScheduledCheckins: 26,
            punctualityRate: 100,
          },
        ],
        topOvertime: [
          { id: "u-3", name: "Lê Cày Cuốc", avgOvertime: 2.5, displayOvertimeHours: 65, daysWorked: 26 },
        ],
        topPacking: [
          { id: "u-4", name: "Phạm Đóng Hàng", points: 60 },
        ],
        topCarrying: [
          { id: "u-5", name: "Hoàng Bưng Hàng", points: 55 },
        ],
        topLate: [
          {
            user: { id: "u-6", name: "Vũ Đi Muộn" },
            lateCount: 2,
            totalLateMinutes: 15,
          },
        ],
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    } as any);

    renderWithClient(<ReportsPage />);

    expect(screen.getByText("Bảng Thành Tích & Báo Cáo")).toBeDefined();
    expect(await screen.findByText("🐝 Top Chăm Chỉ")).toBeDefined();
    expect(screen.getByText("🌟 Top Kỷ Luật")).toBeDefined();
    expect(screen.getByText("🔥 Top Cày Cuốc (OT)")).toBeDefined();
    expect(screen.getByText("📦 Vua Đóng Hàng")).toBeDefined();
    expect(screen.getByText("🛗 Chiến Thần Bưng Hàng")).toBeDefined();
    expect(screen.getByText("🚨 Báo cáo Vi Phạm (Đi muộn)")).toBeDefined();

    // Verify CLS standard: ensure no unconstrained <img> tags are rendered
    const images = screen.queryAllByRole("img");
    expect(images.length).toBe(0);
  });
});
