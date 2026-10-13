import React, { useState, useEffect } from "react";
import { Link } from "@/lib/router";
import { StaffUser } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

export interface CheckinHeaderCardProps {
  user?: StaffUser;
  streak?: number;
  swapCount?: number;
  todayShift?: any;
  todayCheckins?: any[];
}

export const CheckinHeaderCard: React.FC<CheckinHeaderCardProps> = ({
  user,
  streak = 0,
  swapCount = 0,
  todayShift,
  todayCheckins = [],
}) => {
  const [currentDateTime, setCurrentDateTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) + " • " + now.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setCurrentDateTime(formatted);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const lastCheckin = todayCheckins.length > 0 ? todayCheckins[todayCheckins.length - 1] : null;
  const isWorking = lastCheckin?.type === "checkin";

  const formatShiftTime = (iso?: string) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative">
      {/* Streak & Swap Badges */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        {swapCount > 0 && (
          <Link
            to="/schedule"
            className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-[10px] font-bold border border-purple-200 shadow-xs animate-pulse hover:bg-purple-200 transition-colors"
          >
            🎁 {swapCount} kèo thơm
          </Link>
        )}
        {streak > 0 && (
          <div className="bg-orange-100 text-orange-600 px-2 py-1 rounded-full text-[10px] font-bold border border-orange-200 shadow-xs">
            🔥 {streak}
          </div>
        )}
      </div>

      {/* User Welcome Header */}
      <div className="p-4 sm:p-5 pb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 rounded-2xl bg-amber-50 border border-amber-200/80 overflow-hidden shadow-xs shrink-0 flex items-center justify-center">
            <img
              src={user?.image || "/capybara_mascot.webp"}
              alt="Mascot Capybara"
              width="48"
              height="48"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.endsWith("/capybara_mascot.webp")) {
                  target.src = "/capybara_mascot.webp";
                }
              }}
            />
            {isWorking && (
              <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white animate-pulse" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-gray-900 leading-tight">
                {user?.role === "PARTNER" ? "Khu Vực Đối Tác" : "Chấm Công"}
              </h1>
              {isWorking ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-1.5 py-0 h-4 font-bold">
                  🟢 Đang làm việc
                </Badge>
              ) : todayShift?.start ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0 h-4 font-semibold">
                  Ca {formatShiftTime(todayShift.start)} - {formatShiftTime(todayShift.end)}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-stone-50 text-stone-600 border-stone-200 text-[10px] px-1.5 py-0 h-4">
                  Chưa vào ca
                </Badge>
              )}
            </div>

            <div
              id="home-user-info"
              className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap"
            >
              <span>Xin chào, <strong className="text-stone-800">{user?.name || "Bạn"}</strong></span>
              {user?.achievements?.map((a: any) => {
                if (a.code === "LUCKY_STAR")
                  return (
                    <span key={a.id} title="Ngôi Sao May Mắn">
                      🌟
                    </span>
                  );
                if (a.code === "GACHA_KING")
                  return (
                    <span key={a.id} title="Vua Nhân Phẩm">
                      👑
                    </span>
                  );
                return null;
              })}
              <Link
                to="/profile"
                className="inline-flex items-center text-[10px] text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200/70 px-1.5 py-0.2 rounded-md font-semibold transition-colors"
                title="Chuyển tài khoản"
              >
                Đổi
              </Link>
            </div>

            {currentDateTime && (
              <p className="text-[10px] text-stone-400 mt-1 capitalize font-medium">
                {currentDateTime}
              </p>
            )}
          </div>
        </div>

        {/* Official LimArt Logo */}
        <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-yellow-50 overflow-hidden shadow-xs border border-yellow-100 shrink-0">
          <img
            src="/logo.png"
            alt="LimArt"
            width="40"
            height="40"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.endsWith("/icon-192.png")) {
                target.src = "/icon-192.png";
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default CheckinHeaderCard;
