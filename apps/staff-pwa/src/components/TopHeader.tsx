import React from "react";
import { Wifi, WifiOff, RefreshCw, Sparkles } from "lucide-react";
import { StaffProfile } from "@/lib/api-client";

interface TopHeaderProps {
  profile: StaffProfile;
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
  onOpenGacha?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  profile,
  isOnline,
  pendingCount,
  isSyncing,
  onSyncNow,
  onOpenGacha,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 pt-safe px-4 py-3 select-none">
      <div className="w-full max-w-full md:max-w-md mx-auto flex items-center justify-between gap-2">
        {/* Left: Mascot + Brand */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/10 border border-amber-500/30 p-1 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
            <img
              src="/logo.png"
              alt="LimArt Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-bold tracking-tight text-white truncate">
                LimArt Chấm Công
              </span>
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20 shrink-0">
                PWA
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium truncate min-w-0">
              Xin chào, <span className="text-slate-200 truncate">{profile?.name || "Nhân viên"}</span>
            </p>
          </div>
        </div>

        {/* Right: Network Status & Gacha Ticket */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Gacha shortcut button */}
          {onOpenGacha && (
            <button
              onClick={onOpenGacha}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/40 hover:to-indigo-600/40 border border-purple-500/30 text-purple-200 text-xs font-semibold active:scale-95 transition-transform"
              title="Vòng quay Gacha May Mắn"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-spin-slow" />
              <span>{profile.gachaTickets} Vé</span>
            </button>
          )}

          {/* Network status badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              !isOnline
                ? "bg-rose-950/40 border-rose-800 text-rose-300"
                : pendingCount > 0
                ? "bg-amber-950/40 border-amber-800 text-amber-300"
                : "bg-emerald-950/40 border-emerald-800/80 text-emerald-400"
            }`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Ngoại tuyến</span>
              </>
            ) : pendingCount > 0 ? (
              <button
                onClick={onSyncNow}
                disabled={isSyncing}
                className="flex items-center gap-1 cursor-pointer active:scale-95"
                title="Đang có bản ghi chưa đồng bộ. Nhấp để đồng bộ ngay"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-amber-400 ${
                    isSyncing ? "animate-spin" : ""
                  }`}
                />
                <span>{pendingCount} chờ</span>
              </button>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Trực tuyến</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Offline Alert Ribbon when Offline or Items Pending */}
      {(!isOnline || pendingCount > 0) && (
        <div className="w-full max-w-full md:max-w-md mx-auto mt-2">
          <div
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center justify-between border ${
              !isOnline
                ? "bg-amber-950/60 border-amber-800/80 text-amber-200"
                : "bg-blue-950/60 border-blue-800/80 text-blue-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>
                {!isOnline
                  ? `Đang ngoại tuyến. Mọi lượt chấm công sẽ lưu vào hàng đợi Outbox.`
                  : `Đang có ${pendingCount} lượt chấm công lưu offline. Tự động đồng bộ...`}
              </span>
            </div>
            {isOnline && pendingCount > 0 && (
              <button
                onClick={onSyncNow}
                disabled={isSyncing}
                className="text-[11px] underline font-semibold ml-2 hover:text-white"
              >
                {isSyncing ? "Đang gửi..." : "Đồng bộ ngay"}
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
