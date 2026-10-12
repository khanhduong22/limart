import React from "react";
import { Button } from "@/components/ui/button";
import { MarketItem } from "./WfhTaskTypes";

export interface MarketTaskListProps {
  items: MarketItem[];
  isLoading: boolean;
  isProcessing: boolean;
  onClaim: (taskItemId: string) => void;
}

export const MarketTaskList: React.FC<MarketTaskListProps> = ({
  items,
  isLoading,
  isProcessing,
  onClaim,
}) => {
  if (isLoading) {
    return <div className="p-8 text-center text-xs text-stone-400">Đang tải sàn việc...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center space-y-2">
        <span className="text-3xl">🧺</span>
        <p className="text-xs font-bold text-stone-700">Hiện chưa có việc mở nào trên sàn</p>
        <p className="text-[11px] text-stone-500">
          Hãy quay lại sau hoặc xem tab Nhiệm vụ chung nhé!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const taskDef = item.taskDefinition || item.taskDef;
        const title = item.title || (item as any).name || taskDef?.name || taskDef?.title || "Nhiệm vụ";
        const categoryTitle = taskDef?.name || taskDef?.title || (item as any).title || "Nhiệm vụ";
        const baseReward = taskDef?.baseReward || 0;
        const unit = taskDef?.unit || "lượt";

        return (
          <div
            key={item.id}
            className="rounded-2xl bg-white border border-indigo-100 p-3.5 shadow-2xs space-y-2.5 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-stone-900">{title}</h3>
                {item.description && (
                  <p className="text-xs text-stone-600 mt-0.5 line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md font-mono">
                +{baseReward.toLocaleString()}đ/{unit}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-stone-100">
              <span className="text-[11px] text-stone-500">
                Phân loại: <span className="font-semibold text-stone-700">{categoryTitle}</span>
              </span>
              <Button
                size="sm"
                disabled={isProcessing}
                onClick={() => onClaim(item.id)}
                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 cursor-pointer"
              >
                Nhận Job Này
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MarketTaskList;
