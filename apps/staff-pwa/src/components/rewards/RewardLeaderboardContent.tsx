import React from "react";

export type RewardLeaderboardTab =
  | "discipline"
  | "hardworking"
  | "overtime"
  | "packing"
  | "carrying";

export interface LeaderboardUser {
  id?: string;
  name?: string;
  image?: string | null;
  points?: number;
  totalHours?: number;
  daysWorked?: number;
  avgOvertime?: number;
  displayOvertimeHours?: number;
  overtimeHours?: number;
  lateCount?: number;
  user?: {
    id?: string;
    name?: string;
    image?: string | null;
  };
}

export interface DisciplineLeaderboardItem {
  name?: string;
  image?: string | null;
  daysWorked?: number;
  totalScheduledCheckins?: number;
  totalHours?: number;
  punctualityRate?: number;
  user?: {
    id?: string;
    name?: string;
    image?: string | null;
  };
}

export interface LeaderboardData {
  month?: number;
  year?: number;
  topDiscipline?: DisciplineLeaderboardItem[];
  topHardworking?: LeaderboardUser[];
  topOvertime?: LeaderboardUser[];
  topPacking?: LeaderboardUser[];
  topCarrying?: LeaderboardUser[];
}

export interface RewardLeaderboardContentProps {
  activeTab: RewardLeaderboardTab;
  leaderboard?: LeaderboardData;
  isLoading: boolean;
}

export interface FormattedLeaderboardItem {
  name: string;
  image?: string | null;
  stat: string;
  subStat?: string;
}

interface CategoryConfig {
  title: string;
  subtitle: string;
  icon: string;
  badgeColor: string;
  getItems: (data?: LeaderboardData) => FormattedLeaderboardItem[];
}

const TAB_CONFIGS: Record<RewardLeaderboardTab, CategoryConfig> = {
  discipline: {
    title: "Top Chuyên Cần",
    subtitle: "Không đi trễ phút nào trong tháng",
    icon: "🌟",
    badgeColor: "bg-amber-100 text-amber-800",
    getItems: (data) =>
      (Array.isArray(data?.topDiscipline) ? data.topDiscipline : []).map((d: any) => ({
        name: d.name || d.user?.name || "Nhân viên",
        image: d.image || d.user?.image,
        stat: `${d.daysWorked || d.totalScheduledCheckins || 0} ca`,
        subStat: d.totalHours
          ? `${Number(d.totalHours).toFixed(1)} giờ làm việc`
          : `Đúng giờ ${Math.round(d.punctualityRate || 100)}%`,
      })),
  },
  hardworking: {
    title: "Top Chăm Chỉ",
    subtitle: "Nhân viên Part-time cống hiến nhiều giờ nhất",
    icon: "⏱️",
    badgeColor: "bg-blue-100 text-blue-800",
    getItems: (data) =>
      (Array.isArray(data?.topHardworking) ? data.topHardworking : []).map((u: any) => ({
        name: u.name || u.user?.name || "Nhân viên",
        image: u.image || u.user?.image,
        stat: `${Number(u.totalHours || 0).toFixed(1)} giờ`,
        subStat: `${u.daysWorked || 0} ngày làm`,
      })),
  },
  overtime: {
    title: "Chiến Thần Tăng Ca",
    subtitle: "Thời gian tăng ca trung bình cao nhất",
    icon: "⚡",
    badgeColor: "bg-purple-100 text-purple-800",
    getItems: (data) =>
      (Array.isArray(data?.topOvertime) ? data.topOvertime : []).map((u: any) => ({
        name: u.name || u.user?.name || "Nhân viên",
        image: u.image || u.user?.image,
        stat: `+${Number(u.displayOvertimeHours || u.totalHours || 0).toFixed(1)}h OT`,
        subStat: `TB ${Number(u.avgOvertime || 0).toFixed(1)}h/ngày`,
      })),
  },
  packing: {
    title: "Vua Đóng Hàng",
    subtitle: "Tích luỹ điểm đóng đơn nhiều nhất (+100K cho Top 1)",
    icon: "📦",
    badgeColor: "bg-emerald-100 text-emerald-800",
    getItems: (data) =>
      (Array.isArray(data?.topPacking) ? data.topPacking : []).map((u: any) => ({
        name: u.name || u.user?.name || "Nhân viên",
        image: u.image || u.user?.image,
        stat: `${u.points || 0} điểm`,
      })),
  },
  carrying: {
    title: "Chiến Thần Bưng Hàng",
    subtitle: "Bưng hàng lên lầu nhiều nhất (+200K cho Top 1)",
    icon: "🛗",
    badgeColor: "bg-amber-100 text-amber-800",
    getItems: (data) =>
      (Array.isArray(data?.topCarrying) ? data.topCarrying : []).map((u: any) => ({
        name: u.name || u.user?.name || "Nhân viên",
        image: u.image || u.user?.image,
        stat: `${u.points || 0} điểm bưng`,
      })),
  },
};

const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  e.currentTarget.onerror = null;
  const target = e.currentTarget;
  if (!target.src.endsWith("/capybara_mascot.webp")) {
    target.src = "/capybara_mascot.webp";
  }
};

export const renderPodium = (items: FormattedLeaderboardItem[]) => {
  if (items.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-stone-400">
        Chưa có nhân viên đạt tiêu chuẩn trong tháng này
      </div>
    );
  }

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const rankBg =
          idx === 0
            ? "bg-amber-50/70 border-amber-200"
            : idx === 1
            ? "bg-slate-50 border-slate-200"
            : "bg-orange-50/50 border-orange-200";

        return (
          <div
            key={idx}
            className={`flex items-center justify-between p-2 rounded-xl border gap-2 ${rankBg}`}
          >
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <span className="text-base leading-none shrink-0">{medals[idx]}</span>
              <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    width="32"
                    height="32"
                    loading="lazy"
                    decoding="async"
                    onError={handleAvatarError}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-bold text-stone-600">
                    {item.name?.charAt(0) || "U"}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-stone-900 truncate">{item.name}</p>
                {item.subStat && (
                  <p className="text-[10px] text-stone-500 truncate">{item.subStat}</p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-black text-stone-800 font-mono whitespace-nowrap">
                {item.stat}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const renderLeaderboardList = (items: FormattedLeaderboardItem[]) => {
  if (items.length === 0) return null;

  return (
    <div className="pt-3 border-t border-stone-100 space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
          Xếp hạng tiếp theo
        </h3>
        <span className="text-[10px] font-medium text-stone-400">
          +{items.length} nhân viên
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2 rounded-xl border border-stone-100 bg-stone-50/60 gap-2"
          >
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <span className="w-5 text-center text-xs font-bold font-mono text-stone-400 shrink-0">
                #{idx + 4}
              </span>
              <div className="w-7 h-7 rounded-full overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    width="28"
                    height="28"
                    loading="lazy"
                    decoding="async"
                    onError={handleAvatarError}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-bold text-stone-600">
                    {item.name?.charAt(0) || "U"}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-stone-800 truncate">{item.name}</p>
                {item.subStat && (
                  <p className="text-[10px] text-stone-500 truncate">{item.subStat}</p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-black text-stone-700 font-mono whitespace-nowrap">
                {item.stat}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const RewardLeaderboardContent: React.FC<RewardLeaderboardContentProps> = ({
  activeTab,
  leaderboard,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-stone-400">
        Đang tải bảng xếp hạng...
      </div>
    );
  }

  const config = TAB_CONFIGS[activeTab] || TAB_CONFIGS.discipline;
  const items = config.getItems(leaderboard);
  const podiumItems = items.slice(0, 3);
  const rankingItems = items.slice(3);

  return (
    <div className="space-y-3 max-w-full overflow-hidden">
      <div className="rounded-2xl bg-white border border-stone-200 p-3 sm:p-4 shadow-xs space-y-3 max-w-full">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0">{config.icon}</span>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-stone-900 truncate">{config.title}</h2>
              <p className="text-[10px] text-stone-500 truncate">{config.subtitle}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${config.badgeColor}`}>
            Top 3
          </span>
        </div>

        {renderPodium(podiumItems)}
        {renderLeaderboardList(rankingItems)}
      </div>
    </div>
  );
};

export default RewardLeaderboardContent;
