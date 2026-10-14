import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { EmployeePayrollDailyTable } from "./EmployeePayrollDailyTable";

describe("EmployeePayrollDailyTable Component", () => {
  const mockFormatVND = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;

  it("renders empty state message when dailyDetails is undefined or empty", () => {
    const { rerender } = render(
      <EmployeePayrollDailyTable dailyDetails={undefined} formatVND={mockFormatVND} />
    );
    expect(screen.getByText("Chưa có dữ liệu chấm công tháng này.")).toBeDefined();

    rerender(
      <EmployeePayrollDailyTable dailyDetails={[]} formatVND={mockFormatVND} />
    );
    expect(screen.getByText("Chưa có dữ liệu chấm công tháng này.")).toBeDefined();
  });

  it("renders table with correct headers and daily shift records", () => {
    const mockDailyDetails = [
      {
        date: "2026-10-01T00:00:00.000Z",
        checkIn: "2026-10-01T08:00:00.000Z",
        checkOut: "2026-10-01T17:00:00.000Z",
        hours: 8.5,
        salary: 212500,
      },
      {
        date: "2026-10-02T00:00:00.000Z",
        checkIn: null,
        checkOut: null,
        hours: 0,
        salary: 0,
      },
    ];

    render(
      <EmployeePayrollDailyTable
        dailyDetails={mockDailyDetails}
        formatVND={mockFormatVND}
      />
    );

    // Table title and headers
    expect(screen.getByText("Chi tiết công theo từng ngày")).toBeDefined();
    expect(screen.getByText("Ngày")).toBeDefined();
    expect(screen.getByText("Vào")).toBeDefined();
    expect(screen.getByText("Ra")).toBeDefined();
    expect(screen.getByText("Giờ")).toBeDefined();
    expect(screen.getByText("Lương")).toBeDefined();

    // First row verification
    expect(screen.getByText("8.5h")).toBeDefined();
    expect(screen.getByText("212.500 ₫")).toBeDefined();

    // Second row verification (empty/zero fallbacks)
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(2);

    const missingTimes = screen.getAllByText("--:--");
    expect(missingTimes.length).toBeGreaterThanOrEqual(2);
  });
});
