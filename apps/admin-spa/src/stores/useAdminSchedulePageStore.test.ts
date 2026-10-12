import { describe, it, expect, beforeEach } from "vitest";
import {
  useAdminSchedulePageStore,
  formatDateToYMD,
  formatDateToDM,
  getMonday,
} from "./useAdminSchedulePageStore";

describe("useAdminSchedulePageStore", () => {
  beforeEach(() => {
    useAdminSchedulePageStore.getState().reset();
  });

  describe("Helper Functions", () => {
    it("formatDateToYMD should format date as YYYY-MM-DD", () => {
      const date = new Date(2026, 9, 12); // Month is 0-indexed: 9 = October
      expect(formatDateToYMD(date)).toBe("2026-10-12");

      const janDate = new Date(2026, 0, 5);
      expect(formatDateToYMD(janDate)).toBe("2026-01-05");
    });

    it("formatDateToDM should format date as DD/MM", () => {
      const date = new Date(2026, 9, 12);
      expect(formatDateToDM(date)).toBe("12/10");

      const singleDigit = new Date(2026, 2, 7);
      expect(formatDateToDM(singleDigit)).toBe("07/03");
    });

    it("getMonday should return the Monday of the given week", () => {
      // 2026-10-14 is a Wednesday (day 3)
      const wednesday = new Date(2026, 9, 14, 15, 30);
      const monday = getMonday(wednesday);
      expect(monday.getDay()).toBe(1); // Monday is 1
      expect(formatDateToYMD(monday)).toBe("2026-10-12");
      expect(monday.getHours()).toBe(0);
      expect(monday.getMinutes()).toBe(0);

      // 2026-10-18 is a Sunday (day 0)
      const sunday = new Date(2026, 9, 18, 10, 0);
      const mondayFromSun = getMonday(sunday);
      expect(mondayFromSun.getDay()).toBe(1);
      expect(formatDateToYMD(mondayFromSun)).toBe("2026-10-12");
    });
  });

  describe("Initial State", () => {
    it("should initialize with default values", () => {
      const state = useAdminSchedulePageStore.getState();
      expect(state.viewMode).toBe("calendar");
      expect(state.isAddModalOpen).toBe(false);
      expect(state.isDeleteModalOpen).toBe(false);
      expect(state.deletingShiftId).toBeNull();
      expect(state.selectedUserId).toBe("");
      expect(state.shiftPreset).toBe("MORNING");
      expect(state.isSubmitting).toBe(false);
    });
  });

  describe("View Mode & Navigation", () => {
    it("should switch view modes correctly", () => {
      const store = useAdminSchedulePageStore.getState();

      store.setViewMode("columns");
      expect(useAdminSchedulePageStore.getState().viewMode).toBe("columns");

      store.setViewMode("calendar");
      expect(useAdminSchedulePageStore.getState().viewMode).toBe("calendar");

      // "visual" maps back to "calendar"
      store.setViewMode("visual");
      expect(useAdminSchedulePageStore.getState().viewMode).toBe("calendar");
    });

    it("should navigate previous and next week", () => {
      const initialDate = new Date(2026, 9, 12);
      useAdminSchedulePageStore.getState().setCurrentDate(initialDate);

      // Next week (+7 days)
      useAdminSchedulePageStore.getState().nextWeek();
      const nextDate = useAdminSchedulePageStore.getState().currentDate;
      expect(formatDateToYMD(nextDate)).toBe("2026-10-19");

      // Prev week (-7 days)
      useAdminSchedulePageStore.getState().prevWeek();
      const prevDate = useAdminSchedulePageStore.getState().currentDate;
      expect(formatDateToYMD(prevDate)).toBe("2026-10-12");

      // currentWeek resets to today
      useAdminSchedulePageStore.getState().currentWeek();
      const currentDate = useAdminSchedulePageStore.getState().currentDate;
      expect(formatDateToYMD(currentDate)).toBe(formatDateToYMD(new Date()));
    });

    it("should update currentDate using functional updater", () => {
      const initialDate = new Date(2026, 5, 1);
      useAdminSchedulePageStore.getState().setCurrentDate(initialDate);

      useAdminSchedulePageStore.getState().setCurrentDate((prev) => new Date(prev.getTime() + 86400000));
      expect(formatDateToYMD(useAdminSchedulePageStore.getState().currentDate)).toBe("2026-06-02");
    });
  });

  describe("Add Shift Modal & Form", () => {
    it("should open and close add shift modal with default or specified date", () => {
      const store = useAdminSchedulePageStore.getState();

      store.openAddModal("2026-11-20");
      expect(useAdminSchedulePageStore.getState().isAddModalOpen).toBe(true);
      expect(useAdminSchedulePageStore.getState().selectedDate).toBe("2026-11-20");
      expect(useAdminSchedulePageStore.getState().selectedUserId).toBe("");
      expect(useAdminSchedulePageStore.getState().shiftPreset).toBe("MORNING");

      store.closeAddModal();
      expect(useAdminSchedulePageStore.getState().isAddModalOpen).toBe(false);

      store.setIsAddModalOpen(true);
      expect(useAdminSchedulePageStore.getState().isAddModalOpen).toBe(true);
    });

    it("should update form fields and reset add form", () => {
      const store = useAdminSchedulePageStore.getState();

      store.setSelectedUserId("user-42");
      store.setSelectedDate("2026-12-25");
      store.setShiftPreset("EVENING");
      store.setIsSubmitting(true);

      const state = useAdminSchedulePageStore.getState();
      expect(state.selectedUserId).toBe("user-42");
      expect(state.selectedDate).toBe("2026-12-25");
      expect(state.shiftPreset).toBe("EVENING");
      expect(state.isSubmitting).toBe(true);

      store.resetAddForm();
      const resetState = useAdminSchedulePageStore.getState();
      expect(resetState.selectedUserId).toBe("");
      expect(resetState.selectedDate).toBe(formatDateToYMD(new Date()));
      expect(resetState.shiftPreset).toBe("MORNING");
      expect(resetState.isSubmitting).toBe(false);
    });
  });

  describe("Delete Shift Modal", () => {
    it("should open and close delete modal with shift ID", () => {
      const store = useAdminSchedulePageStore.getState();

      store.openDeleteModal("shift-99");
      expect(useAdminSchedulePageStore.getState().isDeleteModalOpen).toBe(true);
      expect(useAdminSchedulePageStore.getState().deletingShiftId).toBe("shift-99");

      store.closeDeleteModal();
      expect(useAdminSchedulePageStore.getState().isDeleteModalOpen).toBe(false);
      expect(useAdminSchedulePageStore.getState().deletingShiftId).toBeNull();

      store.setIsDeleteModalOpen(true);
      expect(useAdminSchedulePageStore.getState().isDeleteModalOpen).toBe(true);
    });
  });

  describe("Store Reset", () => {
    it("should reset all fields to initial default state", () => {
      const store = useAdminSchedulePageStore.getState();
      store.setViewMode("columns");
      store.openAddModal("2026-12-01");
      store.openDeleteModal(555);
      store.setSelectedUserId("user-1");
      store.setIsSubmitting(true);

      store.reset();

      const state = useAdminSchedulePageStore.getState();
      expect(state.viewMode).toBe("calendar");
      expect(state.isAddModalOpen).toBe(false);
      expect(state.isDeleteModalOpen).toBe(false);
      expect(state.deletingShiftId).toBeNull();
      expect(state.selectedUserId).toBe("");
      expect(state.shiftPreset).toBe("MORNING");
      expect(state.isSubmitting).toBe(false);
    });
  });
});
