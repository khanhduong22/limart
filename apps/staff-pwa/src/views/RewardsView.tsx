import React, { useState } from "react";
import { useAppQuery } from "@/lib/api-query";
import {
  ChevronLeft,
  ChevronRight,
  Trophy,
  Sparkles,
  Flame,
  Award,
  Package,
  Layers,
  Star,
  ExternalLink,
} from "lucide-react";
import { useRouter, Link } from "@/lib/router";
import { Button } from "@/components/ui/button";

interface LeaderboardUser {
  id: string;
  name: string;
  image?: string | null;
  points?: number;
  totalHours?: number;
  daysWorked?: number;
  avgOvertime?: number;
  displayOvertimeHours?: number;
  overtimeHours?: number;
  lateCount?: number;
}

interface LeaderboardData {
  month: number;
  year: number;
  topDiscipline: Array<{
    user: { id: string; name: string; image?: string | null };
    daysWorked: number;
    totalHours: number;
  }>;
  topHardworking: LeaderboardUser[];
  topOvertime: LeaderboardUser[];
  topPacking: LeaderboardUser[];
  topCarrying: LeaderboardUser[];
}

export const RewardsView: React.FC = () => {
  const router = useRouter();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

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

  const renderPodium = (
    title: string,
    subtitle: string,
    icon: string,
    badgeColor: string,
    items: Array<{
      name: string;
      image?: string | null;
      stat: string;
      subStat?: string;
    }>
  ) => {
    return (
      <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <div>
              <h2 className="text-xs font-bold text-stone-900">{title}</h2>
              <p className="text-[10px] text-stone-500">{subtitle}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
            Top 3
          </span>
        </div>

        {items.length === 0 ? (
          <div className="py-4 text-center text-xs text-stone-400">
            Chưa có nhân viên đạt tiêu chuẩn trong tháng này
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const medals = ["🥇", "🥈", "🥉"];
              const rankBg =
                idx === 0
                  ? "bg-amber-50/70 border-amber-200"
                  : idx === 1
                  ? "bg-slate-50 border-slate-200"
                  : "bg-orange-50/50 border-orange-200";

              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2 rounded-xl border ${rankBg}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none">{medals[idx]}</span>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          width="32"
                          height="32"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            const target = e.currentTarget;
                            if (!target.src.endsWith("/capybara_mascot.webp")) {
                              target.src = "/capybara_mascot.webp";
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-stone-600">
                          {item.name?.charAt(0) || "U"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-900">{item.name}</p>
                      {item.subStat && (
                        <p className="text-[10px] text-stone-500">{item.subStat}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-stone-800 font-mono">
                      {item.stat}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 pb-24 max-w-md mx-auto px-3 sm:px-4 pt-2 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="h-8 w-8 rounded-full hover:bg-yellow-100 text-stone-700 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-1.5">
              <span>🏆</span> Bảng Vàng & Khen Thưởng
            </h1>
            <p className="text-[10px] text-stone-500">
              Vinh danh những cá nhân xuất sắc nhất tháng
            </p>
          </div>
        </div>
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-between bg-white border border-stone-200 p-2 rounded-2xl shadow-xs">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrevMonth}
          className="h-8 px-2 text-stone-600 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 mr-0.5" /> Tháng trước
        </Button>
        <span className="text-xs font-extrabold text-stone-800 font-mono">
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
          className="h-8 px-2 text-stone-600 cursor-pointer disabled:opacity-30"
        >
          Tháng sau <ChevronRight className="w-4 h-4 ml-0.5" />
        </Button>
      </div>

      {/* Lucky Wheel Quick Banner */}
      <Link to="/lucky-wheel" className="block">
        <div className="rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-3.5 text-white shadow-md flex items-center justify-between cursor-pointer hover:opacity-95 transition-all">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🎡</span>
            <div>
              <p className="text-xs font-black">Vòng Quay May Mắn</p>
              <p className="text-[10px] text-amber-100 mt-0.5">
                Chấm công đủ để quay trúng quà tiền mặt & vé gacha!
              </p>
            </div>
          </div>
          <span className="text-xs font-bold bg-white text-orange-700 px-2.5 py-1 rounded-full shadow-xs">
            Quay ngay →
          </span>
        </div>
      </Link>

      {/* Leaderboard Sections */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-stone-400">Đang tải bảng xếp hạng...</div>
      ) : (
        <div className="space-y-3">
          {/* 1. Top Chuyên Cần */}
          {renderPodium(
            "Top Chuyên Cần",
            "Không đi trễ phút nào trong tháng",
            "🌟",
            "bg-amber-100 text-amber-800",
            (Array.isArray(leaderboard?.topDiscipline) ? leaderboard.topDiscipline : []).map((d: any) => ({
              name: d.name || d.user?.name || "Nhân viên",
              image: d.image || d.user?.image,
              stat: `${d.daysWorked || d.totalScheduledCheckins || 0} ca`,
              subStat: d.totalHours ? `${Number(d.totalHours).toFixed(1)} giờ làm việc` : `Đúng giờ ${Math.round(d.punctualityRate || 100)}%`,
            }))
          )}

          {/* 2. Top Chăm Chỉ */}
          {renderPodium(
            "Top Chăm Chỉ",
            "Nhân viên Part-time cống hiến nhiều giờ nhất",
            "⏱️",
            "bg-blue-100 text-blue-800",
            (Array.isArray(leaderboard?.topHardworking) ? leaderboard.topHardworking : []).map((u: any) => ({
              name: u.name || u.user?.name || "Nhân viên",
              image: u.image || u.user?.image,
              stat: `${Number(u.totalHours || 0).toFixed(1)} giờ`,
              subStat: `${u.daysWorked || 0} ngày làm`,
            }))
          )}

          {/* 3. Top Chiến Thần Tăng Ca */}
          {renderPodium(
            "Chiến Thần Tăng Ca",
            "Thời gian tăng ca trung bình cao nhất",
            "⚡",
            "bg-purple-100 text-purple-800",
            (Array.isArray(leaderboard?.topOvertime) ? leaderboard.topOvertime : []).map((u: any) => ({
              name: u.name || u.user?.name || "Nhân viên",
              image: u.image || u.user?.image,
              stat: `+${Number(u.displayOvertimeHours || u.totalHours || 0).toFixed(1)}h OT`,
              subStat: `TB ${Number(u.avgOvertime || 0).toFixed(1)}h/ngày`,
            }))
          )}

          {/* 4. Top Vua Đóng Hàng */}
          {renderPodium(
            "Vua Đóng Hàng",
            "Tích luỹ điểm đóng đơn nhiều nhất (+100K cho Top 1)",
            "📦",
            "bg-emerald-100 text-emerald-800",
            (Array.isArray(leaderboard?.topPacking) ? leaderboard.topPacking : []).map((u: any) => ({
              name: u.name || u.user?.name || "Nhân viên",
              image: u.image || u.user?.image,
              stat: `${u.points || 0} điểm`,
            }))
          )}

          {/* 5. Top Chiến Thần Bưng Hàng */}
          {renderPodium(
            "Chiến Thần Bưng Hàng",
            "Bưng hàng lên lầu nhiều nhất (+200K cho Top 1)",
            "🛗",
            "bg-amber-100 text-amber-800",
            (Array.isArray(leaderboard?.topCarrying) ? leaderboard.topCarrying : []).map((u: any) => ({
              name: u.name || u.user?.name || "Nhân viên",
              image: u.image || u.user?.image,
              stat: `${u.points || 0} điểm bưng`,
            }))
          )}
        </div>
      )}
    </div>
  );
};

export default RewardsView;
