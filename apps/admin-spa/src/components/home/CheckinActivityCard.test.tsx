import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CheckinActivityCard } from "./CheckinActivityCard";

describe("CheckinActivityCard", () => {
  const dummyFormatTime = (d: string | Date | null) => {
    if (!d) return "--:--";
    return "08:00";
  };

  const dummyGetShiftStatus = (checkin: any) => {
    if (checkin.type === "checkin") {
      return <span data-testid="shift-status">Đúng giờ</span>;
    }
    return null;
  };

  it("renders empty state message when there are no checkins", () => {
    render(
      <MemoryRouter>
        <CheckinActivityCard
          checkinsToday={[]}
          formatTime={dummyFormatTime}
          getShiftStatus={dummyGetShiftStatus}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Hoạt động chấm công")).toBeDefined();
    expect(screen.getByText("Chưa có lượt chấm công nào hôm nay.")).toBeDefined();
  });

  it("handles null or undefined checkinsToday gracefully", () => {
    render(
      <MemoryRouter>
        <CheckinActivityCard
          checkinsToday={undefined as any}
          formatTime={dummyFormatTime}
          getShiftStatus={dummyGetShiftStatus}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Chưa có lượt chấm công nào hôm nay.")).toBeDefined();
  });

  it("renders check-in and check-out items with correct labels and links", () => {
    const mockCheckins = [
      {
        id: "checkin-1",
        userId: "user-123",
        type: "checkin",
        timestamp: "2026-10-14T08:00:00Z",
        user: { name: "Nguyễn Văn A" },
      },
      {
        id: "checkout-1",
        userId: "user-456",
        type: "checkout",
        timestamp: "2026-10-14T17:00:00Z",
        user: { name: "Trần Thị B" },
      },
    ];

    render(
      <MemoryRouter>
        <CheckinActivityCard
          checkinsToday={mockCheckins}
          formatTime={dummyFormatTime}
          getShiftStatus={dummyGetShiftStatus}
        />
      </MemoryRouter>
    );

    // Verify employee names rendered as links
    const linkA = screen.getByRole("link", { name: "Nguyễn Văn A" });
    expect(linkA).toBeDefined();
    expect(linkA.getAttribute("href")).toBe("/employees/user-123");

    const linkB = screen.getByRole("link", { name: "Trần Thị B" });
    expect(linkB).toBeDefined();
    expect(linkB.getAttribute("href")).toBe("/employees/user-456");

    // Verify type badges
    expect(screen.getByText("🟢 Vào ca")).toBeDefined();
    expect(screen.getByText("👋 Tan ca")).toBeDefined();

    // Verify user initial avatars
    expect(screen.getByText("N")).toBeDefined();
    expect(screen.getByText("T")).toBeDefined();

    // Verify shift status indicator
    expect(screen.getByTestId("shift-status")).toBeDefined();
  });

  it("falls back to default labels and '?' initial when user is undefined", () => {
    const mockCheckins = [
      {
        id: "checkin-anonymous",
        userId: "user-unknown",
        type: "checkin",
        timestamp: "2026-10-14T08:00:00Z",
      },
    ];

    render(
      <MemoryRouter>
        <CheckinActivityCard
          checkinsToday={mockCheckins}
          formatTime={dummyFormatTime}
          getShiftStatus={dummyGetShiftStatus}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Nhân viên")).toBeDefined();
    expect(screen.getByText("?")).toBeDefined();
  });
});
