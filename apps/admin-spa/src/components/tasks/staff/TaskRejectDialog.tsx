import React, { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStaffTasksStore } from "@/stores/useAdminStaffTasksStore";
import { toast } from "sonner";

export interface TaskRejectDialogProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSubmit: (reason: string) => Promise<void> | void;
  submitting?: boolean;
}

export function TaskRejectDialog({
  isOpen: propIsOpen,
  onClose: propOnClose,
  onSubmit,
  submitting = false,
}: TaskRejectDialogProps) {
  const {
    isRejectDialogOpen,
    setIsRejectDialogOpen,
    rejectReason,
    setRejectReason,
  } = useAdminStaffTasksStore();

  const isOpen = propIsOpen !== undefined ? propIsOpen : isRejectDialogOpen;
  const [localReason, setLocalReason] = useState(rejectReason || "");

  useEffect(() => {
    setLocalReason(rejectReason || "");
  }, [rejectReason, isOpen]);

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      setIsRejectDialogOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localReason.trim()) {
      toast.error("Vui lòng nhập yêu cầu chỉnh sửa");
      return;
    }

    setRejectReason(localReason.trim());
    await onSubmit(localReason.trim());
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-xs bg-white border border-slate-200 rounded-2xl shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-1.5 text-rose-700">
            <AlertCircle className="h-5 w-5" /> Yêu cầu sửa đổi
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Nhập lý do hoặc hướng dẫn chỉnh sửa để gửi lại cho nhân viên.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="reject-note-input" className="text-xs font-semibold text-slate-700">
              Yêu cầu chỉnh sửa cụ thể <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reject-note-input"
              value={localReason}
              onChange={(e) => setLocalReason(e.target.value)}
              placeholder="VD: Thiếu link bài đăng Tiktok số 3, đăng lại video có chèn hashtag..."
              rows={3}
              required
              autoFocus
              className="bg-white border-slate-200 text-xs"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              disabled={submitting}
            >
              {submitting ? "Đang gửi..." : "Gửi yêu cầu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
