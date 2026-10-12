import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { api } from "@/lib/api";
import { useManagerTasksStore } from "@/stores/useManagerTasksStore";

interface CreateChecklistDialogProps {
  onSuccess?: () => void;
}

export function CreateChecklistDialog({ onSuccess }: CreateChecklistDialogProps) {
  const { isCreateOpen, closeCreateDialog, setIsCreateOpen, selectedUserId } =
    useManagerTasksStore();
  const queryClient = useQueryClient();

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskTargetDate, setTaskTargetDate] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    if (!selectedUserId) {
      toast.error("Vui lòng chọn nhân sự trước!");
      return;
    }

    setActionLoading(true);
    try {
      await api.post("/api/manager-tasks/checklist", {
        title: taskTitle.trim(),
        description: taskDesc.trim() || null,
        assigneeId: selectedUserId,
        targetDate: taskTargetDate || null,
      });
      toast.success("Tạo nhiệm vụ mẫu thành công!");
      closeCreateDialog();
      setTaskTitle("");
      setTaskDesc("");
      setTaskTargetDate("");

      // Invalidate caches for checklist and templates
      await queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("/api/manager-tasks/checklist"),
      });
      await queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("/api/manager-tasks/templates"),
      });

      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.message || "Gặp lỗi tạo nhiệm vụ");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleCreateTask}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-800">
              Tạo nhiệm vụ checklist mẫu
            </DialogTitle>
            <DialogDescription className="text-xs">
              Thêm nhiệm vụ lặp lại hàng ngày mới gán cho quản lý.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs font-bold text-slate-700">
                Tên nhiệm vụ (Bắt buộc)
              </Label>
              <Input
                id="title"
                placeholder="Ví dụ: Kiểm tra vệ sinh shop đầu ngày"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-bold text-slate-700">
                Mô tả chi tiết
              </Label>
              <Textarea
                id="description"
                placeholder="Mô tả các đầu việc cụ thể cần làm..."
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-date" className="text-xs font-bold text-slate-700">
                Ngày áp dụng (Bỏ trống nếu muốn lặp lại hằng ngày)
              </Label>
              <Input
                id="target-date"
                type="date"
                value={taskTargetDate}
                onChange={(e) => setTaskTargetDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeCreateDialog}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 font-bold"
              disabled={actionLoading}
            >
              {actionLoading && (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
