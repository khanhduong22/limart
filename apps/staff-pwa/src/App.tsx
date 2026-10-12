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
import useSWR from "swr";
import {
  getCachedProfile,
  saveCachedProfile,
  DEFAULT_STAFF,
  StaffProfile,
  fetcher,
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

  // Authentication Guard: check HttpOnly cookie session via /api/me
  useEffect(() => {
    // Verify if user is authenticated via HttpOnly cookie (e.g. Google OAuth redirect)
    fetch("/api/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Unauthenticated");
      })
      .then((data) => {
        if (data.success && data.user) {
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
        } else if (pathname !== "/login") {
          router.push("/login");
        }
      })
      .catch(() => {
        if (pathname !== "/login") {
          router.push("/login");
        }
      })
      .finally(() => {
        setHasCheckedSession(true);
      });
  }, [pathname, router]);

  const { data: homeRes } = useSWR<{ success: boolean; data: any }>(
    hasCheckedSession && pathname !== "/login" ? "/api/staff/home-data" : null,
    fetcher
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
    if (path.startsWith("/schedule")) return "schedule";
    if (path.startsWith("/tasks") || path.startsWith("/packing") || path.startsWith("/carrying") || path.startsWith("/staff-tasks"))
      return "tasks";
    if (path.startsWith("/payroll")) return "payroll";
    if (path.startsWith("/profile")) return "profile";
    return "home";
  };

  const currentTab = getTabFromPath(pathname);

  const handleTabChange = (tab: NavTab) => {
    if (tab === "home") router.push("/");
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

      {/* Centered Mobile Shell Frame (Warm LimArt Tone) */}
      <div className="w-full max-w-md mx-auto min-h-screen bg-[#faf6f0]/95 shadow-2xl border-x border-orange-100/60 flex flex-col relative backdrop-blur-xs">
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
      <RouterProvider>
        <AppContent />
      </RouterProvider>
    </ErrorBoundary>
  );
};

export default App;
