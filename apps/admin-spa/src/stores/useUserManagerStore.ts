import { create } from "zustand";

export type RoleFilter = "ALL" | "ADMIN" | "USER" | "PARTNER";
export type EmploymentFilter = "ALL" | "FULL_TIME" | "PART_TIME";

export interface UserManagerState {
  // UI filters
  searchQuery: string;
  roleFilter: RoleFilter;
  employmentFilter: EmploymentFilter;
  showResigned: boolean;

  // Dialog & selection state
  isAddOpen: boolean;
  isEditDatesOpen: boolean;
  isDeleteOpen: boolean;
  selectedUser: any | null;

  // Filter actions
  setSearchQuery: (query: string) => void;
  setRoleFilter: (role: RoleFilter) => void;
  setEmploymentFilter: (filter: EmploymentFilter) => void;
  setShowResigned: (show: boolean | ((prev: boolean) => boolean)) => void;

  // Dialog actions
  setIsAddOpen: (isOpen: boolean) => void;
  setIsEditDatesOpen: (isOpen: boolean) => void;
  setIsDeleteOpen: (isOpen: boolean) => void;
  setSelectedUser: (user: any | null) => void;

  // Convenience helper actions
  openAddEmployee: () => void;
  closeAddEmployee: () => void;
  openEditDates: (user: any) => void;
  closeEditDates: () => void;
  openDeleteUser: (user: any) => void;
  closeDeleteUser: () => void;
  resetFilters: () => void;
}

export const useUserManagerStore = create<UserManagerState>((set) => ({
  searchQuery: "",
  roleFilter: "ALL",
  employmentFilter: "ALL",
  showResigned: false,

  isAddOpen: false,
  isEditDatesOpen: false,
  isDeleteOpen: false,
  selectedUser: null,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setRoleFilter: (roleFilter) => set({ roleFilter }),
  setEmploymentFilter: (employmentFilter) => set({ employmentFilter }),
  setShowResigned: (val) =>
    set((state) => ({
      showResigned: typeof val === "function" ? val(state.showResigned) : val,
    })),

  setIsAddOpen: (isAddOpen) => set({ isAddOpen }),
  setIsEditDatesOpen: (isEditDatesOpen) => set({ isEditDatesOpen }),
  setIsDeleteOpen: (isDeleteOpen) => set({ isDeleteOpen }),
  setSelectedUser: (selectedUser) => set({ selectedUser }),

  openAddEmployee: () => set({ isAddOpen: true }),
  closeAddEmployee: () => set({ isAddOpen: false }),

  openEditDates: (user) =>
    set({
      isEditDatesOpen: true,
      selectedUser: user,
    }),
  closeEditDates: () =>
    set({
      isEditDatesOpen: false,
      selectedUser: null,
    }),

  openDeleteUser: (user) =>
    set({
      isDeleteOpen: true,
      selectedUser: user,
    }),
  closeDeleteUser: () =>
    set({
      isDeleteOpen: false,
      selectedUser: null,
    }),

  resetFilters: () =>
    set({
      searchQuery: "",
      roleFilter: "ALL",
      employmentFilter: "ALL",
      showResigned: false,
    }),
}));
