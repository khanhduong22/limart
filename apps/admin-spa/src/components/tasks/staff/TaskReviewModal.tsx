import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Check,
  RotateCcw,
  ExternalLink,
  FileText,
  User,
  Calendar,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStaffTasksStore } from "@/stores/useAdminStaffTasksStore";
import { COLUMNS } from "@/types/staff-tasks";
import { toast } from "sonner";

export interface TaskReviewModalProps {
  task?: any | null;
  isOpen?: boolean;
  onClose?: () => void;
  onApprove?: (task: any, adminNote?: string) => Promise<void> | void;
  onReject?: (task: any, reason: string) => Promise<void> | void;
  submitting?: boolean;
}

function safeFormatDate(dateVal: string | Date | null | undefined, fmt = "dd/MM/yyyy HH:mm"): string {
  if (!dateVal) return "—";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "—";
  return format(d, fmt);
}

export function TaskReviewModal({
  task: propTask,
  isOpen: propIsOpen,
  onClose: propOnClose,
  onApprove,
  onReject,
  submitting = false,
}: TaskReviewModalProps) {
  const {
    isReviewModalOpen,
    closeReviewModal,
    reviewingTask,
    rejectReason,
    setRejectReason,
  } = useAdminStaffTasksStore();

  const isOpen = propIsOpen !== undefined ? propIsOpen : isReviewModalOpen;
  const currentTask = propTask !== undefined ? propTask : reviewingTask;

  const [localNote, setLocalNote] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [localRejectReason, setLocalRejectReason] = useState("");

  useEffect(() => {
    if (currentTask) {
      setLocalNote(currentTask.adminNote || "");
      setLocalRejectReason(rejectReason || "");
      setIsRejecting(false);
    }
  }, [currentTask, rejectReason]);

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      closeReviewModal();
    }
    setIsRejecting(false);
  };

  const handleApprove = async () => {
    if (!currentTask) return;
    try {
      if (onApprove) {
        await onApprove(currentTask, localNote.trim());
      }
      handleClose();
    } catch {
      // Handled by parent
    }
  };

  const handleReject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentTask) return;
    const reason = localRejectReason.trim();
    if (!reason) {
      toast.error("Vui lòng nhập lý do / hướng dẫn chỉnh sửa");
      return;
    }
    try {
      setRejectReason(reason);
      if (onReject) {
        await onReject(currentTask, reason);
      }
      handleClose();
    } catch {
      // Handled by parent
    }
  };

  if (!currentTask) return null;

  const statusCol = COLUMNS.find((c) => c.id === currentTask.status);
  const assigneeName = currentTask.assignee?.name || currentTask.user?.name || "Nhân viên";
  const assigneeEmail = currentTask.assignee?.email || currentTask.user?.email || "";
  const proofUrl = currentTask.evidenceLink || currentTask.proofUrl;
  const proofNote = currentTask.evidenceNote || currentTask.notes || currentTask.note;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg font-bold text-slate-900 leading-snug">
              Kiểm duyệt nhiệm vụ
            </DialogTitle>
            <Badge className={statusCol?.color || "bg-slate-100 text-slate-800"}>
              {statusCol?.label || currentTask.status}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground flex flex-col gap-1 pt-1">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <User className="h-3.5 w-3.5 text-indigo-500" />
              <span>{assigneeName}</span>
              {assigneeEmail && <span className="text-slate-400">({assigneeEmail})</span>}
            </div>
            {currentTask.submittedAt && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <Clock className="h-3 w-3" />
                Nộp lúc: {safeFormatDate(currentTask.submittedAt)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm text-slate-800 max-h-[65vh] overflow-y-auto pr-1">
          {/* Task Title & Description */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
            <h4 className="font-bold text-sm text-slate-900">{currentTask.title}</h4>
            {currentTask.description ? (
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                {currentTask.description}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">Không có mô tả chi tiết.</p>
            )}
          </div>

          {/* Submission Proof / Evidence */}
          <div className="bg-emerald-50/40 border border-emerald-200/70 rounded-xl p-3.5 space-y-2">
            <h5 className="font-bold text-emerald-950 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-emerald-600" /> Báo cáo hoàn thành của nhân sự
            </h5>

            {proofUrl ? (
              <div className="text-xs space-y-1">
                <span className="font-semibold text-emerald-900 block">Link chứng minh:</span>
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-800 font-bold underline break-all inline-flex items-center gap-1 bg-white p-2 rounded-lg border border-emerald-100 w-full"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{proofUrl}</span>
                </a>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Không có link đính kèm.</p>
            )}

            {proofNote && (
              <div className="text-xs space-y-1 pt-1">
                <span className="font-semibold text-emerald-900 block">Ghi chú của nhân viên:</span>
                <p className="text-slate-700 bg-white p-2.5 rounded-lg border border-emerald-100 whitespace-pre-wrap leading-relaxed">
                  &ldquo;{proofNote}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 bg-slate-50 border rounded-lg">
              <span className="font-semibold text-slate-500 block mb-0.5">Ngày bắt đầu:</span>
              <span className="text-slate-800 font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                {safeFormatDate(currentTask.startDate, "dd/MM/yyyy")}
              </span>
            </div>
            <div className="p-2.5 bg-slate-50 border rounded-lg">
              <span className="font-semibold text-slate-500 block mb-0.5">Hạn chót:</span>
              <span className="text-slate-800 font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                {safeFormatDate(currentTask.deadline, "dd/MM/yyyy")}
              </span>
            </div>
          </div>

          {/* Rejection Note Form (If Rejecting) */}
          {isRejecting ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="reject-reason" className="text-xs font-bold text-rose-800 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Yêu cầu chỉnh sửa cụ thể <span className="text-red-500">*</span>
                </Label>
                <button
                  type="button"
                  onClick={() => setIsRejecting(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Quay lại
                </button>
              </div>
              <Textarea
                id="reject-reason"
                value={localRejectReason}
                onChange={(e) => setLocalRejectReason(e.target.value)}
                placeholder="VD: Thiếu hình ảnh kết quả, link không truy cập được, cần sửa lại video..."
                rows={3}
                className="bg-white border-rose-200 text-xs"
                autoFocus
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="admin-note" className="text-xs font-semibold text-slate-700">
                Ghi chú phản hồi / duyệt (tùy chọn)
              </Label>
              <Textarea
                id="admin-note"
                value={localNote}
                onChange={(e) => setLocalNote(e.target.value)}
                placeholder="Ghi nhận lời khen hoặc lưu ý cho nhân viên..."
                rows={2}
                className="bg-white border-slate-200 text-xs"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {isRejecting ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsRejecting(false)}
                disabled={submitting}
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                onClick={() => handleReject()}
                disabled={submitting}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {submitting ? "Đang gửi..." : "Gửi yêu cầu làm lại"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={submitting}
              >
                Đóng
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                onClick={() => setIsRejecting(true)}
                disabled={submitting}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Yêu cầu sửa
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={handleApprove}
                disabled={submitting}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                {submitting ? "Đang duyệt..." : "Duyệt hoàn thành"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
