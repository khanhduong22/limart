import React from "react";
import {
  Shield,
  LogOut,
  Flame,
  Ticket,
  ChevronRight,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { StaffProfile, removeAuthToken } from "@/lib/api-client";
import { useRouter } from "@/lib/router";
import { triggerPwaInstallPrompt } from "@/components/pwa";

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
    <div className="space-y-3 pb-24 max-w-md mx-auto px-3 sm:px-4 pt-3 select-none">
      {/* Staff Profile Header Card */}
      <div className="rounded-2xl bg-white/95 border border-orange-100 p-5 shadow-xs text-center relative overflow-hidden">
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
        <h2 className="text-base font-bold text-stone-900 mt-2.5 tracking-tight">
          {profile?.name || "Nhân viên"}
        </h2>
        <p className="text-xs text-stone-500 font-mono mt-0.5">{profile?.email || ""}</p>

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
        <div className="mt-4 pt-3 border-t border-orange-100/70 grid grid-cols-2 gap-2 text-center">
          <div className="p-2 rounded-xl bg-orange-50/60 border border-orange-100/60">
            <div className="flex items-center justify-center gap-1 text-xs text-orange-800 font-bold">
              <Flame className="w-3.5 h-3.5 text-orange-600" />
              <span>{profile?.streakDays || 0} ngày</span>
            </div>
            <p className="text-[10px] text-stone-500 mt-0.5">Chuỗi chuyên cần</p>
          </div>

          <div className="p-2 rounded-xl bg-amber-50/60 border border-amber-100/60">
            <div className="flex items-center justify-center gap-1 text-xs text-amber-800 font-bold">
              <Ticket className="w-3.5 h-3.5 text-amber-600" />
              <span>{profile?.gachaTickets || 1} vé</span>
            </div>
            <p className="text-[10px] text-stone-500 mt-0.5">Vé quay may mắn</p>
          </div>
        </div>
      </div>

      {/* Admin Portal Link */}
      {profile?.role === "ADMIN" && (
        <div className="rounded-2xl bg-white/95 border border-amber-200 p-3 shadow-xs">
          <a
            href="/admin"
            className="w-full flex items-center justify-between p-2 rounded-xl bg-amber-50 hover:bg-amber-100/80 transition-colors text-amber-900"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-900 flex items-center justify-center font-bold">
                <Shield className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold">Trang Quản Trị (Admin)</p>
                <p className="text-[10px] text-amber-700">Duyệt đơn, tính lương, xếp ca trực</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-700" />
          </a>
        </div>
      )}

      {/* PWA Installation Guide Button */}
      <div className="rounded-2xl bg-white/95 border border-orange-100 p-3 shadow-xs">
        <button
          type="button"
          onClick={() => triggerPwaInstallPrompt()}
          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-orange-50/80 transition-colors text-left cursor-pointer active:scale-98"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-orange-700" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-800">
                Cài đặt ứng dụng PWA
              </p>
              <p className="text-[10px] text-stone-400">
                Ghim app lên màn hình chính để mở nhanh & tiện lợi hơn
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </button>
      </div>

      {/* Logout Action */}
      <div className="rounded-2xl bg-white/95 border border-orange-100 p-3 shadow-xs">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200/60 text-xs font-semibold text-red-700 transition-all cursor-pointer active:scale-98"
        >
          <LogOut className="w-3.5 h-3.5 text-red-600" />
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
