import { create } from "zustand";

export interface PayrollAdminState {
  // Period & search filters
  month: number;
  year: number;
  searchTerm: string;

  // Bonus & close states
  bonusPercent: number;
  bonusTargets: string[];
  excludedUsers: string[];
  showTargetDropdown: boolean;
  closedState: boolean;
  isClosing: boolean;
  isUpdatingBonus: boolean;

  // Modal states
  isAdjustmentOpen: boolean;
  selectedEmployee: any | null;
  isExportOpen: boolean;

  // Actions
  setPeriod: (month: number, year: number) => void;
  setSearchTerm: (term: string) => void;
  setBonusPercent: (percent: number) => void;
  setBonusTargets: (targets: string[] | ((prev: string[]) => string[])) => void;
  toggleBonusTarget: (target: string) => void;
  setExcludedUsers: (users: string[] | ((prev: string[]) => string[])) => void;
  toggleExcludeUser: (userId: string) => void;
  setShowTargetDropdown: (show: boolean | ((prev: boolean) => boolean)) => void;
  setClosedState: (closed: boolean) => void;
  setIsClosing: (isClosing: boolean) => void;
  setIsUpdatingBonus: (isUpdating: boolean) => void;

  // Modal actions
  openAdjustment: (employee: any) => void;
  closeAdjustment: () => void;
  setIsExportOpen: (open: boolean) => void;
  openExport: () => void;
  closeExport: () => void;
  reset: () => void;
}

const now = new Date();

export const usePayrollAdminStore = create<PayrollAdminState>((set) => ({
  month: now.getMonth() + 1,
  year: now.getFullYear(),
  searchTerm: "",

  bonusPercent: 0,
  bonusTargets: ["PART_TIME"],
  excludedUsers: [],
  showTargetDropdown: false,
  closedState: false,
  isClosing: false,
  isUpdatingBonus: false,

  isAdjustmentOpen: false,
  selectedEmployee: null,
  isExportOpen: false,

  setPeriod: (month, year) => set({ month, year }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setBonusPercent: (bonusPercent) => set({ bonusPercent }),
  setBonusTargets: (val) =>
    set((state) => ({
      bonusTargets: typeof val === "function" ? val(state.bonusTargets) : val,
    })),
  toggleBonusTarget: (target) =>
    set((state) => {
      const exists = state.bonusTargets.includes(target);
      return {
        bonusTargets: exists
          ? state.bonusTargets.filter((t) => t !== target)
          : [...state.bonusTargets, target],
      };
    }),
  setExcludedUsers: (val) =>
    set((state) => ({
      excludedUsers: typeof val === "function" ? val(state.excludedUsers) : val,
    })),
  toggleExcludeUser: (userId) =>
    set((state) => {
      const exists = state.excludedUsers.includes(userId);
      return {
        excludedUsers: exists
          ? state.excludedUsers.filter((id) => id !== userId)
          : [...state.excludedUsers, userId],
      };
    }),
  setShowTargetDropdown: (val) =>
    set((state) => ({
      showTargetDropdown:
        typeof val === "function" ? val(state.showTargetDropdown) : val,
    })),
  setClosedState: (closedState) => set({ closedState }),
  setIsClosing: (isClosing) => set({ isClosing }),
  setIsUpdatingBonus: (isUpdatingBonus) => set({ isUpdatingBonus }),

  openAdjustment: (employee) =>
    set({
      isAdjustmentOpen: true,
      selectedEmployee: employee,
    }),
  closeAdjustment: () =>
    set({
      isAdjustmentOpen: false,
      selectedEmployee: null,
    }),
  setIsExportOpen: (isExportOpen) => set({ isExportOpen }),
  openExport: () => set({ isExportOpen: true }),
  closeExport: () => set({ isExportOpen: false }),

  reset: () =>
    set({
      searchTerm: "",
      showTargetDropdown: false,
      isAdjustmentOpen: false,
      selectedEmployee: null,
      isExportOpen: false,
    }),
}));
