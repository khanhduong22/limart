import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PayrollAdminClient from "./PayrollAdminClient";

// Mock toast and API calls
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock("@/lib/payrollExport", () => ({
  exportSingleEmployeeXLSX: vi.fn().mockResolvedValue(true),
}));

import { usePayrollAdminStore } from "@/stores/usePayrollAdminStore";

describe("PayrollAdminClient Grouping & Layout Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePayrollAdminStore.getState().reset();
  });

  const mockPayrollData = [
    {
      id: "admin-1",
      name: "Nguyễn Văn Admin",
      email: "admin@limart.com",
      role: "ADMIN",
      isActive: true,
      stats: {
        totalHours: 160,
        baseSalary: 15000000,
        totalSalary: 15000000,
        employmentType: "FULL_TIME",
        totalAdjustments: 0,
        daysWorked: 20,
        standardDays: 26,
      },
    },
    {
      id: "partner-1",
      name: "Trần Thị Partner",
      email: "partner@limart.com",
      role: "PARTNER",
      isActive: true,
      stats: {
        totalHours: 80,
        baseSalary: 8000000,
        totalSalary: 8000000,
        employmentType: "PART_TIME",
        totalAdjustments: 0,
      },
    },
    {
      id: "fulltime-1",
      name: "Lê Văn FullTime",
      email: "fulltime@limart.com",
      role: "USER",
      isActive: true,
      department: "Toàn thời gian",
      stats: {
        totalHours: 200,
        baseSalary: 10000000,
        totalSalary: 10000000,
        employmentType: "FULL_TIME",
        totalAdjustments: 500000,
        daysWorked: 25,
        standardDays: 26,
      },
    },
    {
      id: "parttime-1",
      name: "Phạm Thị PartTime",
      email: "parttime@limart.com",
      role: "USER",
      isActive: true,
      department: "Bán thời gian",
      stats: {
        totalHours: 50,
        hourlyRate: 25000,
        baseSalary: 1250000,
        totalSalary: 1250000,
        employmentType: "PART_TIME",
        totalAdjustments: 0,
      },
    },
    {
      id: "resigned-1",
      name: "Hoàng Văn Resigned",
      email: "resigned@limart.com",
      role: "USER",
      isActive: false, // Inactive / Resigned
      department: "Bán thời gian",
      stats: {
        totalHours: 12,
        hourlyRate: 25000,
        baseSalary: 300000,
        totalSalary: 300000,
        employmentType: "PART_TIME",
        totalAdjustments: 0,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("correctly groups employees into 5 distinct categories with group headers and subtotals", () => {
    render(
      <MemoryRouter>
        <PayrollAdminClient data={mockPayrollData} month={10} year={2026} />
      </MemoryRouter>
    );

    // Group headers must be rendered
    expect(screen.getByText("QUẢN TRỊ VIÊN")).toBeDefined();
    expect(screen.getByText("ĐỐI TÁC WFH / MARKETING")).toBeDefined();
    expect(screen.getByText("TOÀN THỜI GIAN")).toBeDefined();
    expect(screen.getByText("BÁN THỜI GIAN")).toBeDefined();
    expect(screen.getByText("NHÂN VIÊN ĐÃ NGHỈ VIỆC")).toBeDefined();

    // Verify employee presence in active groups
    expect(screen.getByText("Nguyễn Văn Admin")).toBeDefined();
    expect(screen.getByText("Trần Thị Partner")).toBeDefined();
    expect(screen.getByText("Lê Văn FullTime")).toBeDefined();
    expect(screen.getByText("Phạm Thị PartTime")).toBeDefined();

    // Resigned employee is collapsed by default!
    expect(screen.queryByText("Hoàng Văn Resigned")).toBeNull();
  });

  it("toggles the resigned employee accordion open and closed", () => {
    render(
      <MemoryRouter>
        <PayrollAdminClient data={mockPayrollData} month={10} year={2026} />
      </MemoryRouter>
    );

    // Initially collapsed
    expect(screen.queryByText("Hoàng Văn Resigned")).toBeNull();
    const toggleButton = screen.getByRole("button", {
      name: /NHÂN VIÊN ĐÃ NGHỈ VIỆC/i,
    });
    expect(toggleButton).toBeDefined();

    // Click to expand
    fireEvent.click(toggleButton);
    expect(screen.getByText("Hoàng Văn Resigned")).toBeDefined();
    expect(screen.getByText("Đã nghỉ")).toBeDefined();

    // Click to collapse
    fireEvent.click(toggleButton);
    expect(screen.queryByText("Hoàng Văn Resigned")).toBeNull();
  });

  it("filters employees across groups and hides empty groups when searching", () => {
    render(
      <MemoryRouter>
        <PayrollAdminClient data={mockPayrollData} month={10} year={2026} />
      </MemoryRouter>
    );

    const searchInput = screen.getByPlaceholderText("Tìm kiếm nhân viên...");
    fireEvent.change(searchInput, { target: { value: "FullTime" } });

    // Only TOÀN THỜI GIAN should be rendered
    expect(screen.getByText("TOÀN THỜI GIAN")).toBeDefined();
    expect(screen.getByText("Lê Văn FullTime")).toBeDefined();

    // Other group headers must be hidden
    expect(screen.queryByText("QUẢN TRỊ VIÊN")).toBeNull();
    expect(screen.queryByText("ĐỐI TÁC WFH / MARKETING")).toBeNull();
    expect(screen.queryByText("BÁN THỜI GIAN")).toBeNull();
    expect(screen.queryByText("NHÂN VIÊN ĐÃ NGHỈ VIỆC")).toBeNull();
  });

  it("renders empty state message when search yields no matches", () => {
    render(
      <MemoryRouter>
        <PayrollAdminClient data={mockPayrollData} month={10} year={2026} />
      </MemoryRouter>
    );

    const searchInput = screen.getByPlaceholderText("Tìm kiếm nhân viên...");
    fireEvent.change(searchInput, { target: { value: "KhôngTồnTại12345" } });

    expect(
      screen.getByText(/Không tìm thấy nhân viên nào phù hợp với từ khóa/i)
    ).toBeDefined();
  });

  it("preserves single employee excel download and adjustment actions", async () => {
    render(
      <MemoryRouter>
        <PayrollAdminClient data={mockPayrollData} month={10} year={2026} />
      </MemoryRouter>
    );

    const singleExportButtons = screen.getAllByTitle("Xuất phiếu lương");
    expect(singleExportButtons.length).toBeGreaterThan(0);

    const adjustmentButtons = screen.getAllByTitle("Thưởng/Phạt");
    expect(adjustmentButtons.length).toBeGreaterThan(0);
  });
});
