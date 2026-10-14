import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TodayScheduleCardProps {
  todayShifts: any[];
  formatTime: (d: string | Date | null) => string;
}

export function TodayScheduleCard({
  todayShifts = [],
  formatTime,
}: TodayScheduleCardProps) {
  const safeShifts = Array.isArray(todayShifts) ? todayShifts : [];

  return (
    <Card
      id="dashboard-today-schedule"
      className="col-span-1 lg:col-span-3 bg-white shadow-sm overflow-hidden"
    >
      <CardHeader>
        <CardTitle className="text-base font-bold">
          Lịch làm việc hôm nay
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {safeShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Không có lịch làm việc hôm nay.
            </p>
          ) : (
            <div className="space-y-3">
              {safeShifts.map((shift: any) => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100 gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {shift.user?.image ? (
                      <img
                        src={shift.user.image}
                        alt={shift.user.name || "Avatar"}
                        width="24"
                        height="24"
                        decoding="async"
                        loading="lazy"
                        className="h-6 w-6 rounded-full object-cover shrink-0"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.endsWith("/icons/capy_dashboard.webp")) {
                            target.src = "/icons/capy_dashboard.webp";
                          }
                        }}
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold shrink-0">
                        {(shift.user?.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium hover:underline text-slate-800 truncate">
                      <Link to={`/employees/${shift.userId}`}>
                        {shift.user?.name || "Nhân sự"}
                      </Link>
                    </span>
                  </div>
                  <div className="text-xs font-mono font-medium text-slate-600 shrink-0">
                    {formatTime(shift.start)} - {formatTime(shift.end)}
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

export default TodayScheduleCard;
