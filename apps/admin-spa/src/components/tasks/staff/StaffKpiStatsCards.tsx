import React from "react";
import { UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StaffPerformanceStats, StaffTaskUserOption } from "@/types/staff-tasks";

export interface StaffKpiStatsCardsProps {
  selectedUserFilter: string;
  allowedUsers: StaffTaskUserOption[];
  userStats: Record<string, { monthly: StaffPerformanceStats; weekly: StaffPerformanceStats }>;
}

const fPercent = (val: number | null | undefined) => `${Math.round((val || 0) * 100)}%`;

export function StaffKpiStatsCards({
  selectedUserFilter,
  allowedUsers,
  userStats,
}: StaffKpiStatsCardsProps) {
  // KPI Performance Overview for All Employees
  if (selectedUserFilter === "ALL") {
    return (
      <Card className="border-indigo-100 shadow-xs overflow-hidden rounded-2xl">
        <CardHeader className="bg-slate-50/60 border-b pb-3">
          <CardTitle className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
            <UserCheck className="h-4 w-4 text-indigo-600" /> Báo cáo hiệu suất nhân sự tháng này
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Tỷ lệ hoàn thành công việc khoán của các nhân viên được chỉ định.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {allowedUsers.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground italic">
              Chưa có nhân viên nào được cấp quyền giao việc khoán/KPI. Vui lòng vào mục Nhân sự để bật quyền KPI.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {allowedUsers.map((u) => {
                const stats = userStats[u.id];
                return (
                  <div
                    key={u.id}
                    className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="h-9 w-9 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                        {u.name?.[0] || "?"}
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 text-sm">{u.name}</span>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>

                    {stats ? (
                      <div className="flex-1 max-w-md w-full grid grid-cols-2 gap-4">
                        {/* Month Stats */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-700 font-medium">
                            <span>
                              Tháng: <b>{fPercent(stats.monthly.completionRate)}</b>
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {stats.monthly.approved}/{stats.monthly.total} việc
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border">
                            <div
                              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                              style={{ width: `${(stats.monthly.completionRate || 0) * 100}%` }}
                            />
                          </div>
                        </div>

                        {/* Week Stats */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-700 font-medium">
                            <span>
                              Tuần: <b>{fPercent(stats.weekly.completionRate)}</b>
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {stats.weekly.approved}/{stats.weekly.total} việc
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border">
                            <div
                              className="bg-sky-600 h-full rounded-full transition-all duration-300"
                              style={{ width: `${(stats.weekly.completionRate || 0) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Đang cập nhật số liệu...</div>
                    )}

                    {stats && stats.monthly.overdue > 0 && (
                      <Badge
                        variant="destructive"
                        className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 gap-1 text-[10px] shrink-0 font-bold"
                      >
                        ⚠️ {stats.monthly.overdue} việc quá hạn
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Specific Employee Performance Stats
  const selectedStats = userStats[selectedUserFilter];
  if (!selectedStats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Monthly KPI */}
      <Card className="border-indigo-100 bg-slate-50/20 shadow-xs rounded-2xl">
        <CardContent className="pt-4 space-y-3">
          <div className="flex justify-between text-xs font-bold text-indigo-950 uppercase tracking-wide">
            <span>Hiệu suất KPI Tháng Này</span>
            <span>{fPercent(selectedStats.monthly.completionRate)}</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
              style={{
                width: `${(selectedStats.monthly.completionRate || 0) * 100}%`,
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Hoàn thành: <b>{selectedStats.monthly.approved}</b> / {selectedStats.monthly.total} việc được giao trong tháng này.
          </p>
        </CardContent>
      </Card>

      {/* Weekly KPI */}
      <Card className="border-sky-100 bg-slate-50/20 shadow-xs rounded-2xl">
        <CardContent className="pt-4 space-y-3">
          <div className="flex justify-between text-xs font-bold text-sky-950 uppercase tracking-wide">
            <span>Hiệu suất KPI Tuần Này</span>
            <span>{fPercent(selectedStats.weekly.completionRate)}</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border">
            <div
              className="bg-sky-600 h-full rounded-full transition-all duration-300"
              style={{
                width: `${(selectedStats.weekly.completionRate || 0) * 100}%`,
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Hoàn thành: <b>{selectedStats.weekly.approved}</b> / {selectedStats.weekly.total} việc được giao trong tuần này.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
