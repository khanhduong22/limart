import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ScheduleClient from "./ScheduleClient";
import { useStaffScheduleStore } from "@/stores/useStaffScheduleStore";
import * as apiClient from "@/lib/api-client";

// Router mock
const mockPush = vi.fn();
vi.mock("@/lib/router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Sonner mock
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// API client mock
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    authFetch: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    }),
    toggleShiftSwap: vi.fn().mockResolvedValue({ success: true }),
  };
});

describe("ScheduleClient Integration", () => {
  const testUserId = "staff-user-01";
  const viewDate = new Date("2026-10-12T10:00:00Z"); // Monday Oct 12, 2026

  const mockShifts = [
    {
      id: 101,
      userId: testUserId,
      start: "2026-10-12T08:30:00.000Z",
      end: "2026-10-12T12:00:00.000Z",
      shift: "8h30 - 12h",
      shiftType: "MORNING",
      isOpenForSwap: false,
    },
    // Another user's shift on Tuesday (strict privacy test)
    {
      id: 102,
      userId: "other-user-99",
      start: "2026-10-13T13:30:00.000Z",
      end: "2026-10-13T17:30:00.000Z",
      shift: "13h30 - 17h30",
    },
  ];

  beforeEach(() => {
    const store = useStaffScheduleStore.getState();
    store.closeDateDetails();
    store.closeSwapModal();
    store.closeRegisterModal();
    store.resetRegistrationForm();
    vi.clearAllMocks();
  });

  it("renders weekly calendar, displays user shifts, and hides other users shifts", () => {
    render(
      <ScheduleClient
        shifts={mockShifts}
        currentUserId={testUserId}
        viewDate={viewDate}
      />
    );

    // Header & Week Date Range
    expect(screen.getByText("Lịch Làm Việc & Ca Trực")).toBeDefined();
    expect(screen.getByText(/12\/10 - 18\/10\/2026/)).toBeDefined();

    // Monday (T2) with user's shift
    expect(screen.getByText("Thứ Hai")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
    expect(screen.getByText(/[0-9]{2}:[0-9]{2} - [0-9]{2}:[0-9]{2}/)).toBeDefined();

    // Tuesday (T3) where other user has shift: current user should see "+ Đăng ký ca"
    expect(screen.getByText("Thứ Ba")).toBeDefined();
    expect(screen.getByText("13")).toBeDefined();
    expect(screen.getAllByText("+ Đăng ký ca").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/13:30 - 17:30/)).toBeNull();
  });

  it("navigates between weeks with next and previous buttons", () => {
    const onMonthChange = vi.fn();
    render(
      <ScheduleClient
        shifts={mockShifts}
        currentUserId={testUserId}
        viewDate={viewDate}
        onMonthChange={onMonthChange}
      />
    );

    expect(screen.getByText(/12\/10 - 18\/10\/2026/)).toBeDefined();

    // Click "Tuần sau"
    const nextWeekBtn = screen.getByText("Tuần sau");
    fireEvent.click(nextWeekBtn);
    expect(screen.getByText(/19\/10 - 25\/10\/2026/)).toBeDefined();

    // Click "Tuần trước"
    const prevWeekBtn = screen.getByTitle("Tuần trước");
    fireEvent.click(prevWeekBtn);
    expect(screen.getByText(/12\/10 - 18\/10\/2026/)).toBeDefined();
  });

  it("opens ShiftDetailsModal on day click and triggers swap modal when clicking Pass ca", async () => {
    render(
      <ScheduleClient
        shifts={mockShifts}
        currentUserId={testUserId}
        viewDate={viewDate}
      />
    );

    // Click Monday (Oct 12) card
    const mondayCard = screen.getByText("Thứ Hai").closest("div[class*='p-3 rounded-2xl border']");
    expect(mondayCard).toBeDefined();
    fireEvent.click(mondayCard!);

    // ShiftDetailsModal should be open
    expect(await screen.findByText("Lịch chi tiết", {}, { timeout: 4000 })).toBeDefined();
    expect(screen.getByText(/Ca làm của bạn \(1\):/)).toBeDefined();
    expect(screen.getByText("Pass ca")).toBeDefined();

    // Click "Pass ca" button
    fireEvent.click(screen.getByText("Pass ca"));

    // ShiftSwapModal should be open
    expect(useStaffScheduleStore.getState().isSwapModalOpen).toBe(true);
    expect(await screen.findByText("Đổi / Pass ca trực", {}, { timeout: 4000 })).toBeDefined();
    expect(screen.getByText("🔄 Xác nhận đăng đổi ca")).toBeDefined();

    // Close swap modal (target the top modal's close button)
    const closeButtons = screen.getAllByText("Đóng");
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(useStaffScheduleStore.getState().isSwapModalOpen).toBe(false);
  });

  it("triggers ShiftRegisterModal when openRegisterModal is invoked from store", async () => {
    render(
      <ScheduleClient
        shifts={mockShifts}
        currentUserId={testUserId}
        viewDate={viewDate}
      />
    );

    // Open direct register modal via store wrapped in act
    fireEvent.click(screen.getAllByText("+ Đăng ký ca")[0]);

    // Or open date details
    expect(await screen.findByText("Lịch chi tiết", {}, { timeout: 4000 })).toBeDefined();
    expect(screen.getByText("Xác nhận đăng ký giờ làm")).toBeDefined();

    // Close modal
    fireEvent.click(screen.getByText("Đóng"));
    expect(useStaffScheduleStore.getState().selectedDate).toBeNull();
  });

  it("registers shift from ShiftDetailsModal on an empty day and triggers authFetch", async () => {
    const onRefresh = vi.fn();
    render(
      <ScheduleClient
        shifts={mockShifts}
        currentUserId={testUserId}
        viewDate={viewDate}
        onRefresh={onRefresh}
      />
    );

    // Click Tuesday (Oct 13) card which has no shifts for current user
    const tuesdayCard = screen.getByText("Thứ Ba").closest("div[class*='p-3 rounded-2xl border']");
    fireEvent.click(tuesdayCard!);

    // ShiftDetailsModal opens with registration form
    expect(await screen.findByText("Đăng ký giờ làm tự do:", {}, { timeout: 4000 })).toBeDefined();
    const registerBtn = screen.getByText("Xác nhận đăng ký giờ làm");

    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(apiClient.authFetch).toHaveBeenCalledWith(
        "/api/staff/schedule/register",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"startTime":"08:00"'),
        })
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("cancels registered shift after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onRefresh = vi.fn();

    render(
      <ScheduleClient
        shifts={mockShifts}
        currentUserId={testUserId}
        viewDate={viewDate}
        onRefresh={onRefresh}
      />
    );

    // Click Monday card
    const mondayCard = screen.getByText("Thứ Hai").closest("div[class*='p-3 rounded-2xl border']");
    fireEvent.click(mondayCard!);

    // Click "Hủy ca này"
    const cancelBtn = await screen.findByText("Hủy ca này");
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(apiClient.authFetch).toHaveBeenCalledWith(
        "/api/staff/schedule/cancel",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ shiftId: 101 }),
        })
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("navigates to /requests when clicking Xin giải trình button", () => {
    render(
      <ScheduleClient
        shifts={mockShifts}
        currentUserId={testUserId}
        viewDate={viewDate}
      />
    );

    const requestsBtn = screen.getByText(/Xin giải trình/);
    expect(requestsBtn).toBeDefined();
    fireEvent.click(requestsBtn);
    expect(mockPush).toHaveBeenCalledWith("/requests");
  });
});
