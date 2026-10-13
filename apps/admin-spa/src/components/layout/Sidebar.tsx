import React from "react";
import { Link } from "react-router-dom";
import AdminNavLinks from "./AdminNavLinks";
import { useDashboardStats } from "@/hooks/useAdminData";

import { cn } from "@/lib/utils";

export function Sidebar({
  onItemClick,
  className,
  style,
}: {
  onItemClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { stats } = useDashboardStats();

  return (
    <div
      id="admin-sidebar"
      style={style}
      className={cn(
        "border-r bg-gray-100/40 dark:bg-gray-800/40 w-full flex flex-col h-full inset-y-0 left-0 overflow-hidden",
        className
      )}
    >
      <div className="flex h-14 items-center border-b px-6 lg:h-[60px] bg-white dark:bg-gray-950">
        <Link className="flex items-center gap-2.5 font-bold text-slate-800" to="/">
          <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center border border-orange-200 shadow-sm shrink-0">
            <img
              src="/logo.png"
              alt="LimArt"
              width="24"
              height="24"
              decoding="async"
              className="h-6 w-6 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  "/icons/capy_dashboard.png";
              }}
            />
          </div>
          <span className="text-base tracking-tight text-slate-900">
            Admin Panel
          </span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <AdminNavLinks
          pendingRequestsCount={stats?.pendingRequestsCount || 0}
          pendingTasksCount={stats?.pendingTasksCount || 0}
          onItemClick={onItemClick}
        />
      </div>
    </div>
  );
}
