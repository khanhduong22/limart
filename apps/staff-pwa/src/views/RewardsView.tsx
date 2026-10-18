import React, { useState } from "react";
import { useAppQuery } from "@/lib/api-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import type {
  LeaderboardData,
  RewardLeaderboardTab,
} from "@/components/rewards/RewardLeaderboardContent";

const RewardLeaderboardContent = React.lazy(
  () => import("@/components/rewards/RewardLeaderboardContent")
);

const TABS: Array<{
  id: RewardLeaderboardTab;
  label: string;
  icon: string;
}> = [
  { id: "discipline", label: "Chuyên cần", icon: "🌟" },
  { id: "hardworking", label: "Chăm chỉ", icon: "⏱️" },
  { id: "overtime", label: "Tăng ca", icon: "⚡" },
  { id: "packing", label: "Đóng hàng", icon: "📦" },
  { id: "carrying", label: "Bưng hàng", icon: "🛗" },
];

export const RewardsView: React.FC = () => {
  const router = useRouter();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<RewardLeaderboardTab>("discipline");

  const { data: res, isLoading } = useAppQuery<{
    success: boolean;
    data: LeaderboardData;
  }>(
    `/api/staff/rewards/leaderboard?month=${selectedMonth}&year=${selectedYear}`,
    { revalidateOnFocus: true }
  );

  const leaderboard = res?.data;

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  return (
    <div className="w-full max-w-full md:max-w-md mx-auto px-3 sm:px-4 pt-2 pb-32 space-y-3 select-none box-border min-w-0 overflow-x-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="h-8 w-8 rounded-full hover:bg-yellow-100 text-stone-700 cursor-pointer shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-1.5 truncate">
              <span className="shrink-0">🏆</span> <span className="truncate">Bảng Vàng &amp; Khen Thưởng</span>
            </h1>
            <p className="text-[10px] text-stone-500 truncate">
              Vinh danh những cá nhân xuất sắc nhất tháng
            </p>
          </div>
        </div>
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-between bg-white border border-stone-200 p-2 rounded-2xl shadow-xs gap-1 w-full max-w-full box-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrevMonth}
          className="h-8 px-2 text-stone-600 cursor-pointer shrink-0 text-xs font-semibold"
        >
          <ChevronLeft className="w-4 h-4 mr-0.5" /> Tháng trước
        </Button>
        <span className="text-xs font-extrabold text-stone-800 font-mono whitespace-nowrap px-1">
          Tháng {selectedMonth} / {selectedYear}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNextMonth}
          disabled={
            selectedYear > now.getFullYear() ||
            (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth() + 1)
          }
          className="h-8 px-2 text-stone-600 cursor-pointer disabled:opacity-30 shrink-0 text-xs font-semibold"
        >
          Tháng sau <ChevronRight className="w-4 h-4 ml-0.5" />
        </Button>
      </div>

      {/* Lucky Wheel Quick Banner */}
      <Link to="/lucky-wheel" className="block w-full max-w-full box-border">
        <div className="rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-3 sm:p-3.5 text-white shadow-md flex items-center justify-between gap-2 cursor-pointer hover:opacity-95 transition-all w-full box-border">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span className="text-2xl shrink-0">🎡</span>
            <div className="min-w-0">
              <p className="text-xs font-black truncate">Vòng Quay May Mắn</p>
              <p className="text-[10px] text-amber-100 mt-0.5 line-clamp-1">
                Chấm công đủ để quay trúng quà tiền mặt &amp; vé gacha!
              </p>
            </div>
          </div>
          <span className="text-xs font-bold bg-white text-orange-700 px-2.5 py-1 rounded-full shadow-xs shrink-0 whitespace-nowrap">
            Quay ngay →
          </span>
        </div>
      </Link>

      {/* Category Tabs */}
      <div className="w-full min-w-0 overflow-hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar -mx-1 px-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                activeTab === tab.id
                  ? "bg-amber-500 text-white shadow-xs ring-2 ring-amber-200"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard Content */}
      <React.Suspense
        fallback={
          <div className="h-96 w-full flex items-center justify-center text-xs text-slate-400 animate-pulse bg-slate-50/50 rounded-2xl border border-slate-100">
            Đang tải bảng vinh danh...
          </div>
        }
      >
        <RewardLeaderboardContent
          activeTab={activeTab}
          leaderboard={leaderboard}
          isLoading={isLoading}
        />
      </React.Suspense>
    </div>
  );
};

export default RewardsView;
