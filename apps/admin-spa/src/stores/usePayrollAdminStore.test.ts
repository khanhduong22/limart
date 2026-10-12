import { describe, it, expect, beforeEach } from "vitest";
import { usePayrollAdminStore } from "./usePayrollAdminStore";

describe("usePayrollAdminStore", () => {
  beforeEach(() => {
    usePayrollAdminStore.getState().reset();
    usePayrollAdminStore.getState().setBonusPercent(0);
    usePayrollAdminStore.getState().setBonusTargets(["PART_TIME"]);
    usePayrollAdminStore.getState().setExcludedUsers([]);
    usePayrollAdminStore.getState().setClosedState(false);
    usePayrollAdminStore.getState().setIsClosing(false);
    usePayrollAdminStore.getState().setIsUpdatingBonus(false);
  });

  const mockEmployee = {
    id: "emp-01",
    name: "Tran Thi B",
    baseSalary: 7000000,
    role: "STAFF",
  };

  describe("Initial State", () => {
    it("should initialize with default period, search, and bonus target values", () => {
      const state = usePayrollAdminStore.getState();
      const now = new Date();
      expect(state.month).toBe(now.getMonth() + 1);
      expect(state.year).toBe(now.getFullYear());
      expect(state.searchTerm).toBe("");
      expect(state.bonusPercent).toBe(0);
      expect(state.bonusTargets).toEqual(["PART_TIME"]);
      expect(state.excludedUsers).toEqual([]);
      expect(state.showTargetDropdown).toBe(false);
      expect(state.closedState).toBe(false);
      expect(state.isClosing).toBe(false);
      expect(state.isUpdatingBonus).toBe(false);
      expect(state.isAdjustmentOpen).toBe(false);
      expect(state.selectedEmployee).toBeNull();
      expect(state.isExportOpen).toBe(false);
    });
  });

  describe("Period & Search Updates", () => {
    it("should update period (month and year)", () => {
      const store = usePayrollAdminStore.getState();
      store.setPeriod(11, 2026);

      const state = usePayrollAdminStore.getState();
      expect(state.month).toBe(11);
      expect(state.year).toBe(2026);
    });

    it("should update search term", () => {
      usePayrollAdminStore.getState().setSearchTerm("Tran Thi");
      expect(usePayrollAdminStore.getState().searchTerm).toBe("Tran Thi");
    });
  });

  describe("Bonus Targets & Exclusions", () => {
    it("should update bonus percent", () => {
      usePayrollAdminStore.getState().setBonusPercent(15);
      expect(usePayrollAdminStore.getState().bonusPercent).toBe(15);
    });

    it("should toggle bonus targets correctly", () => {
      const store = usePayrollAdminStore.getState();
      expect(store.bonusTargets).toEqual(["PART_TIME"]);

      // Add FULL_TIME
      store.toggleBonusTarget("FULL_TIME");
      expect(usePayrollAdminStore.getState().bonusTargets).toEqual(["PART_TIME", "FULL_TIME"]);

      // Remove PART_TIME
      store.toggleBonusTarget("PART_TIME");
      expect(usePayrollAdminStore.getState().bonusTargets).toEqual(["FULL_TIME"]);

      // Remove FULL_TIME
      store.toggleBonusTarget("FULL_TIME");
      expect(usePayrollAdminStore.getState().bonusTargets).toEqual([]);
    });

    it("should set bonus targets using direct array and functional updater", () => {
      const store = usePayrollAdminStore.getState();
      store.setBonusTargets(["ALL"]);
      expect(usePayrollAdminStore.getState().bonusTargets).toEqual(["ALL"]);

      store.setBonusTargets((prev) => [...prev, "SEASONAL"]);
      expect(usePayrollAdminStore.getState().bonusTargets).toEqual(["ALL", "SEASONAL"]);
    });

    it("should toggle excluded users correctly", () => {
      const store = usePayrollAdminStore.getState();
      expect(store.excludedUsers).toEqual([]);

      store.toggleExcludeUser("usr-1");
      expect(usePayrollAdminStore.getState().excludedUsers).toEqual(["usr-1"]);

      store.toggleExcludeUser("usr-2");
      expect(usePayrollAdminStore.getState().excludedUsers).toEqual(["usr-1", "usr-2"]);

      store.toggleExcludeUser("usr-1");
      expect(usePayrollAdminStore.getState().excludedUsers).toEqual(["usr-2"]);
    });

    it("should set excluded users with functional updater", () => {
      const store = usePayrollAdminStore.getState();
      store.setExcludedUsers(["u1", "u2"]);
      expect(usePayrollAdminStore.getState().excludedUsers).toEqual(["u1", "u2"]);

      store.setExcludedUsers((prev) => prev.filter((id) => id !== "u1"));
      expect(usePayrollAdminStore.getState().excludedUsers).toEqual(["u2"]);
    });

    it("should toggle showTargetDropdown with boolean and functional updater", () => {
      const store = usePayrollAdminStore.getState();
      store.setShowTargetDropdown(true);
      expect(usePayrollAdminStore.getState().showTargetDropdown).toBe(true);

      store.setShowTargetDropdown((prev) => !prev);
      expect(usePayrollAdminStore.getState().showTargetDropdown).toBe(false);
    });

    it("should update closed state, isClosing, and isUpdatingBonus", () => {
      const store = usePayrollAdminStore.getState();
      store.setClosedState(true);
      store.setIsClosing(true);
      store.setIsUpdatingBonus(true);

      const state = usePayrollAdminStore.getState();
      expect(state.closedState).toBe(true);
      expect(state.isClosing).toBe(true);
      expect(state.isUpdatingBonus).toBe(true);
    });
  });

  describe("Adjustment & Export Modals", () => {
    it("should open and close adjustment modal with selected employee", () => {
      const store = usePayrollAdminStore.getState();
      store.openAdjustment(mockEmployee);

      expect(usePayrollAdminStore.getState().isAdjustmentOpen).toBe(true);
      expect(usePayrollAdminStore.getState().selectedEmployee).toEqual(mockEmployee);

      store.closeAdjustment();
      expect(usePayrollAdminStore.getState().isAdjustmentOpen).toBe(false);
      expect(usePayrollAdminStore.getState().selectedEmployee).toBeNull();
    });

    it("should open and close export modal", () => {
      const store = usePayrollAdminStore.getState();
      store.openExport();
      expect(usePayrollAdminStore.getState().isExportOpen).toBe(true);

      store.closeExport();
      expect(usePayrollAdminStore.getState().isExportOpen).toBe(false);

      store.setIsExportOpen(true);
      expect(usePayrollAdminStore.getState().isExportOpen).toBe(true);
    });
  });

  describe("Reset Action", () => {
    it("should reset transient state back to defaults", () => {
      const store = usePayrollAdminStore.getState();
      store.setSearchTerm("loc");
      store.setShowTargetDropdown(true);
      store.openAdjustment(mockEmployee);
      store.openExport();

      store.reset();

      const state = usePayrollAdminStore.getState();
      expect(state.searchTerm).toBe("");
      expect(state.showTargetDropdown).toBe(false);
      expect(state.isAdjustmentOpen).toBe(false);
      expect(state.selectedEmployee).toBeNull();
      expect(state.isExportOpen).toBe(false);
    });
  });
});
