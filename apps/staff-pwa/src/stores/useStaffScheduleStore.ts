import { create } from "zustand";

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export interface ShiftItem {
  id: number | string;
  userId?: string;
  user?: {
    id: string;
    name?: string;
  };
  start?: string;
  end?: string;
  date?: string;
  shift?: string;
  shiftType?: string;
  isOpenForSwap?: boolean;
  status?: string;
  [key: string]: any;
}

export interface StaffScheduleStoreState {
  weekStart: Date;
  selectedDate: Date | null;
  selectedShift: ShiftItem | null;
  swapTargetShift: ShiftItem | null;
  isRegisterModalOpen: boolean;
  isSwapModalOpen: boolean;
  showAddForm: boolean;
  isSubmitting: boolean;

  // Time registration form state
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
  activePreset: string | null;

  // Actions
  setWeekStart: (date: Date) => void;
  setSelectedDate: (date: Date | null) => void;
  setSelectedShift: (shift: ShiftItem | null) => void;
  setIsRegisterModalOpen: (open: boolean) => void;
  openRegisterModal: (date?: Date) => void;
  closeRegisterModal: () => void;
  openSwapModal: (shift: ShiftItem) => void;
  closeSwapModal: () => void;
  setShowAddForm: (show: boolean) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
  setTimeRange: (sh: string, sm: string, eh: string, em: string, preset: string | null) => void;
  setStartHour: (hour: string) => void;
  setStartMinute: (minute: string) => void;
  setEndHour: (hour: string) => void;
  setEndMinute: (minute: string) => void;
  setActivePreset: (preset: string | null) => void;
  resetRegistrationForm: () => void;
  openDateDetails: (date: Date) => void;
  closeDateDetails: () => void;
}

export const useStaffScheduleStore = create<StaffScheduleStoreState>((set) => ({
  weekStart: getMonday(new Date()),
  selectedDate: null,
  selectedShift: null,
  swapTargetShift: null,
  isRegisterModalOpen: false,
  isSwapModalOpen: false,
  showAddForm: false,
  isSubmitting: false,

  startHour: "08",
  startMinute: "00",
  endHour: "12",
  endMinute: "00",
  activePreset: "8h - 12h",

  setWeekStart: (date) => set({ weekStart: getMonday(date) }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedShift: (selectedShift) => set({ selectedShift }),
  setIsRegisterModalOpen: (isRegisterModalOpen) => set({ isRegisterModalOpen }),
  openRegisterModal: (date) =>
    set({
      selectedDate: date || new Date(),
      isRegisterModalOpen: true,
      showAddForm: true,
      startHour: "08",
      startMinute: "00",
      endHour: "12",
      endMinute: "00",
      activePreset: "8h - 12h",
    }),
  closeRegisterModal: () =>
    set({
      isRegisterModalOpen: false,
      showAddForm: false,
    }),
  openSwapModal: (shift) =>
    set({
      isSwapModalOpen: true,
      swapTargetShift: shift,
    }),
  closeSwapModal: () =>
    set({
      isSwapModalOpen: false,
      swapTargetShift: null,
    }),
  setShowAddForm: (showAddForm) => set({ showAddForm }),
  setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
  setTimeRange: (sh, sm, eh, em, preset) =>
    set({
      startHour: sh,
      startMinute: sm,
      endHour: eh,
      endMinute: em,
      activePreset: preset,
    }),
  setStartHour: (startHour) => set({ startHour, activePreset: null }),
  setStartMinute: (startMinute) => set({ startMinute, activePreset: null }),
  setEndHour: (endHour) => set({ endHour, activePreset: null }),
  setEndMinute: (endMinute) => set({ endMinute, activePreset: null }),
  setActivePreset: (activePreset) => set({ activePreset }),
  resetRegistrationForm: () =>
    set({
      startHour: "08",
      startMinute: "00",
      endHour: "12",
      endMinute: "00",
      activePreset: "8h - 12h",
      showAddForm: false,
      isSubmitting: false,
    }),
  openDateDetails: (date) =>
    set({
      selectedDate: date,
      startHour: "08",
      startMinute: "00",
      endHour: "12",
      endMinute: "00",
      activePreset: "8h - 12h",
      showAddForm: false,
    }),
  closeDateDetails: () =>
    set({
      selectedDate: null,
      showAddForm: false,
    }),
}));
