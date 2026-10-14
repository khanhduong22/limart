import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import StaffTasksKpiBanner from "./StaffTasksKpiBanner";

describe("StaffTasksKpiBanner", () => {
  it("renders monthly rate percentage and approved/total count badge", () => {
    const mockKPI = {
      total: 10,
      approved: 7,
      completionRate: 0.7,
      doing: 2,
      pendingReview: 1,
      overdue: 0,
    };

    render(
      <StaffTasksKpiBanner
        monthlyRatePct={70}
        monthlyKPI={mockKPI}
      />
    );

    expect(screen.getByText("Hiệu Suất Tháng")).toBeDefined();
    expect(screen.getByText("70%")).toBeDefined();
    expect(screen.getByText("hoàn thành")).toBeDefined();
    expect(screen.getByText("7 / 10 Việc")).toBeDefined();
    expect(screen.getByText("Đang làm")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("Chờ duyệt")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("Đã duyệt")).toBeDefined();
    expect(screen.getByText("Trễ hạn")).toBeDefined();
    expect(screen.getByText("0")).toBeDefined();
  });

  it("handles minimal monthlyKPI props without doing/pendingReview/overdue and defaults to 0", () => {
    const minimalKPI = {
      total: 4,
      approved: 2,
      completionRate: 0.5,
    };

    render(
      <StaffTasksKpiBanner
        monthlyRatePct={50}
        monthlyKPI={minimalKPI}
      />
    );

    expect(screen.getByText("50%")).toBeDefined();
    expect(screen.getByText("2 / 4 Việc")).toBeDefined();
    expect(screen.getByText("Đang làm")).toBeDefined();
    expect(screen.getByText("Chờ duyệt")).toBeDefined();
    expect(screen.getByText("Đã duyệt")).toBeDefined();
    expect(screen.getByText("Trễ hạn")).toBeDefined();
  });

  it("handles null or undefined monthlyKPI safely without crashing", () => {
    render(
      <StaffTasksKpiBanner
        monthlyRatePct={0}
        monthlyKPI={null}
      />
    );

    expect(screen.getByText("0%")).toBeDefined();
    expect(screen.getByText("0 / 0 Việc")).toBeDefined();
    expect(screen.getByText("Hiệu Suất Tháng")).toBeDefined();
  });

  it("sets progress bar width matching monthlyRatePct", () => {
    const { container } = render(
      <StaffTasksKpiBanner
        monthlyRatePct={85}
        monthlyKPI={{ total: 20, approved: 17, completionRate: 0.85 }}
      />
    );

    const progressBar = container.querySelector(".bg-gradient-to-r");
    expect(progressBar).not.toBeNull();
    expect((progressBar as HTMLElement)?.style.width).toBe("85%");
  });
});
