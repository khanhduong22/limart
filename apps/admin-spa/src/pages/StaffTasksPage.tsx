import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { api } from "@/lib/api";
import {
  type StaffTask,
  type StaffPerformanceStats,
  type StaffTaskUserOption,
} from "@/types/staff-tasks";
import { useAdminStaffTasksStore } from "@/stores/useAdminStaffTasksStore";
import {
  StaffTasksFilterBar,
  StaffTasksTable,
  StaffKpiStatsCards,
  computeStaffTaskDateRanges,
  filterStaffTasks,
} from "@/components/tasks/staff";

const StaffTaskFormDialog = React.lazy(() =>
  import("@/components/tasks/staff").then((m) => ({ default: m.StaffTaskFormDialog }))
);
const TaskReviewModal = React.lazy(() =>
  import("@/components/tasks/staff").then((m) => ({ default: m.TaskReviewModal }))
);
const CreateTaskDefinitionDialog = React.lazy(() =>
  import("@/components/tasks/staff").then((m) => ({ default: m.CreateTaskDefinitionDialog }))
);
const TaskRejectDialog = React.lazy(() =>
  import("@/components/tasks/staff").then((m) => ({ default: m.TaskRejectDialog }))
);

export function StaffTasksPage() {
  const {
    searchKeyword,
    statusFilter,
    selectedAssignee,
    selectedWeekFilter,
    openAssignTask,
    openReviewModal,
    setIsRejectDialogOpen,
  } = useAdminStaffTasksStore();

  // 1. Fetch tasks and users list
  const {
    data: staffTasksResponse,
    isValidating: isTasksValidating,
    mutate: mutateTasks,
  } = useAdminQuery<any>("/api/staff-tasks", {
    revalidateOnFocus: true,
    dedupingInterval: 4000,
  });

  // 2. Fetch KPI performance stats
  const {
    data: statsResponse,
    mutate: mutateStats,
  } = useAdminQuery<any>("/api/staff-tasks/stats", {
    revalidateOnFocus: true,
    dedupingInterval: 4000,
  });

  const apiTasks: StaffTask[] = useMemo(() => {
    if (!staffTasksResponse) return [];
    if (Array.isArray(staffTasksResponse.tasks)) return staffTasksResponse.tasks;
    if (staffTasksResponse.data && Array.isArray(staffTasksResponse.data.tasks)) {
      return staffTasksResponse.data.tasks;
    }
    if (Array.isArray(staffTasksResponse)) return staffTasksResponse;
    return [];
  }, [staffTasksResponse]);

  const apiUsers: StaffTaskUserOption[] = useMemo(() => {
    if (!staffTasksResponse) return [];
    if (Array.isArray(staffTasksResponse.users)) return staffTasksResponse.users;
    if (staffTasksResponse.data && Array.isArray(staffTasksResponse.data.users)) {
      return staffTasksResponse.data.users;
    }
    return [];
  }, [staffTasksResponse]);

  // Local optimistic state for tasks
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTaskForReject, setSelectedTaskForReject] = useState<StaffTask | null>(null);

  useEffect(() => {
    if (apiTasks) {
      setTasks(apiTasks);
    }
  }, [apiTasks]);

  // Only users who are active and granted KPI permissions
  const allowedUsers = useMemo(() => {
    return apiUsers.filter((u) => u.staffTasksAllowed || u.role === "PARTNER");
  }, [apiUsers]);

  // Stats mapping per employee
  const userStats = useMemo<Record<string, { monthly: StaffPerformanceStats; weekly: StaffPerformanceStats }>>(() => {
    if (!statsResponse) return {};
    if (statsResponse.stats && typeof statsResponse.stats === "object") return statsResponse.stats;
    if (statsResponse.data && typeof statsResponse.data === "object") return statsResponse.data;
    if (typeof statsResponse === "object" && !Array.isArray(statsResponse)) return statsResponse;
    return {};
  }, [statsResponse]);

  // Weekly & Monthly range boundary calculations
  const ranges = useMemo(() => computeStaffTaskDateRanges(), []);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return filterStaffTasks(tasks, {
      selectedAssignee,
      statusFilter,
      searchKeyword,
      selectedWeekFilter,
      ranges,
    });
  }, [tasks, selectedAssignee, statusFilter, searchKeyword, selectedWeekFilter, ranges]);

  // Submit Handler for Creating / Editing Staff Task
  const handleSaveStaffTask = async (formData: {
    title: string;
    description: string | null;
    assigneeId: string;
    startDate: string | null;
    deadline: string | null;
    adminNote: string | null;
  }) => {
    const { formMode, editingTask, closeAssignTask } = useAdminStaffTasksStore.getState();
    setSubmitting(true);
    try {
      if (formMode === "CREATE") {
        const res = await api.post<any>("/api/staff-tasks", formData);
        const newTask = res.task || res.data || res;
        toast.success("Tạo nhiệm vụ thành công!");
        setTasks((prev) => [newTask, ...prev]);
      } else {
        if (!editingTask) return;
        const res = await api.patch<any>(`/api/staff-tasks/${editingTask.id}`, formData);
        const updatedTask = res.task || res.data || res;
        toast.success("Cập nhật nhiệm vụ thành công!");
        setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updatedTask : t)));
      }
      closeAssignTask();
      mutateTasks();
      mutateStats();
    } catch (err: any) {
      toast.error(err.message || "Gặp lỗi khi xử lý nhiệm vụ");
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Handler
  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const taskToDelete = tasks.find((t) => t.id === taskId);
    const taskTitle = taskToDelete?.title ? `"${taskToDelete.title}"` : "nhiệm vụ này";
    const assigneeName = taskToDelete?.assignee?.name || "nhân viên";

    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa nhiệm vụ ${taskTitle} của ${assigneeName} không? (Thao tác này giúp Admin thu hồi nếu giao nhầm)`
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      await api.delete(`/api/staff-tasks/${taskId}`);
      toast.success("Đã xóa nhiệm vụ thành công!");
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      mutateTasks();
      mutateStats();
    } catch (err: any) {
      toast.error(err.message || "Gặp lỗi xóa nhiệm vụ");
    } finally {
      setSubmitting(false);
    }
  };

  // Approve Handler
  const handleApproveTask = async (task: StaffTask, e?: React.MouseEvent | React.FormEvent, adminNote?: string) => {
    if (e && "stopPropagation" in e) e.stopPropagation();
    setSubmitting(true);
    try {
      const res = await api.patch<any>(`/api/staff-tasks/${task.id}`, {
        status: "APPROVED",
        adminNote: adminNote || task.adminNote,
      });
      const updated = res.task || res.data || res;
      toast.success("Đã duyệt hoàn thành!");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      mutateTasks();
      mutateStats();
    } catch (err: any) {
      toast.error(err.message || "Lỗi phê duyệt nhiệm vụ");
    } finally {
      setSubmitting(false);
    }
  };

  // Reject Handler
  const handleRejectTask = async (task: StaffTask, reason: string) => {
    setSubmitting(true);
    try {
      const res = await api.patch<any>(`/api/staff-tasks/${task.id}`, {
        status: "REJECTED",
        adminNote: reason.trim(),
      });
      const updated = res.task || res.data || res;
      toast.success("Đã gửi yêu cầu làm lại cho nhân viên");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      mutateTasks();
      mutateStats();
    } catch (err: any) {
      toast.error(err.message || "Lỗi xử lý yêu cầu chỉnh sửa");
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Reject Dialog Trigger
  const handleOpenRejectDialog = (task: StaffTask) => {
    setSelectedTaskForReject(task);
    setIsRejectDialogOpen(true);
  };

  // Refresh
  const handleRefresh = useCallback(() => {
    mutateTasks();
    mutateStats();
    toast.info("Đã làm mới dữ liệu công việc và KPI");
  }, [mutateTasks, mutateStats]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Bảng giao việc & KPI
            </h1>
            {isTasksValidating && (
              <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Quản lý, phân công và kiểm duyệt hiệu suất làm việc theo chỉ tiêu của nhân viên LimArt.
          </p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <StaffTasksFilterBar
        assignableUsers={allowedUsers}
        totalCount={filteredTasks.length}
        onRefresh={handleRefresh}
        isRefreshing={isTasksValidating}
        onOpenCreateTask={() => openAssignTask()}
      />

      {/* KPI Performance Overview */}
      <StaffKpiStatsCards
        selectedUserFilter={selectedAssignee}
        allowedUsers={allowedUsers}
        userStats={userStats}
      />

      {/* Staff Tasks Responsive Table / Kanban Board with .cv-auto-table-row & .cv-auto-card */}
      <StaffTasksTable
        tasks={filteredTasks}
        onSelectTask={(task) => openReviewModal(task)}
        onEditTask={(task, e) => {
          e.stopPropagation();
          openAssignTask(task);
        }}
        onDeleteTask={handleDeleteTask}
        onApproveTask={handleApproveTask}
        onRejectTask={handleOpenRejectDialog}
        submitting={submitting}
      />

      {/* Dialogs */}
      <React.Suspense fallback={null}>
        <StaffTaskFormDialog
          assignableUsers={allowedUsers}
          existingTasks={tasks}
          onSubmit={handleSaveStaffTask}
          submitting={submitting}
        />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <TaskReviewModal
          onApprove={(task, adminNote) => handleApproveTask(task, undefined, adminNote)}
          onReject={handleRejectTask}
          submitting={submitting}
        />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <CreateTaskDefinitionDialog />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <TaskRejectDialog
          onSubmit={(reason) => {
            if (selectedTaskForReject) {
              return handleRejectTask(selectedTaskForReject, reason);
            }
          }}
          submitting={submitting}
        />
      </React.Suspense>
    </div>
  );
}

export default StaffTasksPage;
