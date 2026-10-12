import { describe, it, expect, beforeEach } from 'vitest';
import { useAdminStaffTasksStore } from '../../apps/admin-spa/src/stores/useAdminStaffTasksStore';

describe('useAdminStaffTasksStore', () => {
  beforeEach(() => {
    useAdminStaffTasksStore.getState().reset();
  });

  describe('Initial State', () => {
    it('initializes with default filter and modal values', () => {
      const state = useAdminStaffTasksStore.getState();
      expect(state.searchKeyword).toBe('');
      expect(state.statusFilter).toBe('ALL');
      expect(state.priorityFilter).toBe('ALL');
      expect(state.frequencyFilter).toBe('ALL');
      expect(state.selectedAssignee).toBe('ALL');
      expect(state.selectedWeekFilter).toBe('THIS_WEEK');
      expect(state.historyMonth).toBe('all');
      expect(state.viewMode).toBe('kanban');

      expect(state.isCreateDefinitionOpen).toBe(false);
      expect(state.isReviewModalOpen).toBe(false);
      expect(state.reviewingTask).toBeNull();
      expect(state.isAssignTaskOpen).toBe(false);
      expect(state.editingDefinition).toBeNull();
      expect(state.rejectReason).toBe('');
      expect(state.isRejectDialogOpen).toBe(false);
      expect(state.formMode).toBe('CREATE');
      expect(state.editingTask).toBeNull();
    });
  });

  describe('Filter State Actions', () => {
    it('updates search keyword, status, priority, frequency, and assignee filters', () => {
      const store = useAdminStaffTasksStore.getState();

      store.setSearchKeyword('livestream');
      store.setStatusFilter('DONE');
      store.setPriorityFilter('HIGH');
      store.setFrequencyFilter('WEEKLY');
      store.setSelectedAssignee('staff-123');
      store.setSelectedWeekFilter('LAST_WEEK');
      store.setViewMode('table');

      const updated = useAdminStaffTasksStore.getState();
      expect(updated.searchKeyword).toBe('livestream');
      expect(updated.statusFilter).toBe('DONE');
      expect(updated.priorityFilter).toBe('HIGH');
      expect(updated.frequencyFilter).toBe('WEEKLY');
      expect(updated.selectedAssignee).toBe('staff-123');
      expect(updated.selectedWeekFilter).toBe('LAST_WEEK');
      expect(updated.viewMode).toBe('table');
    });

    it('resets filters back to default values', () => {
      const store = useAdminStaffTasksStore.getState();
      store.setSearchKeyword('post video');
      store.setStatusFilter('APPROVED');
      store.setSelectedAssignee('staff-999');

      store.resetFilters();

      const state = useAdminStaffTasksStore.getState();
      expect(state.searchKeyword).toBe('');
      expect(state.statusFilter).toBe('ALL');
      expect(state.selectedAssignee).toBe('ALL');
    });
  });

  describe('Modal State Actions', () => {
    it('manages task review modal open and close cleanly', () => {
      const store = useAdminStaffTasksStore.getState();
      const mockTask = { id: 'task-1', title: 'Video review', status: 'DONE' };

      store.openReviewModal(mockTask);
      let state = useAdminStaffTasksStore.getState();
      expect(state.isReviewModalOpen).toBe(true);
      expect(state.reviewingTask).toEqual(mockTask);
      expect(state.rejectReason).toBe('');

      store.setRejectReason('Cần bổ sung link đính kèm');
      expect(useAdminStaffTasksStore.getState().rejectReason).toBe('Cần bổ sung link đính kèm');

      store.closeReviewModal();
      state = useAdminStaffTasksStore.getState();
      expect(state.isReviewModalOpen).toBe(false);
      expect(state.reviewingTask).toBeNull();
      expect(state.rejectReason).toBe('');
    });

    it('manages task definition creation dialog', () => {
      const store = useAdminStaffTasksStore.getState();
      const mockDef = { id: 'def-1', name: 'Đăng video Tiktok', priority: 'HIGH' };

      store.openCreateDefinition(mockDef);
      let state = useAdminStaffTasksStore.getState();
      expect(state.isCreateDefinitionOpen).toBe(true);
      expect(state.editingDefinition).toEqual(mockDef);

      store.closeCreateDefinition();
      state = useAdminStaffTasksStore.getState();
      expect(state.isCreateDefinitionOpen).toBe(false);
      expect(state.editingDefinition).toBeNull();
    });

    it('manages staff task assignment and edit dialog', () => {
      const store = useAdminStaffTasksStore.getState();
      const mockEditTask = { id: 'task-5', title: 'Kiểm kho', assigneeId: 'u-1' };

      // Open in CREATE mode
      store.openAssignTask();
      let state = useAdminStaffTasksStore.getState();
      expect(state.isAssignTaskOpen).toBe(true);
      expect(state.formMode).toBe('CREATE');
      expect(state.editingTask).toBeNull();

      store.closeAssignTask();
      expect(useAdminStaffTasksStore.getState().isAssignTaskOpen).toBe(false);

      // Open in EDIT mode
      store.openAssignTask(mockEditTask);
      state = useAdminStaffTasksStore.getState();
      expect(state.isAssignTaskOpen).toBe(true);
      expect(state.formMode).toBe('EDIT');
      expect(state.editingTask).toEqual(mockEditTask);
    });

    it('manages rejection dialog state', () => {
      const store = useAdminStaffTasksStore.getState();
      store.setIsRejectDialogOpen(true);
      expect(useAdminStaffTasksStore.getState().isRejectDialogOpen).toBe(true);

      store.setIsRejectDialogOpen(false);
      expect(useAdminStaffTasksStore.getState().isRejectDialogOpen).toBe(false);
    });

    it('resets entire state with reset()', () => {
      const store = useAdminStaffTasksStore.getState();
      store.setSearchKeyword('abc');
      store.openReviewModal({ id: 'task-test' });
      store.setIsAssignTaskOpen(true);

      store.reset();

      const state = useAdminStaffTasksStore.getState();
      expect(state.searchKeyword).toBe('');
      expect(state.isReviewModalOpen).toBe(false);
      expect(state.reviewingTask).toBeNull();
      expect(state.isAssignTaskOpen).toBe(false);
    });
  });
});
