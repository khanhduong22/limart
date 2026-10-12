import React from "react";
import { Button } from "@/components/ui/button";
import { TaskDefItem } from "./WfhTaskTypes";

export interface GeneralTaskListProps {
  tasks: TaskDefItem[];
  isLoading: boolean;
  isProcessing: boolean;
  onStart: (taskDefId: string) => void;
}

export const GeneralTaskList: React.FC<GeneralTaskListProps> = ({
  tasks,
  isLoading,
  isProcessing,
  onStart,
}) => {
  if (isLoading) {
    return <div className="p-8 text-center text-xs text-stone-400">Đang tải danh sách nhiệm vụ...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center text-xs text-stone-500">
        Không có nhiệm vụ chung nào đang hoạt động.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {tasks.map((t) => {
        const title = (t as any).name || t.title || "Nhiệm vụ";
        const baseReward = t.baseReward || 0;
        const unit = t.unit || "lượt";

        return (
          <div
            key={t.id}
            className="rounded-2xl bg-white border border-stone-200 p-3.5 shadow-2xs space-y-2.5 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-stone-900">{title}</h3>
                {t.description && (
                  <p className="text-xs text-stone-600 mt-0.5">{t.description}</p>
                )}
              </div>
              <span className="shrink-0 text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-mono">
                +{baseReward.toLocaleString()}đ/{unit}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-100">
              <Button
                size="sm"
                variant="outline"
                disabled={isProcessing}
                onClick={() => onStart(t.id)}
                className="h-7 text-xs font-semibold cursor-pointer"
              >
                Bắt đầu nhận việc
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GeneralTaskList;
