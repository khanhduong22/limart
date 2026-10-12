import React from 'react';
import moment from 'moment';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  RefreshCw,
  ListTodo,
} from 'lucide-react';
import { useScheduleStore } from '@/stores/useScheduleStore';
import { getEventColor } from './schedule-utils';
import type { CalendarEvent } from './types';

interface MobileScheduleListProps {
  selectedDate: Date;
  setSelectedDate: React.Dispatch<React.SetStateAction<Date>>;
  displayedEvents: CalendarEvent[];
  totalWeekDuties: number;
  isAdmin: boolean;
  userId: string;
  onSelectEvent: (event: CalendarEvent) => void;
  onMobileRegister: () => void;
}

export default function MobileScheduleList({
  selectedDate,
  setSelectedDate,
  displayedEvents,
  totalWeekDuties,
  isAdmin,
  userId,
  onSelectEvent,
  onMobileRegister,
}: MobileScheduleListProps) {
  const {
    showAllShifts,
    setShowAllShifts,
    hideFullTime,
    setHideFullTime,
    setDutySheetOpen,
  } = useScheduleStore();

  const startOfWeek = moment(selectedDate).startOf('week').toDate();
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(moment(startOfWeek).add(i, 'days').toDate());
  }

  const dailyEvents = displayedEvents
    .filter((e) => moment(e.start).isSame(selectedDate, 'day'))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const hasEventsOnDay = (date: Date) => {
    return displayedEvents.some((e) => moment(e.start).isSame(date, 'day'));
  };

  const handlePrevWeek = () => {
    setSelectedDate((prev) => moment(prev).subtract(1, 'week').toDate());
  };
  const handleNextWeek = () => {
    setSelectedDate((prev) => moment(prev).add(1, 'week').toDate());
  };

  return (
    <div className="flex flex-col flex-1 space-y-4 relative pb-16">
      {/* Top Mobile Controls */}
      <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-lg border text-sm">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-all-shifts-mobile"
              checked={showAllShifts}
              onCheckedChange={setShowAllShifts}
            />
            <Label
              htmlFor="show-all-shifts-mobile"
              className="cursor-pointer text-xs font-semibold select-none"
            >
              Xem lịch cửa hàng
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="hide-full-time-mobile"
              checked={hideFullTime}
              onCheckedChange={setHideFullTime}
            />
            <Label
              htmlFor="hide-full-time-mobile"
              className="cursor-pointer text-xs font-semibold select-none"
            >
              Ẩn Full-time
            </Label>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDutySheetOpen(true)}
          className="w-full mt-1 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center gap-1.5 text-xs py-1.5 h-8"
        >
          <ListTodo className="h-3.5 w-3.5 text-indigo-600" />
          <span>Bảng nhiệm vụ tuần này</span>
          <span className="ml-1 bg-indigo-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            {totalWeekDuties}
          </span>
        </Button>
      </div>

      {/* Week Navigation Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-700">
          Tháng {moment(selectedDate).format('M / YYYY')}
        </h2>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handlePrevWeek}
            title="Tuần trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-semibold px-2 py-0"
            onClick={() => setSelectedDate(new Date())}
          >
            Hôm nay
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleNextWeek}
            title="Tuần sau"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday Strip */}
      <div className="grid grid-cols-7 gap-1 pb-2 border-b">
        {weekDays.map((d, i) => {
          const isSelected = moment(d).isSame(selectedDate, 'day');
          const isToday = moment(d).isSame(new Date(), 'day');
          const hasEvents = hasEventsOnDay(d);
          const dayName = moment(d).format('dd');

          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDate(d)}
              className={`flex flex-col items-center py-2.5 rounded-xl transition duration-150 relative active:scale-95 ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'hover:bg-gray-100 text-gray-700 bg-gray-50/50'
              }`}
            >
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                {dayName}
              </span>
              <span
                className={`text-base font-extrabold mt-0.5 ${
                  isToday && !isSelected
                    ? 'text-emerald-600 underline decoration-2'
                    : ''
                }`}
              >
                {moment(d).format('D')}
              </span>
              {hasEvents && (
                <span
                  className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-emerald-500'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Day Events Header */}
      <div className="flex items-center justify-between pt-1">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <CalendarIcon className="h-4 w-4 text-emerald-600" />
          Lịch làm việc ({moment(selectedDate).format('DD/MM/YYYY')})
        </h3>
      </div>

      {/* Daily Events List */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[360px] pr-1">
        {dailyEvents.map((event) => {
          const isSwap = !event.isOwner && event.resource?.isOpenForSwap;
          const colors = isSwap
            ? { bg: '#8b5cf6', text: '#ffffff' }
            : getEventColor(event.title);

          return (
            <div
              key={event.id}
              onClick={() => onSelectEvent(event)}
              className="bg-white p-3.5 rounded-xl border shadow-sm flex items-center justify-between transition active:scale-95 duration-100 cursor-pointer hover:border-emerald-200"
              style={{ borderLeft: `5px solid ${colors.bg}` }}
            >
              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-gray-800 text-sm">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span>
                    {moment(event.start).format('HH:mm')} -{' '}
                    {moment(event.end).format('HH:mm')}
                  </span>
                  <span className="text-xs font-normal text-gray-400">
                    (
                    {moment
                      .duration(moment(event.end).diff(moment(event.start)))
                      .asHours()
                      .toFixed(1)}
                    h)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-600 flex-wrap">
                  <span className="font-semibold text-gray-700">{event.title}</span>
                  {(event.isSenior || event.resource?.isSenior) && (
                    <span className="bg-amber-100 text-amber-950 border border-amber-300 font-extrabold px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 shadow-2xs">
                      👑 Trưởng ca
                      {isAdmin || event.resource?.userId === userId
                        ? ' (+3k/h)'
                        : ''}
                    </span>
                  )}
                  {event.employmentType === 'FULL_TIME' && (
                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">
                      Full-time
                    </span>
                  )}
                  {event.duties && event.duties.length > 0 && (
                    <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                      📋 {event.duties.length} việc
                      {event.duties.some((d: any) => d.isCompleted) && (
                        <span className="text-emerald-600 font-semibold">
                          (
                          {
                            event.duties.filter((d: any) => d.isCompleted).length
                          }
                          /{event.duties.length})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSwap && (
                  <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Nhận ca
                  </span>
                )}
                {event.isOwner && (
                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
                    Của bạn
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {dailyEvents.length === 0 && (
          <div className="p-8 text-center border-2 border-dashed border-gray-100 rounded-xl bg-gray-50/50 flex flex-col items-center justify-center space-y-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm font-semibold text-gray-500">
              Chưa có ai đăng ký ca làm
            </p>
            <p className="text-xs text-gray-400">
              Bấm đăng ký bên dưới để thêm lịch
            </p>
          </div>
        )}
      </div>

      {/* Floating Register Button */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-4 pb-2 z-10">
        <Button
          onClick={onMobileRegister}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 shadow-lg rounded-xl flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="h-5 w-5" />
          Đăng ký ca làm ngày {moment(selectedDate).format('DD/MM')}
        </Button>
      </div>
    </div>
  );
}
