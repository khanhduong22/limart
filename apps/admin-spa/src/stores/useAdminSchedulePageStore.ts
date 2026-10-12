import { create } from "zustand";

export type SchedulePageViewMode = "calendar" | "columns";

export interface AdminSchedulePageState {
  // View mode
  viewMode: SchedulePageViewMode;

  // Selected date/week navigation state
  currentDate: Date;

  // Dialog states
  isAddModalOpen: boolean;
  isDeleteModalOpen: boolean;
  deletingShiftId: string | number | null;

  // Add shift modal form state
  selectedUserId: string;
  selectedDate: string;
  shiftPreset: string;
  isSubmitting: boolean;

  // View actions
  setViewMode: (viewMode: SchedulePageViewMode | "visual") => void;
  setCurrentDate: (date: Date | ((prev: Date) => Date)) => void;
  prevWeek: () => void;
  nextWeek: () => void;
  currentWeek: () => void;

  // Dialog actions
  setIsAddModalOpen: (open: boolean) => void;
  openAddModal: (defaultDate?: string) => void;
  closeAddModal: () => void;

  setIsDeleteModalOpen: (open: boolean) => void;
  openDeleteModal: (shiftId: string | number) => void;
  closeDeleteModal: () => void;

  // Form actions
  setSelectedUserId: (userId: string) => void;
  setSelectedDate: (date: string) => void;
  setShiftPreset: (preset: string) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
  resetAddForm: () => void;
  reset: () => void;
}

export function formatDateToYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateToDM(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}/${month}`;
}

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const initialDate = new Date();

export const useAdminSchedulePageStore = create<AdminSchedulePageState>((set) => ({
  viewMode: "calendar",
  currentDate: initialDate,

  isAddModalOpen: false,
  isDeleteModalOpen: false,
  deletingShiftId: null,

  selectedUserId: "",
  selectedDate: formatDateToYMD(initialDate),
  shiftPreset: "MORNING",
  isSubmitting: false,

  setViewMode: (mode) =>
    set({ viewMode: mode === "visual" ? "calendar" : mode }),

  setCurrentDate: (val) =>
    set((state) => ({
      currentDate: typeof val === "function" ? val(state.currentDate) : val,
    })),

  prevWeek: () =>
    set((state) => ({
      currentDate: new Date(state.currentDate.getTime() - 7 * 24 * 3600 * 1000),
    })),

  nextWeek: () =>
    set((state) => ({
      currentDate: new Date(state.currentDate.getTime() + 7 * 24 * 3600 * 1000),
    })),

  currentWeek: () =>
    set({
      currentDate: new Date(),
    }),

  setIsAddModalOpen: (isAddModalOpen) =>
    set((state) => ({
      isAddModalOpen,
      selectedDate: isAddModalOpen ? state.selectedDate : formatDateToYMD(new Date()),
    })),

  openAddModal: (defaultDate) =>
    set({
      isAddModalOpen: true,
      selectedDate: defaultDate || formatDateToYMD(new Date()),
      selectedUserId: "",
      shiftPreset: "MORNING",
    }),

  closeAddModal: () =>
    set({
      isAddModalOpen: false,
    }),

  setIsDeleteModalOpen: (isDeleteModalOpen) =>
    set({
      isDeleteModalOpen,
      deletingShiftId: isDeleteModalOpen ? undefined : null,
    }),

  openDeleteModal: (shiftId) =>
    set({
      isDeleteModalOpen: true,
      deletingShiftId: shiftId,
    }),

  closeDeleteModal: () =>
    set({
      isDeleteModalOpen: false,
      deletingShiftId: null,
    }),

  setSelectedUserId: (selectedUserId) => set({ selectedUserId }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setShiftPreset: (shiftPreset) => set({ shiftPreset }),
  setIsSubmitting: (isSubmitting) => set({ isSubmitting }),

  resetAddForm: () =>
    set({
      selectedUserId: "",
      selectedDate: formatDateToYMD(new Date()),
      shiftPreset: "MORNING",
      isSubmitting: false,
    }),

  reset: () =>
    set({
      viewMode: "calendar",
      currentDate: new Date(),
      isAddModalOpen: false,
      isDeleteModalOpen: false,
      deletingShiftId: null,
      selectedUserId: "",
      selectedDate: formatDateToYMD(new Date()),
      shiftPreset: "MORNING",
      isSubmitting: false,
    }),
}));
