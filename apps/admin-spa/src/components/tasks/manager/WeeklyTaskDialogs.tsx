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
import { getSelectedWeekRangeStr } from "@/types/manager-tasks";

interface WeeklyTaskDialogsProps {
  onSuccess?: () => void;
}

export function WeeklyTaskDialogs({ onSuccess }: WeeklyTaskDialogsProps) {
  const {
    selectedUserId,
    selectedDate,
    isWeeklyCreateOpen,
    isWeeklyEditOpen,
    isWeeklyCarryOverOpen,
    editingWeeklyTask,
    closeWeeklyCreateDialog,
    closeWeeklyEditDialog,
    closeWeeklyCarryOverDialog,
    setIsWeeklyCreateOpen,
    setIsWeeklyEditOpen,
    setIsWeeklyCarryOverOpen,
  } = useManagerTasksStore();
  const { mutate } = useSWRConfig();

  // Local Form states
  const [weeklyTaskTitle, setWeeklyTaskTitle] = useState("");
  const [weeklyTaskDesc, setWeeklyTaskDesc] = useState("");
  const [carryOverExplanation, setCarryOverExplanation] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Sync edit form
  useEffect(() => {
    if (editingWeeklyTask && isWeeklyEditOpen) {
      setWeeklyTaskTitle(editingWeeklyTask.title);
      setWeeklyTaskDesc(editingWeeklyTask.description || "");
    } else if (!isWeeklyEditOpen) {
      setWeeklyTaskTitle("");
      setWeeklyTaskDesc("");
    }
  }, [editingWeeklyTask, isWeeklyEditOpen]);

  // Sync carry-over form
  useEffect(() => {
    if (!isWeeklyCarryOverOpen) {
      setCarryOverExplanation("");
    }
  }, [isWeeklyCarryOverOpen]);

  // Actions
  const handleCreateWeeklyTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weeklyTaskTitle.trim()) return;

    if (!selectedUserId) {
      toast.error("Vui lòng chọn nhân sự trước!");
      return;
    }

    setActionLoading(true);
    try {
      await api.post("/api/manager-tasks/weekly", {
        title: weeklyTaskTitle.trim(),
        description: weeklyTaskDesc.trim() || null,
        assigneeId: selectedUserId,
        dateStr: selectedDate,
      });
      toast.success("Tạo việc hằng tuần thành công!");
      closeWeeklyCreateDialog();
      setWeeklyTaskTitle("");
      setWeeklyTaskDesc("");
      await mutate(
        (key) => typeof key === "string" && key.startsWith("/api/manager-tasks/weekly")
      );
      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.message || "Gặp lỗi tạo nhiệm vụ tuần");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateWeeklyTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWeeklyTask || !weeklyTaskTitle.trim()) return;

    setActionLoading(true);
    try {
      await api.patch(`/api/manager-tasks/weekly/${editingWeeklyTask.id}`, {
        title: weeklyTaskTitle.trim(),
        description: weeklyTaskDesc.trim() || null,
      });
      toast.success("Cập nhật nhiệm vụ tuần thành công!");
      closeWeeklyEditDialog();
      setWeeklyTaskTitle("");
      setWeeklyTaskDesc("");
      await mutate(
        (key) => typeof key === "string" && key.startsWith("/api/manager-tasks/weekly")
      );
      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.message || "Gặp lỗi cập nhật");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCarryOverWeeklyTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWeeklyTask || !carryOverExplanation.trim()) {
      toast.error("Vui lòng nhập lý do giải trình!");
      return;
    }

    setActionLoading(true);
    try {
      await api.post(`/api/manager-tasks/weekly/${editingWeeklyTask.id}/carry-over`, {
        explanation: carryOverExplanation.trim(),
      });
      toast.success("Đã nộp giải trình và chuyển việc sang tuần sau!");
      closeWeeklyCarryOverDialog();
      setCarryOverExplanation("");
      await mutate(
        (key) => typeof key === "string" && key.startsWith("/api/manager-tasks/weekly")
      );
      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.message || "Gặp lỗi nộp giải trình");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {/* Create Weekly Task Dialog */}
      <Dialog open={isWeeklyCreateOpen} onOpenChange={setIsWeeklyCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateWeeklyTask}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-800">
                Tạo nhiệm vụ hằng tuần
              </DialogTitle>
              <DialogDescription className="text-xs">
                Thêm nhiệm vụ bắt buộc hoàn thành trong tuần ({getSelectedWeekRangeStr(selectedDate)}) cho quản lý.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="weekly-title" className="text-xs font-bold text-slate-700">
                  Tên nhiệm vụ (Bắt buộc)
                </Label>
                <Input
                  id="weekly-title"
                  placeholder="Ví dụ: Hoàn tất báo cáo doanh thu tuần"
                  value={weeklyTaskTitle}
                  onChange={(e) => setWeeklyTaskTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weekly-description" className="text-xs font-bold text-slate-700">
                  Mô tả chi tiết
                </Label>
                <Textarea
                  id="weekly-description"
                  placeholder="Mô tả công việc cụ thể..."
                  value={weeklyTaskDesc}
                  onChange={(e) => setWeeklyTaskDesc(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeWeeklyCreateDialog}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 font-bold text-white"
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

      {/* Edit Weekly Task Dialog */}
      <Dialog open={isWeeklyEditOpen} onOpenChange={setIsWeeklyEditOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleUpdateWeeklyTask}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-800">
                Sửa nhiệm vụ hằng tuần
              </DialogTitle>
              <DialogDescription className="text-xs">
                Sửa đổi tên hoặc mô tả việc tuần ({getSelectedWeekRangeStr(selectedDate)}).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="weekly-edit-title" className="text-xs font-bold text-slate-700">
                  Tên nhiệm vụ (Bắt buộc)
                </Label>
                <Input
                  id="weekly-edit-title"
                  placeholder="Ví dụ: Hoàn tất báo cáo doanh thu tuần"
                  value={weeklyTaskTitle}
                  onChange={(e) => setWeeklyTaskTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weekly-edit-description" className="text-xs font-bold text-slate-700">
                  Mô tả chi tiết
                </Label>
                <Textarea
                  id="weekly-edit-description"
                  placeholder="Mô tả công việc cụ thể..."
                  value={weeklyTaskDesc}
                  onChange={(e) => setWeeklyTaskDesc(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeWeeklyEditDialog}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 font-bold text-white"
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

      {/* Weekly Carry Over / Explanation Dialog */}
      <Dialog open={isWeeklyCarryOverOpen} onOpenChange={setIsWeeklyCarryOverOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCarryOverWeeklyTask}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-800">
                Giải trình & Chuyển sang tuần sau
              </DialogTitle>
              <DialogDescription className="text-xs">
                Nhập lý do chưa hoàn thành để chuyển công việc sang tuần tiếp theo và được mở chặn Check-out. Báo cáo giải trình sẽ được gửi cho Admin Dung duyệt.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Tên nhiệm vụ</Label>
                <div className="text-sm bg-slate-50 border rounded-lg p-3 font-semibold text-slate-800">
                  {editingWeeklyTask?.title}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="carryover-explanation" className="text-xs font-bold text-slate-700">
                  Lý do giải trình (Bắt buộc)
                </Label>
                <Textarea
                  id="carryover-explanation"
                  placeholder="Ví dụ: Đối tác gửi số liệu trễ nên chưa thể đối soát xong..."
                  value={carryOverExplanation}
                  onChange={(e) => setCarryOverExplanation(e.target.value)}
                  rows={3}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeWeeklyCarryOverDialog}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
                disabled={actionLoading}
              >
                {actionLoading && (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Xác nhận & Chuyển tuần
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
