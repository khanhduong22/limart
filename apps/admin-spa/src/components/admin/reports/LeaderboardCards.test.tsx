import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LeaderboardCards } from "./LeaderboardCards";

const mockReport = {
  topHardworking: [
    { id: "u-1", name: "Nguyễn Văn Chăm", totalHours: 145, daysWorked: 26 },
    { id: "u-2", name: "Trần Thị Cần Cù", totalHours: 120, daysWorked: 24 },
  ],
  topDiscipline: [
    {
      user: { id: "u-3", name: "Lê Đúng Giờ", image: "https://example.com/avatar1.jpg" },
      totalScheduledCheckins: 26,
      punctualityRate: 100,
    },
    {
      user: { id: "u-4", name: "Phạm Kỷ Luật", image: null },
      totalScheduledCheckins: 25,
      punctualityRate: 98,
    },
  ],
  topOvertime: [
    { id: "u-5", name: "Hoàng Cày Cuốc", avgOvertime: 2.5, displayOvertimeHours: 65, daysWorked: 26 },
  ],
  topPacking: [
    { id: "u-6", name: "Vũ Đóng Hàng", points: 65 },
    { id: "u-7", name: "Đặng Đóng Gói", points: 40 },
  ],
  topCarrying: [
    { id: "u-8", name: "Bùi Bưng Hàng", points: 55 },
  ],
  topLate: [
    {
      user: { id: "u-9", name: "Trương Đi Muộn" },
      lateCount: 6,
      totalLateMinutes: 45,
    },
    {
      user: { id: "u-10", name: "Ngô Trễ Nải" },
      lateCount: 2,
      totalLateMinutes: 10,
    },
  ],
};

function renderComponent(props: { report: any }) {
  return render(
    <MemoryRouter>
      <LeaderboardCards {...props} />
    </MemoryRouter>
  );
}

describe("LeaderboardCards Component", () => {
  it("renders all 6 leaderboard cards with full data", () => {
    renderComponent({ report: mockReport });

    // Top Chăm Chỉ
    expect(screen.getByText("🐝 Top Chăm Chỉ")).toBeDefined();
    expect(screen.getByText("Nguyễn Văn Chăm")).toBeDefined();
    expect(screen.getByText("+200k")).toBeDefined(); // >= 130h bonus
    expect(screen.getByText("145.0h")).toBeDefined();

    // Top Kỷ Luật
    expect(screen.getByText("🌟 Top Kỷ Luật")).toBeDefined();
    expect(screen.getByText("Lê Đúng Giờ")).toBeDefined();
    expect(screen.getByText("100.0%")).toBeDefined();

    // Top Cày Cuốc (OT)
    expect(screen.getByText("🔥 Top Cày Cuốc (OT)")).toBeDefined();
    expect(screen.getByText("Hoàng Cày Cuốc")).toBeDefined();
    expect(screen.getByText("2.5h/ca")).toBeDefined();

    // Vua Đóng Hàng
    expect(screen.getByText("📦 Vua Đóng Hàng")).toBeDefined();
    expect(screen.getByText("Vũ Đóng Hàng")).toBeDefined();
    expect(screen.getByText("65đ")).toBeDefined();
    expect(screen.getAllByText("+200K").length).toBe(2); // points > 50 for both packing and carrying

    // Chiến Thần Bưng Hàng
    expect(screen.getByText("🛗 Chiến Thần Bưng Hàng")).toBeDefined();
    expect(screen.getByText("Bùi Bưng Hàng")).toBeDefined();
    expect(screen.getByText("55đ")).toBeDefined();

    // Báo cáo Vi Phạm
    expect(screen.getByText("🚨 Báo cáo Vi Phạm (Đi muộn)")).toBeDefined();
    expect(screen.getByText("Trương Đi Muộn")).toBeDefined();
    expect(screen.getByText("Cảnh báo đỏ")).toBeDefined(); // lateCount > 5
    expect(screen.getByText("Ngô Trễ Nải")).toBeDefined();
    expect(screen.getByText("Cần nhắc nhở")).toBeDefined(); // lateCount <= 5
  });

  it("handles non-recursive image error fallback guard (Section 9.15)", () => {
    renderComponent({ report: mockReport });

    // Find avatar image rendered for Lê Đúng Giờ
    const avatarImg = screen.getByAltText("Lê Đúng Giờ") as HTMLImageElement;
    expect(avatarImg).toBeDefined();
    expect(avatarImg.src).toBe("https://example.com/avatar1.jpg");

    // Simulate image error event
    fireEvent.error(avatarImg);

    // Verify fallback image is applied and onerror handler is reset to null
    expect(avatarImg.src).toContain("/icons/capy_dashboard.webp");
    expect(avatarImg.onerror).toBeNull();

    // Trigger error again when already on fallback: must not re-trigger or change src
    fireEvent.error(avatarImg);
    expect(avatarImg.src).toContain("/icons/capy_dashboard.webp");
  });

  it("renders rank number fallback when user has no avatar image", () => {
    renderComponent({ report: mockReport });

    // Phạm Kỷ Luật has image: null -> should render rank "2" text instead of <img>
    expect(screen.queryByAltText("Phạm Kỷ Luật")).toBeNull();
    expect(screen.getByText("Phạm Kỷ Luật")).toBeDefined();
  });

  it("renders empty state gracefully when all lists are empty", () => {
    const emptyReport = {
      topHardworking: [],
      topDiscipline: [],
      topOvertime: [],
      topPacking: [],
      topCarrying: [],
      topLate: [],
    };

    renderComponent({ report: emptyReport });

    const emptyNotices = screen.getAllByText("Chưa có dữ liệu");
    expect(emptyNotices.length).toBe(5); // 5 hero cards have "Chưa có dữ liệu"

    expect(
      screen.getByText("👏 Tuyệt vời! Tháng này chưa có ai vi phạm.")
    ).toBeDefined();
  });
});
