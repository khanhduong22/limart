import React from "react";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Send,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffTask } from "@/stores/useStaffTasksStore";

interface StaffTaskCardProps {
  task: StaffTask;
  isProcessing?: boolean;
  onViewDetails: (task: StaffTask) => void;
  onStartTask: (taskId: string) => void;
  onSubmitTask: (task: StaffTask) => void;
}

export const StaffTaskCard: React.FC<StaffTaskCardProps> = ({
  task,
  isProcessing = false,
  onViewDetails,
  onStartTask,
  onSubmitTask,
}) => {
  const title =
    task.title ||
    task.name ||
    task.taskDefinition?.name ||
    task.taskDefinition?.title ||
    "Công việc";

  const isOverdue =
    task.deadline &&
    new Date(task.deadline) < new Date() &&
    task.status !== "APPROVED";

  return (
    <div
      onClick={() => onViewDetails(task)}
      className={`rounded-2xl border p-4 shadow-xs flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all active:scale-[0.99] group ${
        task.status === "APPROVED"
          ? "bg-emerald-50/40 border-emerald-200"
          : task.status === "REJECTED"
          ? "bg-rose-50/50 border-rose-200"
          : task.status === "DONE"
          ? "bg-sky-50/40 border-sky-200"
          : "bg-white border-stone-200"
      }`}
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <h3 className="text-xs md:text-sm font-bold text-stone-900 leading-snug group-hover:text-indigo-900 transition-colors">
              {title}
            </h3>
            {task.description && (
              <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
                {task.description}
              </p>
            )}
          </div>

          {/* Status Badge */}
          <div className="shrink-0">
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
          </div>
        </div>

        {/* Priority & Deadline details */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500 pt-1 border-t border-stone-100">
          {task.priority === "URGENT" && (
            <span className="font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
              ⚡ Khẩn cấp
            </span>
          )}
          {task.frequency && (
            <span className="text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
              🔄 {task.frequency}
            </span>
          )}
          {task.deadline && (
            <span
              className={`inline-flex items-center gap-1 ${
                isOverdue ? "text-rose-600 font-bold" : "text-stone-500"
              }`}
            >
              <Calendar className="w-3 h-3" /> Hạn:{" "}
              {new Date(task.deadline).toLocaleDateString("vi-VN")}
              {isOverdue && " (Quá hạn)"}
            </span>
          )}
        </div>

        {/* Evidence link & note */}
        {task.evidenceLink && (
          <div className="text-[11px] text-indigo-700 truncate">
            🔗{" "}
            <a
              href={task.evidenceLink}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline hover:text-indigo-900"
            >
              {task.evidenceLink}
            </a>
          </div>
        )}
      </div>

      {/* Card Bottom Area: View details trigger + Action button */}
      <div className="flex items-center justify-between pt-3 mt-2 border-t border-stone-100/80">
        <span className="text-[10px] text-indigo-600 font-semibold inline-flex items-center gap-0.5 hover:underline">
          Chi tiết &rarr;
        </span>

        <div className="flex items-center gap-1.5">
          {task.status === "TODO" && (
            <Button
              size="sm"
              disabled={isProcessing}
              onClick={(e) => {
                e.stopPropagation();
                onStartTask(task.id);
              }}
              className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 rounded-lg cursor-pointer"
            >
              <Play className="w-3 h-3 mr-1" /> Bắt đầu làm
            </Button>
          )}
          {(task.status === "DOING" || task.status === "REJECTED") && (
            <Button
              size="sm"
              disabled={isProcessing}
              onClick={(e) => {
                e.stopPropagation();
                onSubmitTask(task);
              }}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 rounded-lg cursor-pointer"
            >
              <Send className="w-3 h-3 mr-1" /> Báo hoàn thành
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffTaskCard;
