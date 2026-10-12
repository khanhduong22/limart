export interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource?: any;
  isOwner?: boolean;
  employmentType?: string;
  duties?: any[];
  allDay?: boolean;
  isSenior?: boolean;
}

export interface PendingEvent {
  start: Date;
  end: Date;
}

export interface SheetWeekDay {
  dateStr: string;
  dayTitle: string;
  isToday: boolean;
  events: CalendarEvent[];
}

export interface ShiftDutyItem {
  id: string;
  title: string;
  description?: string | null;
  isCompleted?: boolean;
  shiftId?: number;
  userId?: string;
  date?: string;
}
