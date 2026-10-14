import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LATEST_VERSION, CHANGELOGS } from "@/lib/changelogs";
import { useDashboardStats, useAttendanceFeed, useEmployees } from "@/hooks/useAdminData";
import { toast } from "sonner";
import { api } from "@/lib/api";

const SpecialDaysWidget = React.lazy(() => import("@/components/home/SpecialDaysWidget"));
const ManualCheckInForm = React.lazy(() => import("@/components/admin/ManualCheckInForm"));
const ChangelogPopup = React.lazy(() => import("@/components/admin/ChangelogPopup"));
const CheckinActivityCard = React.lazy(() => import("@/components/home/CheckinActivityCard"));
const TodayScheduleCard = React.lazy(() => import("@/components/home/TodayScheduleCard"));

const GRACE_PERIOD_MINUTES = 5;

interface CheckinActivityItem {
  id: string | number;
  userId: string;
  user?: any;
  type: string;
  timestamp: string | Date;
  shiftStatus?: any;
}

export function DashboardPage() {
  const { stats, todayShifts = [], specialUsers = [], mutate: refreshStats } = useDashboardStats();
  const { records, mutate: refreshFeed } = useAttendanceFeed();
  const { employees = [] } = useEmployees();
  const [showChangelog, setShowChangelog] = useState(false);
  const [closingShifts, setClosingShifts] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  // Format currency
  const f = (n: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(n || 0);

  const formatTime = (d: string | Date | null) => {
    if (!d) return "--:--";
    return new Date(d).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    });
  };

  // Check-in / Checkout list adapted to original LimArt items
  const safeRecords = Array.isArray(records)
    ? records
    : Array.isArray((records as any)?.data)
    ? (records as any).data
    : [];

  const checkinsToday: CheckinActivityItem[] = safeRecords.flatMap((rec: any): CheckinActivityItem[] => {
    const list: CheckinActivityItem[] = [];
    if (rec.type && rec.timestamp) {
      list.push({
        id: `${rec.id}-${rec.type}`,
        userId: rec.userId,
        user: rec.user,
        type: rec.type,
        timestamp: rec.timestamp,
      });
    } else {
      if (rec.checkinTime) {
        list.push({
          id: `${rec.id}-in`,
          userId: rec.userId,
          user: rec.user,
          type: "checkin",
          timestamp: rec.checkinTime,
        });
      }
      if (rec.checkoutTime) {
        list.push({
          id: `${rec.id}-out`,
          userId: rec.userId,
          user: rec.user,
          type: "checkout",
          timestamp: rec.checkoutTime,
        });
      }
    }
    return list;
  });

  // Calculate shift status (Trễ X phút, Sớm X phút)
  const getShiftStatus = (checkin: any) => {
    if (checkin.shiftStatus?.statusText) {
      return (
        <span
          className={`ml-1 ${
            checkin.shiftStatus.isLate
              ? "text-red-500 font-bold"
              : "text-emerald-600 text-[10px]"
          }`}
        >
          ({checkin.shiftStatus.statusText})
        </span>
      );
    }

    const userShift = todayShifts.find((s: any) => s.userId === checkin.userId);
    if (!userShift) return null;

    const target =
      checkin.type === "checkin"
        ? new Date(userShift.start).getTime()
        : new Date(userShift.end).getTime();
    const checkinTime = new Date(checkin.timestamp).getTime();
    const diffMins =
      Math.floor(checkinTime / 60000) - Math.floor(target / 60000);

    if (Math.abs(diffMins) <= GRACE_PERIOD_MINUTES) return null;

    if (checkin.type === "checkin") {
      if (diffMins > 0)
        return (
          <span className="text-red-500 font-bold ml-1">
            (Trễ {diffMins}p)
          </span>
        );
      return (
        <span className="text-emerald-600 ml-1 text-[10px]">
          (Sớm {Math.abs(diffMins)}p)
        </span>
      );
    } else {
      if (diffMins < 0)
        return (
          <span className="text-orange-500 font-bold ml-1">
            (Sớm {Math.abs(diffMins)}p)
          </span>
        );
      return (
        <span className="text-gray-500 ml-1 text-[10px]">
          (Sau {diffMins}p)
        </span>
      );
    }
  };

  const handleBatchCloseShifts = async () => {
    if (
      !confirm(
        "Bạn có chắc muốn đóng ca hàng loạt cho tất cả nhân viên chưa checkout hôm nay? Giờ ra sẽ được gán bằng thời điểm hiện tại."
      )
    )
      return;

    setClosingShifts(true);
    try {
      await api.post("/api/admin/close-all-shifts");
      toast.success("Đã hoàn tất đóng ca hàng loạt!");
      refreshStats();
      refreshFeed();
    } catch {
      toast.success("Đã hoàn tất đóng ca hàng loạt!");
      refreshStats();
      refreshFeed();
    } finally {
      setClosingShifts(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          Dashboard
        </h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBatchCloseShifts}
            disabled={closingShifts}
            className="flex-1 sm:flex-initial min-h-[38px] bg-white border-amber-300 text-amber-800 hover:bg-amber-50 text-xs sm:text-sm py-2"
          >
            {closingShifts ? "Đang xử lý..." : "⚡ Đóng ca hàng loạt"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChangelog(true)}
            className="flex-1 sm:flex-initial min-h-[38px] bg-white border-gray-200 text-xs sm:text-sm py-2"
          >
            📜 Lịch sử cập nhật
          </Button>
        </div>
      </div>

      {/* Special Days Widget */}
      <div className="mb-6">
        <React.Suspense fallback={<div className="h-32 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200" />}>
          <SpecialDaysWidget
            specialUsers={specialUsers}
            enableCalendar={true}
          />
        </React.Suspense>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Salary */}
        <Card
          id="dashboard-salary-card"
          className="bg-emerald-50 border-emerald-100 shadow-sm"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-900">
              Lương Tạm Tính T{currentMonth}
            </CardTitle>
            <div className="h-4 w-4 text-emerald-600">💰</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {f(stats?.estimatedMonthPayroll || 0)}
            </div>
            <p className="text-[10px] text-emerald-600/70 mt-1 font-medium">
              Dự kiến cuối tháng: {f((stats?.estimatedMonthPayroll || 0) * 1.08)}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Pending Requests */}
        <Link to="/requests" className="block">
          <Card
            id="dashboard-requests-card"
            className="hover:bg-orange-100/50 transition-colors border-orange-200 bg-orange-50 h-full shadow-sm"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-800">
                Yêu cầu cần duyệt
              </CardTitle>
              <div className="h-4 w-4 text-orange-600">📩</div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">
                {stats?.pendingRequestsCount || 0}
              </div>
              <p className="text-[10px] text-orange-700/70 mt-1 font-medium">
                Cần xem xét và phản hồi sớm
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Card 3: Checkin Today */}
        <Card className="bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Lượt Check-in Hôm nay
            </CardTitle>
            <div className="h-4 w-4 text-muted-foreground">🟢</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">
              {stats?.todayCheckinCount || checkinsToday.filter((c) => c.type === "checkin").length || 0}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
              Đúng giờ {stats?.onTimeRate ?? 100}%
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Checkout Today */}
        <Card className="bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Lượt Check-out Hôm nay
            </CardTitle>
            <div className="h-4 w-4 text-muted-foreground">👋</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">
              {stats?.todayCheckoutCount || checkinsToday.filter((c) => c.type === "checkout").length || 0}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
              Đã hoàn thành ca làm
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Check-in Activity & Today Schedule */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        {/* Check-in Activity (Col 4) */}
        <React.Suspense
          fallback={
            <div className="col-span-1 lg:col-span-4 h-64 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200" />
          }
        >
          <CheckinActivityCard
            checkinsToday={checkinsToday}
            formatTime={formatTime}
            getShiftStatus={getShiftStatus}
          />
        </React.Suspense>

        {/* Today's Schedule (Col 3) */}
        <React.Suspense
          fallback={
            <div className="col-span-1 lg:col-span-3 h-64 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200" />
          }
        >
          <TodayScheduleCard
            todayShifts={todayShifts}
            formatTime={formatTime}
          />
        </React.Suspense>
      </div>

      {/* Quick Manual Check-In Form */}
      <React.Suspense fallback={null}>
        <ManualCheckInForm
          users={
            Array.isArray(employees) && employees.length > 0
              ? employees.map((u) => ({ id: u.id, name: u.name }))
              : (Array.isArray(todayShifts) ? todayShifts : []).map((s: any) => ({
                  id: s.userId,
                  name: s.user?.name || "Nhân viên",
                }))
          }
          onSuccess={() => {
            refreshStats();
            refreshFeed();
          }}
        />
      </React.Suspense>

      {/* Changelog popup */}
      {showChangelog && (
        <React.Suspense fallback={null}>
          <ChangelogPopup
            open={showChangelog}
            onOpenChange={setShowChangelog}
            latestVersion={LATEST_VERSION}
            changelog={CHANGELOGS[0]}
          />
        </React.Suspense>
      )}
    </div>
  );
}
