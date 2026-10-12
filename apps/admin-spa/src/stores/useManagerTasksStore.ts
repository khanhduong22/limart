import { create } from "zustand";
import {
  ChecklistItem,
  WeeklyTaskItem,
  DailyDetailItem,
  getTodayVN,
} from "@/types/manager-tasks";

export type ManagerTasksTab = "checklist" | "templates" | "history";

export interface ManagerTasksState {
  activeTab: ManagerTasksTab;
  selectedUserId: string;
  selectedDate: string;

  // Dialog states
  isCreateOpen: boolean;
  isEditOpen: boolean;
  editingItem: ChecklistItem | null;
  isHistoryDetailOpen: boolean;
  historyItem: DailyDetailItem | null;

  // Weekly Dialog states
  isWeeklyCreateOpen: boolean;
  isWeeklyEditOpen: boolean;
  isWeeklyCarryOverOpen: boolean;
  editingWeeklyTask: WeeklyTaskItem | null;

  // Actions
  setActiveTab: (tab: ManagerTasksTab) => void;
  setSelectedUserId: (userId: string) => void;
  setSelectedDate: (date: string) => void;

  // Checklist Dialog Actions
  setIsCreateOpen: (isOpen: boolean) => void;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;

  setIsEditOpen: (isOpen: boolean, item?: ChecklistItem | null) => void;
  openEditDialog: (item: ChecklistItem) => void;
  closeEditDialog: () => void;
  setEditingItem: (item: ChecklistItem | null) => void;

  // History Detail Dialog Actions
  setIsHistoryDetailOpen: (isOpen: boolean, item?: DailyDetailItem | null) => void;
  openHistoryDetail: (item: DailyDetailItem) => void;
  closeHistoryDetail: () => void;
  setHistoryItem: (item: DailyDetailItem | null) => void;

  // Weekly Dialog Actions
  setIsWeeklyCreateOpen: (isOpen: boolean) => void;
  openWeeklyCreateDialog: () => void;
  closeWeeklyCreateDialog: () => void;

  setIsWeeklyEditOpen: (isOpen: boolean, task?: WeeklyTaskItem | null) => void;
  openWeeklyEditDialog: (task: WeeklyTaskItem) => void;
  closeWeeklyEditDialog: () => void;

  setIsWeeklyCarryOverOpen: (isOpen: boolean, task?: WeeklyTaskItem | null) => void;
  openWeeklyCarryOverDialog: (task: WeeklyTaskItem) => void;
  closeWeeklyCarryOverDialog: () => void;

  setEditingWeeklyTask: (task: WeeklyTaskItem | null) => void;

  reset: () => void;
}

export const useManagerTasksStore = create<ManagerTasksState>((set) => ({
  activeTab: "checklist",
  selectedUserId: "",
  selectedDate: getTodayVN(),

  isCreateOpen: false,
  isEditOpen: false,
  editingItem: null,
  isHistoryDetailOpen: false,
  historyItem: null,

  isWeeklyCreateOpen: false,
  isWeeklyEditOpen: false,
  isWeeklyCarryOverOpen: false,
  editingWeeklyTask: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedUserId: (selectedUserId) => set({ selectedUserId }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),

  setIsCreateOpen: (isCreateOpen) => set({ isCreateOpen }),
  openCreateDialog: () => set({ isCreateOpen: true }),
  closeCreateDialog: () => set({ isCreateOpen: false }),

  setIsEditOpen: (isEditOpen, item) =>
    set({
      isEditOpen,
      ...(item !== undefined ? { editingItem: item } : {}),
    }),
  openEditDialog: (item) => set({ isEditOpen: true, editingItem: item }),
  closeEditDialog: () => set({ isEditOpen: false, editingItem: null }),
  setEditingItem: (editingItem) => set({ editingItem }),

  setIsHistoryDetailOpen: (isHistoryDetailOpen, item) =>
    set({
      isHistoryDetailOpen,
      ...(item !== undefined ? { historyItem: item } : {}),
    }),
  openHistoryDetail: (item) => set({ isHistoryDetailOpen: true, historyItem: item }),
  closeHistoryDetail: () => set({ isHistoryDetailOpen: false, historyItem: null }),
  setHistoryItem: (historyItem) => set({ historyItem }),

  setIsWeeklyCreateOpen: (isWeeklyCreateOpen) => set({ isWeeklyCreateOpen }),
  openWeeklyCreateDialog: () => set({ isWeeklyCreateOpen: true }),
  closeWeeklyCreateDialog: () => set({ isWeeklyCreateOpen: false }),

  setIsWeeklyEditOpen: (isWeeklyEditOpen, task) =>
    set({
      isWeeklyEditOpen,
      ...(task !== undefined ? { editingWeeklyTask: task } : {}),
    }),
  openWeeklyEditDialog: (task) => set({ isWeeklyEditOpen: true, editingWeeklyTask: task }),
  closeWeeklyEditDialog: () => set({ isWeeklyEditOpen: false, editingWeeklyTask: null }),

  setIsWeeklyCarryOverOpen: (isWeeklyCarryOverOpen, task) =>
    set({
      isWeeklyCarryOverOpen,
      ...(task !== undefined ? { editingWeeklyTask: task } : {}),
    }),
  openWeeklyCarryOverDialog: (task) =>
    set({ isWeeklyCarryOverOpen: true, editingWeeklyTask: task }),
  closeWeeklyCarryOverDialog: () =>
    set({ isWeeklyCarryOverOpen: false, editingWeeklyTask: null }),

  setEditingWeeklyTask: (editingWeeklyTask) => set({ editingWeeklyTask }),

  reset: () =>
    set({
      activeTab: "checklist",
      selectedUserId: "",
      selectedDate: getTodayVN(),
      isCreateOpen: false,
      isEditOpen: false,
      editingItem: null,
      isHistoryDetailOpen: false,
      historyItem: null,
      isWeeklyCreateOpen: false,
      isWeeklyEditOpen: false,
      isWeeklyCarryOverOpen: false,
      editingWeeklyTask: null,
    }),
}));
