import React, { useState, useEffect } from "react";
import { useSWRConfig } from "swr";
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

interface EditChecklistDialogProps {
  onSuccess?: () => void;
}

export function EditChecklistDialog({ onSuccess }: EditChecklistDialogProps) {
  const { isEditOpen, closeEditDialog, setIsEditOpen, editingItem } =
    useManagerTasksStore();
  const { mutate } = useSWRConfig();

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskTargetDate, setTaskTargetDate] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setTaskTitle(editingItem.title || "");
      setTaskDesc(editingItem.description || "");
      setTaskTargetDate(editingItem.targetDate || "");
    } else {
      setTaskTitle("");
      setTaskDesc("");
      setTaskTargetDate("");
    }
  }, [editingItem, isEditOpen]);

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !taskTitle.trim()) return;

    setActionLoading(true);
    try {
      await api.patch(`/api/manager-tasks/checklist/${editingItem.id}`, {
        title: taskTitle.trim(),
        description: taskDesc.trim() || null,
        active: editingItem.active,
        targetDate: taskTargetDate || null,
      });
      toast.success("Cập nhật nhiệm vụ thành công!");
      closeEditDialog();

      // Invalidate SWR caches for checklist and templates
      await mutate(
        (key) => typeof key === "string" && key.startsWith("/api/manager-tasks/checklist")
      );
      await mutate(
        (key) => typeof key === "string" && key.startsWith("/api/manager-tasks/templates")
      );

      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.message || "Gặp lỗi cập nhật");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleUpdateTask}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-800">
              Chỉnh sửa nhiệm vụ mẫu
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sửa đổi tiêu đề hoặc mô tả của nhiệm vụ mẫu lặp lại hàng ngày.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title" className="text-xs font-bold text-slate-700">
                Tên nhiệm vụ (Bắt buộc)
              </Label>
              <Input
                id="edit-title"
                placeholder="Ví dụ: Kiểm tra vệ sinh shop đầu ngày"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description" className="text-xs font-bold text-slate-700">
                Mô tả chi tiết
              </Label>
              <Textarea
                id="edit-description"
                placeholder="Mô tả các đầu việc cụ thể cần làm..."
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-target-date" className="text-xs font-bold text-slate-700">
                Ngày áp dụng (Bỏ trống nếu muốn lặp lại hằng ngày)
              </Label>
              <Input
                id="edit-target-date"
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
              onClick={closeEditDialog}
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
              Cập nhật
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
