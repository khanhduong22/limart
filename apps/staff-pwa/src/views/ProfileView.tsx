import React, { Suspense, lazy } from "react";
import {
  Shield,
  LogOut,
  Flame,
  Ticket,
  ChevronRight,
  Smartphone,
  History,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { StaffProfile, removeAuthToken } from "@/lib/api-client";
import { useRouter } from "@/lib/router";
import { triggerPwaInstallPrompt } from "@/lib/pwa/usePwaInstallPrompt";

const NotificationOptInCard = lazy(() => import("@/components/NotificationOptInCard"));

interface ProfileViewProps {
  profile: StaffProfile;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ profile }) => {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    } finally {
      removeAuthToken();
      toast.success("Đã đăng xuất tài khoản.");
      router.push("/login");
      setTimeout(() => {
        window.location.href = "/login";
      }, 200);
    }
  };

  return (
    <div className="space-y-3 pb-24 max-w-md mx-auto px-3 sm:px-4 pt-3 select-none w-full box-border overflow-hidden">
      {/* Staff Profile Header Card */}
      <div className="rounded-2xl bg-white/95 border border-orange-100 p-4 sm:p-5 shadow-xs text-center relative overflow-hidden w-full box-border">
        {/* Avatar */}
        <div className="w-20 h-20 mx-auto rounded-full bg-orange-100 border-3 border-orange-300 p-1 flex items-center justify-center overflow-hidden shadow-sm">
          <img
            src={profile?.avatarUrl || "/capybara_mascot.webp"}
            alt={profile?.name || "Profile"}
            width="80"
            height="80"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              e.currentTarget.onerror = null;
              const target = e.currentTarget;
              if (!target.src.endsWith("/capybara_mascot.webp")) {
                target.src = "/capybara_mascot.webp";
              }
            }}
          />
        </div>

        {/* Name & Role */}
        <h2 className="text-base font-bold text-stone-900 mt-2.5 tracking-tight truncate px-2">
          {profile?.name || "Nhân viên"}
        </h2>
        <p className="text-xs text-stone-500 font-mono mt-0.5 truncate px-2">{profile?.email || ""}</p>

        {/* Badges */}
        <div className="mt-2.5 flex items-center justify-center gap-1.5 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
            {profile?.employmentType === "FULL_TIME"
              ? "Toàn thời gian"
              : "Bán thời gian"}
          </span>
          {profile?.role === "ADMIN" && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Quản trị viên
            </span>
          )}
        </div>

        {/* Work Stats Pill */}
        <div className="mt-4 pt-3 border-t border-orange-100/70 grid grid-cols-2 gap-2 text-center w-full">
          <div className="p-2 rounded-xl bg-orange-50/60 border border-orange-100/60">
            <div className="flex items-center justify-center gap-1 text-xs text-orange-800 font-bold">
              <Flame className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span>{profile?.streakDays || 0} ngày</span>
            </div>
            <p className="text-[10px] text-stone-500 mt-0.5">Chuỗi chuyên cần</p>
          </div>

          <div className="p-2 rounded-xl bg-amber-50/60 border border-amber-100/60">
            <div className="flex items-center justify-center gap-1 text-xs text-amber-800 font-bold">
              <Ticket className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{profile?.gachaTickets || 1} vé</span>
            </div>
            <p className="text-[10px] text-stone-500 mt-0.5">Vé quay may mắn</p>
          </div>
        </div>
      </div>

      {/* Quick Utilities & Activities Group */}
      <div className="rounded-2xl bg-white/95 border border-orange-100 p-1.5 sm:p-2 shadow-xs divide-y divide-orange-100/60 w-full overflow-hidden box-border">
        {/* Lịch sử chấm công */}
        <button
          type="button"
          onClick={() => router.push("/history")}
          className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-orange-50/70 active:scale-98 transition-all text-left cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-orange-100/90 text-orange-800 flex items-center justify-center shrink-0">
              <History className="w-4 h-4 text-orange-700" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-stone-900 truncate">
                Lịch sử chấm công
              </p>
              <p className="text-[10px] text-stone-500 truncate">
                Xem lại ca trực, bảng chấm công &amp; giờ làm việc
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400 shrink-0 ml-1" />
        </button>

        {/* Vòng quay may mắn / Nhân phẩm */}
        <button
          type="button"
          onClick={() => router.push("/lucky-wheel")}
          className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-purple-50/70 active:scale-98 transition-all text-left cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-purple-700" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-stone-900 truncate flex items-center gap-1.5">
                Vòng quay nhân phẩm
                <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 font-extrabold shrink-0">
                  May mắn
                </span>
              </p>
              <p className="text-[10px] text-stone-500 truncate">
                Quay thưởng mỗi ngày sau khi hoàn thành Check-in
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400 shrink-0 ml-1" />
        </button>
      </div>

      {/* Admin Portal Link */}
      {profile?.role === "ADMIN" && (
        <div className="rounded-2xl bg-white/95 border border-amber-200 p-2 sm:p-2.5 shadow-xs w-full box-border overflow-hidden">
          <a
            href="/admin"
            className="w-full flex items-center justify-between p-2 rounded-xl bg-amber-50 hover:bg-amber-100/80 transition-colors text-amber-900"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-900 flex items-center justify-center font-bold shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-xs font-bold truncate">Trang Quản Trị (Admin)</p>
                <p className="text-[10px] text-amber-700 truncate">Duyệt đơn, tính lương, xếp ca trực</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-700 shrink-0 ml-1" />
          </a>
        </div>
      )}

      {/* Automatic Shift Notification Opt-In Card (compact prop prevents overflow) */}
      <Suspense fallback={null}>
        <NotificationOptInCard userId={profile?.id} compact />
      </Suspense>

      {/* PWA Installation Guide Button */}
      <div className="rounded-2xl bg-white/95 border border-orange-100 p-2 sm:p-2.5 shadow-xs w-full box-border overflow-hidden">
        <button
          type="button"
          onClick={() => triggerPwaInstallPrompt()}
          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-orange-50/80 transition-colors text-left cursor-pointer active:scale-98"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-orange-700" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-stone-800 truncate">
                Cài đặt ứng dụng PWA
              </p>
              <p className="text-[10px] text-stone-400 truncate">
                Ghim app lên màn hình chính để mở nhanh &amp; tiện lợi hơn
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400 shrink-0 ml-1" />
        </button>
      </div>

      {/* Logout Action */}
      <div className="rounded-2xl bg-white/95 border border-orange-100 p-2 sm:p-2.5 shadow-xs w-full box-border overflow-hidden">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200/60 text-xs font-semibold text-red-700 transition-all cursor-pointer active:scale-98"
        >
          <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span>Đăng xuất tài khoản</span>
        </button>
      </div>

      {/* Footer Branding */}
      <div className="text-center text-[10px] text-stone-400 pt-2">
        <p>LimArt Chấm Công • Phiên bản 2.0</p>
      </div>
    </div>
  );
};

export default ProfileView;
