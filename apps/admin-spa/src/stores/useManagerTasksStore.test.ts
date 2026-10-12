import { describe, it, expect, beforeEach } from "vitest";
import { useManagerTasksStore } from "./useManagerTasksStore";
import { ChecklistItem, DailyDetailItem, WeeklyTaskItem, getTodayVN } from "@/types/manager-tasks";

describe("useManagerTasksStore", () => {
  beforeEach(() => {
    useManagerTasksStore.getState().reset();
  });

  const mockChecklistItem: ChecklistItem = {
    id: "check-1",
    title: "Kiểm tra nhiệt độ tủ mát",
    description: "Ghi nhận nhiệt độ lúc 8h sáng",
    active: true,
    targetDate: "2026-10-12",
    createdAt: "2026-10-12T01:00:00Z",
    completed: false,
    completedAt: null,
  };

  const mockHistoryItem: DailyDetailItem = {
    date: "2026-10-12",
    shift: "Sáng (07:30 - 12:00)",
    hours: 4.5,
    isChecklistIncomplete: true,
  };

  const mockWeeklyTask: WeeklyTaskItem = {
    id: "wtask-1",
    title: "Kiểm kê hàng tồn kho tầng 2",
    description: "Đếm số lượng thực tế và đối chiếu hệ thống",
    assigneeId: "user-123",
    weekStart: "2026-10-12",
    weekEnd: "2026-10-18",
    completed: false,
    completedAt: null,
    explanation: null,
    isCarriedOver: false,
  };

  describe("Initial State", () => {
    it("should initialize with default values", () => {
      const state = useManagerTasksStore.getState();
      expect(state.activeTab).toBe("checklist");
      expect(state.selectedUserId).toBe("");
      expect(state.selectedDate).toBe(getTodayVN());
      expect(state.isCreateOpen).toBe(false);
      expect(state.isEditOpen).toBe(false);
      expect(state.editingItem).toBeNull();
      expect(state.isHistoryDetailOpen).toBe(false);
      expect(state.historyItem).toBeNull();
      expect(state.isWeeklyCreateOpen).toBe(false);
      expect(state.isWeeklyEditOpen).toBe(false);
      expect(state.isWeeklyCarryOverOpen).toBe(false);
      expect(state.editingWeeklyTask).toBeNull();
    });
  });

  describe("Tab & Filter Updates", () => {
    it("should update active tab correctly", () => {
      const { setActiveTab } = useManagerTasksStore.getState();

      setActiveTab("templates");
      expect(useManagerTasksStore.getState().activeTab).toBe("templates");

      setActiveTab("history");
      expect(useManagerTasksStore.getState().activeTab).toBe("history");

      setActiveTab("checklist");
      expect(useManagerTasksStore.getState().activeTab).toBe("checklist");
    });

    it("should update selected user and date", () => {
      const { setSelectedUserId, setSelectedDate } = useManagerTasksStore.getState();

      setSelectedUserId("usr-456");
      expect(useManagerTasksStore.getState().selectedUserId).toBe("usr-456");

      setSelectedDate("2026-11-01");
      expect(useManagerTasksStore.getState().selectedDate).toBe("2026-11-01");
    });
  });

  describe("Checklist Dialogs", () => {
    it("should manage create checklist dialog", () => {
      const { openCreateDialog, closeCreateDialog, setIsCreateOpen } = useManagerTasksStore.getState();

      openCreateDialog();
      expect(useManagerTasksStore.getState().isCreateOpen).toBe(true);

      closeCreateDialog();
      expect(useManagerTasksStore.getState().isCreateOpen).toBe(false);

      setIsCreateOpen(true);
      expect(useManagerTasksStore.getState().isCreateOpen).toBe(true);
    });

    it("should manage edit checklist dialog and item", () => {
      const { openEditDialog, closeEditDialog, setEditingItem, setIsEditOpen } =
        useManagerTasksStore.getState();

      openEditDialog(mockChecklistItem);
      expect(useManagerTasksStore.getState().isEditOpen).toBe(true);
      expect(useManagerTasksStore.getState().editingItem).toEqual(mockChecklistItem);

      closeEditDialog();
      expect(useManagerTasksStore.getState().isEditOpen).toBe(false);
      expect(useManagerTasksStore.getState().editingItem).toBeNull();

      setEditingItem(mockChecklistItem);
      expect(useManagerTasksStore.getState().editingItem).toEqual(mockChecklistItem);

      setIsEditOpen(true, mockChecklistItem);
      expect(useManagerTasksStore.getState().isEditOpen).toBe(true);
      expect(useManagerTasksStore.getState().editingItem).toEqual(mockChecklistItem);
    });
  });

  describe("History Detail Dialog", () => {
    it("should manage history detail modal and selected item", () => {
      const { openHistoryDetail, closeHistoryDetail, setHistoryItem, setIsHistoryDetailOpen } =
        useManagerTasksStore.getState();

      openHistoryDetail(mockHistoryItem);
      expect(useManagerTasksStore.getState().isHistoryDetailOpen).toBe(true);
      expect(useManagerTasksStore.getState().historyItem).toEqual(mockHistoryItem);

      closeHistoryDetail();
      expect(useManagerTasksStore.getState().isHistoryDetailOpen).toBe(false);
      expect(useManagerTasksStore.getState().historyItem).toBeNull();

      setHistoryItem(mockHistoryItem);
      expect(useManagerTasksStore.getState().historyItem).toEqual(mockHistoryItem);

      setIsHistoryDetailOpen(false);
      expect(useManagerTasksStore.getState().isHistoryDetailOpen).toBe(false);
    });
  });

  describe("Weekly Dialogs", () => {
    it("should manage weekly task create dialog", () => {
      const { openWeeklyCreateDialog, closeWeeklyCreateDialog, setIsWeeklyCreateOpen } =
        useManagerTasksStore.getState();

      openWeeklyCreateDialog();
      expect(useManagerTasksStore.getState().isWeeklyCreateOpen).toBe(true);

      closeWeeklyCreateDialog();
      expect(useManagerTasksStore.getState().isWeeklyCreateOpen).toBe(false);

      setIsWeeklyCreateOpen(true);
      expect(useManagerTasksStore.getState().isWeeklyCreateOpen).toBe(true);
    });

    it("should manage weekly task edit dialog", () => {
      const { openWeeklyEditDialog, closeWeeklyEditDialog, setEditingWeeklyTask, setIsWeeklyEditOpen } =
        useManagerTasksStore.getState();

      openWeeklyEditDialog(mockWeeklyTask);
      expect(useManagerTasksStore.getState().isWeeklyEditOpen).toBe(true);
      expect(useManagerTasksStore.getState().editingWeeklyTask).toEqual(mockWeeklyTask);

      closeWeeklyEditDialog();
      expect(useManagerTasksStore.getState().isWeeklyEditOpen).toBe(false);
      expect(useManagerTasksStore.getState().editingWeeklyTask).toBeNull();

      setEditingWeeklyTask(mockWeeklyTask);
      expect(useManagerTasksStore.getState().editingWeeklyTask).toEqual(mockWeeklyTask);

      setIsWeeklyEditOpen(true, mockWeeklyTask);
      expect(useManagerTasksStore.getState().isWeeklyEditOpen).toBe(true);
    });

    it("should manage weekly carry-over dialog", () => {
      const { openWeeklyCarryOverDialog, closeWeeklyCarryOverDialog, setIsWeeklyCarryOverOpen } =
        useManagerTasksStore.getState();

      openWeeklyCarryOverDialog(mockWeeklyTask);
      expect(useManagerTasksStore.getState().isWeeklyCarryOverOpen).toBe(true);
      expect(useManagerTasksStore.getState().editingWeeklyTask).toEqual(mockWeeklyTask);

      closeWeeklyCarryOverDialog();
      expect(useManagerTasksStore.getState().isWeeklyCarryOverOpen).toBe(false);
      expect(useManagerTasksStore.getState().editingWeeklyTask).toBeNull();

      setIsWeeklyCarryOverOpen(true, mockWeeklyTask);
      expect(useManagerTasksStore.getState().isWeeklyCarryOverOpen).toBe(true);
      expect(useManagerTasksStore.getState().editingWeeklyTask).toEqual(mockWeeklyTask);
    });
  });

  describe("Reset Action", () => {
    it("should reset all state properties to initial values", () => {
      const store = useManagerTasksStore.getState();
      store.setActiveTab("history");
      store.setSelectedUserId("user-999");
      store.setSelectedDate("2026-12-31");
      store.openCreateDialog();
      store.openEditDialog(mockChecklistItem);
      store.openHistoryDetail(mockHistoryItem);
      store.openWeeklyCreateDialog();
      store.openWeeklyEditDialog(mockWeeklyTask);

      store.reset();

      const resetState = useManagerTasksStore.getState();
      expect(resetState.activeTab).toBe("checklist");
      expect(resetState.selectedUserId).toBe("");
      expect(resetState.selectedDate).toBe(getTodayVN());
      expect(resetState.isCreateOpen).toBe(false);
      expect(resetState.isEditOpen).toBe(false);
      expect(resetState.editingItem).toBeNull();
      expect(resetState.isHistoryDetailOpen).toBe(false);
      expect(resetState.historyItem).toBeNull();
      expect(resetState.isWeeklyCreateOpen).toBe(false);
      expect(resetState.isWeeklyEditOpen).toBe(false);
      expect(resetState.isWeeklyCarryOverOpen).toBe(false);
      expect(resetState.editingWeeklyTask).toBeNull();
    });
  });
});
