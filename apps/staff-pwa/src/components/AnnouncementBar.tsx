import React, { useState, useEffect } from "react";
import { Megaphone, Info, AlertTriangle, Check, X } from "lucide-react";
import { AnnouncementItem, markAnnouncementsAsRead } from "@/lib/api-client";

// Module-level cache to remember dismissed announcement IDs across route switches & revalidations
export const sessionDismissedIds = new Set<string>();

export function clearSessionDismissedAnnouncements() {
  sessionDismissedIds.clear();
}

interface AnnouncementBarProps {
  announcements: AnnouncementItem[];
  onMarkedRead?: () => void;
}

export default function AnnouncementBar({
  announcements,
  onMarkedRead,
}: AnnouncementBarProps) {
  const [dismissedVersion, setDismissedVersion] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  // Memoize unread announcement calculation using React.useMemo to prevent re-filtering arrays on every component render
  const unreadAnnouncements = React.useMemo<AnnouncementItem[]>(() => {
    if (!announcements || announcements.length === 0) {
      return [];
    }

    let readIdsSet: Set<string>;
    try {
      const readIdsStr = localStorage.getItem("read_announcement_ids");
      if (readIdsStr) {
        const parsed = JSON.parse(readIdsStr);
        readIdsSet = new Set(Array.isArray(parsed) ? parsed : []);
      } else {
        readIdsSet = new Set();
      }
    } catch {
      readIdsSet = new Set();
      try {
        localStorage.removeItem("read_announcement_ids");
      } catch {}
    }

    // Filter announcements that:
    // 1. Are NOT marked isRead from server
    // 2. Are NOT recorded in localStorage
    // 3. Have NOT been dismissed in the current session
    return announcements.filter(
      (a) =>
        !a.isRead &&
        !readIdsSet.has(a.id) &&
        !sessionDismissedIds.has(a.id)
    );
  }, [announcements, dismissedVersion]);

  // When announcements change to new ones, reset dismissed state if there are unread items
  useEffect(() => {
    if (unreadAnnouncements.length > 0) {
      setIsDismissed(false);
    }
  }, [unreadAnnouncements]);

  const handleMarkAsRead = async () => {
    const idsToMark = unreadAnnouncements.map((a) => a.id);
    if (idsToMark.length === 0) {
      setIsDismissed(true);
      return;
    }

    // 1. Immediately record in module-level session set
    idsToMark.forEach((id) => sessionDismissedIds.add(id));

    // 2. Immediately persist to localStorage safely (pruning oldest if > 200 entries)
    try {
      const readIdsStr = localStorage.getItem("read_announcement_ids");
      let readIds: string[] = [];
      if (readIdsStr) {
        const parsed = JSON.parse(readIdsStr);
        if (Array.isArray(parsed)) readIds = parsed;
      }
      const newReadIds = Array.from(new Set([...readIds, ...idsToMark])).slice(-200);
      localStorage.setItem("read_announcement_ids", JSON.stringify(newReadIds));
    } catch {}

    // 3. Immediately dismiss popup from UI and trigger useMemo re-evaluation
    setIsDismissed(true);
    setDismissedVersion((v) => v + 1);

    // 4. Persist to DB on server and trigger callback
    try {
      await markAnnouncementsAsRead(idsToMark);
      onMarkedRead?.();
    } catch (err) {
      console.warn("Failed to mark announcements as read on server:", err);
    }
  };

  if (isDismissed || unreadAnnouncements.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-orange-100 flex flex-col animate-in zoom-in-95 duration-300">
        {/* Vibrant Gradient Header */}
        <div className="bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 p-5 text-white flex items-center justify-between relative overflow-hidden">
          <div className="flex items-center gap-3.5 z-10">
            <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm animate-pulse">
              <Megaphone className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-wider drop-shadow-md">
                THÔNG BÁO MỚI NHẤT
              </h2>
              <p className="text-xs text-white/85 mt-0.5 font-medium">
                Bạn có {unreadAnnouncements.length} thông báo mới
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={handleMarkAsRead}
            className="z-10 p-2 rounded-full hover:bg-white/20 active:scale-95 transition-all text-white/90 hover:text-white cursor-pointer"
            title="Đóng thông báo"
            aria-label="Đóng thông báo"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3 bg-gray-50/50">
          {unreadAnnouncements.map((a) => {
            const Icon = a.type === "WARNING" ? AlertTriangle : Info;
            const badgeStyle =
              a.type === "WARNING"
                ? "bg-amber-100 text-amber-700 border-amber-200"
                : "bg-blue-100 text-blue-700 border-blue-200";

            return (
              <div
                key={a.id}
                className="p-4 rounded-xl border bg-white border-slate-100 shadow-sm space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${badgeStyle}`}
                  >
                    {a.type === "WARNING" ? "Cảnh báo" : "Thông tin"}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">
                    {new Date(a.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-sm leading-snug">
                  {a.title}
                </h3>
                <p className="text-gray-700 text-xs leading-relaxed whitespace-pre-line bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  {a.content}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer with Immediate Confirmation Button */}
        <div className="p-4 bg-white border-t border-gray-100 space-y-2 shadow-inner">
          <button
            onClick={handleMarkAsRead}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md active:scale-98 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Xác nhận đã đọc</span>
          </button>
          <p className="text-[11px] text-center text-gray-400 leading-tight">
            Thông báo sẽ không xuất hiện lại. Bạn luôn có thể xem lại tại Bảng tin thông báo bên dưới.
          </p>
        </div>
      </div>
    </div>
  );
}
