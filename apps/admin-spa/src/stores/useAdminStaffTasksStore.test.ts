import { describe, it, expect, beforeEach } from "vitest";
import { useAdminStaffTasksStore } from "./useAdminStaffTasksStore";

describe("useAdminStaffTasksStore", () => {
  beforeEach(() => {
    useAdminStaffTasksStore.getState().reset();
  });

  const mockTask = {
    id: "task-001",
    title: "Vệ sinh quầy thu ngân",
    status: "PENDING_APPROVAL",
    priority: "HIGH",
    frequency: "DAILY",
    assigneeId: "user-1",
  };

  const mockDefinition = {
    id: "def-001",
    title: "Mẫu kiểm tra ca sáng",
    status: "ACTIVE",
    priority: "MEDIUM",
  };

  describe("Initial State", () => {
    it("should initialize with default filter and modal values", () => {
      const state = useAdminStaffTasksStore.getState();
      expect(state.searchKeyword).toBe("");
      expect(state.statusFilter).toBe("ALL");
      expect(state.priorityFilter).toBe("ALL");
      expect(state.frequencyFilter).toBe("ALL");
      expect(state.selectedAssignee).toBe("ALL");
      expect(state.selectedWeekFilter).toBe("THIS_WEEK");
      expect(state.historyMonth).toBe("all");
      expect(state.defSearch).toBe("");
      expect(state.defStatusFilter).toBe("ALL");
      expect(state.itemSearch).toBe("");
      expect(state.itemStatusFilter).toBe("ALL");
      expect(state.viewMode).toBe("kanban");

      expect(state.isCreateDefinitionOpen).toBe(false);
      expect(state.isReviewModalOpen).toBe(false);
      expect(state.reviewingTask).toBeNull();
      expect(state.isAssignTaskOpen).toBe(false);
      expect(state.editingDefinition).toBeNull();
      expect(state.rejectReason).toBe("");
      expect(state.isRejectDialogOpen).toBe(false);
      expect(state.selectedTaskDetail).toBeNull();
      expect(state.formMode).toBe("CREATE");
      expect(state.editingTask).toBeNull();
      expect(state.isCreateItemOpen).toBe(false);
      expect(state.viewingItem).toBeNull();
    });
  });

  describe("Filter Updates & Resets", () => {
    it("should update all filter fields", () => {
      const store = useAdminStaffTasksStore.getState();

      store.setSearchKeyword("kiem tra");
      store.setStatusFilter("COMPLETED");
      store.setPriorityFilter("URGENT");
      store.setFrequencyFilter("WEEKLY");
      store.setSelectedAssignee("user-99");
      store.setSelectedWeekFilter("NEXT_WEEK");
      store.setHistoryMonth("2026-10");
      store.setDefSearch("quy trinh");
      store.setDefStatusFilter("ACTIVE");
      store.setItemSearch("vat tu");
      store.setItemStatusFilter("IN_PROGRESS");
      store.setViewMode("table");

      const updated = useAdminStaffTasksStore.getState();
      expect(updated.searchKeyword).toBe("kiem tra");
      expect(updated.statusFilter).toBe("COMPLETED");
      expect(updated.priorityFilter).toBe("URGENT");
      expect(updated.frequencyFilter).toBe("WEEKLY");
      expect(updated.selectedAssignee).toBe("user-99");
      expect(updated.selectedWeekFilter).toBe("NEXT_WEEK");
      expect(updated.historyMonth).toBe("2026-10");
      expect(updated.defSearch).toBe("quy trinh");
      expect(updated.defStatusFilter).toBe("ACTIVE");
      expect(updated.itemSearch).toBe("vat tu");
      expect(updated.itemStatusFilter).toBe("IN_PROGRESS");
      expect(updated.viewMode).toBe("table");
    });

    it("should reset filters back to initial without wiping modals", () => {
      const store = useAdminStaffTasksStore.getState();
      store.setSearchKeyword("loc du lieu");
      store.setStatusFilter("OPEN");
      store.openReviewModal(mockTask);

      store.resetFilters();

      const afterReset = useAdminStaffTasksStore.getState();
      expect(afterReset.searchKeyword).toBe("");
      expect(afterReset.statusFilter).toBe("ALL");
      expect(afterReset.viewMode).toBe("kanban");
      expect(afterReset.isReviewModalOpen).toBe(true);
      expect(afterReset.reviewingTask).toEqual(mockTask);
    });
  });

  describe("Task Review Modal", () => {
    it("should open and close review modal with task and clear rejection reason", () => {
      const { openReviewModal, closeReviewModal, setRejectReason, setIsRejectDialogOpen } =
        useAdminStaffTasksStore.getState();

      openReviewModal(mockTask);
      expect(useAdminStaffTasksStore.getState().isReviewModalOpen).toBe(true);
      expect(useAdminStaffTasksStore.getState().reviewingTask).toEqual(mockTask);
      expect(useAdminStaffTasksStore.getState().rejectReason).toBe("");

      setRejectReason("Hình ảnh chứng minh không rõ nét");
      setIsRejectDialogOpen(true);
      expect(useAdminStaffTasksStore.getState().rejectReason).toBe("Hình ảnh chứng minh không rõ nét");
      expect(useAdminStaffTasksStore.getState().isRejectDialogOpen).toBe(true);

      closeReviewModal();
      expect(useAdminStaffTasksStore.getState().isReviewModalOpen).toBe(false);
      expect(useAdminStaffTasksStore.getState().reviewingTask).toBeNull();
      expect(useAdminStaffTasksStore.getState().rejectReason).toBe("");
    });

    it("should handle setIsReviewModalOpen and setReviewingTask directly", () => {
      const store = useAdminStaffTasksStore.getState();
      store.setIsReviewModalOpen(true, mockTask);
      expect(useAdminStaffTasksStore.getState().isReviewModalOpen).toBe(true);
      expect(useAdminStaffTasksStore.getState().reviewingTask).toEqual(mockTask);

      store.setReviewingTask(null);
      expect(useAdminStaffTasksStore.getState().reviewingTask).toBeNull();
    });
  });

  describe("Task Assignment & Definition Modals", () => {
    it("should open assign task modal in CREATE mode when no task provided", () => {
      const store = useAdminStaffTasksStore.getState();
      store.openAssignTask();

      expect(useAdminStaffTasksStore.getState().isAssignTaskOpen).toBe(true);
      expect(useAdminStaffTasksStore.getState().formMode).toBe("CREATE");
      expect(useAdminStaffTasksStore.getState().editingTask).toBeNull();

      store.closeAssignTask();
      expect(useAdminStaffTasksStore.getState().isAssignTaskOpen).toBe(false);
      expect(useAdminStaffTasksStore.getState().formMode).toBe("CREATE");
    });

    it("should open assign task modal in EDIT mode when task is provided", () => {
      const store = useAdminStaffTasksStore.getState();
      store.openAssignTask(mockTask);

      expect(useAdminStaffTasksStore.getState().isAssignTaskOpen).toBe(true);
      expect(useAdminStaffTasksStore.getState().formMode).toBe("EDIT");
      expect(useAdminStaffTasksStore.getState().editingTask).toEqual(mockTask);
    });

    it("should manage create and edit definition modal", () => {
      const store = useAdminStaffTasksStore.getState();
      store.openCreateDefinition(mockDefinition);

      expect(useAdminStaffTasksStore.getState().isCreateDefinitionOpen).toBe(true);
      expect(useAdminStaffTasksStore.getState().editingDefinition).toEqual(mockDefinition);

      store.closeCreateDefinition();
      expect(useAdminStaffTasksStore.getState().isCreateDefinitionOpen).toBe(false);
      expect(useAdminStaffTasksStore.getState().editingDefinition).toBeNull();

      store.setEditingDefinition(mockDefinition);
      expect(useAdminStaffTasksStore.getState().editingDefinition).toEqual(mockDefinition);
    });

    it("should manage item creation, viewing item, and task detail", () => {
      const store = useAdminStaffTasksStore.getState();
      const mockItem = { id: "item-1", name: "Khai báo ca" };

      store.setIsCreateItemOpen(true);
      expect(useAdminStaffTasksStore.getState().isCreateItemOpen).toBe(true);

      store.setViewingItem(mockItem);
      expect(useAdminStaffTasksStore.getState().viewingItem).toEqual(mockItem);

      store.setSelectedTaskDetail(mockTask);
      expect(useAdminStaffTasksStore.getState().selectedTaskDetail).toEqual(mockTask);

      store.setFormMode("EDIT");
      expect(useAdminStaffTasksStore.getState().formMode).toBe("EDIT");
    });
  });

  describe("Store Reset", () => {
    it("should reset all states including filters and modals", () => {
      const store = useAdminStaffTasksStore.getState();
      store.setSearchKeyword("test");
      store.openAssignTask(mockTask);
      store.openReviewModal(mockTask);
      store.openCreateDefinition(mockDefinition);

      store.reset();

      const resetState = useAdminStaffTasksStore.getState();
      expect(resetState.searchKeyword).toBe("");
      expect(resetState.statusFilter).toBe("ALL");
      expect(resetState.isReviewModalOpen).toBe(false);
      expect(resetState.reviewingTask).toBeNull();
      expect(resetState.isAssignTaskOpen).toBe(false);
      expect(resetState.editingTask).toBeNull();
      expect(resetState.isCreateDefinitionOpen).toBe(false);
      expect(resetState.editingDefinition).toBeNull();
      expect(resetState.formMode).toBe("CREATE");
    });
  });
});
