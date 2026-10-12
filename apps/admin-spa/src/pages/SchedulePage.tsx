import React from "react";
import {
  Calendar as CalendarIcon,
  Columns3,
  CalendarRange,
} from "lucide-react";
import { useEmployees } from "@/hooks/useAdminData";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import ScheduleCalendar from "@/components/schedule/ScheduleCalendar";
import UploadScheduleButton from "@/components/schedule/UploadScheduleButton";
import ShiftHistoryDialog from "@/components/admin/ShiftHistoryDialog";
import ScheduleColumnsView from "@/components/schedule/ScheduleColumnsView";
import ScheduleAddShiftModal from "@/components/schedule/ScheduleAddShiftModal";
import ScheduleDeleteShiftDialog from "@/components/schedule/ScheduleDeleteShiftDialog";
import { useAdminSchedulePageStore } from "@/stores/useAdminSchedulePageStore";

export function SchedulePage() {
  const { viewMode, setViewMode, openAddModal, openDeleteModal } =
    useAdminSchedulePageStore();

  const { employees } = useEmployees();

  // Fetch all shifts
  const { data: scheduleData, mutate } = useAdminQuery<any>(
    "/api/admin/schedule",
    { revalidateOnFocus: true }
  );

  const { data: meData } = useAdminQuery<any>("/api/me");
  const currentUser = meData?.data || meData;

  const events = Array.isArray(scheduleData)
    ? scheduleData
    : Array.isArray(scheduleData?.data)
    ? scheduleData.data
    : [];

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-900 flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 shrink-0" />
            <span>Quản lý Lịch làm việc</span>
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Xem, quản lý và tải lên file Excel lịch làm hàng tuần.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 w-full sm:w-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs sm:text-sm font-semibold transition cursor-pointer ${
                viewMode === "calendar"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <CalendarRange className="h-4 w-4" />
              Lịch trực quan
            </button>
            <button
              type="button"
              onClick={() => setViewMode("columns")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs sm:text-sm font-semibold transition cursor-pointer ${
                viewMode === "columns"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Columns3 className="h-4 w-4" />
              Cột tuần
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <ShiftHistoryDialog />
            <UploadScheduleButton onSuccess={mutate} />
          </div>
        </div>
      </div>

      {/* Main Body */}
      {viewMode === "calendar" ? (
        <ScheduleCalendar
          initialEvents={events}
          userId={currentUser?.id || "admin"}
          isAdmin={true}
          users={employees}
          onEventsChange={mutate}
        />
      ) : (
        <ScheduleColumnsView
          events={events}
          onDeleteShift={(shiftId) => openDeleteModal(shiftId)}
          onAddShift={() => openAddModal()}
        />
      )}

      {/* Dialogs for Columns View */}
      <ScheduleAddShiftModal employees={employees} onSuccess={mutate} />
      <ScheduleDeleteShiftDialog onSuccess={mutate} />
    </div>
  );
}

export default SchedulePage;
