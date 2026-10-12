import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useAdminSchedulePageStore } from "@/stores/useAdminSchedulePageStore";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ScheduleDeleteShiftDialogProps {
  onSuccess?: () => void;
  onConfirm?: (shiftId: string | number) => Promise<void> | void;
}

export function ScheduleDeleteShiftDialog({
  onSuccess,
  onConfirm,
}: ScheduleDeleteShiftDialogProps) {
  const {
    isDeleteModalOpen,
    deletingShiftId,
    closeDeleteModal,
    setIsDeleteModalOpen,
  } = useAdminSchedulePageStore();

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deletingShiftId) return;

    setDeleting(true);
    try {
      if (onConfirm) {
        await onConfirm(deletingShiftId);
      } else {
        await api.delete(`/api/admin/schedule/${deletingShiftId}`);
        toast.success("Đã xóa ca trực!");
      }
      closeDeleteModal();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "Không thể xóa ca trực");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <Trash2 className="h-5 w-5 text-rose-600" />
            Xác nhận xóa ca trực
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm text-gray-600">
            Bạn có chắc chắn muốn xóa ca trực này khỏi lịch làm việc? Thao tác này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="pt-3 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={closeDeleteModal}
            disabled={deleting}
          >
            Hủy bỏ
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {deleting ? "Đang xóa..." : "Xác nhận xóa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleDeleteShiftDialog;
