import React, { useState } from "react";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LeaderboardCards = React.lazy(
  () => import("@/components/admin/reports/LeaderboardCards")
);

const EMPTY_REPORT = {
  totalPayrollCost: 0,
  totalHoursAll: 0,
  totalEmployeeCount: 0,
  topHardworking: [] as { id: string; name: string; totalHours: number; daysWorked: number }[],
  topDiscipline: [] as { user: { id: string; name: string; image?: string | null }; totalScheduledCheckins: number; punctualityRate: number }[],
  topOvertime: [] as { id: string; name: string; avgOvertime: number; displayOvertimeHours: number; daysWorked: number }[],
  topPacking: [] as { id: string; name: string; points: number }[],
  topCarrying: [] as { id: string; name: string; points: number }[],
  topLate: [] as { user: { id: string; name: string }; lateCount: number; totalLateMinutes: number }[],
};

export function ReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data } = useAdminQuery<typeof EMPTY_REPORT>(
    `/api/admin/reports?month=${month}&year=${year}`,
    { fallbackData: EMPTY_REPORT, revalidateOnFocus: false }
  );

  const report: typeof EMPTY_REPORT = {
    ...EMPTY_REPORT,
    ...(data || {}),
    topHardworking: data?.topHardworking || [],
    topDiscipline: data?.topDiscipline || [],
    topOvertime: data?.topOvertime || [],
    topPacking: data?.topPacking || [],
    topCarrying: data?.topCarrying || [],
    topLate: data?.topLate || [],
  };

  const monthOptions = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    monthOptions.push({
      value: `${y}-${m}`,
      label: `Tháng ${m}/${y}`,
      month: m,
      year: y,
    });
  }

  const formatVND = (num: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(num);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Bảng Thành Tích & Báo Cáo
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Tháng {month}/{year}
          </p>
        </div>
        <div className="w-full sm:w-56 bg-white p-1 rounded-xl shadow-sm border border-orange-100">
          <Select
            value={`${year}-${month}`}
            onValueChange={(val) => {
              const [y, m] = val.split("-").map(Number);
              setYear(y);
              setMonth(m);
            }}
          >
            <SelectTrigger className="border-0 focus:ring-0 font-medium text-slate-700 min-h-[38px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 📊 SUMMARY STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card id="report-summary-stats" className="bg-emerald-50/70 border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-emerald-800">
              Tổng Chi Lương (Tạm tính)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {formatVND(report.totalPayrollCost)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/70 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-blue-800">
              Tổng Giờ Làm
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {(Number(report.totalHoursAll) || 0).toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card className="bg-purple-50/70 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-purple-800">
              Nhân sự Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">
              {report.totalEmployeeCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 🏆 HERO SECTION & VIOLATIONS (Extracted into LeaderboardCards) */}
      <React.Suspense
        fallback={
          <div className="h-96 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Đang tải bảng thành tích...
          </div>
        }
      >
        <LeaderboardCards report={report} />
      </React.Suspense>
    </div>
  );
}
