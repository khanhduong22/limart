import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
} from "./home";

const CheckinDutyModal = lazy(() =>
  import("./home").then((m) => ({ default: m.CheckinDutyModal }))
);
const UncompletedDutiesModal = lazy(() =>
  import("./home").then((m) => ({ default: m.UncompletedDutiesModal }))
);
const EarlyCheckoutModal = lazy(() =>
  import("./home").then((m) => ({ default: m.EarlyCheckoutModal }))
);

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
  const [optimisticCheckin, setOptimisticCheckin] = useState<any | null>(null);
  const loading = isCheckingIn || isCheckingOut;

  const cachedCoordsRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);

  // Merge optimistic checkin with parent todayCheckins
  const effectiveCheckins =
    optimisticCheckin && !todayCheckins.some((c) => c.id === optimisticCheckin.id)
      ? [...todayCheckins, optimisticCheckin]
      : todayCheckins;

  // Deterministic latest checkin calculation (independent of ASC/DESC ordering)
  const lastCheckin =
    effectiveCheckins.length > 0
      ? effectiveCheckins.reduce((latest, item) =>
          new Date(item.timestamp).getTime() >= new Date(latest.timestamp).getTime()
            ? item
            : latest
        )
      : null;

  const isWorking = lastCheckin?.type === "checkin";

  // Silent Geolocation Pre-Warm
  useEffect(() => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      try {
        navigator.geolocation.getCurrentPosition(
          (p) => {
            cachedCoordsRef.current = {
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              ts: Date.now(),
            };
          },
          () => {},
          { maximumAge: 60000, timeout: 2500, enableHighAccuracy: false }
        );
      } catch {}
    }
  }, []);

  // IP status refresh on mount & network/focus change
  useEffect(() => {
    const refreshIP = () => {
      getIPStatus()
        .then(setIpStatus)
        .catch(() => {
          setIpStatus({ isAllowed: true, locationName: "LimArt Store (Văn phòng chính)", ip: "127.0.0.1" });
        });
    };

    refreshIP();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIP();
      }
    };

    window.addEventListener("focus", refreshIP);
    window.addEventListener("online", refreshIP);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshIP);
      window.removeEventListener("online", refreshIP);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Fetch shift duties
  useEffect(() => {
    if (userId) {
      getTodayUserShiftDuties(userId)
        .then((res) => {
          if (res.success && res.data) setTodayDuties(res.data);
        })
        .catch(() => {});
    }
  }, [userId]);

  const getCoordinates = async () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return undefined;

    if (cachedCoordsRef.current && Date.now() - cachedCoordsRef.current.ts < 120000) {
      return { lat: cachedCoordsRef.current.lat, lng: cachedCoordsRef.current.lng };
    }

    return new Promise<{ lat: number; lng: number } | undefined>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const coords = { lat: p.coords.latitude, lng: p.coords.longitude };
          cachedCoordsRef.current = { ...coords, ts: Date.now() };
          resolve(coords);
        },
        () => resolve(undefined),
        { maximumAge: 60000, timeout: 1200, enableHighAccuracy: false }
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
        if (result.data) {
          setOptimisticCheckin(result.data);
        }
        if (onCheckinSuccess) {
          onCheckinSuccess(result.data);
        }
        toast.success(result.message);
        setEarlyCheckoutReason("");

        if (type === "checkin") {
          const duties = result.todayDuties || [];
          setTodayDuties(duties);
          if (duties.length > 0) setDutyModalOpen(true);

          import("canvas-confetti")
            .then((m) => {
              const confetti = m.default;
              confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
            })
            .catch(() => {});
        } else {
          if (result.todayDuties) {
            setTodayDuties(result.todayDuties);
          }
        }
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
    // Refresh IP status in background without hard blocking
    if (ipStatus && !ipStatus.isAllowed) {
      getIPStatus().then(setIpStatus).catch(() => {});
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

      <div className="w-full">
        {!isWorking ? (
          <Button
            onClick={() => handleAction("checkin")}
            disabled={loading}
            className="w-full h-12 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition-all active:scale-98"
          >
            {isCheckingIn ? "⏳ Đang check-in..." : "📍 Vào Ca (Check-in)"}
          </Button>
        ) : (
          <Button
            onClick={() => handleAction("checkout")}
            disabled={loading}
            className="w-full h-12 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer transition-all active:scale-98"
          >
            {isCheckingOut ? "⏳ Đang check-out..." : "👋 Tan Ca (Check-out)"}
          </Button>
        )}
      </div>

      <QuickTaskSummaryWidget todayDuties={todayDuties} onOpenDuties={() => setDutyModalOpen(true)} />

      {loading && (
        <div className="mt-4 text-center text-xs text-muted-foreground animate-pulse">
          Đang xử lý dữ liệu...
        </div>
      )}

      <CheckinHistoryList checkins={effectiveCheckins} />

      {dutyModalOpen && (
        <Suspense fallback={null}>
          <CheckinDutyModal
            open={dutyModalOpen}
            onOpenChange={setDutyModalOpen}
            duties={todayDuties}
            onToggleDuty={handleToggleDuty}
          />
        </Suspense>
      )}

      {uncompletedWarningOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {earlyCheckoutModalOpen && (
        <Suspense fallback={null}>
          <EarlyCheckoutModal
            open={earlyCheckoutModalOpen}
            onOpenChange={setEarlyCheckoutModalOpen}
            shiftEnd={todayShift?.end}
            reason={earlyCheckoutReason}
            onReasonChange={setEarlyCheckoutReason}
            onConfirm={confirmEarlyCheckout}
          />
        </Suspense>
      )}
    </div>
  );
}
