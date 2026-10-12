import { format } from "date-fns";
import type { AdminTaskItem } from "@/types";

export function computeOverduePenalty(task: AdminTaskItem): { penalty: number; note: string } | null {
  if (!task.startedAt) return null;

  const submitted = task.submittedAt ? new Date(task.submittedAt) : new Date();
  const started = new Date(task.startedAt);
  const diffTime = Math.abs(submitted.getTime() - started.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 7 && !task.bonusPenalty) {
    const baseAmount = (task.ratePerUnit || 0) * (task.quantity || 1);
    const penalty = -(baseAmount * 0.5); // 50% penalty
    const note = `Overdue by ${diffDays} days (Started: ${format(
      started,
      "dd/MM"
    )}). Auto penalty applied.`;
    return { penalty, note };
  }

  return null;
}

export function filterReviewedTasks(tasks: AdminTaskItem[] | undefined, historyMonth: string): AdminTaskItem[] {
  const list = Array.isArray(tasks) ? tasks : [];
  const reviewed = list.filter(
    (t) => t.status === "APPROVED" || t.status === "REJECTED"
  );

  if (historyMonth === "all") {
    return reviewed.slice(0, 100);
  }

  const monthNum = parseInt(historyMonth, 10);
  return reviewed.filter((t) => {
    const dateStr = t.reviewedAt || t.submittedAt;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() + 1 === monthNum;
  });
}
