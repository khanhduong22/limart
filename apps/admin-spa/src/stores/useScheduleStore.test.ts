import { describe, it, expect, beforeEach } from "vitest";
import { useScheduleStore } from "./useScheduleStore";
import type { CalendarEvent, PendingEvent } from "../components/schedule/types";

describe("useScheduleStore", () => {
  beforeEach(() => {
    useScheduleStore.getState().reset();
  });

  const mockPending: PendingEvent = {
    start: new Date(2026, 9, 12, 8, 0),
    end: new Date(2026, 9, 12, 12, 0),
  };

  const mockEvent: CalendarEvent = {
    id: 1,
    title: "Nguyen Van A (Ca Sáng)",
    start: new Date(2026, 9, 12, 8, 0),
    end: new Date(2026, 9, 12, 12, 0),
    allDay: false,
    resource: {
      id: "event-1",
      userId: "user-1",
      shiftCode: "MORNING",
      status: "APPROVED",
    } as any,
  };

  describe("Initial State", () => {
    it("should initialize with default filter, modal, and drawer values", () => {
      const state = useScheduleStore.getState();
      expect(state.hideFullTime).toBe(true);
      expect(state.showAllShifts).toBe(false);
      expect(state.showDutyDetails).toBe(false);
      expect(state.dutySheetOpen).toBe(false);
      expect(state.modalOpen).toBe(false);
      expect(state.pendingEvent).toBeNull();
      expect(state.targetUserId).toBe("");
      expect(state.isSeniorRegister).toBe(false);
      expect(state.actionModalOpen).toBe(false);
      expect(state.selectedEvent).toBeNull();
      expect(state.showAddShiftTask).toBe(false);
    });
  });

  describe("Filter Toggles", () => {
    it("should toggle hideFullTime, showAllShifts, and showDutyDetails", () => {
      const store = useScheduleStore.getState();

      store.setHideFullTime(false);
      expect(useScheduleStore.getState().hideFullTime).toBe(false);
      store.setHideFullTime((prev) => !prev);
      expect(useScheduleStore.getState().hideFullTime).toBe(true);

      store.setShowAllShifts(true);
      expect(useScheduleStore.getState().showAllShifts).toBe(true);

      store.setShowDutyDetails(true);
      expect(useScheduleStore.getState().showDutyDetails).toBe(true);
    });
  });

  describe("Modals & Selection", () => {
    it("should manage create modal with pending event and target user", () => {
      const store = useScheduleStore.getState();

      store.openCreateModal(mockPending, "user-55");
      const openState = useScheduleStore.getState();
      expect(openState.modalOpen).toBe(true);
      expect(openState.pendingEvent).toEqual(mockPending);
      expect(openState.targetUserId).toBe("user-55");
      expect(openState.isSeniorRegister).toBe(false);

      store.closeCreateModal();
      const closedState = useScheduleStore.getState();
      expect(closedState.modalOpen).toBe(false);
      expect(closedState.pendingEvent).toBeNull();
      expect(closedState.targetUserId).toBe("");
    });

    it("should manage action modal and autoOpenAddTask flag", () => {
      const store = useScheduleStore.getState();

      store.openActionModal(mockEvent, true);
      const openState = useScheduleStore.getState();
      expect(openState.actionModalOpen).toBe(true);
      expect(openState.selectedEvent).toEqual(mockEvent);
      expect(openState.showAddShiftTask).toBe(true);

      store.closeActionModal();
      const closedState = useScheduleStore.getState();
      expect(closedState.actionModalOpen).toBe(false);
      expect(closedState.selectedEvent).toBeNull();
      expect(closedState.showAddShiftTask).toBe(false);
    });

    it("should manage dutySheetOpen and isSeniorRegister directly", () => {
      const store = useScheduleStore.getState();

      store.setDutySheetOpen(true);
      expect(useScheduleStore.getState().dutySheetOpen).toBe(true);

      store.setIsSeniorRegister(true);
      expect(useScheduleStore.getState().isSeniorRegister).toBe(true);
    });
  });

  describe("Store Reset", () => {
    it("should reset all values back to defaults", () => {
      const store = useScheduleStore.getState();
      store.setHideFullTime(false);
      store.setShowAllShifts(true);
      store.openCreateModal(mockPending, "user-123");
      store.setDutySheetOpen(true);

      store.reset();

      const state = useScheduleStore.getState();
      expect(state.hideFullTime).toBe(true);
      expect(state.showAllShifts).toBe(false);
      expect(state.modalOpen).toBe(false);
      expect(state.pendingEvent).toBeNull();
      expect(state.dutySheetOpen).toBe(false);
    });
  });
});
