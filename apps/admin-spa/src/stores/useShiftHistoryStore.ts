import { create } from "zustand";

export type ShiftHistoryFilterType =
  | "7_days"
  | "today"
  | "this_week"
  | "last_week"
  | "custom_date"
  | "all";

export interface ShiftHistoryState {
  // Dialog open state
  isOpen: boolean;

  // Filter & Search states
  filterType: ShiftHistoryFilterType;
  search: string;
  customDate: string;

  // Data & Pagination states
  logs: any[];
  loading: boolean;
  page: number;
  hasMore: boolean;

  // Dialog actions
  setIsOpen: (isOpen: boolean) => void;
  openModal: () => void;
  closeModal: () => void;

  // Filter actions
  setFilterType: (filterType: ShiftHistoryFilterType) => void;
  setSearch: (search: string) => void;
  setCustomDate: (customDate: string) => void;
  resetFilter: () => void;

  // Data actions
  setLogs: (logs: any[] | ((prev: any[]) => any[])) => void;
  appendLogs: (newLogs: any[]) => void;
  setLoading: (loading: boolean) => void;
  setPage: (page: number | ((prev: number) => number)) => void;
  setHasMore: (hasMore: boolean) => void;

  reset: () => void;
}

export const useShiftHistoryStore = create<ShiftHistoryState>((set) => ({
  isOpen: false,

  filterType: "7_days",
  search: "",
  customDate: "",

  logs: [],
  loading: false,
  page: 1,
  hasMore: true,

  setIsOpen: (isOpen) => set({ isOpen }),
  openModal: () =>
    set({
      isOpen: true,
      page: 1,
      filterType: "7_days",
      customDate: "",
      search: "",
    }),
  closeModal: () => set({ isOpen: false }),

  setFilterType: (filterType) =>
    set({
      filterType,
      customDate: filterType === "custom_date" ? undefined : "",
      page: 1,
    }),

  setSearch: (search) => set({ search }),

  setCustomDate: (customDate) =>
    set({
      customDate,
      filterType: customDate ? "custom_date" : "7_days",
      page: 1,
    }),

  resetFilter: () =>
    set({
      filterType: "7_days",
      search: "",
      customDate: "",
      page: 1,
    }),

  setLogs: (val) =>
    set((state) => ({
      logs: typeof val === "function" ? val(state.logs) : val,
    })),

  appendLogs: (newLogs) =>
    set((state) => ({
      logs: [...state.logs, ...newLogs],
    })),

  setLoading: (loading) => set({ loading }),

  setPage: (val) =>
    set((state) => ({
      page: typeof val === "function" ? val(state.page) : val,
    })),

  setHasMore: (hasMore) => set({ hasMore }),

  reset: () =>
    set({
      isOpen: false,
      filterType: "7_days",
      search: "",
      customDate: "",
      logs: [],
      loading: false,
      page: 1,
      hasMore: true,
    }),
}));
