import { describe, it, expect, beforeEach } from "vitest";
import { useStaffScheduleStore, getMonday, ShiftItem } from "./useStaffScheduleStore";

describe("useStaffScheduleStore", () => {
  beforeEach(() => {
    useStaffScheduleStore.getState().resetRegistrationForm();
    useStaffScheduleStore.getState().closeDateDetails();
    useStaffScheduleStore.getState().closeSwapModal();
    useStaffScheduleStore.getState().closeRegisterModal();
  });

  const mockShift: ShiftItem = {
    id: 123,
    start: "2026-10-12T08:00:00Z",
    end: "2026-10-12T12:00:00Z",
    shift: "8h - 12h",
    isOpenForSwap: false,
  };

  it("calculates Monday correctly with getMonday", () => {
    // 2026-10-14 is Wednesday
    const wednesday = new Date("2026-10-14T10:00:00Z");
    const monday = getMonday(wednesday);
    expect(monday.getDay()).toBe(1); // Monday is 1
  });

  it("should update weekStart", () => {
    const testDate = new Date("2026-10-20T00:00:00Z");
    useStaffScheduleStore.getState().setWeekStart(testDate);
    const monday = getMonday(testDate);
    expect(useStaffScheduleStore.getState().weekStart.toDateString()).toBe(monday.toDateString());
  });

  it("should open and close date details", () => {
    const date = new Date("2026-10-15T00:00:00Z");
    useStaffScheduleStore.getState().openDateDetails(date);
    expect(useStaffScheduleStore.getState().selectedDate).toEqual(date);
    expect(useStaffScheduleStore.getState().showAddForm).toBe(false);

    useStaffScheduleStore.getState().closeDateDetails();
    expect(useStaffScheduleStore.getState().selectedDate).toBeNull();
  });

  it("should open and close swap modal", () => {
    useStaffScheduleStore.getState().openSwapModal(mockShift);
    expect(useStaffScheduleStore.getState().isSwapModalOpen).toBe(true);
    expect(useStaffScheduleStore.getState().swapTargetShift).toEqual(mockShift);

    useStaffScheduleStore.getState().closeSwapModal();
    expect(useStaffScheduleStore.getState().isSwapModalOpen).toBe(false);
    expect(useStaffScheduleStore.getState().swapTargetShift).toBeNull();
  });

  it("should update time presets and custom inputs", () => {
    useStaffScheduleStore.getState().setTimeRange("09", "15", "14", "45", "9h - 14h45");
    const state = useStaffScheduleStore.getState();
    expect(state.startHour).toBe("09");
    expect(state.startMinute).toBe("15");
    expect(state.endHour).toBe("14");
    expect(state.endMinute).toBe("45");
    expect(state.activePreset).toBe("9h - 14h45");

    useStaffScheduleStore.getState().setStartHour("10");
    expect(useStaffScheduleStore.getState().startHour).toBe("10");
    expect(useStaffScheduleStore.getState().activePreset).toBeNull();
  });

  it("should open and close register modal and reset registration form", () => {
    const testDate = new Date("2026-10-18T00:00:00Z");
    useStaffScheduleStore.getState().openRegisterModal(testDate);

    let state = useStaffScheduleStore.getState();
    expect(state.isRegisterModalOpen).toBe(true);
    expect(state.showAddForm).toBe(true);
    expect(state.selectedDate).toEqual(testDate);

    useStaffScheduleStore.getState().setIsSubmitting(true);
    expect(useStaffScheduleStore.getState().isSubmitting).toBe(true);

    useStaffScheduleStore.getState().closeRegisterModal();
    state = useStaffScheduleStore.getState();
    expect(state.isRegisterModalOpen).toBe(false);
    expect(state.showAddForm).toBe(false);

    useStaffScheduleStore.getState().resetRegistrationForm();
    state = useStaffScheduleStore.getState();
    expect(state.startHour).toBe("08");
    expect(state.startMinute).toBe("00");
    expect(state.endHour).toBe("12");
    expect(state.endMinute).toBe("00");
    expect(state.isSubmitting).toBe(false);
  });

  it("should set and update selected shift", () => {
    useStaffScheduleStore.getState().setSelectedShift(mockShift);
    expect(useStaffScheduleStore.getState().selectedShift).toEqual(mockShift);

    useStaffScheduleStore.getState().setSelectedShift(null);
    expect(useStaffScheduleStore.getState().selectedShift).toBeNull();
  });
});
