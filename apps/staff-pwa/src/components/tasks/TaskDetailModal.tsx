import React from "react";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Send,
  Calendar,
  X,
  User,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffTask } from "@/stores/useStaffTasksStore";

interface TaskDetailModalProps {
  task: StaffTask | null;
  isProcessing?: boolean;
  onClose: () => void;
  onStartTask?: (taskId: string) => void;
  onSubmitTask?: (task: StaffTask) => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isProcessing = false,
  onClose,
  onStartTask,
  onSubmitTask,
}) => {
  if (!task) return null;

  const title =
    task.title ||
    task.name ||
    task.taskDefinition?.name ||
    task.taskDefinition?.title ||
    "Chi tiết công việc";

  const isOverdue =
    task.deadline &&
    new Date(task.deadline) < new Date() &&
    task.status !== "APPROVED";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-5 md:p-6 max-w-md sm:max-w-lg md:max-w-xl w-full space-y-4 shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title and Close Button */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {task.status === "APPROVED" && (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Đã duyệt
                </span>
              )}
              {task.status === "DONE" && (
                <span className="text-[10px] font-bold text-sky-800 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Chờ duyệt
                </span>
              )}
              {task.status === "DOING" && (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                  Đang làm
                </span>
              )}
              {task.status === "TODO" && (
                <span className="text-[10px] font-bold text-stone-700 bg-stone-100 border border-stone-300 px-2 py-0.5 rounded-full">
                  Cần làm
                </span>
              )}
              {task.status === "REJECTED" && (
                <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Cần sửa
                </span>
              )}
              {task.priority === "URGENT" && (
                <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                  ⚡ Khẩn cấp
                </span>
              )}
              {task.frequency && (
                <span className="text-[10px] text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                  🔄 {task.frequency}
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-extrabold text-stone-900 leading-snug break-words">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="overflow-y-auto space-y-3.5 pr-1 text-xs text-stone-600 flex-1">
          {/* Meta info: Creator & Deadline */}
          <div className="grid grid-cols-2 gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-200/60 text-[11px]">
            <div>
              <span className="text-stone-400 block text-[10px]">Người giao:</span>
              <span className="font-semibold text-stone-800 inline-flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3 text-stone-500" />
                {task.createdBy?.name || "Quản trị viên"}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block text-[10px]">Hạn hoàn thành:</span>
              <span
                className={`font-semibold inline-flex items-center gap-1 mt-0.5 ${
                  isOverdue ? "text-rose-600 font-bold" : "text-stone-800"
                }`}
              >
                <Calendar className="w-3 h-3 text-stone-500" />
                {task.deadline
                  ? new Date(task.deadline).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "Không giới hạn"}
              </span>
            </div>
          </div>

          {/* Task Description (Full, Read-only, Selectable) */}
          <div>
            <label className="text-[11px] font-bold text-stone-700 block mb-1.5 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              Nội dung chi tiết công việc:
            </label>
            {task.description ? (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-stone-800 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words select-text">
                {task.description}
              </div>
            ) : (
              <div className="bg-stone-50 border border-dashed border-stone-200 rounded-xl p-3 text-stone-400 text-xs italic">
                Không có phần mô tả thêm cho công việc này.
              </div>
            )}
          </div>

          {/* Admin Note / Reject Reason (if any) */}
          {(task.adminNote || task.rejectReason) && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1">
              <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                Yêu cầu / Ghi chú từ Quản trị viên:
              </span>
              <p className="text-xs text-rose-900 whitespace-pre-wrap">
                {task.adminNote || task.rejectReason}
              </p>
            </div>
          )}

          {/* Submitted Evidence & Note (if staff submitted before) */}
          {(task.evidenceLink || task.evidenceNote || task.notes) && (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 space-y-1.5 text-xs">
              <span className="font-bold text-indigo-900 block text-[11px]">
                Báo cáo kết quả đã gửi:
              </span>
              {task.evidenceLink && (
                <div className="text-indigo-700 break-all">
                  <span className="text-stone-500 font-medium">Link: </span>
                  <a
                    href={task.evidenceLink}
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-semibold hover:text-indigo-900 inline-flex items-center gap-1"
                  >
                    {task.evidenceLink}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {(task.evidenceNote || task.notes) && (
                <p className="text-stone-700 whitespace-pre-wrap">
                  <span className="text-stone-500 font-medium">Ghi chú: </span>
                  {task.evidenceNote || task.notes}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-2 border-t border-stone-100 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 h-9 text-xs font-bold border-stone-200 text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            Đóng
          </Button>
          {task.status === "TODO" && onStartTask && (
            <Button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                const id = task.id;
                onClose();
                onStartTask(id);
              }}
              className="flex-1 h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
            >
              <Play className="w-3 h-3 mr-1" /> Bắt đầu làm
            </Button>
          )}
          {(task.status === "DOING" || task.status === "REJECTED") && onSubmitTask && (
            <Button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                const currentTask = task;
                onClose();
                onSubmitTask(currentTask);
              }}
              className="flex-1 h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              <Send className="w-3 h-3 mr-1" /> Báo hoàn thành
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;
