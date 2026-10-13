import React from 'react';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ListTodo, Clock, Plus, Trash2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScheduleStore } from '@/stores/useScheduleStore';
import { getEventColor } from './schedule-utils';
import type { SheetWeekDay, CalendarEvent } from './types';

interface ShiftDutySheetProps {
  weekStart: Date;
  weekEnd: Date;
  totalWeekDuties: number;
  sheetWeekDays: SheetWeekDay[];
  isAdmin: boolean;
  handleDeleteShiftTask?: (dutyId: string, dutyTitle: string) => Promise<void>;
}

export default function ShiftDutySheet({
  weekStart,
  weekEnd,
  totalWeekDuties,
  sheetWeekDays,
  isAdmin,
  handleDeleteShiftTask,
}: ShiftDutySheetProps) {
  const { dutySheetOpen, setDutySheetOpen, openActionModal } = useScheduleStore();

  const handleOpenAssignDuty = (ev: CalendarEvent) => {
    openActionModal(ev, true);
  };

  return (
    <Sheet open={dutySheetOpen} onOpenChange={setDutySheetOpen}>
      <SheetContent
        side="right"
        className="w-[90vw] sm:max-w-md md:max-w-lg flex flex-col p-0 bg-white"
      >
        <SheetHeader className="p-4 sm:p-5 border-b bg-gradient-to-r from-indigo-50/50 via-white to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                <ListTodo className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-base sm:text-lg font-bold text-gray-900">
                  Bảng nhiệm vụ theo ca
                </SheetTitle>
                <SheetDescription className="text-xs text-gray-500">
                  Tuần {format(weekStart, 'dd/MM')} -{' '}
                  {format(weekEnd, 'dd/MM/yyyy')} • {totalWeekDuties} nhiệm vụ
                </SheetDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="h-8 text-xs font-semibold gap-1 text-gray-600 print:hidden"
              title="In bảng nhiệm vụ tuần này"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">In bảng</span>
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {sheetWeekDays.map((day, dIdx) => (
            <div
              key={dIdx}
              className={cn(
                'rounded-xl border transition-all',
                day.isToday
                  ? 'border-indigo-300 bg-indigo-50/20 shadow-xs'
                  : 'border-gray-200 bg-white'
              )}
            >
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50/80 border-b rounded-t-xl">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-xs font-bold uppercase',
                      day.isToday ? 'text-indigo-600' : 'text-gray-700'
                    )}
                  >
                    {day.dayTitle}
                  </span>
                  {day.isToday && (
                    <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      Hôm nay
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 font-medium">
                  {day.events.length} ca làm
                </span>
              </div>

              <div className="p-3 space-y-2.5">
                {day.events.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-1 text-center">
                    Không có ca làm việc
                  </p>
                ) : (
                  day.events.map((ev) => {
                    const evDuties = ev.duties || ev.resource?.duties || [];
                    const colors = getEventColor(ev.title);
                    return (
                      <div
                        key={ev.id}
                        className="border rounded-lg p-2.5 bg-white shadow-2xs hover:border-gray-300 transition-all space-y-2"
                        style={{
                          borderLeftWidth: '4px',
                          borderLeftColor: colors.bg,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                              <span>{ev.title}</span>
                              {(ev.isSenior || ev.resource?.isSenior) && (
                                <span className="text-[9px] bg-amber-400 text-amber-950 font-bold px-1.5 py-0.5 rounded shadow-xs">
                                  👑 Trưởng ca
                                </span>
                              )}
                              {ev.employmentType === 'FULL_TIME' && (
                                <span className="text-[9px] bg-gray-100 text-gray-600 px-1 py-0.2 rounded font-normal">
                                  Full-time
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3 text-gray-400" />
                              <span>
                                {format(new Date(ev.start), 'HH:mm')} -{' '}
                                {format(new Date(ev.end), 'HH:mm')}
                              </span>
                            </div>
                          </div>

                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenAssignDuty(ev)}
                              className="h-7 text-xs px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-medium"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Giao việc
                            </Button>
                          )}
                        </div>

                        {/* Duty list for this shift */}
                        {evDuties.length > 0 ? (
                          <div className="space-y-1.5 pt-1 border-t border-dashed border-gray-100">
                            {evDuties.map((d: any) => (
                              <div
                                key={d.id}
                                className="flex items-start justify-between gap-2 bg-gray-50/80 p-2 rounded-md text-xs group"
                              >
                                <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                  <span
                                    className={cn(
                                      'mt-0.5 text-xs',
                                      d.isCompleted
                                        ? 'text-emerald-500 font-bold'
                                        : 'text-amber-500'
                                    )}
                                  >
                                    {d.isCompleted ? '✓' : '○'}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className={cn(
                                        'font-medium text-gray-800 leading-tight',
                                        d.isCompleted &&
                                          'line-through text-gray-400'
                                      )}
                                    >
                                      {d.title}
                                    </p>
                                    {d.description && (
                                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug whitespace-pre-wrap">
                                        {d.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    className={cn(
                                      'text-[9px] px-1.5 py-0.5 rounded font-semibold',
                                      d.isCompleted
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-amber-100 text-amber-700'
                                    )}
                                  >
                                    {d.isCompleted ? 'Xong' : 'Chưa xong'}
                                  </span>
                                  {isAdmin && handleDeleteShiftTask && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteShiftTask(d.id, d.title)
                                      }
                                      className="text-gray-300 hover:text-red-500 p-0.5 rounded transition opacity-0 group-hover:opacity-100"
                                      title="Xóa nhiệm vụ"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">
                            Chưa có nhiệm vụ nào được giao
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
