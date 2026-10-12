export interface UserItem {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  targetDate: string | null;
  order?: number;
  createdAt: string | Date;
  completed: boolean;
  completedAt: string | Date | null;
}

export interface WeeklyTaskItem {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string;
  weekStart: string;
  weekEnd: string;
  completed: boolean;
  completedAt: string | null;
  explanation: string | null;
  isCarriedOver: boolean;
}

export interface DailyDetailItem {
  date: string;
  shift: string;
  hours: number;
  error?: string;
  isChecklistIncomplete?: boolean;
}

export interface StatsHistoryData {
  daysWorked: number;
  totalHours: number;
  lateCount: number;
  totalDeficiencies: number;
  dailyDetails: DailyDetailItem[];
}

export function getTodayVN(): string {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = vnNow.getUTCFullYear();
  const month = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getSelectedWeekRangeStr(selectedDate: string): string {
  try {
    if (!selectedDate) return "";
    const parts = selectedDate.split("-");
    if (parts.length !== 3) return "";
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return "";

    const currentDay = date.getDay(); // 0 = Sun, 1 = Mon... 6 = Sat
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const format = (d: Date) =>
      d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    return `${format(monday)} - ${format(sunday)}`;
  } catch (e) {
    return "";
  }
}
