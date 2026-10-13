import React from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useScheduleStore } from '@/stores/useScheduleStore';
import type { CalendarEvent } from './types';

interface CustomEventComponentProps {
  event: CalendarEvent;
}

export default function CustomEventComponent({ event }: CustomEventComponentProps) {
  const showDutyDetails = useScheduleStore((state) => state.showDutyDetails);

  const duties = event.duties || event.resource?.duties || [];
  const count = duties.length;
  const completedCount = duties.filter((d: any) => d.isCompleted).length;
  const isSenior = Boolean(event.isSenior || event.resource?.isSenior);
  const timeStr = `${format(new Date(event.start), 'HH:mm')} - ${format(new Date(event.end), 'HH:mm')}`;
  const tooltip = `${isSenior ? '👑 [Trưởng ca (+3k/h)] ' : ''}${event.title} (${timeStr})${count > 0 ? ` - ${count} việc` : ''}`;

  return (
    <div
      className="flex flex-col h-full justify-between text-xs py-0.5 leading-tight overflow-hidden relative"
      title={tooltip}
    >
      <div className="min-w-0 w-full flex flex-col items-start gap-0.5">
        <span className="font-bold text-[9.5px] sm:text-[10px] leading-tight break-words line-clamp-2 tracking-tight">
          {event.title}
        </span>
        {isSenior && (
          <span
            className="text-[10px] select-none leading-none filter drop-shadow-xs inline-block"
            title="Trưởng ca"
          >
            👑
          </span>
        )}
      </div>
      {count > 0 && (
        <div className="mt-auto pt-0.5 pointer-events-none">
          {!showDutyDetails ? (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-black/35 text-white backdrop-blur-xs border border-white/20 shadow-xs whitespace-nowrap">
              📋 {count} việc {completedCount > 0 ? `(${completedCount}/${count})` : ''}
            </span>
          ) : (
            <div className="bg-black/35 rounded p-1 text-[10px] space-y-0.5 mt-0.5 border border-white/15">
              <div className="font-bold text-amber-200 flex items-center justify-between">
                <span>📋 {count} việc:</span>
                {completedCount > 0 && (
                  <span className="text-[9px] text-emerald-300">({completedCount} xong)</span>
                )}
              </div>
              {duties.slice(0, 3).map((d: any, idx: number) => (
                <div
                  key={idx}
                  className={cn(
                    'truncate text-[10px]',
                    d.isCompleted ? 'line-through opacity-70 text-emerald-200' : 'text-white'
                  )}
                >
                  • {d.title}
                </div>
              ))}
              {count > 3 && (
                <div className="text-[9px] opacity-80 italic text-white/80">
                  +{count - 3} việc nữa...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
