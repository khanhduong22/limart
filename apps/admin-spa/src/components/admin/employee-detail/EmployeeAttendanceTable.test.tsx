import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { EmployeeAttendanceTable } from "./EmployeeAttendanceTable";

describe("EmployeeAttendanceTable Component", () => {
  it("renders empty state message when dailyDetails is empty or undefined", () => {
    const { rerender } = render(<EmployeeAttendanceTable month={10} year={2026} dailyDetails={[]} />);

    expect(screen.getByText("Bảng Chấm Công Chi Tiết")).toBeDefined();
    expect(screen.getByText("Dữ liệu chấm công tháng 10/2026")).toBeDefined();
    expect(
      screen.getByText("Chưa có dữ liệu chấm công trong tháng 10/2026.")
    ).toBeDefined();

    rerender(<EmployeeAttendanceTable month={11} year={2026} dailyDetails={undefined} />);
    expect(
      screen.getByText("Chưa có dữ liệu chấm công trong tháng 11/2026.")
    ).toBeDefined();
  });

  it("renders daily rows with correct formatting, shifts, and timestamps", () => {
    const mockDetails = [
      {
        date: "2026-10-01T00:00:00.000Z",
        shift: "Ca Sáng",
        checkIn: "2026-10-01T08:00:00.000Z",
        checkOut: "2026-10-01T12:00:00.000Z",
        hours: 4.0,
        salary: 100000,
      },
      {
        date: "2026-10-02T00:00:00.000Z",
        shift: undefined, // Default "Thường"
        checkIn: "2026-10-02T13:00:00.000Z",
        checkOut: null, // Thiếu OUT
        hours: 0,
        salary: 0,
      },
      {
        date: "2026-10-03T00:00:00.000Z",
        shift: "Ca Tối",
        checkIn: null, // Thiếu IN
        checkOut: "2026-10-03T22:00:00.000Z",
        hours: 4.5,
        salary: 120000,
      },
    ];

    render(<EmployeeAttendanceTable month={10} year={2026} dailyDetails={mockDetails} />);

    // Table headers
    expect(screen.getByText("Ngày")).toBeDefined();
    expect(screen.getByText("Ca")).toBeDefined();
    expect(screen.getByText("Vào / Ra")).toBeDefined();
    expect(screen.getByText("Giờ công")).toBeDefined();
    expect(screen.getByText("Lương")).toBeDefined();

    // Row 1: Ca Sáng, hours, salary
    expect(screen.getByText("Ca Sáng")).toBeDefined();
    expect(screen.getByText("4.0h")).toBeDefined();

    // Row 2: Default shift "Thường", missing OUT
    expect(screen.getByText("Thường")).toBeDefined();
    expect(screen.getByText("Thiếu OUT")).toBeDefined();

    // Row 3: Missing IN
    expect(screen.getByText("Thiếu IN")).toBeDefined();
    expect(screen.getByText("Ca Tối")).toBeDefined();
    expect(screen.getByText("4.5h")).toBeDefined();
  });
});
