import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import {
  format,
  parse,
  startOfWeek,
  getDay,
  startOfISOWeek,
  endOfISOWeek,
  addDays,
  isSameDay,
  startOfDay,
} from 'date-fns';
import { vi } from 'date-fns/locale/vi';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { isShiftLocked } from '@/lib/schedule-lock';
import { api } from '@/lib/api';
import { useScheduleStore } from '@/stores/useScheduleStore';
import { eventPropGetter, slotPropGetter } from './schedule-utils';
import CustomEventComponent from './CustomEventComponent';
import CalendarToolbar from './CalendarToolbar';
import ShiftDutySheet from './ShiftDutySheet';
import CreateShiftDialog from './CreateShiftDialog';
import ShiftActionDialog from './ShiftActionDialog';
import MobileScheduleList from './MobileScheduleList';
import type { CalendarEvent, SheetWeekDay } from './types';

const locales = { vi };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});
const DnDCalendar = withDragAndDrop(Calendar as any) as any;

export default function ScheduleCalendar({
  initialEvents = [],
  userId = '',
  isAdmin = false,
  defaultDate,
  users = [],
  onEventsChange,
}: {
  initialEvents?: any[];
  userId?: string;
  isAdmin?: boolean;
  defaultDate?: Date;
  users?: any[];
  onEventsChange?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => defaultDate || new Date());
  const [currentCalDate, setCurrentCalDate] = useState<Date>(() => defaultDate || new Date());
  const [calendarView, setCalendarView] = useState<string>(Views.WEEK);

  // Zustand Store
  const {
    hideFullTime,
    showAllShifts,
    setShowAllShifts,
    pendingEvent,
    targetUserId,
    isSeniorRegister,
    openCreateModal,
    closeCreateModal,
    openActionModal,
  } = useScheduleStore();

  useEffect(() => {
    setMounted(true);
    setShowAllShifts(isAdmin);

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isAdmin, setShowAllShifts]);

  const mapEvents = useCallback(
    (serverEvents: any[]): CalendarEvent[] =>
      (serverEvents || []).map((e) => {
        let parsedStart = new Date(e.start);
        let parsedEnd = new Date(e.end);

        // Prevent react-big-calendar from treating midnight ends as multi-day (all-day event)
        if (
          parsedEnd.getHours() === 0 &&
          parsedEnd.getMinutes() === 0 &&
          parsedEnd.getTime() - parsedStart.getTime() > 0
        ) {
          parsedEnd = new Date(parsedEnd.getTime() - 60000);
        }

        const isSwap = e.userId !== userId && e.isOpenForSwap;
        const title = isSwap ? `🔄 Đổi ca: ${e.title || e.user?.name}` : e.title || e.user?.name;

        return {
          id: e.id,
          title: title || 'Staff',
          start: parsedStart,
          end: parsedEnd,
          resource: e,
          isOwner: e.userId === userId || isAdmin,
          employmentType: e.employmentType || e.user?.employmentType || 'PART_TIME',
          duties: e.duties || [],
          allDay: false,
          isSenior: Boolean(e.isSenior),
        };
      }),
    [userId, isAdmin]
  );

  const [prevInitialEvents, setPrevInitialEvents] = useState(initialEvents);
  const [events, setEvents] = useState<CalendarEvent[]>(() => mapEvents(initialEvents));

  if (initialEvents !== prevInitialEvents) {
    setPrevInitialEvents(initialEvents);
    setEvents(mapEvents(initialEvents));
  }

  const displayedEvents = useMemo(() => {
    return events.filter((e) => {
      if (hideFullTime && e.employmentType === 'FULL_TIME') return false;

      // If it belongs to the current user, they can always see it
      if (e.resource?.userId === userId) return true;

      // If it is open for swap, they can always see it
      if (e.resource?.isOpenForSwap) return true;

      // For other people's normal shifts:
      if (!isAdmin) {
        if (!showAllShifts || !isShiftLocked(e.start)) {
          return false;
        }
      } else {
        if (!showAllShifts) return false;
      }

      return true;
    });
  }, [events, hideFullTime, showAllShifts, isAdmin, userId]);

  // Week boundaries and duties calculations for Sheet
  const weekStart = useMemo(
    () => startOfISOWeek(currentCalDate),
    [currentCalDate]
  );
  const weekEnd = useMemo(
    () => endOfISOWeek(currentCalDate),
    [currentCalDate]
  );

  const totalWeekDuties = useMemo(() => {
    return displayedEvents
      .filter((e) => {
        const evStart = new Date(e.start);
        const dList = e.duties || e.resource?.duties || [];
        return evStart >= weekStart && evStart <= weekEnd && dList.length > 0;
      })
      .reduce((acc, e) => {
        const dList = e.duties || e.resource?.duties || [];
        return acc + dList.length;
      }, 0);
  }, [displayedEvents, weekStart, weekEnd]);

  const sheetWeekDays: SheetWeekDay[] = useMemo(() => {
    return [0, 1, 2, 3, 4, 5, 6].map((offset) => {
      const dayDate = addDays(weekStart, offset);
      const dayEvents = displayedEvents
        .filter((e) => isSameDay(new Date(e.start), dayDate))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      return {
        dateStr: format(dayDate, 'yyyy-MM-dd'),
        dayTitle: format(dayDate, "EEEE, 'ngày' dd/MM", { locale: vi }),
        isToday: isSameDay(dayDate, new Date()),
        events: dayEvents,
      };
    });
  }, [displayedEvents, weekStart]);

  const handleDeleteShiftTask = async (dutyId: string, dutyTitle: string) => {
    if (
      !confirm(
        `Bạn có chắc muốn xóa nhiệm vụ "${dutyTitle}" không? (Dành cho Admin khi giao nhầm việc)`
      )
    )
      return;
    try {
      const res: any = await api.delete(`/api/admin/schedule/duties/${dutyId}`);
      if (res.success) {
        toast.success('Đã xóa nhiệm vụ!');
        setEvents((prev) =>
          prev.map((ev) => {
            const curDuties = ev.duties || ev.resource?.duties || [];
            if (curDuties.some((d: any) => d.id === dutyId)) {
              const nextDuties = curDuties.filter((d: any) => d.id !== dutyId);
              return {
                ...ev,
                duties: nextDuties,
                resource: { ...ev.resource, duties: nextDuties },
              };
            }
            return ev;
          })
        );
        if (onEventsChange) onEventsChange();
      } else {
        toast.error(res.error || 'Lỗi khi xóa nhiệm vụ');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi xóa nhiệm vụ');
    }
  };

  const handleEventUpdate = useCallback(
    async ({ event, start, end }: any) => {
      if (!event.isOwner) return;

      if (!isAdmin && (isShiftLocked(event.start) || isShiftLocked(start))) {
        toast.error('Lịch làm của tuần này đã chốt, không thể thay đổi!');
        return;
      }

      // Optimistic update
      const oldStart = event.start;
      const oldEnd = event.end;

      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, start, end } : e)));

      try {
        const res: any = await api.put(`/api/admin/schedule/${event.id}`, {
          start: start.toISOString(),
          end: end.toISOString(),
        });
        if (!res.success) {
          toast.error(res.error || 'Không thể cập nhật');
          setEvents((prev) =>
            prev.map((e) => (e.id === event.id ? { ...e, start: oldStart, end: oldEnd } : e))
          );
        } else {
          toast.success('Đã cập nhật ca làm');
          if (onEventsChange) onEventsChange();
        }
      } catch (e: any) {
        toast.error(e?.message || 'Không thể cập nhật');
        setEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...e, start: oldStart, end: oldEnd } : e))
        );
      }
    },
    [isAdmin, onEventsChange]
  );

  const handleSelectSlot = useCallback(
    ({ start, end }: { start: Date; end: Date }) => {
      if (start < new Date()) {
        toast.error('Không thể đăng ký lịch trong quá khứ!');
        return;
      }

      if (!isAdmin && isShiftLocked(start)) {
        toast.error('Lịch làm của tuần này đã chốt, không thể đăng ký thêm!');
        return;
      }

      let finalEnd = end;
      const diff = finalEnd.getTime() - start.getTime();
      const minDuration = 4 * 60 * 60 * 1000; // 4 hours

      if (diff < minDuration) {
        finalEnd = new Date(start.getTime() + minDuration);
      }

      openCreateModal({ start, end: finalEnd }, userId);
    },
    [userId, isAdmin, openCreateModal]
  );

  const handleConfirmRegister = async () => {
    if (!pendingEvent) return;

    const { start, end } = pendingEvent;
    const isSenior = isAdmin && isSeniorRegister;
    const tempId = Date.now();
    const optimisticEvent: CalendarEvent = {
      id: tempId,
      title: 'Đang xếp lịch...',
      start,
      end,
      isOwner: true,
      employmentType: 'PART_TIME',
      isSenior,
    };
    setEvents((prev) => [...prev, optimisticEvent]);
    closeCreateModal();

    try {
      const res: any = await api.post('/api/admin/schedule', {
        userId: targetUserId || userId,
        start: start.toISOString(),
        end: end.toISOString(),
        shiftType: 'FULL',
        isSenior,
      });

      if (res.success && res.data) {
        toast.success('Đăng ký thành công!');
        const created = res.data;
        setEvents((prev) =>
          prev.map((e) =>
            e.id === tempId
              ? {
                  ...e,
                  title: created.title || 'Đã đăng ký',
                  id: created.id || tempId,
                  isSenior,
                  resource: { ...e.resource, isSenior, duties: [] },
                }
              : e
          )
        );
        if (onEventsChange) onEventsChange();
      } else {
        toast.error(res.error || 'Lỗi đăng ký');
        setEvents((prev) => prev.filter((e) => e.id !== tempId));
      }
    } catch (err: any) {
      console.error('Error registering shift:', err);
      toast.error('Lỗi hệ thống hoặc kết nối: ' + (err.message || err));
      setEvents((prev) => prev.filter((e) => e.id !== tempId));
    }
  };

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      const isSwap = !event.isOwner && event.resource?.isOpenForSwap;
      if (event.isOwner || isSwap) {
        openActionModal(event);
      }
    },
    [openActionModal]
  );

  const handleMobileRegister = () => {
    if (selectedDate < startOfDay(new Date())) {
      toast.error('Không thể đăng ký lịch trong quá khứ!');
      return;
    }

    if (!isAdmin && isShiftLocked(selectedDate)) {
      toast.error('Lịch làm của tuần này đã chốt, không thể đăng ký thêm!');
      return;
    }

    const start = new Date(selectedDate);
    start.setHours(8, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(12, 0, 0, 0);

    openCreateModal({ start, end }, userId);
  };

  const components = useMemo(
    () => ({
      event: CustomEventComponent as any,
    }),
    []
  );

  if (!mounted) {
    return (
      <div className="flex flex-col bg-white rounded-xl shadow-sm border p-6 min-h-[600px] md:h-[750px] items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent" />
        <p className="text-sm font-semibold text-gray-500">Đang tải lịch làm việc...</p>
      </div>
    );
  }

  return (
    <div
      id="schedule-calendar-container"
      className="flex flex-col bg-white rounded-xl shadow-sm border p-4 min-h-[600px] md:h-[750px]"
    >
      {isMobile ? (
        <MobileScheduleList
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          displayedEvents={displayedEvents}
          totalWeekDuties={totalWeekDuties}
          isAdmin={isAdmin}
          userId={userId}
          onSelectEvent={handleSelectEvent}
          onMobileRegister={handleMobileRegister}
        />
      ) : (
        <div className="flex flex-col flex-1 min-w-0">
          <CalendarToolbar
            currentCalDate={currentCalDate}
            onNavigate={setCurrentCalDate}
            totalWeekDuties={totalWeekDuties}
            view={calendarView}
            onViewChange={setCalendarView}
          />

          <div className="flex-1 w-full h-full min-h-0 flex flex-col overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
            <div className="min-w-[700px] h-full flex flex-col flex-1">
              <DnDCalendar
                localizer={localizer}
                culture="vi"
                dayLayoutAlgorithm="no-overlap"
                events={displayedEvents}
                startAccessor={(event: any) => new Date(event.start)}
                endAccessor={(event: any) => new Date(event.end)}
                defaultView={Views.WEEK}
                view={calendarView}
                onView={(v: string) => setCalendarView(v)}
                date={currentCalDate}
                onNavigate={(newDate: Date) => setCurrentCalDate(newDate)}
                views={[Views.WEEK, Views.DAY]}
                toolbar={false}
                step={30}
                timeslots={2}
                min={new Date(0, 0, 0, 7, 0, 0)}
                max={new Date(0, 0, 0, 23, 59, 59)}
                showMultiDayTimes={true}
                selectable
                resizable
                onEventDrop={handleEventUpdate}
                onEventResize={handleEventUpdate}
                longPressThreshold={100}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                eventPropGetter={eventPropGetter}
                slotPropGetter={slotPropGetter}
                components={components}
                messages={{
                  next: 'Sau',
                  previous: 'Trước',
                  today: 'Hôm nay',
                  month: 'Tháng',
                  week: 'Tuần',
                  day: 'Ngày',
                  agenda: 'Lịch trình',
                  date: 'Ngày',
                  time: 'Thời gian',
                  event: 'Sự kiện',
                  noEventsInRange: 'Không có lịch làm việc nào trong khoảng này',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Registration Dialog */}
      <CreateShiftDialog
        isAdmin={isAdmin}
        users={users}
        onConfirmRegister={handleConfirmRegister}
      />

      {/* Action / Edit / Swap / Duty Assignment Dialog */}
      <ShiftActionDialog
        isAdmin={isAdmin}
        userId={userId}
        events={events}
        setEvents={setEvents}
        onEventsChange={onEventsChange}
      />

      {/* Week Duty Drawer / Sheet */}
      <ShiftDutySheet
        weekStart={weekStart}
        weekEnd={weekEnd}
        totalWeekDuties={totalWeekDuties}
        sheetWeekDays={sheetWeekDays}
        isAdmin={isAdmin}
        handleDeleteShiftTask={handleDeleteShiftTask}
      />
    </div>
  );
}
