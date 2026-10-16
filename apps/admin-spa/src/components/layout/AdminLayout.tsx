import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import ChangelogPopup from "@/components/admin/ChangelogPopup";
import { LATEST_VERSION, CHANGELOGS } from "@/lib/changelogs";
import { Toaster } from "sonner";
import { AdminPageLoadingSkeleton } from "@/components/ui/AdminPageLoadingSkeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminGuard } from "./AdminGuard";

const DemoSandboxWidget = React.lazy(() => import("./DemoSandboxWidget"));

export function AdminLayout() {
  const location = useLocation();
  const [changelogOpen, setChangelogOpen] = useState(false);

  // Sidebar width (default 240px, min 160px, max 420px)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("admin_sidebar_width");
    const num = saved ? parseInt(saved, 10) : 240;
    return isNaN(num) ? 240 : Math.min(420, Math.max(160, num));
  });

  const isSchedulePage = location.pathname.startsWith("/schedule");

  // Media query detection for desktop (lg: >= 1024px)
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Sidebar collapsed state - auto collapsed on /schedule
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (window.location.pathname.startsWith("/schedule")) {
      return true;
    }
    return localStorage.getItem("admin_sidebar_collapsed") === "true";
  });

  // Auto hide sidebar when entering the schedule page
  useEffect(() => {
    if (isSchedulePage) {
      setIsSidebarCollapsed(true);
    }
  }, [isSchedulePage]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("admin_sidebar_collapsed", String(next));
      return next;
    });
  }, []);

  // Resizing logic via dragging the border divider
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const startWidthRef = useRef(sidebarWidth);

  const handleBorderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = false;
      dragStartXRef.current = e.clientX;
      startWidthRef.current = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - dragStartXRef.current;
        if (Math.abs(deltaX) > 3) {
          isDraggingRef.current = true;
        }
        if (isDraggingRef.current) {
          const newWidth = Math.min(
            420,
            Math.max(160, startWidthRef.current + deltaX)
          );
          setSidebarWidth(newWidth);
          localStorage.setItem("admin_sidebar_width", String(newWidth));
          setIsSidebarCollapsed(false);
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // If mouse moved < 3px, treat as a click to toggle collapse
        if (!isDraggingRef.current) {
          toggleSidebar();
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth, toggleSidebar]
  );

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-slate-800 font-sans overflow-x-hidden">
        {/* Toast Notification Provider */}
        <Toaster position="top-right" richColors closeButton />

        {/* Desktop Fixed Sidebar */}
        <div
          style={{
            width: isSidebarCollapsed ? 0 : `${sidebarWidth}px`,
            transform: isSidebarCollapsed ? "translateX(-100%)" : "translateX(0)",
          }}
          className="hidden lg:block fixed inset-y-0 left-0 z-40 transition-all duration-200 ease-in-out select-none shadow-sm"
        >
          <div className="relative h-full w-full">
            <Sidebar />

            {/* Draggable & Clickable Right Border Resizer */}
            <div
              onMouseDown={handleBorderMouseDown}
              title="Kéo dãn kích thước hoặc click để ẩn/hiện menu bên"
              className="absolute top-0 -right-1.5 w-3 h-full cursor-col-resize z-50 group flex items-center justify-center select-none"
            >
              <div className="w-1 h-full bg-slate-200/80 group-hover:bg-emerald-500 transition-colors" />
              <div className="hidden group-hover:flex absolute top-1/2 -translate-y-1/2 -right-2 bg-emerald-600 text-white rounded-full p-0.5 shadow-md">
                <ChevronLeft className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Floating Toggle Button when Sidebar is Collapsed */}
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Mở menu bên (Sidebar)"
            className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-50 items-center justify-center h-12 w-6 bg-white dark:bg-gray-900 border border-l-0 border-gray-300 dark:border-gray-700 rounded-r-md shadow-md hover:bg-emerald-50 hover:text-emerald-700 hover:w-7 transition-all text-gray-500 cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Main Content Area */}
        <div
          style={{
            paddingLeft:
              isDesktop && !isSidebarCollapsed ? `${sidebarWidth}px` : 0,
          }}
          className="flex flex-col min-h-screen min-w-0 overflow-x-hidden transition-[padding-left] duration-200 ease-in-out"
        >
          <Header
            onOpenChangelog={() => setChangelogOpen(true)}
            onToggleSidebar={toggleSidebar}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <main
            className={cn(
              "flex-1 w-full min-w-0 transition-all",
              isSchedulePage
                ? "max-w-none p-1.5 sm:p-2.5 md:p-3"
                : "max-w-none px-2.5 sm:px-4 py-3 sm:py-4"
            )}
          >
            <React.Suspense fallback={<AdminPageLoadingSkeleton />}>
              <Outlet />
            </React.Suspense>
          </main>
        </div>

        {/* Changelog Popup */}
        <ChangelogPopup
          open={changelogOpen}
          onOpenChange={setChangelogOpen}
          latestVersion={LATEST_VERSION}
          changelog={CHANGELOGS[0]}
        />

        {/* Super App Demo Studio Widget (0ms TBT lazy loaded) */}
        <React.Suspense fallback={null}>
          <DemoSandboxWidget />
        </React.Suspense>
      </div>
    </AdminGuard>
  );
}
