import React, { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Clock, Calendar, Banknote, Star, AlertTriangle, ChevronRight, Award } from "lucide-react";

const ManualCheckInForm = React.lazy(
  () => import("@/components/admin/ManualCheckInForm")
);

const EmployeeAttendanceTable = React.lazy(
  () => import("@/components/admin/employee-detail/EmployeeAttendanceTable")
);

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const now = new Date();
  const currentDefaultMonth = now.getMonth() + 1;
  const currentDefaultYear = now.getFullYear();

  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!, 10) : currentDefaultMonth;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : currentDefaultYear;

  const { data, error, isLoading, mutate } = useAdminQuery<{ success: boolean; data: { user: any; stats: any } }>(
    `/api/admin/employees/${id}?month=${month}&year=${year}`
  );

  const formatVND = (n: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-muted-foreground text-sm">
        Đang tải thông tin nhân viên...
      </div>
    );
  }

  if (error || !data?.data?.user) {
    return (
      <div className="space-y-4">
        <Link to="/employees">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Quay lại danh sách nhân viên
          </Button>
        </Link>
        <div className="text-center py-12 text-rose-500 font-medium">
          Không tìm thấy thông tin nhân viên!
        </div>
      </div>
    );
  }

  const { user, stats } = data.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 sm:p-5 rounded-2xl border border-slate-100 shadow-xs">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link to="/employees">
            <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl shrink-0">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
            </Button>
          </Link>
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-900 font-extrabold text-base sm:text-lg border border-amber-200 uppercase shrink-0 overflow-hidden">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name}
                width="128"
                height="128"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover rounded-2xl"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.endsWith("/icons/capy_dashboard.webp")) {
                    target.src = "/icons/capy_dashboard.webp";
                  }
                }}
              />
            ) : (
              user.name?.[0] || "?"
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-1.5 sm:gap-2 text-slate-900 flex-wrap">
              <span className="truncate">{user.name}</span>
              {user.role === "ADMIN" && <Badge className="bg-amber-500 text-white text-[10px]">Admin</Badge>}
              {user.role === "PARTNER" && <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-[10px]">Đối tác WFH</Badge>}
              <Badge variant="outline" className="text-[10px]">{user.employmentType === "FULL_TIME" ? "Toàn thời gian" : "Bán thời gian"}</Badge>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{user.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="w-full sm:w-40 bg-slate-50 rounded-xl border border-slate-200">
            <Select
              value={`${year}-${month}`}
              onValueChange={(val) => {
                const [y, m] = val.split("-");
                setSearchParams({ month: m, year: y });
              }}
            >
              <SelectTrigger className="border-0 focus:ring-0 font-medium text-xs h-9 min-h-[38px]">
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
          <Link to={`/payroll/${user.id}?month=${month}&year=${year}`} className="flex-1 sm:flex-initial">
            <Button variant="outline" size="sm" className="w-full h-9 min-h-[38px] gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50">
              💰 Xem Lương
            </Button>
          </Link>
          <Link to="/schedule" className="flex-1 sm:flex-initial">
            <Button variant="outline" size="sm" className="w-full h-9 min-h-[38px] gap-1.5 border-blue-300 text-blue-800 hover:bg-blue-50">
              📅 Xem Lịch
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-blue-50/50 to-indigo-50/30 border-blue-100">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-blue-700 uppercase">Tổng Công</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats?.daysWorked || 0} ngày</div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-muted-foreground">{(stats?.totalHours || 0).toFixed(1)} giờ làm</span>
              {stats?.lateCount && stats.lateCount > 0 ? (
                <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-bold">
                  ⚠️ Trễ {stats.lateCount} lần
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border-emerald-100">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-emerald-700 uppercase">Lương Tạm Tính</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatVND(stats?.totalSalary || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Lương cơ bản: {formatVND(stats?.baseSalary || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50/50 to-orange-50/30 border-amber-100">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-amber-700 uppercase">Thưởng / Phạt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(stats?.totalAdjustments || 0) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
              {(stats?.totalAdjustments || 0) > 0 ? "+" : ""}
              {formatVND(stats?.totalAdjustments || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {user.adjustments?.length || 0} khoản điều chỉnh
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50/50 to-pink-50/30 border-purple-100">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-purple-700 uppercase">Thành Tích</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">{user.achievements?.length || 0}</div>
            <div className="flex gap-1 mt-1 overflow-x-auto">
              {user.achievements?.slice(0, 5).map((a: any) => (
                <span key={a.id} title={a.code} className="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                  {a.code === "LUCKY_STAR" ? "🌟" : "🏆"}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Column: Work History & Manual Checkin */}
        <div className="md:col-span-2 space-y-6">
          <React.Suspense fallback={null}>
            <ManualCheckInForm userId={user.id} onSuccess={() => mutate()} />
          </React.Suspense>

          <React.Suspense
            fallback={
              <div className="h-96 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
                Đang tải bảng chấm công chi tiết...
              </div>
            }
          >
            <EmployeeAttendanceTable month={month} year={year} dailyDetails={stats?.dailyDetails} />
          </React.Suspense>
        </div>

        {/* Side Column: Adjustments & Requests */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">Lịch sử Thưởng / Phạt</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {!user.adjustments || user.adjustments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Chưa có giao dịch thưởng phạt nào.</p>
              ) : (
                user.adjustments.map((adj: any) => (
                  <div key={adj.id} className="flex justify-between items-start border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <div>
                      <p className="font-semibold text-xs text-slate-800">{adj.reason}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(adj.date).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                    <div className={`font-bold text-xs ${adj.amount > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {adj.amount > 0 ? "+" : ""}
                      {formatVND(adj.amount)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">Đơn Nghỉ Phép / Yêu Cầu</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {!user.requests || user.requests.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Chưa có đơn nghỉ phép nào.</p>
              ) : (
                user.requests.map((req: any) => (
                  <div key={req.id} className="border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] font-semibold">
                        {req.type}
                      </Badge>
                      <Badge
                        className={`text-[10px] ${
                          req.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800"
                            : req.status === "REJECTED"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {req.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-700 mt-1 font-medium">{req.reason}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Ngày: {new Date(req.date).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
export default EmployeeDetailPage;
