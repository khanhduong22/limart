import { describe, it, expect, beforeEach } from "vitest";
import { useShiftHistoryStore } from "./useShiftHistoryStore";

describe("useShiftHistoryStore", () => {
  beforeEach(() => {
    useShiftHistoryStore.getState().reset();
  });

  const mockLog1 = {
    id: "log-1",
    action: "UPDATE_STATUS",
    shiftId: "shift-100",
    performedBy: "admin@limart.com",
    timestamp: "2026-10-12T08:00:00Z",
  };

  const mockLog2 = {
    id: "log-2",
    action: "DELETE_SHIFT",
    shiftId: "shift-101",
    performedBy: "manager@limart.com",
    timestamp: "2026-10-12T09:30:00Z",
  };

  describe("Initial State", () => {
    it("should initialize with default filter, pagination, and modal values", () => {
      const state = useShiftHistoryStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.filterType).toBe("7_days");
      expect(state.search).toBe("");
      expect(state.customDate).toBe("");
      expect(state.logs).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.page).toBe(1);
      expect(state.hasMore).toBe(true);
    });
  });

  describe("Modal Actions", () => {
    it("should open modal and reset filter and pagination to defaults", () => {
      const store = useShiftHistoryStore.getState();
      store.setSearch("test query");
      store.setFilterType("this_week");
      store.setPage(3);

      store.openModal();

      const state = useShiftHistoryStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.page).toBe(1);
      expect(state.filterType).toBe("7_days");
      expect(state.customDate).toBe("");
      expect(state.search).toBe("");
    });

    it("should close modal and toggle isOpen directly", () => {
      const store = useShiftHistoryStore.getState();
      store.openModal();
      expect(useShiftHistoryStore.getState().isOpen).toBe(true);

      store.closeModal();
      expect(useShiftHistoryStore.getState().isOpen).toBe(false);

      store.setIsOpen(true);
      expect(useShiftHistoryStore.getState().isOpen).toBe(true);
    });
  });

  describe("Filter & Search Controls", () => {
    it("should update filter type and reset page", () => {
      const store = useShiftHistoryStore.getState();
      store.setPage(4);

      store.setFilterType("today");
      expect(useShiftHistoryStore.getState().filterType).toBe("today");
      expect(useShiftHistoryStore.getState().page).toBe(1);
      expect(useShiftHistoryStore.getState().customDate).toBe("");

      store.setFilterType("custom_date");
      expect(useShiftHistoryStore.getState().filterType).toBe("custom_date");
      expect(useShiftHistoryStore.getState().customDate).toBeUndefined();
    });

    it("should update search string", () => {
      useShiftHistoryStore.getState().setSearch("Nguyen Van B");
      expect(useShiftHistoryStore.getState().search).toBe("Nguyen Van B");
    });

    it("should set custom date and automatically switch filterType to custom_date", () => {
      const store = useShiftHistoryStore.getState();
      store.setPage(5);

      store.setCustomDate("2026-10-15");
      const state = useShiftHistoryStore.getState();
      expect(state.customDate).toBe("2026-10-15");
      expect(state.filterType).toBe("custom_date");
      expect(state.page).toBe(1);

      // Clearing custom date should fall back to 7_days
      store.setCustomDate("");
      expect(useShiftHistoryStore.getState().filterType).toBe("7_days");
    });

    it("should reset all filter parameters with resetFilter", () => {
      const store = useShiftHistoryStore.getState();
      store.setFilterType("last_week");
      store.setSearch("Loc ca lam");
      store.setCustomDate("2026-09-01");
      store.setPage(3);

      store.resetFilter();

      const state = useShiftHistoryStore.getState();
      expect(state.filterType).toBe("7_days");
      expect(state.search).toBe("");
      expect(state.customDate).toBe("");
      expect(state.page).toBe(1);
    });
  });

  describe("Data & Pagination Controls", () => {
    it("should set logs using direct array and functional updater", () => {
      const store = useShiftHistoryStore.getState();

      store.setLogs([mockLog1]);
      expect(useShiftHistoryStore.getState().logs).toEqual([mockLog1]);

      store.setLogs((prev) => [...prev, mockLog2]);
      expect(useShiftHistoryStore.getState().logs).toEqual([mockLog1, mockLog2]);
    });

    it("should append logs to existing logs", () => {
      const store = useShiftHistoryStore.getState();
      store.setLogs([mockLog1]);

      store.appendLogs([mockLog2]);
      expect(useShiftHistoryStore.getState().logs).toEqual([mockLog1, mockLog2]);
    });

    it("should update loading and hasMore flags", () => {
      const store = useShiftHistoryStore.getState();

      store.setLoading(true);
      expect(useShiftHistoryStore.getState().loading).toBe(true);

      store.setHasMore(false);
      expect(useShiftHistoryStore.getState().hasMore).toBe(false);
    });

    it("should update page number with direct value and functional updater", () => {
      const store = useShiftHistoryStore.getState();

      store.setPage(2);
      expect(useShiftHistoryStore.getState().page).toBe(2);

      store.setPage((prev) => prev + 1);
      expect(useShiftHistoryStore.getState().page).toBe(3);
    });
  });

  describe("Store Reset", () => {
    it("should reset all state values to initial", () => {
      const store = useShiftHistoryStore.getState();
      store.openModal();
      store.setFilterType("all");
      store.setSearch("history");
      store.setLogs([mockLog1, mockLog2]);
      store.setLoading(true);
      store.setPage(4);
      store.setHasMore(false);

      store.reset();

      const state = useShiftHistoryStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.filterType).toBe("7_days");
      expect(state.search).toBe("");
      expect(state.customDate).toBe("");
      expect(state.logs).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.page).toBe(1);
      expect(state.hasMore).toBe(true);
    });
  });
});
