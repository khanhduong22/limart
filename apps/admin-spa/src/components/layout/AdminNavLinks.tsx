import React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function AdminNavLinks({
  pendingRequestsCount = 0,
  pendingTasksCount = 0,
  onItemClick,
}: {
  pendingRequestsCount?: number;
  pendingTasksCount?: number;
  onItemClick?: () => void;
}) {
  const links = [
    { href: "/", label: "Dashboard", icon: "/icons/capy_dashboard.webp" },
    { href: "/employees", label: "Nhân sự", icon: "/icons/capy_hr.webp" },
    { href: "/schedule", label: "Lịch làm việc", icon: "/icons/capy_calendar.webp" },
    { href: "/reports", label: "Bảng thành tích", icon: "/icons/capy_badge.webp" },
    {
      href: "/requests",
      label: "Duyệt yêu cầu",
      badge: pendingRequestsCount,
      icon: "/icons/capy_request.webp",
    },
    { href: "/announcements", label: "Thông báo", icon: "/icons/capy_announce.webp" },
    { href: "/payroll", label: "Bảng Lương", icon: "/icons/capy_payroll.webp" },
    { href: "/lucky-wheel", label: "Vòng quay", icon: "/icons/capy_wheel.webp" },
    {
      href: "/tasks",
      label: "Duyệt WFH & Đóng gói",
      badge: pendingTasksCount,
      icon: "/icons/capy_wfh.webp",
    },
    { href: "/manager-tasks", label: "Manager Tasks", icon: "/icons/capy_manager.webp" },
    { href: "/staff-tasks", label: "Công việc và KPI", icon: "/icons/capy_kpi.webp" },
    { href: "/settings", label: "Cấu hình (IP)", icon: "/icons/capy_settings.webp" },
    { href: "/audit-logs", label: "Session Audit Log", icon: "/icons/capy_badge.webp" },
    { href: "/help", label: "Trợ lí Capy", icon: "/icons/capy_ai.webp" },
  ];

  return (
    <nav
      id="admin-nav-links"
      className="grid items-start px-4 text-sm font-medium gap-1.5 mt-2"
    >
      {links.map((link) => (
        <NavLink
          key={link.href}
          to={link.href}
          end={link.href === "/"}
          onClick={onItemClick}
          className={({ isActive }) =>
            cn(
              "flex justify-between items-center rounded-xl px-3 py-2 transition-all hover:bg-orange-50 hover:text-orange-900 group select-none",
              isActive
                ? "bg-orange-100/80 text-orange-950 font-bold shadow-sm"
                : "text-gray-600"
            )
          }
        >
          <span className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center group-hover:scale-110 transition-transform drop-shadow-sm shrink-0">
              <img
                src={link.icon}
                alt={link.label}
                width="40"
                height="40"
                decoding="async"
                loading="lazy"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "/icons/capy_dashboard.webp";
                }}
              />
            </div>
            <span className="truncate">{link.label}</span>
          </span>
          {link.badge !== undefined && link.badge > 0 && (
            <Badge
              variant="destructive"
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none"
            >
              {link.badge > 99 ? "99+" : link.badge}
            </Badge>
          )}
        </NavLink>
      ))}

      <div className="mt-4 border-t pt-4">
        <a
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
          href="/"
        >
          ← Về trang chủ
        </a>
      </div>
    </nav>
  );
}
