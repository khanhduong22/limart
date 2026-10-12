import React from "react";
import { cn } from "@/lib/utils";

export interface CheckinHistoryListProps {
  checkins: any[];
}

export const CheckinHistoryList: React.FC<CheckinHistoryListProps> = ({ checkins }) => {
  if (!checkins || checkins.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">
        Lịch sử hôm nay ({checkins.length})
      </h3>
      <div className="rounded-xl border bg-white shadow-2xs divide-y text-left">
        {checkins.map((c, i) => (
          <div key={c.id || i} className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full shrink-0",
                  c.type === "checkin" ? "bg-emerald-500 animate-pulse" : "bg-orange-500"
                )}
              />
              <div className="flex flex-col">
                <span className="font-semibold text-xs text-slate-800">
                  {c.type === "checkin" ? "Check-in (Vào ca)" : "Check-out (Tan ca)"}
                </span>
                {c.note && (
                  <span className="text-[10px] text-slate-400 italic">
                    Ghi chú: {c.note}
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs font-mono font-medium text-slate-600 shrink-0">
              {new Date(c.timestamp).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CheckinHistoryList;
