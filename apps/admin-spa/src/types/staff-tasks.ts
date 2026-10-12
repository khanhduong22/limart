export interface StaffTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigneeId: string;
  createdById: string;
  startDate: string | Date | null;
  deadline: string | Date | null;
  submittedAt: string | Date | null;
  completedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  adminNote: string | null;
  evidenceLink: string | null;
  evidenceNote: string | null;
  assignee: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    staffTasksAllowed?: boolean;
  };
  createdBy: {
    id: string;
    name: string | null;
  };
}

export interface StaffPerformanceStats {
  total: number;
  approved: number;
  doing: number;
  pendingReview: number;
  todo: number;
  rejected: number;
  overdue: number;
  completionRate: number;
}

export interface StaffTaskUserOption {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role?: string;
  staffTasksAllowed: boolean;
}

export const COLUMNS = [
  { id: "TODO", label: "Cần làm", color: "bg-slate-100 text-slate-800 border-slate-200" },
  { id: "DOING", label: "Đang làm", color: "bg-blue-50 text-blue-800 border-blue-200" },
  { id: "DONE", label: "Chờ duyệt", color: "bg-amber-50 text-amber-800 border-amber-200" },
  { id: "APPROVED", label: "Đã duyệt", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { id: "REJECTED", label: "Cần sửa lại", color: "bg-rose-50 text-rose-800 border-rose-200" },
];
