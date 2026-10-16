import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Award,
  ClipboardCheck,
  Megaphone,
  Wallet,
  Gift,
  PackageCheck,
  ListChecks,
  Target,
  ShieldCheck,
  FileCheck2,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  isLikelyDemoHost,
  useDemoModules,
  type DemoModulesConfig,
} from "@/lib/demo-mode";

interface AdminNavLinkItem {
  href: string;
  label: string;
  enterpriseLabel: string;
  icon: string;
  lucideIcon: LucideIcon;
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
  const isEnterpriseDemo = isLikelyDemoHost();

  const links: AdminNavLinkItem[] = [
    {
      href: "/",
      label: "Dashboard",
      enterpriseLabel: "Tổng quan vận hành",
      icon: "/admin/icons/capy_dashboard.webp",
      lucideIcon: LayoutDashboard,
      module: "attendance",
    },
    {
      href: "/employees",
      label: "Nhân sự",
      enterpriseLabel: "Quản trị Nhân sự",
      icon: "/admin/icons/capy_hr.webp",
      lucideIcon: Users,
      module: "attendance",
    },
    {
      href: "/schedule",
      label: "Lịch làm việc",
      enterpriseLabel: "Điều phối Lịch ca",
      icon: "/admin/icons/capy_calendar.webp",
      lucideIcon: CalendarDays,
      module: "attendance",
    },
    {
      href: "/reports",
      label: "Bảng thành tích",
      enterpriseLabel: "Báo cáo Hiệu suất",
      icon: "/admin/icons/capy_badge.webp",
      lucideIcon: Award,
      module: "gamification",
    },
    {
      href: "/requests",
      label: "Duyệt yêu cầu",
      enterpriseLabel: "Phê duyệt Đơn từ",
      badge: pendingRequestsCount,
      icon: "/admin/icons/capy_request.webp",
      lucideIcon: ClipboardCheck,
      module: "attendance",
    },
    {
      href: "/announcements",
      label: "Thông báo",
      enterpriseLabel: "Bản tin Nội bộ",
      icon: "/admin/icons/capy_announce.webp",
      lucideIcon: Megaphone,
      module: "attendance",
    },
    {
      href: "/payroll",
      label: "Bảng Lương",
      enterpriseLabel: "Bảng lương & Chi trả",
      icon: "/admin/icons/capy_payroll.webp",
      lucideIcon: Wallet,
      module: "payroll",
    },
    {
      href: "/lucky-wheel",
      label: "Vòng quay",
      enterpriseLabel: "Phúc lợi & Thưởng",
      icon: "/admin/icons/capy_wheel.webp",
      lucideIcon: Gift,
      module: "gamification",
    },
    {
      href: "/tasks",
      label: "Duyệt WFH & Đóng gói",
      enterpriseLabel: "Khoán Đóng gói & WFH",
      badge: pendingTasksCount,
      icon: "/admin/icons/capy_wfh.webp",
      lucideIcon: PackageCheck,
      module: "piecework",
    },
    {
      href: "/manager-tasks",
      label: "Manager Tasks",
      enterpriseLabel: "Checklist Quản lý",
      icon: "/admin/icons/capy_manager.webp",
      lucideIcon: ListChecks,
      module: "operations",
    },
    {
      href: "/staff-tasks",
      label: "Công việc và KPI",
      enterpriseLabel: "Giao việc & KPI",
      icon: "/admin/icons/capy_kpi.webp",
      lucideIcon: Target,
      module: "operations",
    },
    {
      href: "/settings",
      label: "Cấu hình (IP)",
      enterpriseLabel: "Cấu hình & Bảo mật IP",
      icon: "/admin/icons/capy_settings.webp",
      lucideIcon: ShieldCheck,
      module: "attendance",
    },
    {
      href: "/audit-logs",
      label: "Session Audit Log",
      enterpriseLabel: "Nhật ký Bảo mật",
      icon: "/admin/icons/capy_badge.webp",
      lucideIcon: FileCheck2,
      module: "attendance",
    },
    {
      href: "/help",
      label: "Trợ lí Capy",
      enterpriseLabel: "Trợ lý AI Quy trình",
      icon: "/admin/icons/capy_ai.webp",
      lucideIcon: Bot,
      module: "ai_sop",
    },
  ];

  const visibleLinks = links.filter((link) => demoModules[link.module] !== false);

  return (
    <nav
      id="admin-nav-links"
      className="grid items-start px-4 text-sm font-medium gap-1.5 mt-2"
    >
      {visibleLinks.map((link) => {
        const IconComponent = link.lucideIcon;
        return (
          <NavLink
            key={link.href}
            to={link.href}
            end={link.href === "/"}
            onClick={onItemClick}
            className={({ isActive }) =>
              isEnterpriseDemo
                ? cn(
                    "flex justify-between items-center rounded-xl px-3 py-2 transition-all hover:bg-slate-100 hover:text-slate-900 group select-none",
                    isActive
                      ? "bg-indigo-50/90 text-indigo-950 font-semibold shadow-2xs border border-indigo-100/80"
                      : "text-gray-600"
                  )
                : cn(
                    "flex justify-between items-center rounded-xl px-3 py-2 transition-all hover:bg-orange-50 hover:text-orange-900 group select-none",
                    isActive
                      ? "bg-orange-100/80 text-orange-950 font-bold shadow-sm"
                      : "text-gray-600"
                  )
            }
          >
            <span className="flex items-center gap-3">
              {isEnterpriseDemo ? (
                <div className="w-8.5 h-8.5 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 transition-colors flex items-center justify-center shrink-0">
                  <IconComponent className="w-4 h-4" />
                </div>
              ) : (
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
              )}
              <span className="truncate">
                {isEnterpriseDemo ? link.enterpriseLabel : link.label}
              </span>
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
        );
      })}

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
