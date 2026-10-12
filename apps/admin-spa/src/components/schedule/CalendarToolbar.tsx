import React from 'react';
import moment from 'moment';
import { Views } from 'react-big-calendar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ListTodo,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Printer,
} from 'lucide-react';
import { useScheduleStore } from '@/stores/useScheduleStore';

interface CalendarToolbarProps {
  currentCalDate: Date;
  onNavigate: (newDate: Date) => void;
  totalWeekDuties: number;
  view?: string;
  onViewChange?: (view: any) => void;
  onExport?: () => void;
}

export default function CalendarToolbar({
  currentCalDate,
  onNavigate,
  totalWeekDuties,
  view = Views.WEEK,
  onViewChange,
  onExport,
}: CalendarToolbarProps) {
  const {
    hideFullTime,
    setHideFullTime,
    showAllShifts,
    setShowAllShifts,
    showDutyDetails,
    setShowDutyDetails,
    setDutySheetOpen,
  } = useScheduleStore();

  const handlePrev = () => {
    const step = view === Views.DAY ? 'day' : 'week';
    onNavigate(moment(currentCalDate).subtract(1, step).toDate());
  };

  const handleNext = () => {
    const step = view === Views.DAY ? 'day' : 'week';
    onNavigate(moment(currentCalDate).add(1, step).toDate());
  };

  const handleToday = () => {
    onNavigate(new Date());
  };

  const handlePrint = () => {
    if (onExport) {
      onExport();
    } else {
      window.print();
    }
  };

  const dateLabel =
    view === Views.DAY
      ? moment(currentCalDate).format('dddd, [ngày] DD/MM/YYYY')
      : `Tháng ${moment(currentCalDate).format('M / YYYY')} (Tuần ${moment(currentCalDate).startOf('isoWeek').format('DD/MM')} - ${moment(currentCalDate).endOf('isoWeek').format('DD/MM')})`;

  return (
    <div className="flex flex-col gap-2.5 mb-2 px-2 pb-2 border-b">
      {/* Top Filter and Actions Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDutySheetOpen(true)}
            className="border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 font-semibold flex items-center gap-1.5 shadow-xs h-9 min-h-[36px] text-xs"
          >
            <ListTodo className="h-4 w-4 text-indigo-600" />
            <span>Bảng nhiệm vụ tuần này</span>
            <span
              className={cn(
                'ml-1 text-xs px-2 py-0.5 rounded-full font-bold',
                totalWeekDuties > 0
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-600'
              )}
            >
              {totalWeekDuties}
            </span>
          </Button>

          <div className="flex items-center space-x-2 pl-3 border-l border-gray-200">
            <Switch
              id="show-duty-details"
              checked={showDutyDetails}
              onCheckedChange={setShowDutyDetails}
            />
            <Label
              htmlFor="show-duty-details"
              className="cursor-pointer text-xs font-medium text-gray-700 select-none"
            >
              Hiện chi tiết việc trên lịch
            </Label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-all-shifts"
              checked={showAllShifts}
              onCheckedChange={setShowAllShifts}
            />
            <Label
              htmlFor="show-all-shifts"
              className="cursor-pointer text-xs sm:text-sm font-medium select-none"
            >
              Xem lịch toàn cửa hàng
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="hide-full-time"
              checked={hideFullTime}
              onCheckedChange={setHideFullTime}
            />
            <Label
              htmlFor="hide-full-time"
              className="cursor-pointer text-xs sm:text-sm font-medium select-none"
            >
              Ẩn nhân viên Full-time
            </Label>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="h-8 text-xs font-medium text-gray-600 hover:text-gray-900 border-gray-200 gap-1.5"
            title="In / Xuất lịch làm việc"
          >
            <Printer className="h-3.5 w-3.5 text-gray-500" />
            <span className="hidden sm:inline">In lịch</span>
          </Button>
        </div>
      </div>

      {/* Date Navigation & View Selector Row */}
      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-white shadow-2xs p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-gray-100"
              onClick={handlePrev}
              title="Tuần trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-semibold px-2 hover:bg-gray-100"
              onClick={handleToday}
            >
              Hôm nay
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-gray-100"
              onClick={handleNext}
              title="Tuần sau"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700 pl-1">
            <CalendarIcon className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="capitalize rbc-toolbar-label">{dateLabel}</span>
          </div>
        </div>

        {onViewChange && (
          <div className="flex items-center rounded-lg border bg-gray-50/80 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => onViewChange(Views.WEEK)}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
                view === Views.WEEK
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Tuần
            </button>
            <button
              type="button"
              onClick={() => onViewChange(Views.DAY)}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
                view === Views.DAY
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Ngày
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
