import { describe, it, expect, beforeEach } from "vitest";
import { useUserManagerStore } from "./useUserManagerStore";

describe("useUserManagerStore", () => {
  beforeEach(() => {
    useUserManagerStore.getState().resetFilters();
    useUserManagerStore.getState().closeAddEmployee();
    useUserManagerStore.getState().closeEditDates();
    useUserManagerStore.getState().closeDeleteUser();
  });

  const mockUser = {
    id: "user-100",
    name: "Nguyen Van A",
    email: "vana@limart.com",
    role: "USER",
    employmentType: "FULL_TIME",
  };

  describe("Initial State", () => {
    it("should initialize with default filter and modal values", () => {
      const state = useUserManagerStore.getState();
      expect(state.searchQuery).toBe("");
      expect(state.roleFilter).toBe("ALL");
      expect(state.employmentFilter).toBe("ALL");
      expect(state.showResigned).toBe(false);
      expect(state.isAddOpen).toBe(false);
      expect(state.isEditDatesOpen).toBe(false);
      expect(state.isDeleteOpen).toBe(false);
      expect(state.selectedUser).toBeNull();
    });
  });

  describe("Filters & Search", () => {
    it("should update search query", () => {
      useUserManagerStore.getState().setSearchQuery("Nguyen Van");
      expect(useUserManagerStore.getState().searchQuery).toBe("Nguyen Van");
    });

    it("should update role filter", () => {
      const store = useUserManagerStore.getState();
      store.setRoleFilter("ADMIN");
      expect(useUserManagerStore.getState().roleFilter).toBe("ADMIN");

      store.setRoleFilter("PARTNER");
      expect(useUserManagerStore.getState().roleFilter).toBe("PARTNER");
    });

    it("should update employment filter", () => {
      const store = useUserManagerStore.getState();
      store.setEmploymentFilter("PART_TIME");
      expect(useUserManagerStore.getState().employmentFilter).toBe("PART_TIME");

      store.setEmploymentFilter("FULL_TIME");
      expect(useUserManagerStore.getState().employmentFilter).toBe("FULL_TIME");
    });

    it("should toggle showResigned with direct boolean and functional updater", () => {
      const store = useUserManagerStore.getState();

      store.setShowResigned(true);
      expect(useUserManagerStore.getState().showResigned).toBe(true);

      store.setShowResigned((prev) => !prev);
      expect(useUserManagerStore.getState().showResigned).toBe(false);

      store.setShowResigned((prev) => !prev);
      expect(useUserManagerStore.getState().showResigned).toBe(true);
    });

    it("should reset all filters using resetFilters", () => {
      const store = useUserManagerStore.getState();
      store.setSearchQuery("Tim kiem");
      store.setRoleFilter("ADMIN");
      store.setEmploymentFilter("PART_TIME");
      store.setShowResigned(true);

      store.resetFilters();

      const state = useUserManagerStore.getState();
      expect(state.searchQuery).toBe("");
      expect(state.roleFilter).toBe("ALL");
      expect(state.employmentFilter).toBe("ALL");
      expect(state.showResigned).toBe(false);
    });
  });

  describe("Modal Actions & User Selection", () => {
    it("should open and close add employee dialog", () => {
      const store = useUserManagerStore.getState();

      store.openAddEmployee();
      expect(useUserManagerStore.getState().isAddOpen).toBe(true);

      store.closeAddEmployee();
      expect(useUserManagerStore.getState().isAddOpen).toBe(false);

      store.setIsAddOpen(true);
      expect(useUserManagerStore.getState().isAddOpen).toBe(true);
    });

    it("should open and close edit dates dialog with selected user", () => {
      const store = useUserManagerStore.getState();

      store.openEditDates(mockUser);
      expect(useUserManagerStore.getState().isEditDatesOpen).toBe(true);
      expect(useUserManagerStore.getState().selectedUser).toEqual(mockUser);

      store.closeEditDates();
      expect(useUserManagerStore.getState().isEditDatesOpen).toBe(false);
      expect(useUserManagerStore.getState().selectedUser).toBeNull();

      store.setIsEditDatesOpen(true);
      expect(useUserManagerStore.getState().isEditDatesOpen).toBe(true);
    });

    it("should open and close delete user dialog with selected user", () => {
      const store = useUserManagerStore.getState();

      store.openDeleteUser(mockUser);
      expect(useUserManagerStore.getState().isDeleteOpen).toBe(true);
      expect(useUserManagerStore.getState().selectedUser).toEqual(mockUser);

      store.closeDeleteUser();
      expect(useUserManagerStore.getState().isDeleteOpen).toBe(false);
      expect(useUserManagerStore.getState().selectedUser).toBeNull();

      store.setIsDeleteOpen(true);
      expect(useUserManagerStore.getState().isDeleteOpen).toBe(true);
    });

    it("should set selected user directly", () => {
      useUserManagerStore.getState().setSelectedUser(mockUser);
      expect(useUserManagerStore.getState().selectedUser).toEqual(mockUser);

      useUserManagerStore.getState().setSelectedUser(null);
      expect(useUserManagerStore.getState().selectedUser).toBeNull();
    });
  });
});
