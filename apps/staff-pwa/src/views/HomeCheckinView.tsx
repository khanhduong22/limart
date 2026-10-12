import React, { useState } from "react";
import useSWR from "swr";
import {
  fetcher,
  DEFAULT_HOME_DATA,
  StaffHomeData,
  CheckinRecord,
} from "@/lib/api-client";
import CheckInButtons from "@/components/CheckInButtons";
import GachaButton from "@/components/GachaButton";
import SpecialDaysWidget from "@/components/home/SpecialDaysWidget";
import AnnouncementBar from "@/components/AnnouncementBar";
import HomeAnnouncements from "@/components/HomeAnnouncements";
import PrivacyStats from "@/components/PrivacyStats";
import ShiftDutyHomeWidget from "@/components/shift-duty/ShiftDutyHomeWidget";
import CapyAssistant from "@/components/CapyAssistant";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/lib/router";

export const HomeCheckinView: React.FC = () => {
  const router = useRouter();
  const [showRejectedModal, setShowRejectedModal] = useState(false);
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const viewAsUserId = searchParams?.get("viewAsUserId");
  const homeDataUrl = viewAsUserId
    ? `/api/staff/home-data?viewAsUserId=${encodeURIComponent(viewAsUserId)}`
    : "/api/staff/home-data";

  const { data: response, mutate } = useSWR<{ success: boolean; data: StaffHomeData }>(
    homeDataUrl,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateIfStale: true,
    }
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
              <div className="text-xs leading-tight">
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
              className="bg-white hover:bg-purple-50 text-purple-900 text-xs font-bold h-7 px-2.5 shadow-xs cursor-pointer"
            >
              Thoát
            </Button>
          </div>
        )}

        {/* Interactive Tour Guide & Tour Help Button (temporarily disabled) */}

        {/* Special Days Widget (Birthdays, Anniversaries, Holidays) */}
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

        {/* Rejected Tasks Alert */}
        {rejectedTasksCount > 0 && (
          <div className="border border-rose-200 bg-rose-50/90 rounded-xl p-4 flex items-start gap-3 shadow-xs animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="p-2 bg-rose-100 rounded-full text-rose-700 leading-none">
              <span className="text-base">⚠️</span>
            </div>
            <div className="flex-grow space-y-1">
              <h3 className="text-sm font-bold text-rose-800">
                Yêu cầu sửa đổi công việc
              </h3>
              <p className="text-xs text-rose-700 leading-relaxed">
                Bạn có{" "}
                <span className="font-extrabold text-rose-900">
                  {rejectedTasksCount}
                </span>{" "}
                công việc khoán/KPI bị Admin từ chối và yêu cầu sửa đổi.
              </p>
              <div className="pt-1.5">
                <Button
                  size="sm"
                  onClick={() => setShowRejectedModal(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-7 text-xs px-3 shadow-xs cursor-pointer"
                >
                  Xem chi tiết & sửa ngay
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Card Container */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm relative overflow-hidden">
          {/* Streak & Swap Badges */}
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            {swapCount > 0 && (
              <Link
                to="/schedule"
                className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-[10px] font-bold border border-purple-200 shadow-sm animate-pulse hover:bg-purple-200 transition-colors"
              >
                🎁 {swapCount} kèo thơm
              </Link>
            )}
            {streak > 0 && (
              <div className="bg-orange-100 text-orange-600 px-2 py-1 rounded-full text-[10px] font-bold border border-orange-200 shadow-sm">
                🔥 {streak}
              </div>
            )}
          </div>

          {/* User Welcome Header */}
          <div className="p-4 sm:p-5 pb-3 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-900">
                {user?.role === "PARTNER" ? "Khu Vực Đối Tác" : "Chấm Công"}
              </h1>
              <div
                id="home-user-info"
                className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5"
              >
                <span>Xin chào, {user?.name || "Bạn"}</span>
                {user?.achievements?.map((a: any) => {
                  if (a.code === "LUCKY_STAR")
                    return (
                      <span key={a.id} title="Ngôi Sao May Mắn">
                        🌟
                      </span>
                    );
                  if (a.code === "GACHA_KING")
                    return (
                      <span key={a.id} title="Vua Nhân Phẩm">
                        👑
                      </span>
                    );
                  return null;
                })}
                <Link
                  to="/profile"
                  className="inline-flex items-center text-[10px] text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200/70 px-1.5 py-0.2 rounded-md font-semibold transition-colors ml-1"
                  title="Chuyển tài khoản"
                >
                  Đổi
                </Link>
              </div>
            </div>

            {/* Official LimArt Logo */}
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-yellow-50 overflow-hidden shadow-xs border border-yellow-100">
              <img
                src="/logo.png"
                alt="LimArt"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as any).src = "/icon-192.png";
                }}
              />
            </div>
          </div>

          <div className="px-6 pb-6 space-y-6">
            {/* Late Warning Alert Banner (if late >= 2) */}
            {stats && stats.lateCount !== undefined && stats.lateCount >= 2 && (
              <div
                className={`border rounded-lg p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 ${
                  stats.lateCount >= 4
                    ? "bg-red-100 border-red-400"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div
                  className={`p-2 rounded-full ${
                    stats.lateCount >= 4 ? "bg-red-200" : "bg-red-100"
                  }`}
                >
                  <span className="text-xl">{stats.lateCount >= 4 ? "🚨" : "⚠️"}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-800">
                    {stats.lateCount >= 4
                      ? "⛔ Bị trừ lương do đi trễ"
                      : "Cảnh báo đi trễ"}
                  </h3>
                  <p className="text-xs text-red-700 mt-1">
                    Bạn đã đi trễ <span className="font-bold">{stats.lateCount}</span>{" "}
                    lần trong tháng này.
                  </p>
                  {stats.latePenaltyHours !== undefined &&
                    stats.latePenaltyHours > 0 && (
                      <div className="mt-2 bg-red-200/60 rounded-md px-2 py-1.5 text-xs text-red-900 space-y-0.5">
                        <div className="flex justify-between">
                          <span>⏱ Số giờ bị trừ:</span>
                          <span className="font-bold">
                            {stats.latePenaltyHours} giờ
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-red-300/60 pt-0.5">
                          <span>💸 Tiền bị trừ:</span>
                          <span className="font-bold text-red-700">
                            −{" "}
                            {new Intl.NumberFormat("vi-VN", {
                              style: "currency",
                              currency: "VND",
                            }).format(stats.latePenaltyAmount || 0)}
                          </span>
                        </div>
                        <p className="text-[10px] text-red-600 pt-0.5 border-t border-red-300/60">
                          Từ lần trễ thứ 4, mỗi lần trễ thêm sẽ bị trừ 1 giờ lương.
                        </p>
                      </div>
                    )}
                </div>
              </div>
            )}

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
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-sm text-left">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl shrink-0">
                    🎨
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 leading-tight">
                      Chào mừng Đối tác LimArt!
                    </h3>
                    <p className="text-[11px] text-stone-600 mt-0.5">
                      Tài khoản WFH / Marketing / Đối tác gia công. Tự do thời gian, nhận việc và tính lương theo KPI hiệu suất.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <Link to="/tasks" className="block w-full">
                    <Button
                      variant="default"
                      className="w-full text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer py-2 h-auto"
                    >
                      💼 Vào Sàn việc (WFH)
                    </Button>
                  </Link>
                  <Link to="/packing" className="block w-full">
                    <Button
                      variant="outline"
                      className="w-full text-xs font-bold border-amber-300 text-amber-900 bg-white hover:bg-amber-50 shadow-xs cursor-pointer py-2 h-auto"
                    >
                      📦 Báo cáo Đóng gói
                    </Button>
                  </Link>
                </div>
              </div>
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
              <ShiftDutyHomeWidget
                currentUserId={user?.id}
                isAdmin={user?.role === "ADMIN"}
                duties={todayDuties || []}
                activeUsers={activeUsers || []}
              />
            </div>

            {/* Capybara Mascot AI Assistant */}
            <div id="home-sticky" className="pt-2">
              <CapyAssistant currentUser={user} />
            </div>

            {/* Functional Menu Buttons */}
            <div id="home-nav" className="space-y-3 pt-2">
              <div className="flex gap-3">
                <Link to="/history" className="flex-1">
                  <Button variant="outline" className="w-full text-xs cursor-pointer">
                    📜 Lịch sử
                  </Button>
                </Link>
                <Link to="/payroll" className="flex-1">
                  <Button
                    variant="outline"
                    className="w-full text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 cursor-pointer"
                  >
                    💰 Chi tiết lương
                  </Button>
                </Link>
              </div>

              {user?.role !== "PARTNER" && (
                <div className="grid grid-cols-2 gap-3">
                  <Link to="/schedule" className="block w-full">
                    <Button variant="outline" className="w-full text-xs cursor-pointer">
                      📅 Đăng ký Lịch
                    </Button>
                  </Link>
                  <Link to="/requests" className="block w-full">
                    <Button
                      variant="ghost"
                      className="w-full text-xs text-muted-foreground bg-gray-100/50 cursor-pointer"
                    >
                      📝 Xin giải trình
                    </Button>
                  </Link>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <Link to="/packing" className="block w-full">
                  <Button
                    variant="default"
                    className="w-full text-xs bg-purple-600 hover:bg-purple-700 text-white px-1 cursor-pointer"
                  >
                    📦 Đóng gói
                  </Button>
                </Link>
                <Link to="/carrying" className="block w-full">
                  <Button
                    variant="default"
                    className="w-full text-xs bg-amber-600 hover:bg-amber-700 text-white px-1 cursor-pointer"
                  >
                    🛗 Bưng lầu
                  </Button>
                </Link>
              </div>

              {(user?.staffTasksAllowed || user?.role === "ADMIN") && (
                <div>
                  <Link to="/staff-tasks" className="block w-full">
                    <Button
                      variant="default"
                      className="w-full h-11 text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md transition-all hover:scale-[1.01] relative flex items-center justify-center gap-2 cursor-pointer"
                    >
                      🎯 Công việc và KPI
                      {rejectedTasksCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white animate-bounce shadow-sm border border-white">
                          {rejectedTasksCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Gacha Game & Rewards Section */}
            <div
              id="home-gacha"
              className="pt-4 space-y-3 border-t border-dashed mt-4"
            >
              <GachaButton
                userId={user?.id}
                hasCheckedIn={hasCheckedInToday}
                isAdmin={user?.role === "ADMIN"}
              />
              <Link to="/rewards" className="block w-full">
                <Button
                  variant="outline"
                  className="w-full h-11 text-sm font-bold border-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50 text-orange-700 hover:from-yellow-100 hover:to-orange-100 shadow-xs transition-all hover:scale-[1.01] cursor-pointer"
                >
                  🏆 Bảng Vàng & Khen Thưởng
                </Button>
              </Link>
              {user?.role === "ADMIN" && (
                <div className="pt-2 text-center">
                  <a
                    href="/admin"
                    className="text-xs font-bold text-amber-900 hover:text-amber-950 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100/80 border border-amber-300 rounded-xl transition-all shadow-xs"
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-4 sm:p-5 max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <div>
                  <h2 className="text-base font-bold text-rose-900">Công việc bị từ chối</h2>
                  <p className="text-[11px] text-stone-500">
                    {rejectedTasks.length} nhiệm vụ cần bạn cập nhật và nộp lại
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRejectedModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-3 space-y-3">
              {rejectedTasks.length === 0 ? (
                <div className="text-center py-6 text-stone-500 text-xs">
                  Không có công việc nào cần sửa đổi
                </div>
              ) : (
                rejectedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2.5 shadow-xs text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              task.type === "PACKING"
                                ? "bg-blue-100 text-blue-700 border border-blue-200"
                                : task.type === "CARRYING"
                                ? "bg-purple-100 text-purple-700 border border-purple-200"
                                : task.type === "STAFF_TASK"
                                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                : "bg-amber-100 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {task.type === "PACKING"
                              ? "📦 Đóng gói"
                              : task.type === "CARRYING"
                              ? "🏋️ Bưng hàng"
                              : task.type === "STAFF_TASK"
                              ? "🎯 KPI khoán"
                              : "💼 Nhiệm vụ WFH"}
                          </span>
                          {task.date && (
                            <span className="text-[10px] text-stone-400">
                              {new Date(task.date).toLocaleDateString("vi-VN", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-stone-900 leading-snug">
                          {task.title}
                        </h4>
                      </div>
                    </div>

                    {/* Lý do từ chối */}
                    <div className="bg-rose-100/80 border border-rose-300 rounded-lg p-2.5 text-xs text-rose-900 space-y-0.5">
                      <p className="font-bold text-[11px] text-rose-950 flex items-center gap-1">
                        <span>💬</span> Lý do Admin yêu cầu sửa:
                      </p>
                      <p className="text-[11px] text-rose-800 leading-relaxed font-medium">
                        {task.reason}
                      </p>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        onClick={() => {
                          setShowRejectedModal(false);
                          router.push(task.link);
                        }}
                        className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 shadow-xs cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>Sửa & Nộp lại</span>
                        <span>➔</span>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-stone-100 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRejectedModal(false)}
                className="h-8 text-xs cursor-pointer"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeCheckinView;
