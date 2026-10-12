import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import {
  performCheckIn,
  getIPStatus,
  getTodayUserShiftDuties,
  toggleCompleteShiftDuty,
  ShiftDutyItem,
} from "@/lib/api-client";
import { useHomeCheckinStore } from "@/stores/useHomeCheckinStore";
import {
  LocationSecurityBanner,
  QuickTaskSummaryWidget,
  CheckinHistoryList,
  CheckinDutyModal,
  UncompletedDutiesModal,
  EarlyCheckoutModal,
} from "@/components/home";

export interface CheckInButtonsProps {
  userId: string;
  todayCheckins: any[];
  todayShift?: any;
  onCheckinSuccess?: (record?: any) => void;
}

export default function CheckInButtons({
  userId,
  todayCheckins = [],
  todayShift,
  onCheckinSuccess,
}: CheckInButtonsProps) {
  const {
    isCheckingIn,
    isCheckingOut,
    setIsCheckingIn,
    setIsCheckingOut,
    dutyModalOpen,
    setDutyModalOpen,
    uncompletedWarningOpen,
    setUncompletedWarningOpen,
    earlyCheckoutModalOpen,
    setEarlyCheckoutModalOpen,
    earlyCheckoutReason,
    setEarlyCheckoutReason,
  } = useHomeCheckinStore();

  const [ipStatus, setIpStatus] = useState<{ isAllowed: boolean; locationName: string; ip: string } | null>(null);
  const [todayDuties, setTodayDuties] = useState<ShiftDutyItem[]>([]);
  const loading = isCheckingIn || isCheckingOut;

  useEffect(() => {
    getIPStatus().then(setIpStatus).catch(() => {
      setIpStatus({ isAllowed: true, locationName: "LimArt Store (Văn phòng chính)", ip: "127.0.0.1" });
    });

    if (userId) {
      getTodayUserShiftDuties(userId).then((res) => {
        if (res.success && res.data) setTodayDuties(res.data);
      }).catch(() => {});
    }
  }, [userId]);

  const getCoordinates = async () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return undefined;
    return new Promise<{ lat: number; lng: number } | undefined>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(undefined),
        { timeout: 3000 }
      );
    }).catch(() => undefined);
  };

  const executeCheckIn = async (type: "checkin" | "checkout", note?: string) => {
    if (type === "checkin") setIsCheckingIn(true);
    else setIsCheckingOut(true);

    const coords = await getCoordinates();

    try {
      const result = await performCheckIn(userId, type, note, coords);
      if (result.success) {
        toast.success(result.message);
        setEarlyCheckoutReason("");
        if (type === "checkin") {
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
          const dutyRes = await getTodayUserShiftDuties(userId);
          const duties = dutyRes.success && Array.isArray(dutyRes.data) ? dutyRes.data : result.todayDuties || [];
          setTodayDuties(duties);
          if (duties.length > 0) setDutyModalOpen(true);
        } else {
          getTodayUserShiftDuties(userId).then((r) => r.success && setTodayDuties(r.data || []));
        }
        if (onCheckinSuccess) onCheckinSuccess(result.data);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Lỗi kết nối");
    } finally {
      setIsCheckingIn(false);
      setIsCheckingOut(false);
    }
  };

  const proceedWithCheckout = async () => {
    if (todayShift?.end && new Date() < new Date(todayShift.end)) {
      setEarlyCheckoutModalOpen(true);
      return;
    }
    await executeCheckIn("checkout");
  };

  const handleAction = async (type: "checkin" | "checkout") => {
    if (ipStatus && !ipStatus.isAllowed) {
      toast.error(`❌ IP không hợp lệ (${ipStatus.ip}).`, { description: "Vui lòng kết nối Wifi công ty." });
      return;
    }

    if (type === "checkin") {
      await executeCheckIn("checkin");
      return;
    }

    const uncompleted = todayDuties.filter((d) => !d.isCompleted);
    if (uncompleted.length > 0) {
      setUncompletedWarningOpen(true);
      return;
    }
    await proceedWithCheckout();
  };

  const confirmEarlyCheckout = () => {
    if (!earlyCheckoutReason.trim()) {
      toast.error("Vui lòng nhập lý do về sớm!");
      return;
    }
    setEarlyCheckoutModalOpen(false);
    executeCheckIn("checkout", earlyCheckoutReason);
  };

  const handleToggleDuty = async (dutyId: string) => {
    const res = await toggleCompleteShiftDuty(dutyId);
    if (res.success && res.data) {
      setTodayDuties((prev) =>
        prev.map((d) => (d.id === dutyId ? { ...d, isCompleted: res.data!.isCompleted } : d))
      );
      toast.success(res.data.isCompleted ? "✅ Đã hoàn thành nhiệm vụ!" : "Đã hủy đánh dấu hoàn thành");
    } else {
      toast.error(res.error || "Không thể cập nhật trạng thái");
    }
  };

  const uncompletedDuties = todayDuties.filter((d) => !d.isCompleted);

  return (
    <div className="space-y-4 w-full max-w-sm mx-auto">
      <LocationSecurityBanner ipStatus={ipStatus} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full">
        <Button
          onClick={() => handleAction("checkin")}
          disabled={loading}
          className="h-12 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition-all active:scale-98"
        >
          {isCheckingIn ? "⏳ Đang check-in..." : "📍 Vào Ca (Check-in)"}
        </Button>
        <Button
          onClick={() => handleAction("checkout")}
          disabled={loading}
          variant="outline"
          className="h-12 text-sm font-bold border-2 hover:bg-slate-50 shadow-xs cursor-pointer transition-all active:scale-98"
        >
          {isCheckingOut ? "⏳ Đang check-out..." : "👋 Tan Ca (Check-out)"}
        </Button>
      </div>

      <QuickTaskSummaryWidget todayDuties={todayDuties} onOpenDuties={() => setDutyModalOpen(true)} />

      {loading && (
        <div className="mt-4 text-center text-xs text-muted-foreground animate-pulse">
          Đang xử lý dữ liệu...
        </div>
      )}

      <CheckinHistoryList checkins={todayCheckins} />

      <CheckinDutyModal
        open={dutyModalOpen}
        onOpenChange={setDutyModalOpen}
        duties={todayDuties}
        onToggleDuty={handleToggleDuty}
      />

      <UncompletedDutiesModal
        open={uncompletedWarningOpen}
        onOpenChange={setUncompletedWarningOpen}
        uncompletedDuties={uncompletedDuties}
        onReviewDuties={() => {
          setUncompletedWarningOpen(false);
          setDutyModalOpen(true);
        }}
        onConfirmCheckout={() => {
          setUncompletedWarningOpen(false);
          proceedWithCheckout();
        }}
      />

      <EarlyCheckoutModal
        open={earlyCheckoutModalOpen}
        onOpenChange={setEarlyCheckoutModalOpen}
        shiftEnd={todayShift?.end}
        reason={earlyCheckoutReason}
        onReasonChange={setEarlyCheckoutReason}
        onConfirm={confirmEarlyCheckout}
      />
    </div>
  );
}
