import React, { useState, useEffect } from "react";
import { Clock, Timer, CheckCircle, ArrowRight } from "lucide-react";

export interface CheckinTimerCardProps {
  todayCheckins?: any[];
  todayShift?: any;
}

function formatDuration(totalSeconds: number): {
  hours: string;
  minutes: string;
  seconds: string;
} {
  const safeSeconds = Math.max(0, totalSeconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return {
    hours: String(h).padStart(2, "0"),
    minutes: String(m).padStart(2, "0"),
    seconds: String(s).padStart(2, "0"),
  };
}

export const CheckinTimerCard: React.FC<CheckinTimerCardProps> = ({
  todayCheckins = [],
  todayShift,
}) => {
  const lastCheckin = todayCheckins.length > 0 ? todayCheckins[todayCheckins.length - 1] : null;
  const isWorking = lastCheckin?.type === "checkin";

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!isWorking || !lastCheckin?.timestamp) {
      setElapsedSeconds(0);
      return;
    }

    const startTime = new Date(lastCheckin.timestamp).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diffInSeconds = Math.floor((now - startTime) / 1000);
      setElapsedSeconds(diffInSeconds > 0 ? diffInSeconds : 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isWorking, lastCheckin?.timestamp]);

  if (!isWorking) {
    if (todayCheckins.length > 0 && lastCheckin?.type === "checkout") {
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Đã hoàn thành ca làm</p>
              <p className="text-[11px] text-slate-500">
                Check-out lúc:{" "}
                {new Date(lastCheckin.timestamp).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
            Nghỉ ngơi
          </span>
        </div>
      );
    }

    return null;
  }

  const checkinTimeFormatted = lastCheckin?.timestamp
    ? new Date(lastCheckin.timestamp).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";

  const getEstimatedCheckout = () => {
    if (todayShift?.end) {
      try {
        return new Date(todayShift.end).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {}
    }
    if (lastCheckin?.timestamp) {
      const estimated = new Date(new Date(lastCheckin.timestamp).getTime() + 8 * 3600 * 1000);
      return estimated.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return "--:--";
  };

  const { hours, minutes, seconds } = formatDuration(elapsedSeconds);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 shadow-md border border-emerald-500/30 space-y-3 animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b border-emerald-400/30 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-100 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" />
            Thời gian làm việc ca này
          </span>
        </div>
        <span className="text-[11px] font-semibold bg-emerald-500/40 text-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300/30">
          Trực tiếp
        </span>
      </div>

      <div className="flex items-center justify-center py-1">
        <div className="flex items-baseline gap-1.5 font-mono text-center">
          <div className="bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-400/20">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">{hours}</span>
            <span className="text-[10px] block text-emerald-200 uppercase font-sans font-medium">Giờ</span>
          </div>
          <span className="text-2xl font-bold text-emerald-200 animate-pulse">:</span>
          <div className="bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-400/20">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">{minutes}</span>
            <span className="text-[10px] block text-emerald-200 uppercase font-sans font-medium">Phút</span>
          </div>
          <span className="text-2xl font-bold text-emerald-200 animate-pulse">:</span>
          <div className="bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-400/20">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-200">{seconds}</span>
            <span className="text-[10px] block text-emerald-200 uppercase font-sans font-medium">Giây</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-400/30 text-xs">
        <div className="flex items-center gap-1.5 text-emerald-100">
          <Clock className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <div>
            <span className="text-[10px] text-emerald-200/80 block leading-none">Vào ca lúc:</span>
            <strong className="text-white text-xs">{checkinTimeFormatted}</strong>
          </div>
        </div>
        <div className="flex items-center gap-1.5 justify-end text-emerald-100 text-right">
          <div>
            <span className="text-[10px] text-emerald-200/80 block leading-none">Dự kiến tan:</span>
            <strong className="text-white text-xs">{getEstimatedCheckout()}</strong>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
        </div>
      </div>
    </div>
  );
};

export default CheckinTimerCard;
