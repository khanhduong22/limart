import React, { useEffect } from "react";
import {
  User as UserIcon,
  Calendar,
  ClipboardList,
  Settings,
  History,
} from "lucide-react";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { useManagerTasksStore } from "@/stores/useManagerTasksStore";
import { UserItem } from "@/types/manager-tasks";
import { DailyChecklistTab } from "@/components/tasks/manager";

const TemplatesTab = React.lazy(() =>
  import("@/components/tasks/manager").then((m) => ({ default: m.TemplatesTab }))
);
const HistoryTab = React.lazy(() =>
  import("@/components/tasks/manager").then((m) => ({ default: m.HistoryTab }))
);
const CreateChecklistDialog = React.lazy(() =>
  import("@/components/tasks/manager").then((m) => ({ default: m.CreateChecklistDialog }))
);
const EditChecklistDialog = React.lazy(() =>
  import("@/components/tasks/manager").then((m) => ({ default: m.EditChecklistDialog }))
);

export function ManagerTasksPage() {
  const {
    activeTab,
    setActiveTab,
    selectedUserId,
    setSelectedUserId,
    selectedDate,
    setSelectedDate,
  } = useManagerTasksStore();

  // Fetch users for manager tasks
  const { data: rawUsers } = useAdminQuery<any>("/api/manager-tasks/users");
  const users: UserItem[] = Array.isArray(rawUsers)
    ? rawUsers
    : rawUsers?.data || [];

  // Filter admin users for priority display
  const adminUsers = users.filter(
    (u) =>
      u.role === "ADMIN" ||
      u.email?.includes("maithina4040") ||
      u.name?.toLowerCase() === "na"
  );
  const selectableUsers = adminUsers.length > 0 ? adminUsers : users;

  // Auto-select default user (prioritize Na or first admin)
  useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      const defaultUser =
        users.find(
          (u) =>
            u.role === "ADMIN" &&
            (u.email?.includes("maithina4040") || u.name?.toLowerCase() === "na")
        ) ||
        users.find((u) => u.role === "ADMIN") ||
        users[0];
      if (defaultUser) {
        setSelectedUserId(defaultUser.id);
      }
    }
  }, [users, selectedUserId, setSelectedUserId]);

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Checklist Quản Lý
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Hệ thống checklist công việc hàng ngày bắt buộc dành cho nhân sự quản lý và vận hành.
        </p>
      </div>

      {/* Selection Control Bar */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-slate-50 p-3 sm:p-4 rounded-2xl border">
        {/* User Selector */}
        <div className="flex items-center gap-2.5 w-full lg:w-auto">
          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700 shrink-0">
            <UserIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 lg:flex-initial min-w-0">
            <label className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5">
              Nhân sự phụ trách
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              aria-label="Chọn nhân sự quản lý phụ trách"
              className="bg-white border rounded-lg px-3 py-1.5 h-10 sm:h-9 text-base sm:text-sm font-semibold text-slate-800 shadow-xs focus:ring-2 focus:ring-indigo-500 outline-none w-full lg:w-auto"
            >
              {selectableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email?.split("@")[0]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Picker & Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-1.5 h-10 sm:h-9 shadow-xs w-full sm:w-auto">
            <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Chọn ngày xem checklist quản lý"
              className="text-base sm:text-sm font-semibold text-slate-700 outline-none border-0 p-0 w-full sm:w-32 focus:ring-0 focus:border-0"
            />
          </div>

          <div className="flex bg-slate-200/80 rounded-xl p-1 gap-1 overflow-x-auto w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("checklist")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "checklist"
                  ? "bg-white text-indigo-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Checklist
            </button>
            <button
              onClick={() => setActiveTab("templates")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "templates"
                  ? "bg-white text-indigo-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Settings className="h-3.5 w-3.5" /> Nhiệm vụ mẫu
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "history"
                  ? "bg-white text-indigo-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <History className="h-3.5 w-3.5" /> Lịch sử
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content (Tasks, templates, and history rendered with .cv-auto-table-row) */}
      {activeTab === "checklist" && <DailyChecklistTab />}
      {activeTab === "templates" && (
        <React.Suspense
          fallback={
            <div className="p-8 text-center text-muted-foreground">
              Đang tải...
            </div>
          }
        >
          <TemplatesTab />
        </React.Suspense>
      )}
      {activeTab === "history" && (
        <React.Suspense
          fallback={
            <div className="p-8 text-center text-muted-foreground">
              Đang tải...
            </div>
          }
        >
          <HistoryTab />
        </React.Suspense>
      )}

      {/* Dialogs */}
      <React.Suspense fallback={null}>
        <CreateChecklistDialog />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <EditChecklistDialog />
      </React.Suspense>
    </div>
  );
}

export default ManagerTasksPage;
