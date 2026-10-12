import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Sun,
  Sunset,
  Moon,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useAdminSchedulePageStore,
  getMonday,
  formatDateToDM,
  formatDateToYMD,
} from "@/stores/useAdminSchedulePageStore";

export interface ShiftAssignment {
  id: string | number;
  name: string;
  department: string;
  role: string;
  start: string;
  end: string;
  userId: string;
}

export interface DaySchedule {
  dayName: string;
  dateStr: string;
  fullDateStr: string;
  isToday: boolean;
  shifts: {
    morning: ShiftAssignment[];
    afternoon: ShiftAssignment[];
    evening: ShiftAssignment[];
  };
}

const DAY_NAMES = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
];

interface ScheduleColumnsViewProps {
  events: any[];
  onDeleteShift?: (shiftId: string | number) => void;
  onAddShift?: () => void;
}

export function ScheduleColumnsView({
  events,
  onDeleteShift,
  onAddShift,
}: ScheduleColumnsViewProps) {
  const {
    currentDate,
    prevWeek,
    nextWeek,
    currentWeek,
    openAddModal,
    openDeleteModal,
  } = useAdminSchedulePageStore();

  const monday = getMonday(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const todayStr = formatDateToYMD(new Date());

  const columnScheduleData: DaySchedule[] = weekDays.map((dateObj, i) => {
    const dateStr = formatDateToDM(dateObj);
    const fullDateStr = formatDateToYMD(dateObj);
    const isToday = fullDateStr === todayStr;

    const dayShifts = (Array.isArray(events) ? events : []).filter((s: any) => {
      if (!s?.start) return false;
      const shiftDate = new Date(s.start);
      if (isNaN(shiftDate.getTime())) return false;
      const shiftDateStr = shiftDate.toLocaleDateString("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
      });
      return shiftDateStr === fullDateStr;
    });

    const morning: ShiftAssignment[] = [];
    const afternoon: ShiftAssignment[] = [];
    const evening: ShiftAssignment[] = [];

    for (const s of dayShifts) {
      const startDate = new Date(s.start);
      const hour = parseInt(
        startDate.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          hour12: false,
          timeZone: "Asia/Ho_Chi_Minh",
        }),
        10
      );

      const assignment: ShiftAssignment = {
        id: s.id,
        name: s?.user?.name || s?.title || "Nhân sự",
        department:
          s?.user?.department || (s?.shiftType ? `Ca ${s.shiftType}` : "Trực ca"),
        role: s?.user?.role === "ADMIN" ? "Quản lý" : "Nhân viên",
        start: s.start,
        end: s.end,
        userId: s.userId,
      };

      if (hour < 12) {
        morning.push(assignment);
      } else if (hour < 17) {
        afternoon.push(assignment);
      } else {
        evening.push(assignment);
      }
    }

    return {
      dayName: DAY_NAMES[i],
      dateStr,
      fullDateStr,
      isToday,
      shifts: {
        morning,
        afternoon,
        evening,
      },
    };
  });

  const formatTime = (d: string | Date | null) => {
    if (!d) return "--:--";
    return new Date(d).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    });
  };

  const handleDelete = (shiftId: string | number) => {
    if (onDeleteShift) {
      onDeleteShift(shiftId);
    } else {
      openDeleteModal(shiftId);
    }
  };

  const handleAdd = () => {
    if (onAddShift) {
      onAddShift();
    } else {
      openAddModal();
    }
  };

  const sunday = weekDays[6];
  const weekRangeStr = `${formatDateToDM(monday)}/${monday.getFullYear()} - ${formatDateToDM(sunday)}/${sunday.getFullYear()}`;

  return (
    <div className="space-y-4">
      {/* Navigation Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[38px] px-3 cursor-pointer"
            onClick={prevWeek}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[38px] px-3 text-xs sm:text-sm cursor-pointer"
            onClick={currentWeek}
          >
            Hiện tại
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[38px] px-3 cursor-pointer"
            onClick={nextWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs sm:text-sm font-semibold text-gray-700">
            {weekRangeStr}
          </span>
        </div>

        <Button
          onClick={handleAdd}
          className="w-full sm:w-auto min-h-[38px] bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold text-xs sm:text-sm cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Thêm ca trực
        </Button>
      </div>

      {/* 7 Columns Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
        {columnScheduleData.map((day, idx) => (
          <Card
            key={idx}
            className={`overflow-hidden border flex flex-col ${
              day.isToday
                ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-md"
                : "border-gray-200 shadow-xs"
            }`}
          >
            <div
              className={`p-3 text-center border-b ${
                day.isToday
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-50 text-gray-800"
              }`}
            >
              <span className="text-xs uppercase font-bold tracking-wider block opacity-90">
                {day.dayName}
              </span>
              <span className="text-lg font-extrabold mt-0.5 block">
                {day.dateStr}
              </span>
            </div>

            <div className="p-2 flex-1 space-y-3 bg-white min-h-[300px]">
              {/* Morning */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-amber-700 uppercase flex items-center gap-1">
                  <Sun className="h-3 w-3 text-amber-500" /> Ca Sáng
                </span>
                {day.shifts.morning.length === 0 ? (
                  <div className="text-[10px] text-gray-400 italic p-1 bg-gray-50 rounded text-center">
                    Trống
                  </div>
                ) : (
                  day.shifts.morning.map((s) => (
                    <div
                      key={s.id}
                      className="p-1.5 bg-amber-50/70 border border-amber-200 rounded text-xs flex justify-between items-start group"
                    >
                      <div>
                        <div className="font-semibold text-gray-800">
                          {s.name}
                        </div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTime(s.start)} - {formatTime(s.end)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-0.5 cursor-pointer"
                        title="Xóa ca trực"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Afternoon */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-blue-700 uppercase flex items-center gap-1">
                  <Sunset className="h-3 w-3 text-blue-500" /> Ca Chiều
                </span>
                {day.shifts.afternoon.length === 0 ? (
                  <div className="text-[10px] text-gray-400 italic p-1 bg-gray-50 rounded text-center">
                    Trống
                  </div>
                ) : (
                  day.shifts.afternoon.map((s) => (
                    <div
                      key={s.id}
                      className="p-1.5 bg-blue-50/70 border border-blue-200 rounded text-xs flex justify-between items-start group"
                    >
                      <div>
                        <div className="font-semibold text-gray-800">
                          {s.name}
                        </div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTime(s.start)} - {formatTime(s.end)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-0.5 cursor-pointer"
                        title="Xóa ca trực"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Evening */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-purple-700 uppercase flex items-center gap-1">
                  <Moon className="h-3 w-3 text-purple-500" /> Ca Tối
                </span>
                {day.shifts.evening.length === 0 ? (
                  <div className="text-[10px] text-gray-400 italic p-1 bg-gray-50 rounded text-center">
                    Trống
                  </div>
                ) : (
                  day.shifts.evening.map((s) => (
                    <div
                      key={s.id}
                      className="p-1.5 bg-purple-50/70 border border-purple-200 rounded text-xs flex justify-between items-start group"
                    >
                      <div>
                        <div className="font-semibold text-gray-800">
                          {s.name}
                        </div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTime(s.start)} - {formatTime(s.end)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-0.5 cursor-pointer"
                        title="Xóa ca trực"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ScheduleColumnsView;
