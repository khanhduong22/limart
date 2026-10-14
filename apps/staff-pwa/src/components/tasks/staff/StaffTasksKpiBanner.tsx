import React from "react";
import { TrendingUp, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export interface StaffTasksKpiBannerProps {
  monthlyRatePct: number;
  monthlyKPI?: {
    total: number;
    approved: number;
    completionRate: number;
    doing?: number;
    pendingReview?: number;
    overdue?: number;
  } | null;
}

export const StaffTasksKpiBanner: React.FC<StaffTasksKpiBannerProps> = ({
  monthlyRatePct,
  monthlyKPI,
}) => {
  return (
    <div className="rounded-2xl md:rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-violet-950 p-4 md:p-6 text-white shadow-lg relative overflow-hidden">
      {/* Ambient subtle glow for desktop */}
      <div className="absolute -right-8 -bottom-8 w-44 h-44 bg-violet-500/20 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -left-8 -top-8 w-44 h-44 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-13 md:h-13 rounded-2xl bg-white/10 flex items-center justify-center text-amber-300 shadow-inner shrink-0">
            <TrendingUp className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div>
            <p className="text-[11px] md:text-xs font-semibold text-indigo-200">Hiệu Suất Tháng</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-xl md:text-3xl font-black font-mono tracking-tight text-white">
                {monthlyRatePct}%
              </h2>
              <span className="text-[11px] md:text-xs text-indigo-300 font-medium">hoàn thành</span>
            </div>
          </div>
        </div>
        <div className="self-start sm:self-auto">
          <span className="text-[11px] md:text-xs font-bold bg-white/15 px-3 py-1.5 rounded-full text-indigo-100 font-mono shadow-xs inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {monthlyKPI?.approved || 0} / {monthlyKPI?.total || 0} Việc
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/15 rounded-full h-2 md:h-2.5 mt-3 md:mt-4 overflow-hidden relative z-10">
        <div
          className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 h-full rounded-full transition-all duration-500 shadow-sm"
          style={{ width: `${monthlyRatePct}%` }}
        />
      </div>

      {/* KPI 4-Column Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3.5 mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/10 text-center relative z-10">
        <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-xl md:rounded-2xl p-2.5 md:p-3.5 border border-white/5">
          <p className="text-[10px] md:text-xs text-amber-200 font-medium flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Đang làm
          </p>
          <p className="text-base md:text-2xl font-bold md:font-black text-amber-300 font-mono mt-0.5">{monthlyKPI?.doing || 0}</p>
        </div>
        <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-xl md:rounded-2xl p-2.5 md:p-3.5 border border-white/5">
          <p className="text-[10px] md:text-xs text-sky-200 font-medium flex items-center justify-center gap-1">
            <Clock className="w-3 h-3 text-sky-300" /> Chờ duyệt
          </p>
          <p className="text-base md:text-2xl font-bold md:font-black text-sky-300 font-mono mt-0.5">{monthlyKPI?.pendingReview || 0}</p>
        </div>
        <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-xl md:rounded-2xl p-2.5 md:p-3.5 border border-white/5">
          <p className="text-[10px] md:text-xs text-emerald-200 font-medium flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-300" /> Đã duyệt
          </p>
          <p className="text-base md:text-2xl font-bold md:font-black text-emerald-300 font-mono mt-0.5">{monthlyKPI?.approved || 0}</p>
        </div>
        <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-xl md:rounded-2xl p-2.5 md:p-3.5 border border-white/5">
          <p className="text-[10px] md:text-xs text-rose-200 font-medium flex items-center justify-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-300" /> Trễ hạn
          </p>
          <p className="text-base md:text-2xl font-bold md:font-black text-rose-300 font-mono mt-0.5">{monthlyKPI?.overdue || 0}</p>
        </div>
      </div>
    </div>
  );
};

export default StaffTasksKpiBanner;
