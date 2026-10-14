import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface CheckinActivityCardProps {
  checkinsToday: any[];
  formatTime: (d: string | Date | null) => string;
  getShiftStatus: (checkin: any) => React.ReactNode;
}

export function CheckinActivityCard({
  checkinsToday = [],
  formatTime,
  getShiftStatus,
}: CheckinActivityCardProps) {
  const safeCheckins = Array.isArray(checkinsToday) ? checkinsToday : [];

  return (
    <Card
      id="dashboard-checkin-activity"
      className="col-span-1 lg:col-span-4 bg-white shadow-sm overflow-hidden"
    >
      <CardHeader>
        <CardTitle className="text-base font-bold">
          Hoạt động chấm công
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {safeCheckins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có lượt chấm công nào hôm nay.
            </p>
          ) : (
            <div className="space-y-4">
              {safeCheckins.map((checkin) => (
                <div
                  key={checkin.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0 gap-2"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        checkin.type === "checkin"
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-orange-100 text-orange-600"
                      }`}
                    >
                      {(checkin.user?.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium hover:underline truncate">
                        <Link to={`/employees/${checkin.userId}`}>
                          {checkin.user?.name || "Nhân viên"}
                        </Link>
                      </p>
                      <p
                        className={`text-xs ${
                          checkin.type === "checkin"
                            ? "text-emerald-600"
                            : "text-orange-600"
                        }`}
                      >
                        {checkin.type === "checkin"
                          ? "🟢 Vào ca"
                          : "👋 Tan ca"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-slate-800">
                      {formatTime(checkin.timestamp)}
                    </p>
                    <div className="flex justify-end">
                      {getShiftStatus(checkin)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CheckinActivityCard;
