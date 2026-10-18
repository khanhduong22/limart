import React, { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, RefreshCw } from "lucide-react";
import { useRouter } from "@/lib/router";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import {
  useStaffScheduleStore,
  ShiftItem,
} from "@/stores/useStaffScheduleStore";
import {
  DAY_NAMES,
  getMonday,
  formatShiftLabel,
} from "./schedule-utils";
const ShiftDetailsModal = React.lazy(() =>
  import("./ShiftDetailsModal").then((m) => ({ default: m.ShiftDetailsModal }))
);
const ShiftSwapModal = React.lazy(() =>
  import("./ShiftSwapModal").then((m) => ({ default: m.ShiftSwapModal }))
);
const ShiftRegisterModal = React.lazy(() =>
  import("./ShiftRegisterModal").then((m) => ({ default: m.ShiftRegisterModal }))
);

interface ScheduleClientProps {
  shifts: any[];
  currentUserId?: string;
  viewDate?: Date;
  onMonthChange?: (date: Date) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export default function ScheduleClient({
  shifts = [],
  currentUserId,
  viewDate = new Date(),
  onMonthChange,
  onRefresh,
  isLoading = false,
}: ScheduleClientProps) {
  const router = useRouter();

  const {
    weekStart,
    selectedDate,
    isSwapModalOpen,
    swapTargetShift,
    isRegisterModalOpen,
    isSubmitting,
    setWeekStart,
    openDateDetails,
    closeDateDetails,
    openSwapModal,
    closeSwapModal,
    setIsSubmitting,
    setShowAddForm,
  } = useStaffScheduleStore();

  useEffect(() => {
    if (viewDate) {
      setWeekStart(getMonday(viewDate));
    }
  }, [viewDate, setWeekStart]);

  // 7 days of the week starting from Monday (T2) down to Sunday (CN)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekEnd = weekDays[6];
  const todayMonday = getMonday(new Date());
  const nextWeekMonday = new Date(todayMonday);
  nextWeekMonday.setDate(nextWeekMonday.getDate() + 7);

  const isCurrentWeek = weekStart.toDateString() === todayMonday.toDateString();
  const isNextWeek = weekStart.toDateString() === nextWeekMonday.toDateString();

  const safeShifts = Array.isArray(shifts) ? shifts : [];

  // Strict privacy: Staff only sees their own registered shifts
  const getMyShiftsForDate = (date: Date) => {
    return safeShifts.filter((s) => {
      if (!s) return false;
      if (s.userId !== currentUserId && s.user?.id !== currentUserId) return false;
      const rawDate = s.start || s.date;
      if (!rawDate) return false;
      const d = new Date(rawDate);
      return (
        d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate()
      );
    });
  };

  const handlePrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
    if (onMonthChange && prev.getMonth() !== weekStart.getMonth()) {
      onMonthChange(prev);
    }
  };

  const handleNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
    if (onMonthChange && next.getMonth() !== weekStart.getMonth()) {
      onMonthChange(next);
    }
  };

  const handleTodayWeek = () => {
    setWeekStart(todayMonday);
    if (onMonthChange && todayMonday.getMonth() !== weekStart.getMonth()) {
      onMonthChange(todayMonday);
    }
  };

  const handleJumpNextWeek = () => {
    setWeekStart(nextWeekMonday);
    if (onMonthChange && nextWeekMonday.getMonth() !== weekStart.getMonth()) {
      onMonthChange(nextWeekMonday);
    }
  };

  const handleOpenDate = (date: Date) => {
    openDateDetails(date);
  };

  const handleRegister = async () => {
    if (!selectedDate) return;
    const store = useStaffScheduleStore.getState();
    const startTime = `${store.startHour}:${store.startMinute}`;
    const endTime = `${store.endHour}:${store.endMinute}`;

    if (!startTime || !endTime) {
      toast.error("Vui lòng chọn giờ bắt đầu và kết thúc");
      return;
    }
    const [sH, sM] = startTime.split(":").map(Number);
    const [eH, eM] = endTime.split(":").map(Number);
    if (eH * 60 + eM <= sH * 60 + sM) {
      toast.error("Giờ kết thúc phải sau giờ bắt đầu!");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: selectedDate.toISOString(),
          startTime,
          endTime,
          shift: store.activePreset || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success("Đăng ký giờ làm thành công!");
        setShowAddForm(false);
        if (onRefresh) onRefresh();
      } else {
        toast.error(json.error || "Không thể đăng ký ca làm");
      }
    } catch {
      toast.error("Lỗi kết nối khi đăng ký");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelShift = async (shiftId: number | string) => {
    if (!confirm("Bạn có chắc chắn muốn hủy ca làm việc này?")) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch("/api/staff/schedule/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shiftId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Đã hủy ca làm việc.");
        if (onRefresh) onRefresh();
      } else {
        toast.error(json.error || "Không thể hủy ca");
      }
    } catch {
      toast.error("Lỗi kết nối khi hủy ca");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Selected date shifts (only for current user)
  const selectedMyShifts: ShiftItem[] = selectedDate ? getMyShiftsForDate(selectedDate) : [];

  return (
    <div className="space-y-3">
      {/* Header with Back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="h-8 w-8 rounded-full hover:bg-orange-100 text-stone-700 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-bold text-stone-900 tracking-tight">
            Lịch Làm Việc & Ca Trực
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/requests")}
            className="h-7 sm:h-8 text-[11px] sm:text-xs px-2 sm:px-2.5 rounded-full border-amber-300 bg-amber-50/80 hover:bg-amber-100 text-amber-900 font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
          >
            <span>📝</span> Xin giải trình
          </Button>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7 w-7 rounded-full text-stone-500 hover:text-amber-800"
              title="Làm mới lịch trực"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Weekly Vertical Schedule Card */}
      <Card className="rounded-3xl shadow-sm border border-orange-100/90 dark:border-stone-800 overflow-hidden bg-white/95 dark:bg-stone-900/90 backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between py-2.5 px-3 bg-orange-50/70 dark:bg-stone-800/60 border-b border-orange-100/70 dark:border-stone-800 gap-2">
          <Button
            variant={isCurrentWeek ? "default" : "outline"}
            size="sm"
            onClick={handleTodayWeek}
            className={`h-8 text-xs px-2.5 sm:px-3 rounded-xl font-bold cursor-pointer transition-all ${
              isCurrentWeek
                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
                : "border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            Tuần này
          </Button>

          <div className="text-center px-1">
            <CardTitle className="text-xs sm:text-sm font-black text-stone-900 dark:text-stone-100 tracking-tight whitespace-nowrap">
              {weekStart.getDate()}/{weekStart.getMonth() + 1} - {weekEnd.getDate()}/{weekEnd.getMonth() + 1}/{weekEnd.getFullYear()}
            </CardTitle>
          </div>

          <Button
            variant={isNextWeek ? "default" : "outline"}
            size="sm"
            onClick={handleJumpNextWeek}
            className={`h-8 text-xs px-2.5 sm:px-3 rounded-xl font-bold cursor-pointer transition-all ${
              isNextWeek
                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
                : "border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            Tuần sau
          </Button>
        </CardHeader>

        <CardContent className="p-2.5 sm:p-3 space-y-2">
          {weekDays.map((d, idx) => {
            const dayInfo = DAY_NAMES[idx];
            const myShifts = getMyShiftsForDate(d);
            const isToday = new Date().toDateString() === d.toDateString();
            const hasShift = myShifts.length > 0;

            return (
              <div
                key={d.toISOString()}
                onClick={() => handleOpenDate(d)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer select-none active:scale-[0.99] flex items-center justify-between gap-3 ${
                  isToday
                    ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-400/80 dark:border-amber-700/80 ring-1 ring-amber-400/40 shadow-xs"
                    : hasShift
                    ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/90 dark:border-emerald-800/80 hover:border-emerald-300"
                    : "bg-[#fdfbf9] dark:bg-stone-900/60 border-stone-200/80 dark:border-stone-800/80 hover:bg-stone-50/80 dark:hover:bg-stone-800/50"
                }`}
              >
                {/* Left: Day info */}
                {/* Left: Date badge + Day name */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-black shrink-0 shadow-xs transition-transform active:scale-95 ${
                      dayInfo.color
                    } ${
                      isToday
                        ? "ring-2 ring-offset-2 ring-amber-400 dark:ring-offset-stone-900"
                        : ""
                    }`}
                  >
                    <span className="text-lg sm:text-2xl font-black leading-none tracking-tight">
                      {d.getDate()}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                      <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                        {dayInfo.full}
                      </span>
                      <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 whitespace-nowrap">
                        ({dayInfo.short})
                      </span>
                      {isToday && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-500 text-white leading-tight shrink-0 whitespace-nowrap">
                          Hôm nay
                        </span>
                      )}
                    </div>

                    {!hasShift && (
                      <p className="text-[11px] text-stone-400 dark:text-stone-500 italic mt-0.5 truncate">
                        Chưa đăng ký ca
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Shifts list or Register action */}
                <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                  {hasShift ? (
                    <div className="flex flex-col items-end gap-1">
                      {myShifts.map((s, sIdx) => {
                        const shiftText = s.start && s.end
                          ? `${new Date(s.start).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })} - ${new Date(s.end).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : formatShiftLabel(s.shiftType || s.shift);
                        return (
                          <div
                            key={s.id || sIdx}
                            className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-bold bg-emerald-600 text-white shadow-2xs whitespace-nowrap"
                          >
                            <Clock className="w-3 h-3 text-emerald-200 shrink-0" />
                            <span>{shiftText}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-bold px-2.5 sm:px-3 rounded-xl border-amber-300 dark:border-amber-700/80 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100/60 cursor-pointer shadow-2xs shrink-0 whitespace-nowrap"
                    >
                      + Đăng ký ca
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Week Navigation under Sunday */}
          <div className="flex items-center justify-center gap-4 pt-3 pb-1 border-t border-stone-200/60 dark:border-stone-800">
            <Button
              variant="outline"
              onClick={handlePrevWeek}
              className="h-11 w-20 sm:w-24 rounded-2xl border-stone-300 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/80 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 cursor-pointer shadow-xs active:scale-95 transition-all p-0 flex items-center justify-center"
              title="Tuần trước"
            >
              <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
            </Button>

            <Button
              variant="outline"
              onClick={handleNextWeek}
              className="h-11 w-20 sm:w-24 rounded-2xl border-stone-300 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/80 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 cursor-pointer shadow-xs active:scale-95 transition-all p-0 flex items-center justify-center"
              title="Tuần sau"
            >
              <ChevronRight className="h-6 w-6 stroke-[2.5]" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Date Detail / Registration Modal */}
      <React.Suspense fallback={null}>
        <ShiftDetailsModal
          selectedDate={selectedDate}
          myShifts={selectedMyShifts}
          isSubmitting={isSubmitting}
          onClose={closeDateDetails}
          onCancelShift={handleCancelShift}
          onRegisterShift={handleRegister}
          onOpenSwap={(shift) => openSwapModal(shift)}
        />
      </React.Suspense>

      {/* Shift Swap Modal */}
      <React.Suspense fallback={null}>
        <ShiftSwapModal
          isOpen={isSwapModalOpen}
          shift={swapTargetShift}
          onClose={closeSwapModal}
          onSuccess={() => {
            if (onRefresh) onRefresh();
          }}
        />
      </React.Suspense>

      {/* Direct Shift Register Modal */}
      <React.Suspense fallback={null}>
        <ShiftRegisterModal
          isOpen={isRegisterModalOpen}
          selectedDate={selectedDate}
          onClose={() => useStaffScheduleStore.getState().closeRegisterModal()}
          onSuccess={() => {
            if (onRefresh) onRefresh();
          }}
        />
      </React.Suspense>
    </div>
  );
}
