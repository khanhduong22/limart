import React from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { useManagerTasksStore } from "@/stores/useManagerTasksStore";
import {
  ChecklistItem,
  WeeklyTaskItem,
  getSelectedWeekRangeStr,
} from "@/types/manager-tasks";
import { WeeklyTaskDialogs } from "./WeeklyTaskDialogs";

export function DailyChecklistTab() {
  const {
    selectedUserId,
    selectedDate,
    openCreateDialog,
    openWeeklyCreateDialog,
    openWeeklyEditDialog,
    openWeeklyCarryOverDialog,
  } = useManagerTasksStore();

  // Daily Checklist
  const {
    data: rawChecklist,
    isLoading: checklistLoading,
    mutate: mutateChecklist,
  } = useAdminQuery<any>(
    selectedUserId
      ? `/api/manager-tasks/checklist?userId=${selectedUserId}&date=${selectedDate}`
      : null
  );
  const checklist: ChecklistItem[] = Array.isArray(rawChecklist)
    ? rawChecklist
    : rawChecklist?.data || [];

  // Weekly Tasks
  const {
    data: rawWeekly,
    isLoading: weeklyLoading,
    mutate: mutateWeekly,
  } = useAdminQuery<any>(
    selectedUserId
      ? `/api/manager-tasks/weekly?userId=${selectedUserId}&date=${selectedDate}`
      : null
  );
  const weeklyTasks: WeeklyTaskItem[] = Array.isArray(rawWeekly)
    ? rawWeekly
    : rawWeekly?.data || [];

  // Toggle Daily Task Completion
  const handleToggle = async (taskId: string, currentCompleted: boolean) => {
    const nextCompleted = !currentCompleted;

    // Optimistic UI update
    await mutateChecklist(
      checklist.map((item) =>
        item.id === taskId
          ? {
              ...item,
              completed: nextCompleted,
              completedAt: nextCompleted ? new Date() : null,
            }
          : item
      ),
      false
    );

    try {
      await api.post("/api/manager-tasks/checklist/toggle", {
        taskId,
        date: selectedDate,
        completed: nextCompleted,
      });
      toast.success(
        nextCompleted ? "Đã hoàn thành nhiệm vụ!" : "Đã hủy hoàn thành"
      );
      mutateChecklist();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi kết nối máy chủ");
      mutateChecklist();
    }
  };

  // Toggle Weekly Task Completion
  const handleToggleWeekly = async (taskId: string, currentCompleted: boolean) => {
    const nextCompleted = !currentCompleted;

    // Optimistic UI update
    await mutateWeekly(
      weeklyTasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              completed: nextCompleted,
              completedAt: nextCompleted ? new Date().toISOString() : null,
            }
          : item
      ),
      false
    );

    try {
      await api.post(`/api/manager-tasks/weekly/${taskId}/toggle`, {
        completed: nextCompleted,
      });
      toast.success(
        nextCompleted ? "Đã hoàn thành việc tuần!" : "Đã hủy hoàn thành việc tuần"
      );
      mutateWeekly();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi kết nối máy chủ");
      mutateWeekly();
    }
  };

  const handleDeleteWeeklyTask = async (taskId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa nhiệm vụ hằng tuần này?")) return;

    try {
      await api.delete(`/api/manager-tasks/weekly/${taskId}`);
      toast.success("Đã xóa nhiệm vụ tuần!");
      mutateWeekly();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xóa nhiệm vụ");
    }
  };

  // Calculations
  const activeChecklist = checklist.filter((t) => t.active);
  const totalTasks = activeChecklist.length;
  const completedTasks = activeChecklist.filter((t) => t.completed).length;
  const progressPercent =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
  const isFullyCompleted = totalTasks > 0 && completedTasks === totalTasks;

  const weeklyTotal = weeklyTasks.length;
  const weeklyCompleted = weeklyTasks.filter(
    (t) => t.completed || t.explanation
  ).length;
  const weeklyPercent =
    weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 100;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Checklist Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Daily Tasks Checklist Card */}
          <Card className="border-indigo-100 shadow-md">
            <CardHeader className="pb-3 border-b bg-indigo-50/20">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-800">
                    Checklist công việc hằng ngày
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ngày{" "}
                    {new Date(selectedDate).toLocaleDateString("vi-VN", {
                      weekday: "long",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 text-xs"
                    onClick={openCreateDialog}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Thêm nhiệm vụ
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mutateChecklist()}
                    disabled={checklistLoading}
                    className="h-8 w-8 p-0"
                    title="Tải lại checklist"
                  >
                    <RefreshCw
                      className={`h-4 w-4 text-slate-500 ${
                        checklistLoading ? "animate-spin" : ""
                      }`}
                    />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {checklistLoading ? (
                <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
                  Đang tải dữ liệu checklist hằng ngày...
                </div>
              ) : activeChecklist.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <AlertCircle className="h-8 w-8 mx-auto text-amber-500" />
                  <p className="text-sm font-medium text-slate-800">
                    Chưa có nhiệm vụ nào được cấu hình.
                  </p>
                  <p className="text-xs">
                    Vui lòng bấm "Thêm nhiệm vụ" hoặc chuyển qua tab "Nhiệm vụ mẫu" để tạo danh sách công việc hàng ngày.
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {activeChecklist.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => handleToggle(task.id, task.completed)}
                      className={`flex items-start gap-4 p-4 transition-all hover:bg-slate-50 cursor-pointer select-none ${
                        task.completed ? "bg-emerald-50/20" : ""
                      }`}
                    >
                      <div className="pt-0.5">
                        <div
                          className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${
                            task.completed
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "border-slate-300 hover:border-indigo-500"
                          }`}
                        >
                          {task.completed && (
                            <CheckCircle2 className="h-4 w-4 stroke-[3]" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-semibold text-slate-800 break-words ${
                            task.completed
                              ? "line-through text-slate-400 font-normal"
                              : ""
                          }`}
                        >
                          {task.title}
                        </p>
                        {task.description && (
                          <p
                            className={`text-xs text-muted-foreground mt-0.5 ${
                              task.completed ? "text-slate-300" : ""
                            }`}
                          >
                            {task.description}
                          </p>
                        )}
                        {task.completed && task.completedAt && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-600 font-medium">
                            <Clock className="h-3 w-3" />
                            Đã tích lúc{" "}
                            {new Date(task.completedAt).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly Tasks Checklist Card */}
          <Card className="border-indigo-100 shadow-md">
            <CardHeader className="pb-3 border-b bg-purple-50/20">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                    📅 Checklist công việc hằng tuần ({getSelectedWeekRangeStr(selectedDate)})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Công việc bắt buộc hoàn thành trong tuần này
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-8 text-xs"
                    onClick={openWeeklyCreateDialog}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Thêm việc tuần
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mutateWeekly()}
                    disabled={weeklyLoading}
                    className="h-8 w-8 p-0"
                    title="Tải lại việc tuần"
                  >
                    <RefreshCw
                      className={`h-4 w-4 text-slate-500 ${
                        weeklyLoading ? "animate-spin" : ""
                      }`}
                    />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {weeklyLoading ? (
                <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-purple-500" />
                  Đang tải dữ liệu việc tuần...
                </div>
              ) : weeklyTasks.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <AlertCircle className="h-8 w-8 mx-auto text-amber-500" />
                  <p className="text-sm font-medium text-slate-800">
                    Chưa có nhiệm vụ tuần nào.
                  </p>
                  <p className="text-xs">
                    Hãy bấm nút "Thêm việc tuần" ở trên để tạo nhiệm vụ cho tuần này.
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {weeklyTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-start justify-between p-4 transition-all hover:bg-slate-50/50 gap-4 ${
                        task.completed ? "bg-emerald-50/10" : ""
                      }`}
                    >
                      <div
                        className="flex items-start gap-4 flex-1 cursor-pointer select-none min-w-0"
                        onClick={() => handleToggleWeekly(task.id, task.completed)}
                      >
                        <div className="pt-0.5">
                          <div
                            className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${
                              task.completed
                                ? "bg-purple-500 border-purple-500 text-white"
                                : "border-slate-300 hover:border-purple-500"
                            }`}
                          >
                            {task.completed && (
                              <CheckCircle2 className="h-4 w-4 stroke-[3]" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={`text-sm font-semibold text-slate-800 break-words ${
                                task.completed
                                  ? "line-through text-slate-400 font-normal"
                                  : ""
                              }`}
                            >
                              {task.title}
                            </p>
                            {task.isCarriedOver && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                                Chuyển tiếp
                              </span>
                            )}
                            {task.explanation && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                                Đã giải trình chuyển tuần
                              </span>
                            )}
                          </div>
                          {task.description && (
                            <p
                              className={`text-xs text-muted-foreground mt-0.5 ${
                                task.completed ? "text-slate-300" : ""
                              }`}
                            >
                              {task.description}
                            </p>
                          )}
                          {task.explanation && (
                            <p className="text-xs text-blue-700 bg-blue-50/50 border border-blue-100 rounded-md p-1.5 mt-2 font-medium">
                              💬 <b>Giải trình:</b> {task.explanation}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!task.completed && !task.explanation && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-bold px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              openWeeklyCarryOverDialog(task);
                            }}
                          >
                            Chuyển tuần
                          </Button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openWeeklyEditDialog(task);
                          }}
                          className="p-1.5 rounded-md hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-colors"
                          title="Sửa"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteWeeklyTask(task.id);
                          }}
                          className="p-1.5 rounded-md hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition-colors"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Progress Widget Sidebar */}
        <div className="space-y-4">
          {/* Daily progress */}
          <Card className="border-indigo-100 shadow-md overflow-hidden relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-100/40 to-transparent rounded-bl-full pointer-events-none" />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                Tiến Độ Hằng Ngày
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-baseline">
                <span className="text-4xl font-extrabold text-indigo-950 font-mono tracking-tight">
                  {progressPercent}%
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  Đã hoàn thành:{" "}
                  <b className="text-indigo-600 font-mono text-sm">
                    {completedTasks}
                  </b>{" "}
                  / {totalTasks}
                </span>
              </div>

              <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden border">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isFullyCompleted
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : "bg-gradient-to-r from-indigo-500 to-violet-500"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {isFullyCompleted ? (
                <div className="border border-emerald-100 bg-emerald-50/80 rounded-xl p-3.5 flex items-start gap-2.5 shadow-xs animate-in fade-in duration-300">
                  <Sparkles className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-800">
                      Tuyệt vời! Hoàn thành 100%
                    </h4>
                    <p className="text-[10px] text-emerald-700 leading-relaxed mt-0.5">
                      Ngày làm việc này đã được ghi nhận hoàn chỉnh quy trình, không phát sinh lỗi hoặc thiếu sót.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border border-amber-100 bg-amber-50/80 rounded-xl p-3.5 flex items-start gap-2.5 shadow-xs">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-800">
                      Chưa hoàn thành đầy đủ
                    </h4>
                    <p className="text-[10px] text-amber-700 leading-relaxed mt-0.5">
                      Bạn bắt buộc phải hoàn thành toàn bộ các nhiệm vụ trên để tránh việc ngày hôm nay bị đánh giá là{" "}
                      <b>"Thiếu sót trong quy trình làm việc"</b> trên bảng chấm công.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly progress */}
          <Card className="border-indigo-100 shadow-md overflow-hidden relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-100/40 to-transparent rounded-bl-full pointer-events-none" />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                Tiến Độ Tuần Này
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-baseline">
                <span className="text-4xl font-extrabold text-purple-950 font-mono tracking-tight">
                  {weeklyPercent}%
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  Đã hoàn thành:{" "}
                  <b className="text-purple-600 font-mono text-sm">
                    {weeklyCompleted}
                  </b>{" "}
                  / {weeklyTotal}
                </span>
              </div>

              <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden border">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    weeklyCompleted === weeklyTotal && weeklyTotal > 0
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : "bg-gradient-to-r from-purple-500 to-pink-500"
                  }`}
                  style={{ width: `${weeklyPercent}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Weekly Dialogs */}
      <WeeklyTaskDialogs onSuccess={() => mutateWeekly()} />
    </>
  );
}
