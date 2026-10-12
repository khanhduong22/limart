import React from "react";
import { Button } from "@/components/ui/button";
import { RejectedTaskItem } from "@/lib/api-client";

export interface RejectedTasksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rejectedTasks: RejectedTaskItem[];
  onNavigateToTask: (link: string) => void;
}

export const RejectedTasksModal: React.FC<RejectedTasksModalProps> = ({
  open,
  onOpenChange,
  rejectedTasks = [],
  onNavigateToTask,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl p-4 sm:p-5 max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200 text-left">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <div>
              <h2 className="text-base font-bold text-rose-900">Công việc bị từ chối</h2>
              <p className="text-[11px] text-stone-500">
                {rejectedTasks.length} nhiệm vụ cần bạn cập nhật và nộp lại
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-100 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 py-3 space-y-3">
          {rejectedTasks.length === 0 ? (
            <div className="text-center py-6 text-stone-500 text-xs">
              Không có công việc nào cần sửa đổi
            </div>
          ) : (
            rejectedTasks.map((task) => (
              <div
                key={task.id}
                className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2.5 shadow-2xs text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          task.type === "PACKING"
                            ? "bg-blue-100 text-blue-700 border border-blue-200"
                            : task.type === "CARRYING"
                            ? "bg-purple-100 text-purple-700 border border-purple-200"
                            : task.type === "STAFF_TASK"
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : "bg-amber-100 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {task.type === "PACKING"
                          ? "📦 Đóng gói"
                          : task.type === "CARRYING"
                          ? "🏋️ Bưng hàng"
                          : task.type === "STAFF_TASK"
                          ? "🎯 KPI khoán"
                          : "💼 Nhiệm vụ WFH"}
                      </span>
                      {task.date && (
                        <span className="text-[10px] text-stone-400">
                          {new Date(task.date).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-stone-900 leading-snug">
                      {task.title}
                    </h4>
                  </div>
                </div>

                {/* Lý do từ chối */}
                <div className="bg-rose-100/80 border border-rose-300 rounded-lg p-2.5 text-xs text-rose-900 space-y-0.5">
                  <p className="font-bold text-[11px] text-rose-950 flex items-center gap-1">
                    <span>💬</span> Lý do Admin yêu cầu sửa:
                  </p>
                  <p className="text-[11px] text-rose-800 leading-relaxed font-medium">
                    {task.reason}
                  </p>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onNavigateToTask(task.link);
                    }}
                    className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 shadow-2xs cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>Sửa & Nộp lại</span>
                    <span>➔</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-3 border-t border-stone-100 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs cursor-pointer"
          >
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RejectedTasksModal;
