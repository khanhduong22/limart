import React from "react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";

export interface HomeNavGridProps {
  userRole?: string;
  staffTasksAllowed?: boolean;
  rejectedTasksCount?: number;
}

export const HomeNavGrid: React.FC<HomeNavGridProps> = ({
  userRole,
  staffTasksAllowed = false,
  rejectedTasksCount = 0,
}) => {
  const isPartner = userRole === "PARTNER";
  const isAdmin = userRole === "ADMIN";

  return (
    <div id="home-nav" className="space-y-3 pt-2">
      <div className="flex gap-3">
        <Link to="/history" className="flex-1">
          <Button variant="outline" className="w-full text-xs cursor-pointer">
            📜 Lịch sử
          </Button>
        </Link>
        <Link to="/payroll" className="flex-1">
          <Button
            variant="outline"
            className="w-full text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 cursor-pointer"
          >
            💰 Chi tiết lương
          </Button>
        </Link>
      </div>

      {!isPartner && (
        <div className="grid grid-cols-2 gap-3">
          <Link to="/schedule" className="block w-full">
            <Button variant="outline" className="w-full text-xs cursor-pointer">
              📅 Đăng ký Lịch
            </Button>
          </Link>
          <Link to="/requests" className="block w-full">
            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground bg-gray-100/50 cursor-pointer"
            >
              📝 Xin giải trình
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Link to="/packing" className="block w-full">
          <Button
            variant="default"
            className="w-full text-xs bg-purple-600 hover:bg-purple-700 text-white px-1 cursor-pointer"
          >
            📦 Đóng gói
          </Button>
        </Link>
        <Link to="/carrying" className="block w-full">
          <Button
            variant="default"
            className="w-full text-xs bg-amber-600 hover:bg-amber-700 text-white px-1 cursor-pointer"
          >
            🛗 Bưng lầu
          </Button>
        </Link>
      </div>

      {(staffTasksAllowed || isAdmin) && (
        <div>
          <Link to="/staff-tasks" className="block w-full">
            <Button
              variant="default"
              className="w-full h-11 text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md transition-all hover:scale-[1.01] relative flex items-center justify-center gap-2 cursor-pointer"
            >
              🎯 Công việc và KPI
              {rejectedTasksCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white animate-bounce shadow-xs border border-white">
                  {rejectedTasksCount}
                </span>
              )}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default HomeNavGrid;
