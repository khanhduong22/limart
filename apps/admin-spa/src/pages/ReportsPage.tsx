import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

      {/* 🏆 HERO SECTION: HALL OF FAME */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {/* Top Chăm Chỉ */}
        <Card id="report-top-hardworking" className="cv-auto-card bg-gradient-to-br from-yellow-50 to-orange-50 border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-800 text-base font-bold">
              🐝 Top Chăm Chỉ
            </CardTitle>
            <CardDescription className="text-xs">
              Nhân viên có tổng giờ làm cao nhất (Top 1 ≥130h thưởng 200k)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.topHardworking.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Chưa có dữ liệu</p>
            ) : (
              report.topHardworking.map((u: any, idx: number) => (
                <div key={u.id} className="flex items-center justify-between bg-white/80 p-2.5 rounded-lg shadow-sm border border-orange-100">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white ${
                      idx === 0 ? "bg-yellow-500" : idx === 1 ? "bg-gray-400" : "bg-amber-700"
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-1.5">
                        <Link to={`/employees`} className="hover:underline text-slate-800">
                          {u.name}
                        </Link>
                        {idx === 0 && (Number(u.totalHours) || 0) >= 130 && (
                          <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[9px] px-1 py-0 font-bold">
                            +200k
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{u.daysWorked} ngày công</div>
                    </div>
                  </div>
                  <div className="text-base font-bold text-orange-600">{(Number(u.totalHours) || 0).toFixed(1)}h</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Top Kỷ Luật */}
        <Card id="report-top-discipline" className="cv-auto-card bg-gradient-to-br from-teal-50 to-emerald-50 border-emerald-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-800 text-base font-bold">
              🌟 Top Kỷ Luật
            </CardTitle>
            <CardDescription className="text-xs">
              Tỷ lệ đi làm đúng giờ cao nhất
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Array.isArray(report.topDiscipline) ? report.topDiscipline : []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Chưa có dữ liệu</p>
            ) : (
              (Array.isArray(report.topDiscipline) ? report.topDiscipline : []).map((u: any, idx: number) => (
                <div key={u.user?.id || u.id || `disc-${idx}`} className="flex items-center justify-between bg-white/80 p-2.5 rounded-lg shadow-sm border border-emerald-100">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">
                        <Link to={`/employees`} className="hover:underline text-slate-800">
                          {u.user?.name || u.name || "Nhân viên"}
                        </Link>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{u.totalScheduledCheckins || 0} ca làm</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs">
                    {(Number(u.punctualityRate) || 0).toFixed(1)}%
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Top Cày Cuốc */}
        <Card id="report-top-overtime" className="cv-auto-card bg-gradient-to-br from-rose-50 to-pink-50 border-pink-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-pink-800 text-base font-bold">
              🔥 Top Cày Cuốc (OT)
            </CardTitle>
            <CardDescription className="text-xs">
              Trung bình giờ OT mỗi ca cao nhất
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.topOvertime.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Chưa có dữ liệu</p>
            ) : (
              report.topOvertime.map((u: any, idx: number) => (
                <div key={u.id} className="flex items-center justify-between bg-white/80 p-2.5 rounded-lg shadow-sm border border-pink-100">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white ${
                      idx === 0 ? "bg-pink-500" : idx === 1 ? "bg-gray-400" : "bg-red-900"
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">
                        <Link to={`/employees`} className="hover:underline text-slate-800">
                          {u.name}
                        </Link>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{u.daysWorked} ngày</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-pink-600">{(Number(u.avgOvertime) || 0).toFixed(1)}h/ca</div>
                    <div className="text-[10px] text-muted-foreground">Tổng: {(Number(u.displayOvertimeHours) || 0).toFixed(1)}h</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Vua Đóng Hàng */}
        <Card id="report-top-packing" className="cv-auto-card bg-gradient-to-br from-indigo-50 to-purple-50 border-purple-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-800 text-base font-bold">
              📦 Vua Đóng Hàng
            </CardTitle>
            <CardDescription className="text-xs">
              Điểm đóng gói lớn (&gt;50đ thưởng 200k)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.topPacking.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Chưa có dữ liệu</p>
            ) : (
              report.topPacking.map((u: any, idx: number) => {
                const prize = u.points > 50 ? "200K" : "100K";
                return (
                  <div key={u.id} className="flex items-center justify-between bg-white/80 p-2.5 rounded-lg shadow-sm border border-purple-100 relative overflow-hidden">
                    {idx === 0 && (
                      <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[9px] font-bold px-1.5 py-0.5 rounded-bl">
                        +{prize}
                      </div>
                    )}
                    <div className="flex items-center gap-2.5">
                      <div className={`flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white ${
                        idx === 0 ? "bg-purple-500" : idx === 1 ? "bg-gray-400" : "bg-purple-900"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="font-semibold text-sm">
                        <Link to={`/employees`} className="hover:underline text-slate-800">
                          {u.name}
                        </Link>
                      </div>
                    </div>
                    <div className="text-base font-bold text-purple-600">{u.points}đ</div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Chiến Thần Bưng Hàng */}
        <Card id="report-top-carrying" className="cv-auto-card bg-gradient-to-br from-amber-50 to-orange-50 border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-amber-800 text-base font-bold">
              🛗 Chiến Thần Bưng Hàng
            </CardTitle>
            <CardDescription className="text-xs">
              Điểm bưng hàng (Tối thiểu 10đ)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.topCarrying.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Chưa có dữ liệu</p>
            ) : (
              report.topCarrying.map((u: any, idx: number) => {
                const prize = u.points > 50 ? "200K" : "100K";
                return (
                  <div key={u.id} className="flex items-center justify-between bg-white/80 p-2.5 rounded-lg shadow-sm border border-amber-100 relative overflow-hidden">
                    {idx === 0 && (
                      <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[9px] font-bold px-1.5 py-0.5 rounded-bl">
                        +{prize}
                      </div>
                    )}
                    <div className="flex items-center gap-2.5">
                      <div className={`flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white ${
                        idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-gray-400" : "bg-amber-900"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="font-semibold text-sm">
                        <Link to={`/employees`} className="hover:underline text-slate-800">
                          {u.name}
                        </Link>
                      </div>
                    </div>
                    <div className="text-base font-bold text-amber-600">{u.points}đ</div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* 🔥 SHAME SECTION: VIOLATIONS */}
      <Card id="report-violations" className="cv-auto-card border-red-100 shadow-sm bg-white">
        <CardHeader className="border-b bg-red-50/40 pb-3">
          <CardTitle className="text-red-700 flex items-center gap-2 text-base sm:text-lg font-bold">
            🚨 Báo cáo Vi Phạm (Đi muộn)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-sm text-left min-w-[550px]">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 sm:px-6 py-3 font-semibold">Nhân viên</th>
                  <th className="px-4 sm:px-6 py-3 text-center font-semibold">Số lần đi muộn</th>
                  <th className="px-4 sm:px-6 py-3 text-center font-semibold">Tổng phút muộn</th>
                  <th className="px-4 sm:px-6 py-3 text-right font-semibold">Đánh giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(Array.isArray(report.topLate) ? report.topLate : [])
                  .filter((u: any) => (u?.lateCount || 0) > 0)
                  .map((u: any, idx: number) => (
                    <tr key={u.user?.id || u.id || `late-${idx}`} className="cv-auto-table-row hover:bg-red-50/20 transition-colors">
                      <td className="px-4 sm:px-6 py-3.5 font-medium flex items-center gap-3">
                        <span className="text-red-500 font-bold shrink-0">⚠️</span>
                        <Link to={`/employees`} className="hover:underline text-slate-800 truncate">
                          {u.user?.name || u.name || "Nhân viên"}
                        </Link>
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 text-center">
                        <span className="font-bold text-red-600">{u.lateCount || 0}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 text-center">
                        <span className="text-red-600 font-mono font-semibold">{u.totalLateMinutes || 0}p</span>
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 text-right">
                        {(u.lateCount || 0) > 5 ? (
                          <Badge variant="destructive">Cảnh báo đỏ</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
                            Cần nhắc nhở
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                {(Array.isArray(report.topLate) ? report.topLate : []).filter((u: any) => (u?.lateCount || 0) > 0).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground italic">
                      👏 Tuyệt vời! Tháng này chưa có ai vi phạm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
