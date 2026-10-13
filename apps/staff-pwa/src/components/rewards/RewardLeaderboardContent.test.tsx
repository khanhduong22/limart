import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  RewardLeaderboardContent,
  type LeaderboardData,
  type RewardLeaderboardTab,
} from "./RewardLeaderboardContent";

const mockLeaderboard: LeaderboardData = {
  month: 10,
  year: 2026,
  topDiscipline: [
    {
      name: "Nguyễn Văn Kỷ Luật",
      image: "https://example.com/avatar1.jpg",
      daysWorked: 26,
      totalHours: 130.5,
      punctualityRate: 100,
    },
    {
      user: {
        id: "u-2",
        name: "Trần Thị Đúng Giờ",
        image: null,
      },
      daysWorked: 25,
      totalHours: 125,
      punctualityRate: 99,
    },
    {
      name: "Lê Văn Chuẩn Chỉ",
      image: "https://example.com/avatar3.jpg",
      daysWorked: 24,
      totalHours: 120,
      punctualityRate: 98,
    },
    {
      name: "Phạm Văn Nghiêm Túc",
      image: "https://example.com/avatar4.jpg",
      daysWorked: 23,
      totalHours: 115,
      punctualityRate: 95,
    },
  ],
  topHardworking: [
    {
      id: "u-hw-1",
      name: "Bùi Chăm Chỉ",
      image: "https://example.com/hw1.jpg",
      totalHours: 160.5,
      daysWorked: 27,
    },
    {
      id: "u-hw-2",
      name: "Đặng Cần Cù",
      image: null,
      totalHours: 140,
      daysWorked: 24,
    },
  ],
  topOvertime: [
    {
      id: "u-ot-1",
      name: "Vũ Tăng Ca",
      image: "https://example.com/ot1.jpg",
      displayOvertimeHours: 45.5,
      avgOvertime: 2.1,
    },
  ],
  topPacking: [
    {
      id: "u-pack-1",
      name: "Hoàng Đóng Hàng",
      image: "https://example.com/pack1.jpg",
      points: 88,
    },
  ],
  topCarrying: [
    {
      id: "u-carry-1",
      name: "Ngô Bưng Hàng",
      image: "https://example.com/carry1.jpg",
      points: 75,
    },
  ],
};

function renderComponent(props: {
  activeTab: RewardLeaderboardTab;
  leaderboard?: LeaderboardData;
  isLoading: boolean;
}) {
  return render(<RewardLeaderboardContent {...props} />);
}

describe("RewardLeaderboardContent Component", () => {
  it("renders loading indicator when isLoading is true", () => {
    renderComponent({
      activeTab: "discipline",
      leaderboard: undefined,
      isLoading: true,
    });

    expect(screen.getByText("Đang tải bảng xếp hạng...")).toBeDefined();
  });

  it("renders empty state message when no data is available for category", () => {
    renderComponent({
      activeTab: "discipline",
      leaderboard: {
        topDiscipline: [],
      },
      isLoading: false,
    });

    expect(screen.getByText("Top Chuyên Cần")).toBeDefined();
    expect(
      screen.getByText("Chưa có nhân viên đạt tiêu chuẩn trong tháng này")
    ).toBeDefined();
  });

  it("renders podium rankings and rankings list for Top Chuyên Cần (discipline)", () => {
    renderComponent({
      activeTab: "discipline",
      leaderboard: mockLeaderboard,
      isLoading: false,
    });

    expect(screen.getByText("Top Chuyên Cần")).toBeDefined();
    expect(screen.getByText("Không đi trễ phút nào trong tháng")).toBeDefined();
    expect(screen.getByText("Top 3")).toBeDefined();

    // Top 1
    expect(screen.getByText("Nguyễn Văn Kỷ Luật")).toBeDefined();
    expect(screen.getByText("26 ca")).toBeDefined();
    expect(screen.getByText("130.5 giờ làm việc")).toBeDefined();
    expect(screen.getByText("🥇")).toBeDefined();

    // Top 2
    expect(screen.getByText("Trần Thị Đúng Giờ")).toBeDefined();
    expect(screen.getByText("25 ca")).toBeDefined();
    expect(screen.getByText("🥈")).toBeDefined();

    // Top 3
    expect(screen.getByText("Lê Văn Chuẩn Chỉ")).toBeDefined();
    expect(screen.getByText("24 ca")).toBeDefined();
    expect(screen.getByText("🥉")).toBeDefined();

    // Ranks 4+ (Rankings list)
    expect(screen.getByText("Xếp hạng tiếp theo")).toBeDefined();
    expect(screen.getByText("+1 nhân viên")).toBeDefined();
    expect(screen.getByText("#4")).toBeDefined();
    expect(screen.getByText("Phạm Văn Nghiêm Túc")).toBeDefined();
    expect(screen.getByText("23 ca")).toBeDefined();
  });

  it("renders Top Chăm Chỉ (hardworking) tab correctly", () => {
    renderComponent({
      activeTab: "hardworking",
      leaderboard: mockLeaderboard,
      isLoading: false,
    });

    expect(screen.getByText("Top Chăm Chỉ")).toBeDefined();
    expect(
      screen.getByText("Nhân viên Part-time cống hiến nhiều giờ nhất")
    ).toBeDefined();

    expect(screen.getByText("Bùi Chăm Chỉ")).toBeDefined();
    expect(screen.getByText("160.5 giờ")).toBeDefined();
    expect(screen.getByText("27 ngày làm")).toBeDefined();

    expect(screen.getByText("Đặng Cần Cù")).toBeDefined();
    expect(screen.getByText("140.0 giờ")).toBeDefined();
    expect(screen.getByText("24 ngày làm")).toBeDefined();
  });

  it("renders Chiến Thần Tăng Ca (overtime) tab correctly", () => {
    renderComponent({
      activeTab: "overtime",
      leaderboard: mockLeaderboard,
      isLoading: false,
    });

    expect(screen.getByText("Chiến Thần Tăng Ca")).toBeDefined();
    expect(
      screen.getByText("Thời gian tăng ca trung bình cao nhất")
    ).toBeDefined();

    expect(screen.getByText("Vũ Tăng Ca")).toBeDefined();
    expect(screen.getByText("+45.5h OT")).toBeDefined();
    expect(screen.getByText("TB 2.1h/ngày")).toBeDefined();
  });

  it("renders Vua Đóng Hàng (packing) tab correctly", () => {
    renderComponent({
      activeTab: "packing",
      leaderboard: mockLeaderboard,
      isLoading: false,
    });

    expect(screen.getByText("Vua Đóng Hàng")).toBeDefined();
    expect(
      screen.getByText("Tích luỹ điểm đóng đơn nhiều nhất (+100K cho Top 1)")
    ).toBeDefined();

    expect(screen.getByText("Hoàng Đóng Hàng")).toBeDefined();
    expect(screen.getByText("88 điểm")).toBeDefined();
  });

  it("renders Chiến Thần Bưng Hàng (carrying) tab correctly", () => {
    renderComponent({
      activeTab: "carrying",
      leaderboard: mockLeaderboard,
      isLoading: false,
    });

    expect(screen.getByText("Chiến Thần Bưng Hàng")).toBeDefined();
    expect(
      screen.getByText("Bưng hàng lên lầu nhiều nhất (+200K cho Top 1)")
    ).toBeDefined();

    expect(screen.getByText("Ngô Bưng Hàng")).toBeDefined();
    expect(screen.getByText("75 điểm bưng")).toBeDefined();
  });

  it("renders avatar initial when user has no image", () => {
    renderComponent({
      activeTab: "discipline",
      leaderboard: mockLeaderboard,
      isLoading: false,
    });

    // Trần Thị Đúng Giờ has image: null -> should render 'T' initial
    expect(screen.queryByAltText("Trần Thị Đúng Giờ")).toBeNull();
    expect(screen.getByText("T")).toBeDefined();
  });

  it("strictly enforces Section 9.15 Non-Recursive Image Error Fallback Guard", () => {
    renderComponent({
      activeTab: "discipline",
      leaderboard: mockLeaderboard,
      isLoading: false,
    });

    const avatarImg = screen.getByAltText(
      "Nguyễn Văn Kỷ Luật"
    ) as HTMLImageElement;
    expect(avatarImg).toBeDefined();
    expect(avatarImg.src).toBe("https://example.com/avatar1.jpg");

    // Simulate image error event
    fireEvent.error(avatarImg);

    // Verify fallback image is applied and onerror listener is neutralized (null)
    expect(avatarImg.src).toContain("/capybara_mascot.webp");
    expect(avatarImg.onerror).toBeNull();

    // Trigger second error on fallback: must not re-trigger or change src
    fireEvent.error(avatarImg);
    expect(avatarImg.src).toContain("/capybara_mascot.webp");
  });
});
