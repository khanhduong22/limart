import React, { Suspense, lazy } from "react";
import { useAppQuery } from "@/lib/api-query";
import {
  DEFAULT_HOME_DATA,
  StaffHomeData,
} from "@/lib/api-client";
import CheckInButtons from "@/components/CheckInButtons";
import AnnouncementBar from "@/components/AnnouncementBar";
import HomeAnnouncements from "@/components/HomeAnnouncements";
import PrivacyStats from "@/components/PrivacyStats";
const ShiftDutyHomeWidget = lazy(() => import("@/components/shift-duty/ShiftDutyHomeWidget"));
const GachaButton = lazy(() => import("@/components/GachaButton"));
const CapyAssistant = lazy(() => import("@/components/CapyAssistant"));
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/lib/router";
import { useHomeCheckinStore } from "@/stores/useHomeCheckinStore";
import {
  CheckinHeaderCard,
  CheckinTimerCard,
  LateWarningBanner,
  PartnerWelcomeBanner,
  HomeNavGrid,
  SpecialDaysWidget,
  RejectedTasksAlertBanner,
} from "@/components/home";

const RejectedTasksModal = lazy(() =>
  import("@/components/home").then((m) => ({ default: m.RejectedTasksModal }))
);

export const HomeCheckinView: React.FC = () => {
  const router = useRouter();
  const { showRejectedModal, setShowRejectedModal } = useHomeCheckinStore();

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const viewAsUserId = searchParams?.get("viewAsUserId");
  const homeDataUrl = viewAsUserId
    ? `/api/staff/home-data?viewAsUserId=${encodeURIComponent(viewAsUserId)}`
    : "/api/staff/home-data";

  const { data: response, mutate } = useAppQuery<{ success: boolean; data: StaffHomeData }>(
    homeDataUrl,
    { revalidateOnFocus: true, revalidateIfStale: true }
  );

  const homeData: StaffHomeData = response?.data || DEFAULT_HOME_DATA;
  const {
    user,
    streak,
    swapCount,
    announcements,
    rejectedTasksCount,
    rejectedTasks = [],
    stats,
    todayCheckins,
    todayShift,
    todayDuties,
    hasCheckedInToday,
    specialUsers,
    activeUsers,
  } = homeData;

  const handleCheckinSuccess = () => {
    mutate();
  };

  return (
    <div className="flex flex-col items-center justify-center p-2 sm:p-3 w-full bg-transparent">
      <div className="w-full max-w-md space-y-3 animate-in fade-in duration-300 pb-20">
        {/* Admin View Mode Banner */}
        {homeData.isViewAsMode && (
          <div className="bg-purple-700 text-white p-3.5 rounded-xl flex items-center justify-between shadow-md border border-purple-500/30 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">👁️</span>
              <div className="text-xs leading-tight text-left">
                <p className="font-bold text-white">Chế độ xem quản trị viên</p>
                <p className="text-purple-200 text-[11px] mt-0.5">
                  Đang xem: <span className="font-semibold text-white">{user?.name}</span>
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                window.location.href = window.location.pathname;
              }}
              className="bg-white hover:bg-purple-50 text-purple-900 text-xs font-bold h-7 px-2.5 shadow-2xs cursor-pointer"
            >
              Thoát
            </Button>
          </div>
        )}

        {/* Special Days Widget */}
        <div id="home-special-days">
          <SpecialDaysWidget
            specialUsers={specialUsers || []}
            currentUserId={user?.id}
            enableCalendar={false}
          />
        </div>

        {/* Announcements Modal Popup */}
        <div id="home-announcement">
          <AnnouncementBar
            announcements={announcements || []}
            onMarkedRead={() => mutate()}
          />
        </div>

        {/* Rejected Tasks Alert Banner */}
        <RejectedTasksAlertBanner
          count={rejectedTasksCount}
          onOpenModal={() => setShowRejectedModal(true)}
        />

        {/* Main Card Container */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm relative overflow-hidden">
          {/* Header Card with Mascot & Streak */}
          <CheckinHeaderCard
            user={user}
            streak={streak}
            swapCount={swapCount}
            todayShift={todayShift}
            todayCheckins={todayCheckins}
          />

          <div className="px-5 sm:px-6 pb-6 space-y-5">
            {/* Live Running Work Duration Timer */}
            <CheckinTimerCard
              todayCheckins={todayCheckins}
              todayShift={todayShift}
            />

            {/* Late Warning Alert Banner */}
            <LateWarningBanner
              lateCount={stats?.lateCount}
              latePenaltyHours={stats?.latePenaltyHours}
              latePenaltyAmount={stats?.latePenaltyAmount}
            />

            {/* Privacy Stats (Total Salary, Hours, Days) */}
            <div id="home-privacy-stats">
              <PrivacyStats
                totalHours={stats?.totalHours || 0}
                totalSalary={stats?.totalSalary || 0}
                daysWorked={stats?.daysWorked || 0}
                baseSalary={stats?.baseSalary}
                totalAdjustments={stats?.totalAdjustments}
                latePenaltyHours={stats?.latePenaltyHours}
                latePenaltyAmount={stats?.latePenaltyAmount}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-100" />
              </div>
            </div>

            {/* Partner Welcome Banner OR Check-In Buttons Component */}
            {user?.role === "PARTNER" ? (
              <PartnerWelcomeBanner />
            ) : (
              <div id="home-checkin-buttons">
                <CheckInButtons
                  userId={user?.id}
                  todayCheckins={todayCheckins || []}
                  todayShift={todayShift}
                  onCheckinSuccess={handleCheckinSuccess}
                />
              </div>
            )}

            {/* Internal Announcements List */}
            <div id="home-announcements-list">
              <HomeAnnouncements announcements={announcements || []} />
            </div>

            {/* Shift Duties Widget */}
            <div id="home-shift-duties" className="pt-2">
              <Suspense fallback={null}>
                <ShiftDutyHomeWidget
                  currentUserId={user?.id}
                  isAdmin={user?.role === "ADMIN"}
                  duties={todayDuties || []}
                  activeUsers={activeUsers || []}
                />
              </Suspense>
            </div>

            {/* Capybara Mascot AI Assistant */}
            <div id="home-sticky" className="pt-2 min-h-[96px]">
              <Suspense
                fallback={
                  <div className="h-24 w-full animate-pulse rounded-2xl bg-amber-50/50 border border-amber-200/40" />
                }
              >
                <CapyAssistant currentUser={user} />
              </Suspense>
            </div>

            {/* Functional Menu Buttons */}
            <HomeNavGrid
              userRole={user?.role}
              staffTasksAllowed={user?.staffTasksAllowed}
              rejectedTasksCount={rejectedTasksCount}
            />

            {/* Gacha Game & Rewards Section */}
            <div id="home-gacha" className="pt-4 space-y-3 border-t border-dashed mt-4">
              <Suspense fallback={null}>
                <GachaButton
                  userId={user?.id}
                  hasCheckedIn={hasCheckedInToday}
                  isAdmin={user?.role === "ADMIN"}
                />
              </Suspense>
              <Link to="/rewards" className="block w-full">
                <Button
                  variant="outline"
                  className="w-full h-11 text-sm font-bold border-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50 text-orange-700 hover:from-yellow-100 hover:to-orange-100 shadow-2xs transition-all hover:scale-[1.01] cursor-pointer"
                >
                  🏆 Bảng Vàng & Khen Thưởng
                </Button>
              </Link>
              {user?.role === "ADMIN" && (
                <div className="pt-2 text-center">
                  <a
                    href="/admin"
                    className="text-xs font-bold text-amber-900 hover:text-amber-950 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100/80 border border-amber-300 rounded-xl transition-all shadow-2xs"
                  >
                    ⚙️ Vào Trang Quản Trị (Admin) →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Brand */}
        <div className="mt-4 text-[10px] text-center text-stone-400 font-mono">
          LimArt Staff App • Chấm Công Thông Minh
        </div>
      </div>

      {/* Rejected Tasks Modal */}
      {showRejectedModal && (
        <Suspense fallback={null}>
          <RejectedTasksModal
            open={showRejectedModal}
            onOpenChange={setShowRejectedModal}
            rejectedTasks={rejectedTasks}
            onNavigateToTask={(link) => router.push(link)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default HomeCheckinView;
