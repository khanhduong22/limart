import React, { useState, useEffect, useMemo, useCallback } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Calendar,
  User,
  Plus,
  Edit2,
  Trash2,
  Check,
  RotateCcw,
  Filter,
  UserCheck,
  AlertCircle,
  FileText,
  Sparkles,
  History,
  CheckCircle2,
  RefreshCw,
  Clock,
  Layers,
} from "lucide-react";

import { api, swrFetcher } from "@/lib/api";
import {
  type StaffTask,
  type StaffPerformanceStats,
  type StaffTaskUserOption,
  COLUMNS,
} from "@/types/staff-tasks";
import {
  getMergedTaskSuggestions,
  filterTaskSuggestions,
  findBestMatchingTemplate,
  type TaskSuggestion,
  DEFAULT_STAFF_TASK_TEMPLATES,
} from "@/lib/staff-task-templates";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function safeFormatDate(dateVal: string | Date | null | undefined, fmt = "dd/MM/yyyy"): string {
  if (!dateVal) return "—";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "—";
  return format(d, fmt);
}

export function StaffTasksPage() {
  // 1. Fetch tasks and users list
  const {
    data: staffTasksResponse,
    isLoading: isTasksLoading,
    isValidating: isTasksValidating,
    mutate: mutateTasks,
  } = useSWR<any>("/api/staff-tasks", swrFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 4000,
  });

  // 2. Fetch KPI performance stats
  const {
    data: statsResponse,
    mutate: mutateStats,
  } = useSWR<any>("/api/staff-tasks/stats", swrFetcher, {
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

  useEffect(() => {
    if (apiTasks) {
      setTasks(apiTasks);
    }
  }, [apiTasks]);

  // Only users who are active and granted KPI permissions (staffTasksAllowed === true or role === "PARTNER")
  const allowedUsers = useMemo(() => {
    return apiUsers.filter((u) => u.staffTasksAllowed || u.role === "PARTNER");
  }, [apiUsers]);
  const assignableUsers = allowedUsers;

  // Stats mapping per employee
  const userStats = useMemo<Record<string, { monthly: StaffPerformanceStats; weekly: StaffPerformanceStats }>>(() => {
    if (!statsResponse) return {};
    if (statsResponse.stats && typeof statsResponse.stats === "object") {
      return statsResponse.stats;
    }
    if (statsResponse.data && typeof statsResponse.data === "object") {
      return statsResponse.data;
    }
    if (typeof statsResponse === "object" && !Array.isArray(statsResponse)) {
      return statsResponse;
    }
    return {};
  }, [statsResponse]);

  // Filter States
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("ALL");
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<
    "THIS_WEEK" | "NEXT_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "ALL"
  >("THIS_WEEK");

  // Selection & Dialog States
  const [selectedTask, setSelectedTask] = useState<StaffTask | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form states for creating/editing
  const [formMode, setFormMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assigneeId: "",
    startDate: "",
    deadline: "",
    adminNote: "",
  });

  // Autocomplete / Template Suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [autoFilledTemplateTitle, setAutoFilledTemplateTitle] = useState<string | null>(null);

  // Merge history tasks and preset templates
  const allSuggestions = useMemo(() => {
    return getMergedTaskSuggestions(tasks);
  }, [tasks]);

  // Filtered suggestions based on user query in taskForm.title
  const filteredSuggestions = useMemo(() => {
    return filterTaskSuggestions(allSuggestions, taskForm.title);
  }, [allSuggestions, taskForm.title]);

  const handleTitleChange = (newTitle: string) => {
    setTaskForm((prev) => {
      let newDesc = prev.description;
      if (!prev.description || prev.description.trim() === "" || autoFilledTemplateTitle !== null) {
        const bestMatch = findBestMatchingTemplate(allSuggestions, newTitle);
        if (bestMatch && bestMatch.description) {
          newDesc = bestMatch.description;
          setAutoFilledTemplateTitle(bestMatch.title);
        } else if (autoFilledTemplateTitle !== null && !newTitle.trim()) {
          newDesc = "";
          setAutoFilledTemplateTitle(null);
        }
      }
      return { ...prev, title: newTitle, description: newDesc };
    });
    setShowSuggestions(true);
    setHighlightedIndex(-1);
  };

  const handleSelectSuggestion = (suggestion: TaskSuggestion) => {
    setTaskForm((prev) => ({
      ...prev,
      title: suggestion.title,
      description: suggestion.description || prev.description,
    }));
    setAutoFilledTemplateTitle(suggestion.title);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleOpenCreate = () => {
    setFormMode("CREATE");
    setTaskForm({
      title: "",
      description: "",
      assigneeId: selectedUserFilter !== "ALL" ? selectedUserFilter : (assignableUsers[0]?.id || ""),
      startDate: "",
      deadline: "",
      adminNote: "",
    });
    setAutoFilledTemplateTitle(null);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    setShowCreateDialog(true);
  };

  const handleOpenEdit = (task: StaffTask, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormMode("EDIT");
    setSelectedTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || "",
      assigneeId: task.assigneeId,
      startDate: task.startDate ? new Date(task.startDate).toISOString().split("T")[0] : "",
      deadline: task.deadline ? new Date(task.deadline).toISOString().split("T")[0] : "",
      adminNote: task.adminNote || "",
    });
    setAutoFilledTemplateTitle(null);
    setShowSuggestions(false);
    setShowCreateDialog(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      toast.error("Vui lòng nhập tiêu đề nhiệm vụ");
      return;
    }
    if (!taskForm.assigneeId) {
      toast.error("Vui lòng chọn nhân sự thực hiện");
      return;
    }

    setSubmitting(true);
    const dataInput = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      assigneeId: taskForm.assigneeId,
      startDate: taskForm.startDate ? new Date(taskForm.startDate).toISOString() : null,
      deadline: taskForm.deadline ? new Date(taskForm.deadline).toISOString() : null,
      adminNote: taskForm.adminNote.trim() || null,
    };

    try {
      if (formMode === "CREATE") {
        const res = await api.post<any>("/api/staff-tasks", dataInput);
        const newTask = res.task || res.data || res;
        toast.success("Tạo nhiệm vụ thành công!");
        setTasks((prev) => [newTask, ...prev]);
        setShowCreateDialog(false);
        mutateTasks();
        mutateStats();
      } else {
        if (!selectedTask) return;
        const res = await api.patch<any>(`/api/staff-tasks/${selectedTask.id}`, dataInput);
        const updatedTask = res.task || res.data || res;
        toast.success("Cập nhật nhiệm vụ thành công!");
        setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? updatedTask : t)));
        setShowCreateDialog(false);
        setSelectedTask(null);
        mutateTasks();
        mutateStats();
      }
    } catch (err: any) {
      toast.error(err.message || "Gặp lỗi khi xử lý nhiệm vụ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (taskId: string, e: React.MouseEvent) => {
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
      if (selectedTask?.id === taskId) setSelectedTask(null);
      mutateTasks();
      mutateStats();
    } catch (err: any) {
      toast.error(err.message || "Gặp lỗi xóa nhiệm vụ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (task: StaffTask, e?: React.MouseEvent | React.FormEvent) => {
    if (e && "stopPropagation" in e) e.stopPropagation();
    setSubmitting(true);
    try {
      const res = await api.patch<any>(`/api/staff-tasks/${task.id}`, {
        status: "APPROVED",
        adminNote: taskForm.adminNote || task.adminNote,
      });
      const updated = res.task || res.data || res;
      toast.success("Đã duyệt hoàn thành!");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      setSelectedTask(updated);
      mutateTasks();
      mutateStats();
    } catch (err: any) {
      toast.error(err.message || "Lỗi phê duyệt nhiệm vụ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectNote.trim()) {
      toast.error("Vui lòng nhập yêu cầu chỉnh sửa");
      return;
    }
    if (!selectedTask) return;

    setSubmitting(true);
    try {
      const res = await api.patch<any>(`/api/staff-tasks/${selectedTask.id}`, {
        status: "REJECTED",
        adminNote: rejectNote.trim(),
      });
      const updated = res.task || res.data || res;
      toast.success("Đã gửi yêu cầu làm lại cho nhân viên");
      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? updated : t)));
      setSelectedTask(updated);
      setShowRejectDialog(false);
      setRejectNote("");
      mutateTasks();
      mutateStats();
    } catch (err: any) {
      toast.error(err.message || "Lỗi xử lý yêu cầu chỉnh sửa");
    } finally {
      setSubmitting(false);
    }
  };

  // Weekly range boundary calculations (Mon-Sun in Vietnam time)
  const {
    thisWeekStart,
    thisWeekEnd,
    nextWeekStart,
    nextWeekEnd,
    lastWeekStart,
    lastWeekEnd,
    thisMonthStart,
    thisMonthEnd,
  } = useMemo(() => {
    const now = new Date();
    const vnNow = new Date(now.getTime() + VN_OFFSET_MS);

    const currentDay = vnNow.getUTCDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

    const thisWeekStartLocal = new Date(vnNow);
    thisWeekStartLocal.setUTCDate(vnNow.getUTCDate() + diffToMonday);
    thisWeekStartLocal.setUTCHours(0, 0, 0, 0);
    const twStart = new Date(thisWeekStartLocal.getTime() - VN_OFFSET_MS);

    const thisWeekEndLocal = new Date(thisWeekStartLocal);
    thisWeekEndLocal.setUTCDate(thisWeekStartLocal.getUTCDate() + 6);
    thisWeekEndLocal.setUTCHours(23, 59, 59, 999);
    const twEnd = new Date(thisWeekEndLocal.getTime() - VN_OFFSET_MS);

    const nwStart = new Date(twStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nwEnd = new Date(twEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    const lwStart = new Date(twStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lwEnd = new Date(twEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const thisMonthStartLocal = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), 1));
    thisMonthStartLocal.setUTCHours(0, 0, 0, 0);
    const tmStart = new Date(thisMonthStartLocal.getTime() - VN_OFFSET_MS);

    const thisMonthEndLocal = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth() + 1, 0));
    thisMonthEndLocal.setUTCHours(23, 59, 59, 999);
    const tmEnd = new Date(thisMonthEndLocal.getTime() - VN_OFFSET_MS);

    return {
      thisWeekStart: twStart,
      thisWeekEnd: twEnd,
      nextWeekStart: nwStart,
      nextWeekEnd: nwEnd,
      lastWeekStart: lwStart,
      lastWeekEnd: lwEnd,
      thisMonthStart: tmStart,
      thisMonthEnd: tmEnd,
    };
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // 1. User Filter
      if (selectedUserFilter !== "ALL" && t.assigneeId !== selectedUserFilter) {
        return false;
      }

      // 2. Week/Time Filter
      const taskStart = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);

      if (selectedWeekFilter === "THIS_WEEK") {
        return taskStart >= thisWeekStart && taskStart <= thisWeekEnd;
      }
      if (selectedWeekFilter === "NEXT_WEEK") {
        return taskStart >= nextWeekStart && taskStart <= nextWeekEnd;
      }
      if (selectedWeekFilter === "LAST_WEEK") {
        return taskStart >= lastWeekStart && taskStart <= lastWeekEnd;
      }
      if (selectedWeekFilter === "THIS_MONTH") {
        return taskStart >= thisMonthStart && taskStart <= thisMonthEnd;
      }
      return true;
    });
  }, [
    tasks,
    selectedUserFilter,
    selectedWeekFilter,
    thisWeekStart,
    thisWeekEnd,
    nextWeekStart,
    nextWeekEnd,
    lastWeekStart,
    lastWeekEnd,
    thisMonthStart,
    thisMonthEnd,
  ]);

  const fPercent = (val: number | null | undefined) => `${Math.round((val || 0) * 100)}%`;

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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              mutateTasks();
              mutateStats();
              toast.info("Đã làm mới dữ liệu công việc và KPI");
            }}
            className="text-xs text-slate-600 gap-1.5 font-medium min-h-[38px]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Làm mới
          </Button>

          <Button
            onClick={handleOpenCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5 shadow-sm text-xs sm:text-sm min-h-[38px]"
          >
            <Plus className="h-4 w-4" /> Giao nhiệm vụ mới
          </Button>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-4 rounded-xl border shadow-xs">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium">
            <Filter className="h-4 w-4 text-indigo-500" /> Lọc nhân sự:
          </div>
          <select
            value={selectedUserFilter}
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className="border rounded-lg text-base sm:text-sm px-3 py-2 bg-white outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium w-full sm:w-auto min-h-[38px] h-10 sm:h-9"
          >
            <option value="ALL">Tất cả nhân sự được cấp quyền KPI</option>
            {allowedUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} {u.email ? `(${u.email})` : ""}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium ml-0 sm:ml-2">
            <Calendar className="h-4 w-4 text-indigo-500" /> Lọc thời gian:
          </div>
          <select
            value={selectedWeekFilter}
            onChange={(e) => setSelectedWeekFilter(e.target.value as any)}
            className="border rounded-lg text-base sm:text-sm px-3 py-2 bg-white outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 w-full sm:w-auto min-h-[38px] h-10 sm:h-9"
          >
            <option value="LAST_WEEK">Tuần trước</option>
            <option value="THIS_WEEK">Tuần này</option>
            <option value="NEXT_WEEK">Tuần sau</option>
            <option value="THIS_MONTH">Tháng này</option>
            <option value="ALL">Tất cả thời gian</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Hiển thị <b>{filteredTasks.length}</b> công việc
        </div>
      </div>

      {/* KPI Performance Overview for All Employees */}
      {selectedUserFilter === "ALL" && (
        <Card className="border-indigo-100 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/60 border-b pb-3">
            <CardTitle className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
              <UserCheck className="h-4 w-4 text-indigo-600" /> Báo cáo hiệu suất nhân sự tháng này
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Tỷ lệ hoàn thành công việc khoán của các nhân viên được chỉ định.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {allowedUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground italic">
                Chưa có nhân viên nào được cấp quyền giao việc khoán/KPI. Vui lòng vào mục Nhân sự để bật quyền KPI.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {allowedUsers.map((u) => {
                  const stats = userStats[u.id];
                  return (
                    <div
                      key={u.id}
                      className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="h-9 w-9 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                          {u.name?.[0] || "?"}
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 text-sm">{u.name}</span>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>

                      {stats ? (
                        <div className="flex-1 max-w-md w-full grid grid-cols-2 gap-4">
                          {/* Month Stats */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-700 font-medium">
                              <span>
                                Tháng: <b>{fPercent(stats.monthly.completionRate)}</b>
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {stats.monthly.approved}/{stats.monthly.total} việc
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border">
                              <div
                                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                                style={{ width: `${(stats.monthly.completionRate || 0) * 100}%` }}
                              />
                            </div>
                          </div>

                          {/* Week Stats */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-700 font-medium">
                              <span>
                                Tuần: <b>{fPercent(stats.weekly.completionRate)}</b>
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {stats.weekly.approved}/{stats.weekly.total} việc
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border">
                              <div
                                className="bg-sky-600 h-full rounded-full transition-all duration-300"
                                style={{ width: `${(stats.weekly.completionRate || 0) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Đang cập nhật số liệu...</div>
                      )}

                      {stats && stats.monthly.overdue > 0 && (
                        <Badge
                          variant="destructive"
                          className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 gap-1 text-[10px] shrink-0 font-bold"
                        >
                          ⚠️ {stats.monthly.overdue} việc quá hạn
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Specific Employee Performance Stats */}
      {selectedUserFilter !== "ALL" && userStats[selectedUserFilter] && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Monthly KPI */}
          <Card className="border-indigo-100 bg-slate-50/20 shadow-sm">
            <CardContent className="pt-4 space-y-3">
              <div className="flex justify-between text-xs font-bold text-indigo-950 uppercase tracking-wide">
                <span>Hiệu suất KPI Tháng Này</span>
                <span>{fPercent(userStats[selectedUserFilter].monthly.completionRate)}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(userStats[selectedUserFilter].monthly.completionRate || 0) * 100}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Hoàn thành: <b>{userStats[selectedUserFilter].monthly.approved}</b> /{" "}
                {userStats[selectedUserFilter].monthly.total} việc được giao trong tháng này.
              </p>
            </CardContent>
          </Card>

          {/* Weekly KPI */}
          <Card className="border-sky-100 bg-slate-50/20 shadow-sm">
            <CardContent className="pt-4 space-y-3">
              <div className="flex justify-between text-xs font-bold text-sky-950 uppercase tracking-wide">
                <span>Hiệu suất KPI Tuần Này</span>
                <span>{fPercent(userStats[selectedUserFilter].weekly.completionRate)}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border">
                <div
                  className="bg-sky-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(userStats[selectedUserFilter].weekly.completionRate || 0) * 100}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Hoàn thành: <b>{userStats[selectedUserFilter].weekly.approved}</b> /{" "}
                {userStats[selectedUserFilter].weekly.total} việc được giao trong tuần này.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban Board Columns */}
      <div className="flex gap-4 overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch] pb-6 pt-2">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="shrink-0 w-72 flex flex-col" style={{ width: 290 }}>
              <div className="bg-gray-100/90 border border-b-0 rounded-t-xl px-4 py-2.5 flex items-center justify-between shadow-2xs">
                <span className="font-bold text-sm text-gray-800">{col.label}</span>
                <Badge variant="secondary" className="font-mono bg-white font-bold">
                  {colTasks.length}
                </Badge>
              </div>

              <div className="flex-1 min-h-[400px] border rounded-b-xl p-3 space-y-3 bg-slate-50/50 shadow-2xs">
                {colTasks.length === 0 ? (
                  <div className="h-[120px] border border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground italic p-4 text-center">
                    Không có nhiệm vụ
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <Card
                      key={task.id}
                      className="hover:shadow-md hover:scale-[1.01] transition-all duration-200 border-slate-200/80 cursor-pointer overflow-hidden bg-white"
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="p-3.5 space-y-2.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 justify-between">
                            <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-100">
                              {task.assignee?.name || "Nhân viên"}
                            </span>
                            <div
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-slate-400 hover:text-indigo-600"
                                onClick={(e) => handleOpenEdit(task, e)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-slate-400 hover:text-red-600"
                                onClick={(e) => handleDelete(task.id, e)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 leading-snug line-clamp-2 mt-1">
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {task.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>
                              {task.deadline ? safeFormatDate(task.deadline) : "Không có hạn"}
                            </span>
                          </div>
                          {task.status === "DONE" && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 border-amber-200 font-bold animate-pulse"
                            >
                              Cần duyệt
                            </Badge>
                          )}
                        </div>

                        {/* Direct actions for quick review */}
                        {task.status === "DONE" && (
                          <div
                            className="flex gap-2 pt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 text-[10px] gap-1"
                              onClick={(e) => handleApprove(task, e)}
                              disabled={submitting}
                            >
                              <Check className="h-3 w-3" /> Duyệt
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold h-7 text-[10px] gap-1"
                              onClick={() => {
                                setSelectedTask(task);
                                setShowRejectDialog(true);
                              }}
                              disabled={submitting}
                            >
                              <RotateCcw className="h-3 w-3" /> Trả lại
                            </Button>
                          </div>
                        )}

                        {task.status === "REJECTED" && (
                          <div
                            className="flex gap-2 pt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 text-[10px] gap-1"
                              onClick={(e) => handleApprove(task, e)}
                              disabled={submitting}
                            >
                              <Check className="h-3 w-3" /> Duyệt
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Creation & Edit Modal */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {formMode === "CREATE" ? "Giao nhiệm vụ mới" : "Chỉnh sửa nhiệm vụ"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {formMode === "CREATE"
                ? "Tạo và giao một đầu việc khoán cho nhân viên."
                : "Chỉnh sửa thông tin nhiệm vụ."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitForm} className="space-y-4 text-sm">
            {/* Title with Autocomplete & Presets */}
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <Label htmlFor="task-title" className="font-semibold text-slate-800">
                  Tiêu đề nhiệm vụ <span className="text-red-500">*</span>
                </Label>
                {allSuggestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSuggestions((prev) => !prev)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
                  >
                    <Sparkles className="h-3 w-3 text-indigo-500" />
                    {showSuggestions ? "Ẩn danh sách gợi ý" : "Xem gợi ý & task cũ"}
                  </button>
                )}
              </div>

              <div className="relative">
                <Input
                  id="task-title"
                  value={taskForm.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (!showSuggestions || filteredSuggestions.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setHighlightedIndex((prev) =>
                        prev < filteredSuggestions.length - 1 ? prev + 1 : 0
                      );
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlightedIndex((prev) =>
                        prev > 0 ? prev - 1 : filteredSuggestions.length - 1
                      );
                    } else if (e.key === "Enter" && highlightedIndex >= 0) {
                      e.preventDefault();
                      handleSelectSuggestion(filteredSuggestions[highlightedIndex]);
                    } else if (e.key === "Escape") {
                      setShowSuggestions(false);
                    }
                  }}
                  placeholder="VD: Đăng bài fb, livestream, làm video, đăng kí..."
                  autoComplete="off"
                  required
                />

                {/* Suggestions Popover Dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
                    <div className="p-2 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span className="flex items-center gap-1 text-indigo-700">
                        <Sparkles className="h-3 w-3 text-indigo-500" /> Danh sách mẫu & Lịch sử
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Tự động điền Tiêu đề + Mô tả
                      </span>
                    </div>

                    {filteredSuggestions.map((item, idx) => {
                      const isHighlighted = idx === highlightedIndex;
                      return (
                        <div
                          key={`${item.title}-${idx}`}
                          className={`p-2.5 text-left cursor-pointer transition-colors ${
                            isHighlighted ? "bg-indigo-50/90 text-indigo-950" : "hover:bg-slate-50"
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectSuggestion(item);
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                              {item.source === "template" ? (
                                <Sparkles className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                              ) : (
                                <History className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              )}
                              <span>{item.title}</span>
                            </div>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] px-1.5 py-0 font-medium ${
                                item.source === "template"
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {item.badgeLabel}
                            </Badge>
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed pl-5">
                              {item.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Template Selector Chips */}
              <div className="pt-1">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[11px] text-slate-400 font-medium mr-0.5">Mẫu nhanh:</span>
                  {DEFAULT_STAFF_TASK_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.title}
                      type="button"
                      onClick={() => handleSelectSuggestion(tmpl)}
                      className="text-[11px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 border border-slate-200 rounded-md px-2 py-0.5 transition-all duration-150 flex items-center gap-1"
                    >
                      <Plus className="h-2.5 w-2.5 opacity-60" />
                      {tmpl.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="task-desc">Mô tả chi tiết</Label>
                {autoFilledTemplateTitle && (
                  <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Tự động điền theo mẫu
                  </span>
                )}
              </div>
              <Textarea
                id="task-desc"
                value={taskForm.description}
                onChange={(e) => {
                  setTaskForm((prev) => ({ ...prev, description: e.target.value }));
                  setAutoFilledTemplateTitle(null);
                }}
                placeholder="Yêu cầu cụ thể, đường link, số lượng, lưu ý..."
                rows={4}
              />
              {autoFilledTemplateTitle && (
                <p className="text-[11px] text-emerald-700 bg-emerald-50/80 border border-emerald-200/60 rounded px-2 py-1 flex items-center justify-between">
                  <span>
                    ✨ Đã lấy nội dung từ <b>{autoFilledTemplateTitle}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTaskForm((prev) => ({ ...prev, description: "" }));
                      setAutoFilledTemplateTitle(null);
                    }}
                    className="text-slate-500 hover:text-red-600 underline text-[10px]"
                  >
                    Xóa
                  </button>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="task-assignee">
                Giao cho nhân viên <span className="text-red-500">*</span>
              </Label>
              {assignableUsers.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  ⚠️ Chưa có nhân viên nào được bật cấp quyền KPI. Vui lòng vào mục{" "}
                  <b>Quản lý nhân viên</b> để cấp quyền KPI trước khi giao việc.
                </div>
              ) : (
                <select
                  id="task-assignee"
                  value={taskForm.assigneeId}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, assigneeId: e.target.value }))}
                  className="w-full border rounded-lg p-2 bg-white text-sm"
                  required
                >
                  <option value="" disabled>
                    -- Chọn nhân sự --
                  </option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email} {u.email ? `(${u.email})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="task-start">Ngày bắt đầu</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={taskForm.startDate}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-deadline">Hạn chót</Label>
                <Input
                  id="task-deadline"
                  type="date"
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, deadline: e.target.value }))}
                />
              </div>
            </div>

            {formMode === "EDIT" && (
              <div className="space-y-1">
                <Label htmlFor="task-note">Ghi chú duyệt/trả lại</Label>
                <Input
                  id="task-note"
                  value={taskForm.adminNote}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, adminNote: e.target.value }))}
                  placeholder="Ghi chú phản hồi cho nhân viên..."
                />
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowCreateDialog(false)}>
                Hủy
              </Button>
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                disabled={submitting}
              >
                {submitting ? "Đang lưu..." : "Lưu lại"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Task Details Dialog (Read-only / Review) */}
      <Dialog
        open={!!selectedTask && !showCreateDialog && !showRejectDialog}
        onOpenChange={(v) => {
          if (!v) setSelectedTask(null);
        }}
      >
        {selectedTask && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold leading-snug">
                {selectedTask.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex flex-col gap-1.5 pt-1.5">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Nhân viên:{" "}
                  <b>{selectedTask.assignee?.name || "Nhân viên"}</b>{" "}
                  {selectedTask.assignee?.email ? `(${selectedTask.assignee.email})` : ""}
                </div>
                <span>
                  Tạo lúc: {safeFormatDate(selectedTask.createdAt, "dd/MM/yyyy HH:mm")}{" "}
                  {selectedTask.createdBy?.name ? `bởi ${selectedTask.createdBy.name}` : ""}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-sm">
              {/* Description */}
              <div className="space-y-1">
                <h5 className="font-bold text-gray-700 text-xs uppercase tracking-wide">
                  Mô tả nhiệm vụ
                </h5>
                <div className="bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap text-slate-800">
                  {selectedTask.description || (
                    <span className="text-muted-foreground italic">
                      Không có mô tả chi tiết.
                    </span>
                  )}
                </div>
              </div>

              {/* Evidence Submission Info */}
              {(selectedTask.evidenceLink || selectedTask.evidenceNote) && (
                <div className="space-y-2">
                  <h5 className="font-bold text-gray-700 text-xs uppercase tracking-wide">
                    Thông tin báo cáo hoàn thành
                  </h5>
                  <div className="bg-emerald-50/20 border border-emerald-100 rounded-lg p-3 space-y-2">
                    {selectedTask.evidenceLink && (
                      <div className="text-xs">
                        <span className="font-semibold text-emerald-800 block mb-0.5">
                          Link chứng minh:
                        </span>
                        <a
                          href={selectedTask.evidenceLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 font-bold underline break-all inline-flex items-center gap-1"
                        >
                          <FileText className="h-3.5 w-3.5" /> Mở link chứng minh
                        </a>
                      </div>
                    )}
                    {selectedTask.evidenceNote && (
                      <div className="text-xs">
                        <span className="font-semibold text-emerald-800 block mb-0.5">
                          Ghi chú của nhân viên:
                        </span>
                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                          &ldquo;{selectedTask.evidenceNote}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Deadlines */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <h5 className="font-bold text-gray-700 text-xs uppercase tracking-wide">
                    Ngày bắt đầu
                  </h5>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border p-2 rounded-lg">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    {safeFormatDate(selectedTask.startDate)}
                  </div>
                </div>
                <div className="space-y-1">
                  <h5 className="font-bold text-gray-700 text-xs uppercase tracking-wide">
                    Hạn chót
                  </h5>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border p-2 rounded-lg">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>{safeFormatDate(selectedTask.deadline)}</span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-3 bg-slate-50 border p-3 rounded-lg">
                <h5 className="font-bold text-gray-700 text-xs uppercase tracking-wide shrink-0">
                  Trạng thái:
                </h5>
                <Badge className={COLUMNS.find((c) => c.id === selectedTask.status)?.color}>
                  {COLUMNS.find((c) => c.id === selectedTask.status)?.label || selectedTask.status}
                </Badge>
                {selectedTask.submittedAt && (
                  <span className="text-[10px] text-muted-foreground">
                    Nộp lúc: {safeFormatDate(selectedTask.submittedAt, "dd/MM/yyyy HH:mm")}
                  </span>
                )}
              </div>

              {/* Admin Note */}
              {selectedTask.adminNote && (
                <div className="bg-slate-50 border rounded-lg p-3">
                  <h5 className="font-bold text-gray-700 text-xs uppercase tracking-wide">
                    Ghi chú phản hồi / Duyệt
                  </h5>
                  <p className="text-sm mt-1 text-slate-800 italic">
                    &ldquo;{selectedTask.adminNote}&rdquo;
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setSelectedTask(null)}>
                Đóng
              </Button>
              <Button
                variant="destructive"
                className="gap-1"
                onClick={(e) => handleDelete(selectedTask.id, e)}
                disabled={submitting}
              >
                <Trash2 className="h-3.5 w-3.5" /> Xóa
              </Button>
              <Button
                variant="outline"
                className="gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={(e) => handleOpenEdit(selectedTask, e)}
              >
                <Edit2 className="h-3.5 w-3.5" /> Sửa
              </Button>
              {(selectedTask.status === "DONE" || selectedTask.status === "REJECTED") && (
                <>
                  {selectedTask.status === "DONE" && (
                    <Button
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                      onClick={() => setShowRejectDialog(true)}
                      disabled={submitting}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Trả lại sửa
                    </Button>
                  )}
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    onClick={(e) => handleApprove(selectedTask, e)}
                    disabled={submitting}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Duyệt đạt
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Reject Reason Modal */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-1.5 text-rose-700">
              <AlertCircle className="h-5 w-5" /> Yêu cầu sửa đổi
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Nhập lý do hoặc hướng dẫn chỉnh sửa để gửi lại cho nhân viên.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="reject-note" className="text-xs font-semibold text-gray-700">
                Yêu cầu chỉnh sửa cụ thể <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="VD: Thiếu link bài đăng Tiktok số 3, đăng lại video có chèn hashtag..."
                rows={3}
                required
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowRejectDialog(false)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                disabled={submitting}
              >
                Gửi yêu cầu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
