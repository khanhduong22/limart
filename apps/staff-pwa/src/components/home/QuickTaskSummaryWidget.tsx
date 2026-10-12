import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, CheckCircle2, ListTodo } from "lucide-react";
import { ShiftDutyItem } from "@/lib/api-client";

export interface QuickTaskSummaryWidgetProps {
  todayDuties?: ShiftDutyItem[];
  onOpenDuties?: () => void;
  className?: string;
}

export const QuickTaskSummaryWidget: React.FC<QuickTaskSummaryWidgetProps> = ({
  todayDuties = [],
  onOpenDuties,
  className,
}) => {
  if (todayDuties.length === 0) {
    return null;
  }

  const completedCount = todayDuties.filter((d) => d.isCompleted).length;
  const isAllDone = completedCount === todayDuties.length;
  const percent = Math.round((completedCount / todayDuties.length) * 100);

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        onClick={onOpenDuties}
        className="w-full bg-gradient-to-r from-emerald-50/90 to-teal-50/90 hover:from-emerald-100 hover:to-teal-100 border-emerald-200 text-emerald-950 rounded-xl p-3 h-auto shadow-2xs flex items-center justify-between group transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2.5 text-left">
          <div className="w-8 h-8 rounded-lg bg-emerald-100/80 flex items-center justify-center text-lg shrink-0">
            {isAllDone ? "🎉" : "📋"}
          </div>
          <div>
            <div className="text-xs font-bold flex items-center gap-1.5 text-emerald-950">
              <span>Nhiệm vụ ca làm hôm nay</span>
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-1.5 py-0 h-4 font-bold">
                {completedCount}/{todayDuties.length} xong
              </Badge>
            </div>
            <div className="text-[11px] text-emerald-700/90 font-normal mt-0.5">
              {isAllDone
                ? "Tất cả nhiệm vụ đã hoàn tất xuất sắc!"
                : "Nhấn để xem và tích hoàn thành nhiệm vụ"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono font-bold text-emerald-700">
            {percent}%
          </span>
          <ChevronRight className="h-4 w-4 text-emerald-700 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </Button>
    </div>
  );
};

export default QuickTaskSummaryWidget;
