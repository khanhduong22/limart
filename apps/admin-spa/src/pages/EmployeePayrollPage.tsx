import React from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, DollarSign, Clock, Calendar, Gift, Download, User } from "lucide-react";
import { exportSingleEmployeeXLSX } from "@/lib/payrollExport";
import { toast } from "sonner";
import { SendPayslipButton } from "@/components/admin/SendPayslipButton";

export function EmployeePayrollPage() {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!, 10) : currentMonth;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : currentYear;

  const { data, error, isLoading, mutate } = useAdminQuery<{
    success: boolean;
    data: { user: any; period: any; payslip: any; stats: any; isClosed: boolean };
  }>(`/api/admin/payroll/${userId}?month=${month}&year=${year}`);

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
        Đang tải bảng lương nhân viên...
      </div>
    );
  }

  if (error || !data?.data?.user) {
    return (
      <div className="space-y-4">
        <Link to="/payroll">
          <Button variant="ghost" size="sm" className="gap-2">
            <ChevronLeft className="h-4 w-4" /> Quay lại Quản lý Lương
          </Button>
        </Link>
        <div className="text-center py-12 text-rose-500 font-medium">
          Không tìm thấy thông tin bảng lương của nhân viên!
        </div>
      </div>
    );
  }

  const { user, stats, isClosed } = data.data;
  const displayTotal = isClosed && stats?.finalNet != null ? stats.finalNet : stats?.totalSalary || 0;
  const bonusAmount: number = stats?.bonusAmount || 0;

  const handleDownload = () => {
    try {
      exportSingleEmployeeXLSX(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          stats: {
            ...stats,
            employmentType: stats?.employmentType || user.employmentType,
            adjustments: stats?.adjustments || [],
          },
        } as any,
        month,
        year,
        isClosed ?? false
      );
      toast.success("Đã xuất phiếu lương Excel!");
    } catch (err: any) {
      toast.error("Lỗi khi xuất phiếu lương: " + (err?.message || ""));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 sm:p-5 rounded-2xl border border-slate-100 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/payroll">
            <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl shrink-0">
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold flex items-center gap-1.5 sm:gap-2 text-slate-900 flex-wrap">
              <span className="truncate">Chi tiết lương: {user.name}</span>
              {isClosed ? (
                <Badge className="bg-emerald-600 text-white text-[10px]">Đã chốt lương</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                  Tạm tính (Mở)
                </Badge>
              )}
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
              <SelectTrigger className="border-0 focus:ring-0 font-medium text-xs h-10 sm:h-9">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="flex-1 sm:flex-initial h-10 sm:h-9 min-h-[38px] gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs"
          >
            <Download className="h-3.5 w-3.5" /> Xuất Excel
          </Button>
          <SendPayslipButton
            userId={user.id}
            month={month}
            year={year}
            emailSentAt={data?.data?.payslip?.emailSentAt}
            hasPayslip={Boolean(isClosed)}
            onSuccess={() => mutate()}
          />
          <Link to={`/employees/${user.id}`} className="flex-1 sm:flex-initial">
            <Button variant="outline" size="sm" className="w-full h-10 sm:h-9 min-h-[38px] gap-1.5 text-xs">
              <User className="h-3.5 w-3.5" /> Hồ Sơ
            </Button>
          </Link>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3 sm:p-4 bg-emerald-50/80 border-emerald-200">
          <div className="flex items-center gap-2 text-emerald-700 mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Thực lãnh ({month}/{year})</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-950">{formatVND(displayTotal)}</div>
          <p className="text-[11px] text-emerald-700 mt-1">
            Lương cứng: {formatVND(stats?.baseSalary || 0)}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Tổng giờ làm</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{(stats?.totalHours || 0).toFixed(1)}h</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {stats?.daysWorked || 0} ngày đi làm thực tế
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Thưởng / Phạt</span>
          </div>
          <div
            className={`text-2xl font-bold ${
              (stats?.totalAdjustments || 0) >= 0 ? "text-emerald-600" : "text-rose-500"
            }`}
          >
            {(stats?.totalAdjustments || 0) > 0 ? "+" : ""}
            {formatVND(stats?.totalAdjustments || 0)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Phạt đi muộn: {formatVND(stats?.latePenaltyAmount || 0)}
          </p>
        </Card>

        {isClosed && bonusAmount > 0 ? (
          <Card className="p-4 bg-blue-50/80 border-blue-200">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <Gift className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">
                Thưởng tháng ({stats.bonusPercent}%)
              </span>
            </div>
            <div className="text-2xl font-bold text-blue-800">+{formatVND(bonusAmount)}</div>
            <p className="text-[11px] text-blue-600 mt-1">Cộng thêm vào thực lãnh</p>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Đơn giá / giờ</span>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {formatVND(stats?.hourlyRate || user.hourlyRate || 25000)}/h
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {user.employmentType === "FULL_TIME" ? "Toàn thời gian" : "Part-time"}
            </p>
          </Card>
        )}
      </div>

      {/* Adjustments History */}
      <Card className="overflow-hidden">
        <CardHeader className="p-4 bg-slate-50/70 border-b">
          <CardTitle className="font-bold text-slate-800 text-sm">Lịch sử Thưởng / Phạt trong kỳ</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {!stats?.adjustments || stats.adjustments.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              Không có khoản thưởng/phạt nào trong tháng {month}/{year}.
            </div>
          ) : (
            <div className="space-y-3">
              {stats.adjustments.map((adj: any) => (
                <div
                  key={adj.id}
                  className="flex justify-between items-start border-b border-slate-100 pb-2.5 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-xs text-slate-800">{adj.reason}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(adj.date).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div
                    className={`font-bold text-xs ${
                      adj.amount > 0 ? "text-emerald-600" : "text-rose-500"
                    }`}
                  >
                    {adj.amount > 0 ? "+" : ""}
                    {formatVND(adj.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Shift Details */}
      <Card className="overflow-hidden">
        <CardHeader className="p-4 bg-slate-50/70 border-b">
          <CardTitle className="font-bold text-slate-800 text-sm">Chi tiết công theo từng ngày</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
            {!stats?.dailyDetails || stats.dailyDetails.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Chưa có dữ liệu chấm công tháng này.
              </div>
            ) : (
              <table className="w-full text-xs min-w-[500px]">
                <thead className="bg-slate-50 border-b text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="p-3 text-left">Ngày</th>
                    <th className="p-3 text-center">Vào</th>
                    <th className="p-3 text-center">Ra</th>
                    <th className="p-3 text-center">Giờ</th>
                    <th className="p-3 text-right">Lương</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.dailyDetails.map((day: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-3 font-medium text-slate-800">
                        {new Date(day.date).toLocaleDateString("vi-VN", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">
                        {day.checkIn
                          ? new Date(day.checkIn).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "--:--"}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">
                        {day.checkOut
                          ? new Date(day.checkOut).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "--:--"}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-blue-900">
                        {day.hours > 0 ? `${day.hours.toFixed(1)}h` : "-"}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">
                        {day.salary > 0 ? formatVND(day.salary) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
export default EmployeePayrollPage;
