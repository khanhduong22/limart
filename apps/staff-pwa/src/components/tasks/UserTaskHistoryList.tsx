import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { UserTaskRecord } from "./WfhTaskTypes";

export interface UserTaskHistoryListProps {
  tasks: UserTaskRecord[];
  isLoading: boolean;
  onOpenSubmit: (task: UserTaskRecord) => void;
}

export const UserTaskHistoryList: React.FC<UserTaskHistoryListProps> = ({
  tasks,
  isLoading,
  onOpenSubmit,
}) => {
  if (isLoading) {
    return <div className="p-8 text-center text-xs text-stone-400">Đang tải lịch sử...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center space-y-1">
        <span className="text-2xl">📋</span>
        <p className="text-xs font-bold text-stone-700">Chưa có nhiệm vụ nào</p>
        <p className="text-[11px] text-stone-500">
          Hãy qua tab Sàn việc hoặc Nhiệm vụ chung để nhận job nhé!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {tasks.map((t) => {
        const taskDef = t.taskDefinition || (t as any).taskDef;
        const title =
          t.taskItem?.title ||
          (t.taskItem as any)?.name ||
          taskDef.name ||
          taskDef.title ||
          (t as any).title ||
          "Nhiệm vụ WFH";
        const unit = taskDef.unit || (t as any).unit || "lần";
        const amount = t.finalAmount || (t.quantity || 1) * (t.unitPrice || 0);

        return (
          <div
            key={t.id}
            className={`rounded-2xl border p-3.5 shadow-2xs space-y-2 text-left ${
              t.status === "APPROVED"
                ? "bg-emerald-50/40 border-emerald-200"
                : t.status === "REJECTED"
                ? "bg-rose-50/50 border-rose-200"
                : t.status === "SUBMITTED"
                ? "bg-amber-50/40 border-amber-200"
                : "bg-white border-stone-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-stone-900">{title}</h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Số lượng: <span className="font-semibold text-stone-700">{t.quantity} {unit}</span>
                </p>
              </div>
              {/* Status Badge */}
              <div>
                {t.status === "APPROVED" && (
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Đã duyệt (+{amount.toLocaleString()}đ)
                  </span>
                )}
                {t.status === "SUBMITTED" && (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Chờ Admin duyệt
                  </span>
                )}
                {t.status === "PENDING" && (
                  <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100 border border-indigo-300 px-2 py-0.5 rounded-full">
                    Đang thực hiện
                  </span>
                )}
                {t.status === "REJECTED" && (
                  <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Bị từ chối
                  </span>
                )}
              </div>
            </div>

            {/* Reject Reason Alert */}
            {t.status === "REJECTED" && (t.rejectReason || t.adminNote) && (
              <div className="bg-rose-100/70 border border-rose-200 p-2 rounded-lg text-xs text-rose-800">
                <p className="font-bold text-[11px]">Lý do từ chối:</p>
                <p className="text-[11px] mt-0.5">{t.rejectReason || t.adminNote}</p>
              </div>
            )}

            {/* Evidence link */}
            {t.evidenceLink && (
              <div className="text-[11px] text-indigo-700 truncate">
                🔗{" "}
                <a
                  href={t.evidenceLink}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-indigo-900"
                >
                  {t.evidenceLink}
                </a>
              </div>
            )}

            {/* Actions */}
            {(t.status === "PENDING" || t.status === "REJECTED") && (
              <div className="flex justify-end pt-1 border-t border-stone-100">
                <Button
                  size="sm"
                  onClick={() => onOpenSubmit(t)}
                  className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 cursor-pointer"
                >
                  {t.status === "REJECTED" ? "Nộp lại kết quả" : "Nộp kết quả"}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default UserTaskHistoryList;
