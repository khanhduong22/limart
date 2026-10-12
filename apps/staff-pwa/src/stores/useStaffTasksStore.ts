import { create } from "zustand";

export type StaffTaskFilter = "ALL" | "TODO" | "DOING" | "DONE" | "APPROVED";

export interface StaffTask {
  id: string;
  title: string;
  name?: string;
  description?: string;
  status: "TODO" | "DOING" | "DONE" | "APPROVED" | "REJECTED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  frequency?: string;
  deadline?: string;
  evidenceLink?: string;
  notes?: string;
  evidenceNote?: string;
  adminNote?: string;
  rejectReason?: string;
  createdAt?: string;
  startDate?: string;
  completedAt?: string;
  submittedAt?: string;
  taskDefinition?: {
    name?: string;
    title?: string;
  };
  assignee?: {
    id: string;
    name: string;
    image?: string;
  };
  createdBy?: {
    id: string;
    name: string;
  };
}

export interface KPIStats {
  total: number;
  approved: number;
  doing: number;
  pendingReview: number;
  overdue: number;
  completionRate: number;
}

export interface StaffTasksStoreState {
  filter: StaffTaskFilter;
  finishingTask: StaffTask | null;
  viewingTask: StaffTask | null;
  evidenceLink: string;
  note: string;
  isProcessing: boolean;

  setFilter: (filter: StaffTaskFilter) => void;
  openSubmitModal: (task: StaffTask) => void;
  closeSubmitModal: () => void;
  setEvidenceLink: (link: string) => void;
  setNote: (note: string) => void;
  setIsProcessing: (processing: boolean) => void;
  openDetailModal: (task: StaffTask) => void;
  closeDetailModal: () => void;
  reset: () => void;
}

export const useStaffTasksStore = create<StaffTasksStoreState>((set) => ({
  filter: "ALL",
  finishingTask: null,
  viewingTask: null,
  evidenceLink: "",
  note: "",
  isProcessing: false,

  setFilter: (filter) => set({ filter }),
  openSubmitModal: (task) =>
    set({
      finishingTask: task,
      evidenceLink: task.evidenceLink || "",
      note: task.notes || task.evidenceNote || "",
    }),
  closeSubmitModal: () =>
    set({
      finishingTask: null,
      evidenceLink: "",
      note: "",
      isProcessing: false,
    }),
  setEvidenceLink: (evidenceLink) => set({ evidenceLink }),
  setNote: (note) => set({ note }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  openDetailModal: (task) => set({ viewingTask: task }),
  closeDetailModal: () => set({ viewingTask: null }),
  reset: () =>
    set({
      filter: "ALL",
      finishingTask: null,
      viewingTask: null,
      evidenceLink: "",
      note: "",
      isProcessing: false,
    }),
}));
