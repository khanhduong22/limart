import React from "react";
import { useLocation } from "react-router-dom";
import { Menu, LogOut, ExternalLink, Sparkles, PanelLeftClose, PanelLeftOpen, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import AdminNavLinks from "./AdminNavLinks";
import { useDashboardStats } from "@/hooks/useAdminData";
import { removeToken } from "@/lib/api";
import { isLikelyDemoHost } from "@/lib/demo-mode";
import { toast } from "sonner";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Quản lý chấm công",
  "/employees": "Quản lý Nhân sự",
  "/schedule": "Lịch làm việc",
  "/reports": "Bảng thành tích",
  "/requests": "Duyệt yêu cầu",
  "/announcements": "Quản lý Thông báo",
  "/payroll": "Bảng Lương",
  "/lucky-wheel": "Vòng quay may mắn",
  "/tasks": "Duyệt WFH & Đóng gói",
  "/manager-tasks": "Manager Tasks",
  "/staff-tasks": "Công việc và KPI",
  "/settings": "Cấu hình Hệ thống",
  "/audit-logs": "Session Audit Log",
  "/help": "Trợ lí Capy",
};

interface HeaderProps {
  onOpenChangelog?: () => void;
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

export function Header({
  onOpenChangelog,
  onToggleSidebar,
  isSidebarCollapsed,
}: HeaderProps) {
  const location = useLocation();
  const { stats } = useDashboardStats();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const isEnterpriseDemo = isLikelyDemoHost();
  const currentTitle =
    isEnterpriseDemo && location.pathname === "/help"
      ? "Trợ lý AI Quy trình (SOP)"
      : ROUTE_TITLES[location.pathname] || "Admin Panel";

  const handleLogout = async () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi Admin Panel?")) {
      removeToken();
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
      toast.success("Đã đăng xuất thành công");
      window.location.href = "/";
    }
  };

  return (
    <header className="flex h-14 items-center gap-2 sm:gap-4 border-b bg-white dark:bg-gray-950 px-2.5 sm:px-4 lg:h-[60px] sticky top-0 z-30 w-full justify-between">
      {/* Left: Desktop Toggle / Mobile Drawer Trigger & Title */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            title={isSidebarCollapsed ? "Mở menu bên" : "Thu gọn menu bên"}
            className="hidden lg:inline-flex h-9 w-9 text-slate-600 hover:text-slate-900 hover:bg-slate-100 shrink-0"
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
            <span className="sr-only">Toggle Sidebar</span>
          </Button>
        )}

        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden -ml-1 sm:-ml-2 shrink-0 h-9 w-9 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              aria-label="Mở menu điều hướng"
            >
              <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 bg-white overflow-y-auto">
            <div className="flex h-14 items-center border-b px-6">
              <span className="font-semibold text-lg">
                {isEnterpriseDemo ? "DemoMart Enterprise" : "Admin Panel"}
              </span>
            </div>
            <div className="py-2 pb-8">
              <AdminNavLinks
                pendingRequestsCount={stats?.pendingRequestsCount || 0}
                pendingTasksCount={stats?.pendingTasksCount || 0}
                onItemClick={() => setMobileMenuOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
        <h1
          id="admin-header-title"
          className="font-semibold text-base sm:text-lg text-slate-800 dark:text-slate-100 truncate min-w-0"
        >
          {currentTitle}
        </h1>
        {isEnterpriseDemo && (
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
            <Building2 className="w-3 h-3" /> DemoMart Enterprise
          </span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {onOpenChangelog && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenChangelog}
            className="hidden sm:inline-flex text-xs bg-white hover:bg-slate-50 border-slate-200"
          >
            📜 Lịch sử
          </Button>
        )}

        <a
          href="/"
          title="Staff Portal"
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
        >
          <span className="hidden sm:inline">Staff Portal</span>
          <ExternalLink className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
        </a>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1.5 px-2 sm:px-3 shrink-0"
          title="Đăng xuất"
        >
          <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">Đăng xuất</span>
        </Button>
      </div>
    </header>
  );
}
