import { create } from 'zustand';
import type { CalendarEvent, PendingEvent } from '../components/schedule/types';

export interface ScheduleStoreState {
  // UI filters
  hideFullTime: boolean;
  showAllShifts: boolean;
  showDutyDetails: boolean;

  // Modals & drawers
  dutySheetOpen: boolean;
  modalOpen: boolean;
  pendingEvent: PendingEvent | null;
  targetUserId: string;
  isSeniorRegister: boolean;
  actionModalOpen: boolean;
  selectedEvent: CalendarEvent | null;
  showAddShiftTask: boolean;

  // Actions
  setHideFullTime: (val: boolean | ((prev: boolean) => boolean)) => void;
  setShowAllShifts: (val: boolean | ((prev: boolean) => boolean)) => void;
  setShowDutyDetails: (val: boolean | ((prev: boolean) => boolean)) => void;
  setDutySheetOpen: (open: boolean) => void;
  setModalOpen: (open: boolean) => void;
  setPendingEvent: (event: PendingEvent | null) => void;
  setTargetUserId: (id: string) => void;
  setIsSeniorRegister: (isSenior: boolean) => void;
  setActionModalOpen: (open: boolean) => void;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  setShowAddShiftTask: (show: boolean) => void;

  // Convenience helper actions
  openCreateModal: (pending: PendingEvent, targetId?: string) => void;
  closeCreateModal: () => void;
  openActionModal: (event: CalendarEvent, autoOpenAddTask?: boolean) => void;
  closeActionModal: () => void;
  reset: () => void;
}

export const useScheduleStore = create<ScheduleStoreState>((set) => ({
  hideFullTime: true,
  showAllShifts: false,
  showDutyDetails: false,

  dutySheetOpen: false,
  modalOpen: false,
  pendingEvent: null,
  targetUserId: '',
  isSeniorRegister: false,
  actionModalOpen: false,
  selectedEvent: null,
  showAddShiftTask: false,

  setHideFullTime: (val) =>
    set((state) => ({
      hideFullTime: typeof val === 'function' ? val(state.hideFullTime) : val,
    })),
  setShowAllShifts: (val) =>
    set((state) => ({
      showAllShifts: typeof val === 'function' ? val(state.showAllShifts) : val,
    })),
  setShowDutyDetails: (val) =>
    set((state) => ({
      showDutyDetails: typeof val === 'function' ? val(state.showDutyDetails) : val,
    })),
  setDutySheetOpen: (dutySheetOpen) => set({ dutySheetOpen }),
  setModalOpen: (modalOpen) => set({ modalOpen }),
  setPendingEvent: (pendingEvent) => set({ pendingEvent }),
  setTargetUserId: (targetUserId) => set({ targetUserId }),
  setIsSeniorRegister: (isSeniorRegister) => set({ isSeniorRegister }),
  setActionModalOpen: (actionModalOpen) =>
    set((state) => ({
      actionModalOpen,
      // If closing modal, reset add task form flag
      showAddShiftTask: actionModalOpen ? state.showAddShiftTask : false,
    })),
  setSelectedEvent: (selectedEvent) => set({ selectedEvent }),
  setShowAddShiftTask: (showAddShiftTask) => set({ showAddShiftTask }),

  openCreateModal: (pending, targetId = '') =>
    set({
      modalOpen: true,
      pendingEvent: pending,
      targetUserId: targetId,
      isSeniorRegister: false,
    }),

  closeCreateModal: () =>
    set({
      modalOpen: false,
      pendingEvent: null,
      targetUserId: '',
      isSeniorRegister: false,
    }),

  openActionModal: (event, autoOpenAddTask = false) =>
    set({
      actionModalOpen: true,
      selectedEvent: event,
      showAddShiftTask: autoOpenAddTask,
    }),

  closeActionModal: () =>
    set({
      actionModalOpen: false,
      selectedEvent: null,
      showAddShiftTask: false,
    }),

  reset: () =>
    set({
      hideFullTime: true,
      showAllShifts: false,
      showDutyDetails: false,
      dutySheetOpen: false,
      modalOpen: false,
      pendingEvent: null,
      targetUserId: '',
      isSeniorRegister: false,
      actionModalOpen: false,
      selectedEvent: null,
      showAddShiftTask: false,
    }),
}));
