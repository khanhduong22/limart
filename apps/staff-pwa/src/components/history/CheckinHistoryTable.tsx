import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkTimeStatus } from "@/lib/utils";

export interface CheckinHistoryTableProps {
  history: any[];
  isLoading: boolean;
}

export const CheckinHistoryTable: React.FC<CheckinHistoryTableProps> = ({
  history = [],
  isLoading,
}) => {
  const safeHistory = Array.isArray(history) ? history : [];

  return (
    <Card className="rounded-2xl shadow-xs overflow-hidden">
      <CardHeader className="py-3 px-4 bg-gray-50/80 border-b">
        <CardTitle className="text-sm font-bold text-gray-800">
          Chi tiết từng lượt ({safeHistory.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
            Đang tải lịch sử chấm công...
          </div>
        ) : safeHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Chưa có dữ liệu chấm công nào.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
            {safeHistory.map((h: any) => {
              const ts = h?.timestamp ? new Date(h.timestamp) : new Date();
              const status = checkTimeStatus(ts, h?.type);
              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-3.5 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${
                        h.type === "checkin" ? "bg-emerald-500" : "bg-orange-500"
                      }`}
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-gray-800">
                        {h.type === "checkin" ? "Check-in" : "Check-out"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(h.timestamp).toLocaleDateString("vi-VN", {
                          weekday: "short",
                          day: "numeric",
                          month: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-0.5">
                    <div className="font-mono text-xs font-bold flex items-center gap-1.5 text-gray-800">
                      {status && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${status.color}`}
                        >
                          {status.label}
                        </span>
                      )}
                      {new Date(h.timestamp).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    {h.note && (
                      <div className="text-[10px] text-slate-400 italic">
                        {h.note}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CheckinHistoryTable;
