import React, { useState, useEffect, useMemo } from "react";
import { Sparkles, History, Plus, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAdminStaffTasksStore } from "@/stores/useAdminStaffTasksStore";
import {
  getMergedTaskSuggestions,
  filterTaskSuggestions,
  findBestMatchingTemplate,
  type TaskSuggestion,
  DEFAULT_STAFF_TASK_TEMPLATES,
} from "@/lib/staff-task-templates";
import type { StaffTask, StaffTaskUserOption } from "@/types/staff-tasks";
import { toast } from "sonner";

export interface StaffTaskFormDialogProps {
  assignableUsers: StaffTaskUserOption[];
  existingTasks: StaffTask[];
  onSubmit: (formData: {
    title: string;
    description: string | null;
    assigneeId: string;
    startDate: string | null;
    deadline: string | null;
    adminNote: string | null;
  }) => Promise<void> | void;
  submitting?: boolean;
}

export function StaffTaskFormDialog({
  assignableUsers,
  existingTasks,
  onSubmit,
  submitting = false,
}: StaffTaskFormDialogProps) {
  const {
    isAssignTaskOpen,
    closeAssignTask,
    formMode,
    editingTask,
    selectedAssignee,
  } = useAdminStaffTasksStore();

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assigneeId: "",
    startDate: "",
    deadline: "",
    adminNote: "",
  });

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [autoFilledTemplateTitle, setAutoFilledTemplateTitle] = useState<string | null>(null);

  // Merge history tasks and preset templates
  const allSuggestions = useMemo(() => {
    return getMergedTaskSuggestions(existingTasks);
  }, [existingTasks]);

  // Filtered suggestions based on user query in taskForm.title
  const filteredSuggestions = useMemo(() => {
    return filterTaskSuggestions(allSuggestions, taskForm.title);
  }, [allSuggestions, taskForm.title]);

  useEffect(() => {
    if (isAssignTaskOpen) {
      if (formMode === "EDIT" && editingTask) {
        setTaskForm({
          title: editingTask.title || "",
          description: editingTask.description || "",
          assigneeId: editingTask.assigneeId || "",
          startDate: editingTask.startDate
            ? new Date(editingTask.startDate).toISOString().split("T")[0]
            : "",
          deadline: editingTask.deadline
            ? new Date(editingTask.deadline).toISOString().split("T")[0]
            : "",
          adminNote: editingTask.adminNote || "",
        });
      } else {
        setTaskForm({
          title: "",
          description: "",
          assigneeId:
            selectedAssignee !== "ALL"
              ? selectedAssignee
              : assignableUsers[0]?.id || "",
          startDate: "",
          deadline: "",
          adminNote: "",
        });
      }
      setAutoFilledTemplateTitle(null);
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }
  }, [isAssignTaskOpen, formMode, editingTask, selectedAssignee, assignableUsers]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      toast.error("Vui lòng nhập tiêu đề nhiệm vụ");
      return;
    }
    if (!taskForm.assigneeId) {
      toast.error("Vui lòng chọn nhân sự thực hiện");
      return;
    }

    await onSubmit({
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      assigneeId: taskForm.assigneeId,
      startDate: taskForm.startDate ? new Date(taskForm.startDate).toISOString() : null,
      deadline: taskForm.deadline ? new Date(taskForm.deadline).toISOString() : null,
      adminNote: taskForm.adminNote.trim() || null,
    });
  };

  return (
    <Dialog open={isAssignTaskOpen} onOpenChange={(open) => !open && closeAssignTask()}>
      <DialogContent className="max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">
            {formMode === "CREATE" ? "Giao nhiệm vụ mới" : "Chỉnh sửa nhiệm vụ"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {formMode === "CREATE"
              ? "Tạo và giao một đầu việc khoán cho nhân viên."
              : "Chỉnh sửa thông tin nhiệm vụ."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {/* Title with Autocomplete & Presets */}
          <div className="space-y-1.5 relative">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-title" className="font-semibold text-slate-800 text-xs">
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
                placeholder="VD: Đăng bài fb, livestream, làm video, kiểm kho..."
                autoComplete="off"
                className="bg-white border-slate-200"
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
              <Label htmlFor="task-desc" className="text-xs font-semibold text-slate-700">
                Mô tả chi tiết
              </Label>
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
              className="bg-white border-slate-200 text-xs"
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
            <Label htmlFor="task-assignee" className="text-xs font-semibold text-slate-700">
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
                className="w-full border rounded-lg p-2 bg-slate-50 border-slate-200 text-xs font-medium"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="task-start" className="text-xs font-semibold text-slate-700">
                Ngày bắt đầu
              </Label>
              <Input
                id="task-start"
                type="date"
                value={taskForm.startDate}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, startDate: e.target.value }))}
                className="bg-white border-slate-200 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-deadline" className="text-xs font-semibold text-slate-700">
                Hạn chót
              </Label>
              <Input
                id="task-deadline"
                type="date"
                value={taskForm.deadline}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, deadline: e.target.value }))}
                className="bg-white border-slate-200 text-xs"
              />
            </div>
          </div>

          {formMode === "EDIT" && (
            <div className="space-y-1">
              <Label htmlFor="task-note" className="text-xs font-semibold text-slate-700">
                Ghi chú duyệt/trả lại
              </Label>
              <Input
                id="task-note"
                value={taskForm.adminNote}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, adminNote: e.target.value }))}
                placeholder="Ghi chú phản hồi cho nhân viên..."
                className="bg-white border-slate-200 text-xs"
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => closeAssignTask()}>
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              disabled={submitting}
            >
              {submitting ? "Đang lưu..." : "Lưu lại"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
