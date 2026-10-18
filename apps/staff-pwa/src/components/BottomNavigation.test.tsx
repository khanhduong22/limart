import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomNavigation } from "./BottomNavigation";

describe("BottomNavigation (Option A - Big-Tech 5 Tabs Standard)", () => {
  it("renders 5 tabs for regular staff: Chấm công, Công việc, Lịch trực, Bảng lương, Cá nhân", () => {
    const handleChangeTab = vi.fn();

    render(
      <BottomNavigation
        currentTab="home"
        onChangeTab={handleChangeTab}
        userRole="STAFF"
      />
    );

    expect(screen.getByText("Chấm công")).toBeDefined();
    expect(screen.getByText("Công việc")).toBeDefined();
    expect(screen.getByText("Lịch trực")).toBeDefined();
    expect(screen.getByText("Bảng lương")).toBeDefined();
    expect(screen.getByText("Cá nhân")).toBeDefined();

    // Verify 5 buttons in navigation
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(5);

    // Click "Công việc" tab
    fireEvent.click(screen.getByText("Công việc"));
    expect(handleChangeTab).toHaveBeenCalledWith("tasks");

    // Click "Lịch trực" tab
    fireEvent.click(screen.getByText("Lịch trực"));
    expect(handleChangeTab).toHaveBeenCalledWith("schedule");
  });

  it("renders 3 tabs for PARTNER role: Công việc, Bảng lương, Cá nhân", () => {
    const handleChangeTab = vi.fn();

    render(
      <BottomNavigation
        currentTab="tasks"
        onChangeTab={handleChangeTab}
        userRole="PARTNER"
      />
    );

    expect(screen.getByText("Công việc")).toBeDefined();
    expect(screen.getByText("Bảng lương")).toBeDefined();
    expect(screen.getByText("Cá nhân")).toBeDefined();

    // Verify home and schedule tabs are NOT shown for Partner
    expect(screen.queryByText("Chấm công")).toBeNull();
    expect(screen.queryByText("Lịch trực")).toBeNull();

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(3);

    // Click "Bảng lương"
    fireEvent.click(screen.getByText("Bảng lương"));
    expect(handleChangeTab).toHaveBeenCalledWith("payroll");
  });
});
