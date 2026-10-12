import { create } from "zustand";

export interface AdminStaffTasksState {
  // UI Filters
  searchKeyword: string;
  statusFilter: string;
  priorityFilter: string;
  frequencyFilter: string;
  selectedAssignee: string;
  selectedWeekFilter: "THIS_WEEK" | "NEXT_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "ALL";
  historyMonth: string;
  defSearch: string;
  defStatusFilter: "ALL" | "ACTIVE" | "INACTIVE";
  itemSearch: string;
  itemStatusFilter: "ALL" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CLOSED";
  viewMode: "table" | "kanban";

  // Modal / Dialog States
  isCreateDefinitionOpen: boolean;
  isReviewModalOpen: boolean;
  reviewingTask: any | null;
  isAssignTaskOpen: boolean;
  editingDefinition: any | null;
  rejectReason: string;
  isRejectDialogOpen: boolean;
  selectedTaskDetail: any | null;
  formMode: "CREATE" | "EDIT";
  editingTask: any | null;
  isCreateItemOpen: boolean;
  viewingItem: any | null;

  // Filter Actions
  setSearchKeyword: (searchKeyword: string) => void;
  setStatusFilter: (statusFilter: string) => void;
  setPriorityFilter: (priorityFilter: string) => void;
  setFrequencyFilter: (frequencyFilter: string) => void;
  setSelectedAssignee: (selectedAssignee: string) => void;
  setSelectedWeekFilter: (
    selectedWeekFilter: "THIS_WEEK" | "NEXT_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "ALL"
  ) => void;
  setHistoryMonth: (historyMonth: string) => void;
  setDefSearch: (defSearch: string) => void;
  setDefStatusFilter: (defStatusFilter: "ALL" | "ACTIVE" | "INACTIVE") => void;
  setItemSearch: (itemSearch: string) => void;
  setItemStatusFilter: (
    itemStatusFilter: "ALL" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CLOSED"
  ) => void;
  setViewMode: (viewMode: "table" | "kanban") => void;
  resetFilters: () => void;

  // Modal Actions
  setIsCreateDefinitionOpen: (isOpen: boolean, def?: any | null) => void;
  openCreateDefinition: (def?: any | null) => void;
  closeCreateDefinition: () => void;

  setIsReviewModalOpen: (isOpen: boolean, task?: any | null) => void;
  openReviewModal: (task: any) => void;
  closeReviewModal: () => void;
  setReviewingTask: (task: any | null) => void;

  setIsAssignTaskOpen: (isOpen: boolean, task?: any | null) => void;
  openAssignTask: (task?: any | null) => void;
  closeAssignTask: () => void;

  setEditingDefinition: (def: any | null) => void;
  setRejectReason: (rejectReason: string) => void;
  setIsRejectDialogOpen: (isOpen: boolean) => void;
  setSelectedTaskDetail: (task: any | null) => void;
  setFormMode: (mode: "CREATE" | "EDIT") => void;
  setEditingTask: (task: any | null) => void;
  setIsCreateItemOpen: (isOpen: boolean) => void;
  setViewingItem: (item: any | null) => void;

  reset: () => void;
}

const initialFilters = {
  searchKeyword: "",
  statusFilter: "ALL",
  priorityFilter: "ALL",
  frequencyFilter: "ALL",
  selectedAssignee: "ALL",
  selectedWeekFilter: "THIS_WEEK" as const,
  historyMonth: "all",
  defSearch: "",
  defStatusFilter: "ALL" as const,
  itemSearch: "",
  itemStatusFilter: "ALL" as const,
  viewMode: "kanban" as const,
};

export const useAdminStaffTasksStore = create<AdminStaffTasksState>((set) => ({
  ...initialFilters,

  // Modal initial states
  isCreateDefinitionOpen: false,
  isReviewModalOpen: false,
  reviewingTask: null,
  isAssignTaskOpen: false,
  editingDefinition: null,
  rejectReason: "",
  isRejectDialogOpen: false,
  selectedTaskDetail: null,
  formMode: "CREATE",
  editingTask: null,
  isCreateItemOpen: false,
  viewingItem: null,

  // Filter setters
  setSearchKeyword: (searchKeyword) => set({ searchKeyword }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
  setFrequencyFilter: (frequencyFilter) => set({ frequencyFilter }),
  setSelectedAssignee: (selectedAssignee) => set({ selectedAssignee }),
  setSelectedWeekFilter: (selectedWeekFilter) => set({ selectedWeekFilter }),
  setHistoryMonth: (historyMonth) => set({ historyMonth }),
  setDefSearch: (defSearch) => set({ defSearch }),
  setDefStatusFilter: (defStatusFilter) => set({ defStatusFilter }),
  setItemSearch: (itemSearch) => set({ itemSearch }),
  setItemStatusFilter: (itemStatusFilter) => set({ itemStatusFilter }),
  setViewMode: (viewMode) => set({ viewMode }),

  resetFilters: () => set({ ...initialFilters }),

  // Modal actions
  setIsCreateDefinitionOpen: (isCreateDefinitionOpen, def) =>
    set({
      isCreateDefinitionOpen,
      ...(def !== undefined ? { editingDefinition: def } : {}),
    }),
  openCreateDefinition: (def) =>
    set({
      isCreateDefinitionOpen: true,
      editingDefinition: def || null,
    }),
  closeCreateDefinition: () =>
    set({
      isCreateDefinitionOpen: false,
      editingDefinition: null,
    }),

  setIsReviewModalOpen: (isReviewModalOpen, task) =>
    set({
      isReviewModalOpen,
      ...(task !== undefined ? { reviewingTask: task } : {}),
    }),
  openReviewModal: (task) =>
    set({
      isReviewModalOpen: true,
      reviewingTask: task,
      rejectReason: "",
    }),
  closeReviewModal: () =>
    set({
      isReviewModalOpen: false,
      reviewingTask: null,
      rejectReason: "",
    }),
  setReviewingTask: (reviewingTask) => set({ reviewingTask }),

  setIsAssignTaskOpen: (isAssignTaskOpen, task) =>
    set({
      isAssignTaskOpen,
      formMode: task ? "EDIT" : "CREATE",
      editingTask: task || null,
    }),
  openAssignTask: (task) =>
    set({
      isAssignTaskOpen: true,
      formMode: task ? "EDIT" : "CREATE",
      editingTask: task || null,
    }),
  closeAssignTask: () =>
    set({
      isAssignTaskOpen: false,
      formMode: "CREATE",
      editingTask: null,
    }),

  setEditingDefinition: (editingDefinition) => set({ editingDefinition }),
  setRejectReason: (rejectReason) => set({ rejectReason }),
  setIsRejectDialogOpen: (isRejectDialogOpen) => set({ isRejectDialogOpen }),
  setSelectedTaskDetail: (selectedTaskDetail) => set({ selectedTaskDetail }),
  setFormMode: (formMode) => set({ formMode }),
  setEditingTask: (editingTask) => set({ editingTask }),
  setIsCreateItemOpen: (isCreateItemOpen) => set({ isCreateItemOpen }),
  setViewingItem: (viewingItem) => set({ viewingItem }),

  reset: () =>
    set({
      ...initialFilters,
      isCreateDefinitionOpen: false,
      isReviewModalOpen: false,
      reviewingTask: null,
      isAssignTaskOpen: false,
      editingDefinition: null,
      rejectReason: "",
      isRejectDialogOpen: false,
      selectedTaskDetail: null,
      formMode: "CREATE",
      editingTask: null,
      isCreateItemOpen: false,
      viewingItem: null,
    }),
}));
