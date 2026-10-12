import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { useManagerTasksStore } from "@/stores/useManagerTasksStore";
import { ChecklistItem } from "@/types/manager-tasks";

export function TemplatesTab() {
  const { selectedUserId, openCreateDialog, openEditDialog } =
    useManagerTasksStore();
  const queryClient = useQueryClient();

  // Templates
  const {
    data: rawTemplates,
    isLoading: templatesLoading,
    mutate: mutateTemplates,
  } = useAdminQuery<any>(
    selectedUserId ? `/api/manager-tasks/templates?userId=${selectedUserId}` : null
  );
  const templates: ChecklistItem[] = Array.isArray(rawTemplates)
    ? rawTemplates
    : rawTemplates?.data || [];

  const handleToggleTaskActive = async (task: ChecklistItem) => {
    try {
      const nextActive = !task.active;
      await api.patch(`/api/manager-tasks/checklist/${task.id}`, {
        active: nextActive,
      });
      toast.success(
        nextActive ? "Đã kích hoạt nhiệm vụ mẫu" : "Đã tạm dừng nhiệm vụ mẫu"
      );
      mutateTemplates();
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("/api/manager-tasks/checklist"),
      });
    } catch (e: any) {
      toast.error(e?.message || "Lỗi cập nhật trạng thái");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (
      !confirm(
        "Bạn có chắc chắn muốn xóa nhiệm vụ mẫu này? Lịch sử hoàn thành liên quan cũng sẽ bị xóa."
      )
    )
      return;

    try {
      await api.delete(`/api/manager-tasks/checklist/${taskId}`);
      toast.success("Đã xóa nhiệm vụ mẫu!");
      mutateTemplates();
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("/api/manager-tasks/checklist"),
      });
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xóa nhiệm vụ");
    }
  };

  const handleMoveTask = async (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === templates.length - 1) return;

    const newTemplates = [...templates];
    const swapWithIndex = direction === "up" ? index - 1 : index + 1;

    const temp = newTemplates[index];
    newTemplates[index] = newTemplates[swapWithIndex];
    newTemplates[swapWithIndex] = temp;

    await mutateTemplates(newTemplates, false);

    try {
      const orderedIds = newTemplates.map((t) => t.id);
      await api.post("/api/manager-tasks/checklist/reorder", {
        userId: selectedUserId,
        taskIds: orderedIds,
      });
      toast.success("Đã thay đổi thứ tự nhiệm vụ");
      mutateTemplates();
    } catch (e: any) {
      toast.error(e?.message || "Gặp lỗi cập nhật thứ tự");
      mutateTemplates();
    }
  };

  return (
    <Card className="border-indigo-100 shadow-md">
      <CardHeader className="pb-3 border-b flex flex-row justify-between items-center gap-4 flex-wrap">
        <div>
          <CardTitle className="text-lg font-bold text-slate-800">
            Quản lý nhiệm vụ mẫu
          </CardTitle>
          <CardDescription className="text-xs">
            Thiết lập các nhiệm vụ lặp lại hàng ngày bắt buộc phải tích chọn cho từng nhân sự.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 font-bold"
            onClick={openCreateDialog}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Thêm Nhiệm Vụ Mới
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => mutateTemplates()}
            disabled={templatesLoading}
            className="h-8 w-8 p-0"
            title="Tải lại danh sách"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 ${
                templatesLoading ? "animate-spin" : ""
              }`}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {templatesLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
            Đang tải danh sách mẫu...
          </div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
            Chưa có nhiệm vụ mẫu nào được cấu hình cho quản lý này.
          </div>
        ) : (
          <div className="divide-y">
            {templates.map((task, idx) => (
              <div
                key={task.id}
                className="flex justify-between items-center p-4 hover:bg-slate-50 gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        task.active ? "bg-green-500" : "bg-slate-300"
                      }`}
                    />
                    <h4
                      className={`text-sm font-semibold text-slate-800 break-words ${
                        !task.active ? "text-slate-400 font-normal" : ""
                      }`}
                    >
                      {task.title}
                    </h4>
                    {task.targetDate ? (
                      <Badge
                        variant="secondary"
                        className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] py-0.5 px-1.5 font-bold"
                      >
                        Chỉ ngày: {task.targetDate}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] py-0.5 px-1.5 font-semibold"
                      >
                        Hằng ngày
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <p
                      className={`text-xs text-muted-foreground mt-1 ml-4 ${
                        !task.active ? "text-slate-300" : ""
                      }`}
                    >
                      {task.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Move Up */}
                  <button
                    onClick={() => handleMoveTask(idx, "up")}
                    disabled={idx === 0}
                    className={`p-1.5 rounded-md text-slate-400 transition-colors ${
                      idx === 0
                        ? "opacity-25 cursor-not-allowed"
                        : "hover:bg-slate-100 hover:text-slate-700"
                    }`}
                    title="Di chuyển lên"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>

                  {/* Move Down */}
                  <button
                    onClick={() => handleMoveTask(idx, "down")}
                    disabled={idx === templates.length - 1}
                    className={`p-1.5 rounded-md text-slate-400 transition-colors ${
                      idx === templates.length - 1
                        ? "opacity-25 cursor-not-allowed"
                        : "hover:bg-slate-100 hover:text-slate-700"
                    }`}
                    title="Di chuyển xuống"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>

                  {/* Active toggle */}
                  <button
                    onClick={() => handleToggleTaskActive(task)}
                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                    title={task.active ? "Tạm dừng hoạt động" : "Kích hoạt"}
                  >
                    {task.active ? (
                      <ToggleRight className="h-6 w-6 text-green-600 stroke-[2.5]" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-slate-400 stroke-[2.5]" />
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => openEditDialog(task)}
                    className="p-1.5 rounded-md hover:bg-indigo-50 hover:text-indigo-600 text-slate-400 transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteTask(task.id)}
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
  );
}
