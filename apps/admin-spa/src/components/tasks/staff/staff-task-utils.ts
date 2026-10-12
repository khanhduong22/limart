import { StaffTask } from "@/types/staff-tasks";

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface DateRanges {
  thisWeekStart: Date;
  thisWeekEnd: Date;
  nextWeekStart: Date;
  nextWeekEnd: Date;
  lastWeekStart: Date;
  lastWeekEnd: Date;
  thisMonthStart: Date;
  thisMonthEnd: Date;
}

export function computeStaffTaskDateRanges(): DateRanges {
  const now = new Date();
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);

  const currentDay = vnNow.getUTCDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const thisWeekStartLocal = new Date(vnNow);
  thisWeekStartLocal.setUTCDate(vnNow.getUTCDate() + diffToMonday);
  thisWeekStartLocal.setUTCHours(0, 0, 0, 0);
  const twStart = new Date(thisWeekStartLocal.getTime() - VN_OFFSET_MS);

  const thisWeekEndLocal = new Date(thisWeekStartLocal);
  thisWeekEndLocal.setUTCDate(thisWeekStartLocal.getUTCDate() + 6);
  thisWeekEndLocal.setUTCHours(23, 59, 59, 999);
  const twEnd = new Date(thisWeekEndLocal.getTime() - VN_OFFSET_MS);

  const nwStart = new Date(twStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nwEnd = new Date(twEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

  const lwStart = new Date(twStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lwEnd = new Date(twEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const thisMonthStartLocal = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), 1));
  thisMonthStartLocal.setUTCHours(0, 0, 0, 0);
  const tmStart = new Date(thisMonthStartLocal.getTime() - VN_OFFSET_MS);

  const thisMonthEndLocal = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth() + 1, 0));
  thisMonthEndLocal.setUTCHours(23, 59, 59, 999);
  const tmEnd = new Date(thisMonthEndLocal.getTime() - VN_OFFSET_MS);

  return {
    thisWeekStart: twStart,
    thisWeekEnd: twEnd,
    nextWeekStart: nwStart,
    nextWeekEnd: nwEnd,
    lastWeekStart: lwStart,
    lastWeekEnd: lwEnd,
    thisMonthStart: tmStart,
    thisMonthEnd: tmEnd,
  };
}

export function filterStaffTasks(
  tasks: StaffTask[],
  options: {
    selectedAssignee: string;
    statusFilter: string;
    searchKeyword: string;
    selectedWeekFilter: string;
    ranges: DateRanges;
  }
): StaffTask[] {
  const { selectedAssignee, statusFilter, searchKeyword, selectedWeekFilter, ranges } = options;

  return tasks.filter((t) => {
    // 1. User Filter
    if (selectedAssignee !== "ALL" && t.assigneeId !== selectedAssignee) {
      return false;
    }

    // 2. Status Filter
    if (statusFilter !== "ALL" && t.status !== statusFilter) {
      return false;
    }

    // 3. Search Keyword
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchAssignee = t.assignee?.name?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchAssignee) {
        return false;
      }
    }

    // 4. Week/Time Filter
    const taskStart = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);
    if (selectedWeekFilter === "THIS_WEEK") {
      return taskStart >= ranges.thisWeekStart && taskStart <= ranges.thisWeekEnd;
    }
    if (selectedWeekFilter === "NEXT_WEEK") {
      return taskStart >= ranges.nextWeekStart && taskStart <= ranges.nextWeekEnd;
    }
    if (selectedWeekFilter === "LAST_WEEK") {
      return taskStart >= ranges.lastWeekStart && taskStart <= ranges.lastWeekEnd;
    }
    if (selectedWeekFilter === "THIS_MONTH") {
      return taskStart >= ranges.thisMonthStart && taskStart <= ranges.thisMonthEnd;
    }

    return true;
  });
}
