import React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useDemoModules, type DemoModulesConfig } from "@/lib/demo-mode";

interface AdminNavLinkItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  module: keyof DemoModulesConfig;
}

export default function AdminNavLinks({
  pendingRequestsCount = 0,
  pendingTasksCount = 0,
  onItemClick,
}: {
  pendingRequestsCount?: number;
  pendingTasksCount?: number;
  onItemClick?: () => void;
}) {
  const demoModules = useDemoModules();

  const links: AdminNavLinkItem[] = [
    { href: "/", label: "Dashboard", icon: "/admin/icons/capy_dashboard.webp", module: "attendance" },
    { href: "/employees", label: "Nhân sự", icon: "/admin/icons/capy_hr.webp", module: "attendance" },
    { href: "/schedule", label: "Lịch làm việc", icon: "/admin/icons/capy_calendar.webp", module: "attendance" },
    { href: "/reports", label: "Bảng thành tích", icon: "/admin/icons/capy_badge.webp", module: "gamification" },
    {
      href: "/requests",
      label: "Duyệt yêu cầu",
      badge: pendingRequestsCount,
      icon: "/admin/icons/capy_request.webp",
      module: "attendance",
    },
    { href: "/announcements", label: "Thông báo", icon: "/admin/icons/capy_announce.webp", module: "attendance" },
    { href: "/payroll", label: "Bảng Lương", icon: "/admin/icons/capy_payroll.webp", module: "payroll" },
    { href: "/lucky-wheel", label: "Vòng quay", icon: "/admin/icons/capy_wheel.webp", module: "gamification" },
    {
      href: "/tasks",
      label: "Duyệt WFH & Đóng gói",
      badge: pendingTasksCount,
      icon: "/admin/icons/capy_wfh.webp",
      module: "piecework",
    },
    { href: "/manager-tasks", label: "Manager Tasks", icon: "/admin/icons/capy_manager.webp", module: "operations" },
    { href: "/staff-tasks", label: "Công việc và KPI", icon: "/admin/icons/capy_kpi.webp", module: "operations" },
    { href: "/settings", label: "Cấu hình (IP)", icon: "/admin/icons/capy_settings.webp", module: "attendance" },
    { href: "/audit-logs", label: "Session Audit Log", icon: "/admin/icons/capy_badge.webp", module: "attendance" },
    { href: "/help", label: "Trợ lí Capy", icon: "/admin/icons/capy_ai.webp", module: "ai_sop" },
  ];

  const visibleLinks = links.filter((link) => demoModules[link.module] !== false);

  return (
    <nav
      id="admin-nav-links"
      className="grid items-start px-4 text-sm font-medium gap-1.5 mt-2"
    >
      {visibleLinks.map((link) => (
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
                  e.currentTarget.onerror = null;
                  (e.currentTarget as HTMLImageElement).src =
                    "/admin/icons/capy_dashboard.webp";
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
