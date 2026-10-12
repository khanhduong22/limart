import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ShiftDetailsModal,
  ShiftSwapModal,
  ShiftRegisterModal,
  calculateDuration,
  formatShiftLabel,
} from "./index";

vi.mock("@/lib/api-client", () => ({
  authFetch: vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ success: true }),
  }),
  toggleShiftSwap: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Schedule Components and Helpers", () => {
  it("calculates shift duration correctly", () => {
    expect(calculateDuration("08:00", "12:00")).toBe("4 tiếng");
    expect(calculateDuration("08:30", "12:00")).toBe("3 tiếng 30 phút");
    expect(calculateDuration("12:00", "08:00")).toBeNull();
  });

  it("formats shift labels properly", () => {
    expect(formatShiftLabel("MORNING")).toBe("Sáng (8:30 - 12:00)");
    expect(formatShiftLabel("AFTERNOON")).toBe("Chiều (13:30 - 17:30)");
    expect(formatShiftLabel("FULL")).toBe("Cả ngày (8:30 - 17:30)");
  });

  it("renders ShiftDetailsModal with registered shifts and actions", () => {
    const testDate = new Date("2026-10-15T00:00:00Z");
    const mockShifts = [
      {
        id: 101,
        start: "2026-10-15T08:00:00Z",
        end: "2026-10-15T12:00:00Z",
        shift: "8h - 12h",
      },
    ];
    const onCancel = vi.fn();
    const onRegister = vi.fn();
    const onClose = vi.fn();
    const onOpenSwap = vi.fn();

    render(
      <ShiftDetailsModal
        selectedDate={testDate}
        myShifts={mockShifts}
        onCancelShift={onCancel}
        onRegisterShift={onRegister}
        onClose={onClose}
        onOpenSwap={onOpenSwap}
      />
    );

    expect(screen.getByText("Lịch chi tiết")).toBeDefined();
    expect(screen.getByText("Đã xếp ca")).toBeDefined();
    expect(screen.getByText("Pass ca")).toBeDefined();

    fireEvent.click(screen.getByText("Pass ca"));
    expect(onOpenSwap).toHaveBeenCalledWith(mockShifts[0]);

    fireEvent.click(screen.getByText("Đóng"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders ShiftSwapModal and handles close", () => {
    const mockShift = {
      id: 202,
      start: "2026-10-16T13:00:00Z",
      end: "2026-10-16T17:00:00Z",
      shift: "13h - 17h",
      isOpenForSwap: false,
    };
    const onClose = vi.fn();

    render(
      <ShiftSwapModal
        isOpen={true}
        shift={mockShift}
        onClose={onClose}
      />
    );

    expect(screen.getByText("Đổi / Pass ca trực")).toBeDefined();
    expect(screen.getByText("🔄 Xác nhận đăng đổi ca")).toBeDefined();

    fireEvent.click(screen.getByText("Đóng"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders ShiftRegisterModal and handles presets", () => {
    const testDate = new Date("2026-10-17T00:00:00Z");
    const onClose = vi.fn();

    render(
      <ShiftRegisterModal
        isOpen={true}
        selectedDate={testDate}
        onClose={onClose}
      />
    );

    expect(screen.getByText("Đăng ký giờ làm")).toBeDefined();
    expect(screen.getByText("Gợi ý ca làm nhanh:")).toBeDefined();

    fireEvent.click(screen.getByText("Đóng"));
    expect(onClose).toHaveBeenCalled();
  });
});
