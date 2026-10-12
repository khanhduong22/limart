import React from "react";
import { Button } from "@/components/ui/button";
import { StaffTask } from "@/stores/useStaffTasksStore";

interface TaskSubmitModalProps {
  task: StaffTask | null;
  evidenceLink: string;
  note: string;
  isProcessing?: boolean;
  onEvidenceLinkChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const TaskSubmitModal: React.FC<TaskSubmitModalProps> = ({
  task,
  evidenceLink,
  note,
  isProcessing = false,
  onEvidenceLinkChange,
  onNoteChange,
  onSubmit,
  onClose,
}) => {
  if (!task) return null;

  const title =
    task.title ||
    task.name ||
    task.taskDefinition?.name ||
    task.taskDefinition?.title ||
    "Công việc";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-6 max-w-sm sm:max-w-lg w-full space-y-4 shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-sm font-bold text-stone-900">
            Báo cáo hoàn thành: {title}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Nhập link bằng chứng hình ảnh hoặc ghi chú kết quả công việc
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Link bằng chứng kết quả (Google Drive / Ảnh)
            </label>
            <input
              type="url"
              placeholder="https://drive.google.com/..."
              value={evidenceLink}
              onChange={(e) => onEvidenceLinkChange(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Ghi chú kết quả thực hiện
            </label>
            <textarea
              rows={3}
              placeholder="Mô tả kết quả đã làm..."
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-stone-200 text-xs focus:outline-indigo-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isProcessing}
              onClick={onClose}
              className="flex-1 h-9 text-xs font-bold cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isProcessing}
              className="flex-1 h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              {isProcessing ? "Đang gửi..." : "Gửi kết quả"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskSubmitModal;
