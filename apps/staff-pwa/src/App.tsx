import React, { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { BottomNavigation, NavTab } from "./components/BottomNavigation";
import { HomeCheckinView } from "./views/HomeCheckinView";
import { ScheduleView } from "./views/ScheduleView";
import { TasksView } from "./views/TasksView";
import { PayrollView } from "./views/PayrollView";
import { ProfileView } from "./views/ProfileView";
import { HistoryView } from "./views/HistoryView";
import { RequestsView } from "./views/RequestsView";
import { LuckyWheelView } from "./views/LuckyWheelView";
import { LoginView } from "./views/LoginView";
import { PackingView } from "./views/PackingView";
import { CarryingView } from "./views/CarryingView";
import { StaffTasksView } from "./views/StaffTasksView";
import { RewardsView } from "./views/RewardsView";
import { QueryClientProvider } from "@tanstack/react-query";
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
import { PwaInstallModal } from "./components/pwa";
import { useAppVersionGuard, VersionGuardBanner } from "@checkin/spa-version-guard";

function AppContent() {
  const rawPathname = usePathname();
  const pathname = rawPathname ? rawPathname.split("?")[0] : "/";
  const router = useRouter();
  const [hasCheckedSession, setHasCheckedSession] = useState<boolean>(false);

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

    fetch("/api/me", { credentials: "include", headers })
      .then((res) => {
        if (res.ok) return res.json();
        if (res.status === 401) {
          removeAuthToken();
          throw new Error("Unauthenticated");
        }
        throw new Error(`HTTP ${res.status}`);
      })
      .then((data) => {
        if (data.success && data.user) {
          if (data.token) {
            setAuthToken(data.token);
          }
          saveCachedProfile({
            id: data.user.id,
            name: data.user.name || "Nhân viên LimArt",
            email: data.user.email || "",
            role: data.user.role || "USER",
            avatarUrl: data.user.image || "/capybara_mascot.png",
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
          if (pathname !== "/login") {
            router.push("/login");
          }
        }
      })
      .catch((err) => {
        // If it's a network glitch/offline, DO NOT log out if cached profile exists!
        const cached = getCachedProfile();
        if (cached && cached.id && cached.id !== "staff_default") {
          console.warn("[App] Offline/network error, continuing with cached session for:", cached.name);
        } else if (err.message === "Unauthenticated") {
          if (pathname !== "/login") {
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
        avatarUrl: liveUser.image || "/capybara_mascot.png",
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

  // Partner redirect guard: If role is PARTNER and on root `/` or `/tasks`, redirect immediately to `/staff-tasks`
  useEffect(() => {
    if (hasCheckedSession && isPartner && (pathname === "/" || pathname === "/tasks")) {
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
      return "staff-tasks";
    }
    if (path.startsWith("/schedule")) return "schedule";
    if (path.startsWith("/payroll")) return "payroll";
    if (path.startsWith("/profile")) return "profile";
    return "home";
  };

  const currentTab = getTabFromPath(pathname);

  const handleTabChange = (tab: NavTab) => {
    if (isPartner) {
      if (tab === "staff-tasks" || tab === "home" || tab === "tasks") {
        router.push("/staff-tasks");
        return;
      }
    }
    if (tab === "home") router.push("/");
    else if (tab === "staff-tasks") router.push("/staff-tasks");
    else router.push(`/${tab}`);
  };

  // While verifying cookie session for protected routes
  if (!hasCheckedSession && pathname !== "/login") {
    return (
      <div className="min-h-screen bg-[#faf6f0] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="h-16 w-16 mx-auto mb-3 overflow-hidden rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center animate-pulse">
            <img src="/capybara_mascot.png" alt="LimArt" className="w-full h-full object-cover" />
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
        style={{
          backgroundImage: 'url(/capybara_bg.png)',
          backgroundAttachment: 'fixed',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="fixed inset-0 bg-[#faf6f0]/85 pointer-events-none -z-10" />
        <Toaster position="top-center" richColors theme="light" closeButton />
        <LoginView />
        <PwaInstallModal />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-stone-900 font-sans selection:bg-amber-400 selection:text-stone-950 flex flex-col relative"
      style={{
        backgroundImage: 'url(/capybara_bg.png)',
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="fixed inset-0 bg-[#faf6f0]/85 pointer-events-none -z-10" />
      {/* Toast Notifications */}
      <Toaster position="top-center" richColors theme="light" closeButton />

      {/* Responsive Shell Frame: Expands on iPad / Desktop for PARTNER or Staff Tasks */}
      <div
        className={`w-full mx-auto min-h-screen bg-[#faf6f0]/95 shadow-2xl border-x border-orange-100/60 flex flex-col relative backdrop-blur-xs transition-all duration-200 ${
          isWide
            ? "max-w-4xl lg:max-w-5xl xl:max-w-6xl px-2 sm:px-6 md:px-8"
            : "max-w-md"
        }`}
      >
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col">
          <ErrorBoundary>
            {pathname === "/" && <HomeCheckinView />}
            {pathname === "/schedule" && <ScheduleView />}
            {pathname === "/payroll" && <PayrollView />}
            {pathname === "/history" && <HistoryView />}
            {pathname === "/requests" && <RequestsView />}
            {pathname === "/lucky-wheel" && <LuckyWheelView />}
            {pathname === "/rewards" && <RewardsView />}
            {pathname === "/tasks" && <TasksView />}
            {pathname === "/packing" && <PackingView />}
            {pathname === "/carrying" && <CarryingView />}
            {pathname === "/staff-tasks" && <StaffTasksView />}
            {pathname === "/profile" && <ProfileView profile={profile} />}
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
      <PwaInstallModal />
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
    <ErrorBoundary>
      <VersionGuardBanner isUpdating={isUpdating} />
      <QueryClientProvider client={queryClient}>
        <RouterProvider>
          <AppContent />
        </RouterProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
