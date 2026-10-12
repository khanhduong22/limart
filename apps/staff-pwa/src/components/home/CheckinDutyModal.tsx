import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftDutyItem } from "@/lib/api-client";

export interface CheckinDutyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duties: ShiftDutyItem[];
  onToggleDuty: (dutyId: string) => void;
}

export const CheckinDutyModal: React.FC<CheckinDutyModalProps> = ({
  open,
  onOpenChange,
  duties,
  onToggleDuty,
}) => {
  const completedCount = duties.filter((d) => d.isCompleted).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl border-emerald-100 shadow-2xl">
        <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 p-5 text-white text-center relative overflow-hidden">
          <div className="mx-auto w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl shadow-inner mb-2 animate-bounce">
            🎯
          </div>
          <DialogTitle className="text-lg font-bold text-white tracking-tight">
            Check-in thành công!
          </DialogTitle>
          <DialogDescription className="text-emerald-100 text-xs mt-1 font-medium">
            {duties.length > 0
              ? "Nhiệm vụ ca làm của bạn hôm nay:"
              : "Chào mừng bạn đến với ca làm hôm nay!"}
          </DialogDescription>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-slate-50/40">
          {duties.length === 0 ? (
            <div className="text-center py-6 px-4 space-y-2 bg-white rounded-xl border border-dashed border-slate-200">
              <span className="text-3xl block">✨</span>
              <p className="font-bold text-slate-800 text-sm">
                Hôm nay bạn không có nhiệm vụ ca làm nào được giao!
              </p>
              <p className="text-xs text-slate-500">
                Chúc bạn có một ca làm việc vui vẻ, tập trung và tràn đầy năng lượng.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-500 flex items-center justify-between px-1">
                <span>Danh sách nhiệm vụ ca làm ({duties.length})</span>
                <span className="text-[11px] text-emerald-600 font-medium">
                  Đã xong {completedCount}/{duties.length}
                </span>
              </div>

              {duties.map((duty) => (
                <div
                  key={duty.id}
                  onClick={() => onToggleDuty(duty.id)}
                  className={cn(
                    "border rounded-xl p-3.5 bg-white shadow-2xs transition-all space-y-2 cursor-pointer select-none text-left",
                    duty.isCompleted
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-slate-200/90 hover:border-emerald-300 hover:shadow-xs"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleDuty(duty.id);
                        }}
                      >
                        {duty.isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 fill-emerald-100" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-300 hover:text-emerald-500" />
                        )}
                      </button>
                      <div>
                        <h4
                          className={cn(
                            "font-bold text-sm leading-snug transition-all",
                            duty.isCompleted
                              ? "line-through text-slate-400"
                              : "text-slate-900"
                          )}
                        >
                          {duty.title}
                        </h4>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-2 py-0.5 shrink-0 font-semibold",
                        duty.isCompleted
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      )}
                    >
                      {duty.isCompleted ? "✅ Đã xong" : "⏳ Chưa xong"}
                    </Badge>
                  </div>

                  {duty.description && (
                    <div
                      className={cn(
                        "text-xs rounded-lg p-2.5 border leading-relaxed whitespace-pre-wrap ml-7",
                        duty.isCompleted
                          ? "bg-slate-100/60 text-slate-400 border-slate-100"
                          : "bg-slate-50 text-slate-600 border-slate-100"
                      )}
                    >
                      <span className="font-semibold text-slate-700 block mb-0.5 text-[11px]">
                        Mô tả chi tiết:
                      </span>
                      {duty.description}
                    </div>
                  )}
                </div>
              ))}

              <div className="text-[11px] text-center text-slate-400 pt-1">
                💡 Nhấn vào từng mục để đánh dấu hoàn thành nhiệm vụ
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-3 bg-white border-t flex flex-row gap-2 justify-end">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Đã hiểu & Bắt đầu ca làm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckinDutyModal;
