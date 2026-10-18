import React, { useState, useEffect, Suspense, lazy } from "react";
import { Toaster, toast } from "sonner";
import { BottomNavigation, NavTab } from "./components/BottomNavigation";
import { HomeCheckinView } from "./views/HomeCheckinView";
import { LoginView } from "./views/LoginView";
import { QueryClientProvider } from "@tanstack/react-query";

// Code-split secondary views via lazy loading to reduce initial bundle size
const ScheduleView = lazy(() => import("./views/ScheduleView"));
const TasksView = lazy(() => import("./views/TasksView"));
const PayrollView = lazy(() => import("./views/PayrollView"));
const ProfileView = lazy(() => import("./views/ProfileView"));
const HistoryView = lazy(() => import("./views/HistoryView"));
const RequestsView = lazy(() => import("./views/RequestsView"));
const LuckyWheelView = lazy(() => import("./views/LuckyWheelView"));
const PackingView = lazy(() => import("./views/PackingView"));
const CarryingView = lazy(() => import("./views/CarryingView"));
const StaffTasksView = lazy(() => import("./views/StaffTasksView"));
const RewardsView = lazy(() => import("./views/RewardsView"));
import { queryClient } from "./lib/queryClient";
import { useAppQuery } from "./lib/api-query";
import {
  getCachedProfile,
  saveCachedProfile,
  DEFAULT_STAFF,
  StaffProfile,
  fetcher,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
} from "./lib/api-client";
import { useOfflineQueue } from "./lib/use-offline-queue";
import { initPWARegistration } from "./lib/pwa-register";
import { RouterProvider, usePathname, useRouter } from "./lib/router";
import { ErrorBoundary } from "./components/ErrorBoundary";
const PwaInstallModal = lazy(() => import("./components/pwa").then((m) => ({ default: m.PwaInstallModal })));
const DemoSandboxWidget = lazy(() => import("./components/DemoSandboxWidget"));
import { useAppVersionGuard, VersionGuardBanner } from "@checkin/spa-version-guard";
import { DeferredTelemetryProvider } from "@checkin/deferred-telemetry";
import { Building2 } from "lucide-react";
import { isLikelyDemoHost } from "./lib/demo-mode";

function AppContent() {
  const rawPathname = usePathname();
  const pathname = rawPathname ? rawPathname.split("?")[0] : "/";
  const router = useRouter();
  const [hasCheckedSession, setHasCheckedSession] = useState<boolean>(false);
  const isEnterpriseDemo = isLikelyDemoHost();

  // Extract token from URL on mount (e.g. Google OAuth redirect callback)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get("token");
      if (urlToken) {
        setAuthToken(urlToken);
        urlParams.delete("token");
        const cleanSearch = urlParams.toString();
        const newUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : "");
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch {}
  }, []);

  // Authentication Guard: check Dual-Auth (Cookie + Bearer Token) via /api/me (once on mount)
  useEffect(() => {
    const token = getAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    const tryAutoDemoLogin = async (): Promise<boolean> => {
      try {
        const statusRes = await fetch("/api/demo/status", { credentials: "include" });
        if (!statusRes.ok) return false;
        const statusJson = await statusRes.json();
        const isDemoEnabled = Boolean(statusJson?.enabled || statusJson?.data?.enabled);
        if (!isDemoEnabled) return false;

        const targetRole = window.location.pathname.startsWith("/staff-tasks")
          ? "PARTNER"
          : "USER";
        const switchRes = await fetch("/api/demo/switch-role", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: targetRole }),
        });
        if (!switchRes.ok) return false;
        const switchJson = await switchRes.json();
        const payload =
          switchJson?.data && typeof switchJson.data === "object"
            ? { ...switchJson, ...switchJson.data }
            : switchJson;

        if (payload?.token) {
          setAuthToken(payload.token);
        }
        if (payload?.user) {
          saveCachedProfile({
            id: payload.user.id || "demo_staff",
            name: payload.user.name || "Nhân viên LimArt",
            email: payload.user.email || "",
            role: payload.user.role || targetRole,
            avatarUrl: payload.user.image || "/capybara_mascot.webp",
            employmentType: payload.user.employmentType || "PART_TIME",
            hourlyRate: payload.user.hourlyRate || 25000,
            streakDays: 0,
            gachaTickets: 1,
            achievements: payload.user.achievements || [],
          });
        }
        return true;
      } catch {
        return false;
      }
    };

    fetch("/api/me", { credentials: "include", headers })
      .then((res) => {
        if (res.ok) return res.json();
        if (res.status === 401) {
          removeAuthToken();
          throw new Error("Unauthenticated");
        }
        throw new Error(`HTTP ${res.status}`);
      })
      .then(async (data) => {
        if (data.success && data.user) {
          if (data.token) {
            setAuthToken(data.token);
          }
          saveCachedProfile({
            id: data.user.id,
            name: data.user.name || "Nhân viên LimArt",
            email: data.user.email || "",
            role: data.user.role || "USER",
            avatarUrl: data.user.image || "/capybara_mascot.webp",
            employmentType: data.user.employmentType || "PART_TIME",
            hourlyRate: data.user.hourlyRate || 25000,
            streakDays: 0,
            gachaTickets: 1,
            achievements: data.user.achievements || [],
          });
          // If on login view, navigate based on role
          if (data.user.role === "PARTNER") {
            if (pathname === "/login" || pathname === "/" || pathname === "/tasks") {
              router.push("/staff-tasks");
            }
          } else {
            if (pathname === "/login") {
              router.push("/");
            }
          }
        } else {
          const demoAuthed = await tryAutoDemoLogin();
          if (!demoAuthed && pathname !== "/login") {
            router.push("/login");
          }
        }
      })
      .catch(async (err) => {
        // If it's a network glitch/offline, DO NOT log out if cached profile exists!
        const cached = getCachedProfile();
        if (cached && cached.id && cached.id !== "staff_default") {
          console.warn("[App] Offline/network error, continuing with cached session for:", cached.name);
        } else if (err.message === "Unauthenticated") {
          const demoAuthed = await tryAutoDemoLogin();
          if (!demoAuthed && pathname !== "/login") {
            router.push("/login");
          }
        }
      })
      .finally(() => {
        setHasCheckedSession(true);
      });
  }, []);

  const { data: homeRes } = useAppQuery<{ success: boolean; data: any }>(
    hasCheckedSession && pathname !== "/login" ? "/api/staff/home-data" : null
  );
  const liveUser = homeRes?.data?.user;

  const profile: StaffProfile = liveUser
    ? {
        id: liveUser.id,
        name: liveUser.name || "Nhân viên LimArt",
        email: liveUser.email || "",
        role: liveUser.role || "USER",
        avatarUrl: liveUser.image || "/capybara_mascot.webp",
        employmentType: liveUser.employmentType || "PART_TIME",
        hourlyRate: liveUser.hourlyRate || 25000,
        streakDays: homeRes?.data?.streak || 0,
        gachaTickets: 1,
        achievements: liveUser.achievements || [],
      }
    : getCachedProfile();

  useEffect(() => {
    if (liveUser) {
      saveCachedProfile(profile);
    }
  }, [liveUser]);

  const isPartner = profile.role === "PARTNER";
  const isStaffTasksView = pathname.startsWith("/staff-tasks");
  const isWide = isPartner || isStaffTasksView;

  // Partner redirect guard: If role is PARTNER and on root `/`, redirect immediately to `/staff-tasks`
  useEffect(() => {
    if (hasCheckedSession && isPartner && pathname === "/") {
      router.push("/staff-tasks");
    }
  }, [hasCheckedSession, isPartner, pathname, router]);

  // Offline queue with silent background sync (no technical badges/banners)
  const { isOnline, pendingCount, isSyncing, syncNow } = useOfflineQueue();

  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      syncNow().then((res) => {
        if (res && res.syncedCount > 0) {
          toast.success(`Đã tự động đồng bộ ${res.syncedCount} lượt chấm công! 🍊`);
        }
      });
    }
  }, [isOnline, pendingCount, isSyncing, syncNow]);

  // Map pathname to BottomNav tab
  const getTabFromPath = (path: string): NavTab => {
    if (isPartner) {
      if (path.startsWith("/payroll")) return "payroll";
      if (path.startsWith("/profile")) return "profile";
      return "tasks";
    }
    if (
      path.startsWith("/tasks") ||
      path.startsWith("/staff-tasks") ||
      path.startsWith("/packing") ||
      path.startsWith("/carrying")
    ) {
      return "tasks";
    }
    if (path.startsWith("/schedule")) return "schedule";
    if (path.startsWith("/payroll")) return "payroll";
    if (path.startsWith("/profile")) return "profile";
    return "home";
  };

  const currentTab = getTabFromPath(pathname);

  const handleTabChange = (tab: NavTab) => {
    if (isPartner) {
      if (tab === "tasks" || tab === "home" || tab === "staff-tasks") {
        router.push("/staff-tasks");
        return;
      }
      if (tab === "payroll") {
        router.push("/payroll");
        return;
      }
      if (tab === "profile") {
        router.push("/profile");
        return;
      }
    }
    if (tab === "home") router.push("/");
    else if (tab === "tasks") router.push("/tasks");
    else if (tab === "staff-tasks") router.push("/staff-tasks");
    else router.push(`/${tab}`);
  };

  const outerBackgroundStyle: React.CSSProperties = isEnterpriseDemo
    ? {
        backgroundImage:
          "radial-gradient(at 0% 0%, rgba(79, 70, 229, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(14, 165, 233, 0.08) 0px, transparent 50%), linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)",
        backgroundAttachment: "fixed",
      }
    : {
        backgroundImage: "url(/capybara_bg.webp)",
        backgroundAttachment: "fixed",
        backgroundSize: "cover",
        backgroundPosition: "center",
      };

  const overlayClassName = isEnterpriseDemo
    ? "fixed inset-0 bg-slate-100/70 pointer-events-none -z-10"
    : "fixed inset-0 bg-[#faf6f0]/85 pointer-events-none -z-10";

  // While verifying cookie session for protected routes
  if (!hasCheckedSession && pathname !== "/login") {
    if (isEnterpriseDemo) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center shadow-md mx-auto mb-3 animate-pulse">
              <Building2 className="w-7 h-7" />
            </div>
            <p className="text-xs text-slate-600 font-semibold">
              Đang khởi tạo không gian làm việc doanh nghiệp...
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#faf6f0] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="h-16 w-16 mx-auto mb-3 overflow-hidden rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center animate-pulse">
            <img
              src="/capybara_mascot.webp"
              alt="LimArt"
              width="64"
              height="64"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </div>
          <p className="text-xs text-orange-900 font-medium">Đang kiểm tra đăng nhập...</p>
        </div>
      </div>
    );
  }

  // Login view is full-screen without BottomNav
  if (pathname === "/login") {
    return (
      <div
        className="min-h-screen text-stone-900 font-sans selection:bg-amber-400 selection:text-stone-950 flex flex-col justify-center relative"
        style={outerBackgroundStyle}
      >
        <div className={overlayClassName} />
        <Toaster position="top-center" richColors theme="light" closeButton />
        <LoginView />
        <Suspense fallback={null}>
          <PwaInstallModal />
        </Suspense>
        <Suspense fallback={null}>
          <DemoSandboxWidget />
        </Suspense>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-stone-900 font-sans selection:bg-amber-400 selection:text-stone-950 flex flex-col relative"
      style={outerBackgroundStyle}
    >
      <div className={overlayClassName} />
      {/* Toast Notifications */}
      <Toaster position="top-center" richColors theme="light" closeButton />

      {/* Responsive Shell Frame: Expands on iPad / Desktop for PARTNER or Staff Tasks */}
      <div
        className={`w-full mx-auto min-h-screen ${
          isEnterpriseDemo
            ? "bg-white/95 shadow-xl border-x border-slate-200/80"
            : "bg-[#faf6f0]/95 shadow-2xl border-x border-orange-100/60"
        } flex flex-col relative backdrop-blur-xs transition-all duration-200 max-w-full overflow-x-hidden ${
          isWide
            ? "max-w-4xl lg:max-w-5xl xl:max-w-6xl px-2 sm:px-6 md:px-8"
            : "w-full max-w-full md:max-w-md"
        }`}
      >
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-[50vh]">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              {pathname === "/" && <HomeCheckinView />}
              {pathname === "/schedule" && <ScheduleView />}
              {pathname === "/payroll" && <PayrollView />}
              {pathname === "/history" && <HistoryView />}
              {pathname === "/requests" && <RequestsView />}
              {pathname === "/lucky-wheel" && <LuckyWheelView />}
              {pathname === "/rewards" && <RewardsView />}
              {pathname === "/tasks" && <TasksView userRole={profile.role} />}
              {pathname === "/packing" && <PackingView />}
              {pathname === "/carrying" && <CarryingView />}
              {pathname === "/staff-tasks" && <StaffTasksView />}
              {pathname === "/profile" && <ProfileView profile={profile} />}
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* Fixed Bottom Navigation Bar */}
        <BottomNavigation
          currentTab={currentTab}
          onChangeTab={handleTabChange}
          userRole={profile.role}
          isWide={isWide}
        />
      </div>

      {/* PWA Installation Guide Modal */}
      <Suspense fallback={null}>
        <PwaInstallModal />
      </Suspense>

      {/* Demo Sandbox Studio Widget (Rendered only when /api/demo/status is enabled) */}
      <Suspense fallback={null}>
        <DemoSandboxWidget />
      </Suspense>
    </div>
  );
}

export const App: React.FC = () => {
  const { isUpdating } = useAppVersionGuard();

  // Initialize PWA Service Worker Registration
  useEffect(() => {
    initPWARegistration();
  }, []);

  return (
    <DeferredTelemetryProvider config={{ googleAnalyticsId: "G-LIMART-STAFF", debug: false }}>
      <ErrorBoundary>
        <VersionGuardBanner isUpdating={isUpdating} />
        <QueryClientProvider client={queryClient}>
          <RouterProvider>
            <AppContent />
          </RouterProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </DeferredTelemetryProvider>
  );
};

export default App;
