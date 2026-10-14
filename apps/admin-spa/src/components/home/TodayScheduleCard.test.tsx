import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayScheduleCard } from "./TodayScheduleCard";

describe("TodayScheduleCard", () => {
  const dummyFormatTime = (d: string | Date | null) => {
    if (!d) return "--:--";
    const date = new Date(d);
    return date.toISOString().slice(11, 16);
  };

  it("renders empty state message when there are no shifts today", () => {
    render(
      <MemoryRouter>
        <TodayScheduleCard
          todayShifts={[]}
          formatTime={dummyFormatTime}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Lịch làm việc hôm nay")).toBeDefined();
    expect(screen.getByText("Không có lịch làm việc hôm nay.")).toBeDefined();
  });

  it("handles null or undefined todayShifts gracefully", () => {
    render(
      <MemoryRouter>
        <TodayScheduleCard
          todayShifts={undefined as any}
          formatTime={dummyFormatTime}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Không có lịch làm việc hôm nay.")).toBeDefined();
  });

  it("renders shift items with avatar, employee link, and shift times", () => {
    const mockShifts = [
      {
        id: "shift-1",
        userId: "user-101",
        start: "2026-10-14T08:00:00Z",
        end: "2026-10-14T12:00:00Z",
        user: {
          name: "Lê Thị C",
          image: "https://example.com/avatar1.jpg",
        },
      },
    ];

    render(
      <MemoryRouter>
        <TodayScheduleCard
          todayShifts={mockShifts}
          formatTime={dummyFormatTime}
        />
      </MemoryRouter>
    );

    // Verify employee link
    const link = screen.getByRole("link", { name: "Lê Thị C" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/employees/user-101");

    // Verify image attributes
    const img = screen.getByRole("img", { name: "Lê Thị C" }) as HTMLImageElement;
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("https://example.com/avatar1.jpg");
    expect(img.getAttribute("width")).toBe("24");
    expect(img.getAttribute("height")).toBe("24");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");

    // Verify shift time interval
    expect(screen.getByText("08:00 - 12:00")).toBeDefined();
  });

  it("gracefully falls back to /icons/capy_dashboard.webp on image load error", () => {
    const mockShifts = [
      {
        id: "shift-broken-img",
        userId: "user-102",
        start: "2026-10-14T13:00:00Z",
        end: "2026-10-14T17:00:00Z",
        user: {
          name: "Phạm Văn D",
          image: "https://example.com/broken-avatar.jpg",
        },
      },
    ];

    render(
      <MemoryRouter>
        <TodayScheduleCard
          todayShifts={mockShifts}
          formatTime={dummyFormatTime}
        />
      </MemoryRouter>
    );

    const img = screen.getByRole("img", { name: "Phạm Văn D" }) as HTMLImageElement;
    fireEvent.error(img);

    expect(img.src).toContain("/icons/capy_dashboard.webp");
  });

  it("renders initial fallback when user has no image", () => {
    const mockShifts = [
      {
        id: "shift-no-img",
        userId: "user-103",
        start: "2026-10-14T09:00:00Z",
        end: "2026-10-14T15:00:00Z",
        user: {
          name: "Hoàng Gia E",
          image: null,
        },
      },
    ];

    render(
      <MemoryRouter>
        <TodayScheduleCard
          todayShifts={mockShifts}
          formatTime={dummyFormatTime}
        />
      </MemoryRouter>
    );

    // Initial avatar should display "H"
    expect(screen.getByText("H")).toBeDefined();
    expect(screen.getByText("Hoàng Gia E")).toBeDefined();
  });

  it("renders default fallback label when user object is missing", () => {
    const mockShifts = [
      {
        id: "shift-no-user",
        userId: "user-anon",
        start: "2026-10-14T09:00:00Z",
        end: "2026-10-14T15:00:00Z",
      },
    ];

    render(
      <MemoryRouter>
        <TodayScheduleCard
          todayShifts={mockShifts}
          formatTime={dummyFormatTime}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Nhân sự")).toBeDefined();
    expect(screen.getByText("?")).toBeDefined();
  });
});
