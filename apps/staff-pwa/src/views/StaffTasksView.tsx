import React, { useState } from "react";
import useSWR from "swr";
import {
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Play,
  Send,
  Calendar,
  Lock,
  Flame,
  Check,
  X,
  User,
  FileText,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  fetcher,
  toggleStaffTaskStatus,
} from "@/lib/api-client";

interface StaffTask {
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

interface KPIStats {
  total: number;
  approved: number;
  doing: number;
  pendingReview: number;
  overdue: number;
  completionRate: number;
}

interface StaffTasksResponse {
  allowed: boolean;
  data: {
    tasks: StaffTask[];
    stats: {
      monthly: KPIStats;
      weekly: KPIStats;
    };
  };
}

export const StaffTasksView: React.FC = () => {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | "TODO" | "DOING" | "DONE" | "APPROVED">("ALL");

  const { data: res, error, mutate, isLoading } = useSWR<{
    success: boolean;
    allowed?: boolean;
    data: StaffTasksResponse["data"];
    error?: string;
  }>("/api/staff/staff-tasks", fetcher, { revalidateOnFocus: true });

  // Complete submission modal
  const [finishingTask, setFinishingTask] = useState<StaffTask | null>(null);
  const [evidenceLink, setEvidenceLink] = useState("");
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // View task details modal (read-only for staff)
  const [viewingTask, setViewingTask] = useState<StaffTask | null>(null);

  // Check 403 / forbidden permission
  if (!isLoading && (error?.status === 403 || res?.allowed === false || res?.success === false)) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-rose-200 rounded-3xl p-6 text-center space-y-4 shadow-lg animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto text-rose-600">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-stone-900">
              Không có quyền truy cập
            </h2>
            <p className="text-xs text-stone-500 mt-2 leading-relaxed">
              Bạn không có quyền truy cập vào mục <span className="font-bold text-rose-700">&ldquo;Công việc và KPI&rdquo;</span>.
              Nội dung này chỉ hiển thị khi tài khoản của bạn được Quản trị viên/Chủ cửa hàng chỉ định trực tiếp.
            </p>
          </div>
          <Button
            onClick={() => router.push("/")}
            className="w-full h-10 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs cursor-pointer"
          >
            Quay lại trang chủ
          </Button>
        </div>
      </div>
    );
  }

  const tasks = res?.data?.tasks || [];
  const stats = res?.data?.stats;
  const monthlyKPI = stats?.monthly;
  const monthlyRatePct = monthlyKPI ? Math.round(monthlyKPI.completionRate * 100) : 0;

  // Filter tasks
  const filteredTasks = (tasks || []).filter((t) => {
    if (!t) return false;
    if (filter === "ALL") return true;
    return t.status === filter;
  });

  // Action: Start task (TODO -> DOING)
  const handleStartTask = async (taskId: string) => {
    setIsProcessing(true);
    try {
      const result = await toggleStaffTaskStatus(taskId, { status: "DOING" });
      if (result.success) {
        toast.success("🚀 Đã nhận việc! Hãy tập trung hoàn thành nhé.");
        mutate();
      } else {
        toast.error(result.error || "Không thể chuyển trạng thái");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Action: Submit completion (DOING -> DONE)
  const handleFinishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finishingTask) return;

    setIsProcessing(true);
    try {
      const result = await toggleStaffTaskStatus(finishingTask.id, {
        status: "DONE",
        evidenceLink: evidenceLink.trim() || undefined,
        note: note.trim() || undefined,
      });

      if (result.success) {
        toast.success("🎉 Đã gửi báo cáo hoàn thành! Chờ Admin phê duyệt.");
        setFinishingTask(null);
        mutate();
      } else {
        toast.error(result.error || "Không thể nộp báo cáo");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 pb-28 w-full mx-auto px-1 sm:px-3 md:px-4 pt-2 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="h-8 w-8 md:h-9 md:w-9 rounded-full hover:bg-indigo-100 text-stone-700 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          <div>
            <h1 className="text-base md:text-xl font-bold text-stone-900 tracking-tight flex items-center gap-1.5">
              <span>🎯</span> Công Việc & KPI
            </h1>
            <p className="text-[10px] md:text-xs text-stone-500">
              Chỉ tiêu công việc và đánh giá hoàn thành nhiệm vụ
            </p>
          </div>
        </div>
      </div>

      {/* Monthly KPI Overview Card */}
      <div className="rounded-2xl md:rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-violet-950 p-4 md:p-6 text-white shadow-lg relative overflow-hidden">
        {/* Ambient subtle glow for desktop */}
        <div className="absolute -right-8 -bottom-8 w-44 h-44 bg-violet-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -left-8 -top-8 w-44 h-44 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-13 md:h-13 rounded-2xl bg-white/10 flex items-center justify-center text-amber-300 shadow-inner shrink-0">
              <TrendingUp className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <p className="text-[11px] md:text-xs font-semibold text-indigo-200">Hiệu Suất Tháng</p>
              <div className="flex items-baseline gap-2">
                <h2 className="text-xl md:text-3xl font-black font-mono tracking-tight text-white">
                  {monthlyRatePct}%
                </h2>
                <span className="text-[11px] md:text-xs text-indigo-300 font-medium">hoàn thành</span>
              </div>
            </div>
          </div>
          <div className="self-start sm:self-auto">
            <span className="text-[11px] md:text-xs font-bold bg-white/15 px-3 py-1.5 rounded-full text-indigo-100 font-mono shadow-xs inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {monthlyKPI?.approved || 0} / {monthlyKPI?.total || 0} Việc
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-white/15 rounded-full h-2 md:h-2.5 mt-3 md:mt-4 overflow-hidden relative z-10">
          <div
            className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 h-full rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${monthlyRatePct}%` }}
          />
        </div>

        {/* KPI 4-Column Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3.5 mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/10 text-center relative z-10">
          <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-xl md:rounded-2xl p-2.5 md:p-3.5 border border-white/5">
            <p className="text-[10px] md:text-xs text-amber-200 font-medium flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Đang làm
            </p>
            <p className="text-base md:text-2xl font-bold md:font-black text-amber-300 font-mono mt-0.5">{monthlyKPI?.doing || 0}</p>
          </div>
          <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-xl md:rounded-2xl p-2.5 md:p-3.5 border border-white/5">
            <p className="text-[10px] md:text-xs text-sky-200 font-medium flex items-center justify-center gap-1">
              <Clock className="w-3 h-3 text-sky-300" /> Chờ duyệt
            </p>
            <p className="text-base md:text-2xl font-bold md:font-black text-sky-300 font-mono mt-0.5">{monthlyKPI?.pendingReview || 0}</p>
          </div>
          <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-xl md:rounded-2xl p-2.5 md:p-3.5 border border-white/5">
            <p className="text-[10px] md:text-xs text-emerald-200 font-medium flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-300" /> Đã duyệt
            </p>
            <p className="text-base md:text-2xl font-bold md:font-black text-emerald-300 font-mono mt-0.5">{monthlyKPI?.approved || 0}</p>
          </div>
          <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-xl md:rounded-2xl p-2.5 md:p-3.5 border border-white/5">
            <p className="text-[10px] md:text-xs text-rose-200 font-medium flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-300" /> Trễ hạn
            </p>
            <p className="text-base md:text-2xl font-bold md:font-black text-rose-300 font-mono mt-0.5">{monthlyKPI?.overdue || 0}</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 md:gap-2 overflow-x-auto py-1 text-xs no-scrollbar">
        {[
          { key: "ALL", label: `Tất cả (${tasks.length})` },
          { key: "TODO", label: "Cần làm" },
          { key: "DOING", label: "Đang làm" },
          { key: "DONE", label: "Chờ duyệt" },
          { key: "APPROVED", label: "Đã duyệt" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key as any)}
            className={`px-3.5 py-1.5 md:px-4 md:py-2 rounded-full whitespace-nowrap text-xs md:text-sm font-bold transition-all cursor-pointer ${
              filter === tab.key
                ? "bg-indigo-700 text-white shadow-xs ring-2 ring-indigo-200"
                : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div>
        {isLoading ? (
          <div className="p-12 text-center text-xs md:text-sm text-stone-400">Đang tải danh sách công việc...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl md:rounded-3xl border border-dashed border-stone-200 bg-white/60 p-12 text-center space-y-1">
            <span className="text-3xl">🎯</span>
            <p className="text-sm font-bold text-stone-700">Không có công việc nào trong danh mục này</p>
            <p className="text-xs text-stone-400">Bạn đã hoàn thành hết hoặc chưa có công việc mới được giao.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(filteredTasks || []).map((t) => {
              const title = t.title || (t as any).name || t.taskDefinition?.name || t.taskDefinition?.title || "Công việc";
              const isOverdue = t.deadline && new Date(t.deadline) < new Date() && t.status !== "APPROVED";

              return (
                <div
                  key={t.id}
                  onClick={() => setViewingTask(t)}
                  className={`rounded-2xl border p-4 shadow-xs flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all active:scale-[0.99] group ${
                    t.status === "APPROVED"
                      ? "bg-emerald-50/40 border-emerald-200"
                      : t.status === "REJECTED"
                      ? "bg-rose-50/50 border-rose-200"
                      : t.status === "DONE"
                      ? "bg-sky-50/40 border-sky-200"
                      : "bg-white border-stone-200"
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1 min-w-0">
                        <h3 className="text-xs md:text-sm font-bold text-stone-900 leading-snug group-hover:text-indigo-900 transition-colors">
                          {title}
                        </h3>
                        {t.description && (
                          <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">{t.description}</p>
                        )}
                      </div>
                      {/* Status Badge */}
                      <div className="shrink-0">
                        {t.status === "APPROVED" && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Đã duyệt
                          </span>
                        )}
                        {t.status === "DONE" && (
                          <span className="text-[10px] font-bold text-sky-800 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Chờ duyệt
                          </span>
                        )}
                        {t.status === "DOING" && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                            Đang làm
                          </span>
                        )}
                        {t.status === "TODO" && (
                          <span className="text-[10px] font-bold text-stone-700 bg-stone-100 border border-stone-300 px-2 py-0.5 rounded-full">
                            Cần làm
                          </span>
                        )}
                        {t.status === "REJECTED" && (
                          <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Cần sửa
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Priority & Deadline details */}
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500 pt-1 border-t border-stone-100">
                      {t.priority === "URGENT" && (
                        <span className="font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                          ⚡ Khẩn cấp
                        </span>
                      )}
                      {t.frequency && (
                        <span className="text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                          🔄 {t.frequency}
                        </span>
                      )}
                      {t.deadline && (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            isOverdue ? "text-rose-600 font-bold" : "text-stone-500"
                          }`}
                        >
                          <Calendar className="w-3 h-3" /> Hạn: {new Date(t.deadline).toLocaleDateString("vi-VN")}
                          {isOverdue && " (Quá hạn)"}
                        </span>
                      )}
                    </div>

                    {/* Evidence link & note */}
                    {t.evidenceLink && (
                      <div className="text-[11px] text-indigo-700 truncate">
                        🔗 <a
                          href={t.evidenceLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="underline hover:text-indigo-900"
                        >
                          {t.evidenceLink}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Area: View details trigger + Action button */}
                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-stone-100/80">
                    <span className="text-[10px] text-indigo-600 font-semibold inline-flex items-center gap-0.5 hover:underline">
                      Chi tiết &rarr;
                    </span>

                    <div className="flex items-center gap-1.5">
                      {t.status === "TODO" && (
                        <Button
                          size="sm"
                          disabled={isProcessing}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartTask(t.id);
                          }}
                          className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 rounded-lg cursor-pointer"
                        >
                          <Play className="w-3 h-3 mr-1" /> Bắt đầu làm
                        </Button>
                      )}
                      {(t.status === "DOING" || t.status === "REJECTED") && (
                        <Button
                          size="sm"
                          disabled={isProcessing}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFinishingTask(t);
                            setEvidenceLink(t.evidenceLink || "");
                            setNote(t.notes || t.evidenceNote || "");
                          }}
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 rounded-lg cursor-pointer"
                        >
                          <Send className="w-3 h-3 mr-1" /> Báo hoàn thành
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* READ-ONLY TASK DETAILS MODAL */}
      {viewingTask && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setViewingTask(null)}
        >
          <div
            className="bg-white rounded-3xl p-5 md:p-6 max-w-md sm:max-w-lg md:max-w-xl w-full space-y-4 shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Title and Close Button */}
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {viewingTask.status === "APPROVED" && (
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Đã duyệt
                    </span>
                  )}
                  {viewingTask.status === "DONE" && (
                    <span className="text-[10px] font-bold text-sky-800 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Chờ duyệt
                    </span>
                  )}
                  {viewingTask.status === "DOING" && (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                      Đang làm
                    </span>
                  )}
                  {viewingTask.status === "TODO" && (
                    <span className="text-[10px] font-bold text-stone-700 bg-stone-100 border border-stone-300 px-2 py-0.5 rounded-full">
                      Cần làm
                    </span>
                  )}
                  {viewingTask.status === "REJECTED" && (
                    <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Cần sửa
                    </span>
                  )}
                  {viewingTask.priority === "URGENT" && (
                    <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                      ⚡ Khẩn cấp
                    </span>
                  )}
                  {viewingTask.frequency && (
                    <span className="text-[10px] text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                      🔄 {viewingTask.frequency}
                    </span>
                  )}
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-stone-900 leading-snug break-words">
                  {viewingTask.title || (viewingTask as any).name || viewingTask.taskDefinition?.name || "Chi tiết công việc"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setViewingTask(null)}
                className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body Content */}
            <div className="overflow-y-auto space-y-3.5 pr-1 text-xs text-stone-600 flex-1">
              {/* Meta info: Creator & Deadline */}
              <div className="grid grid-cols-2 gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-200/60 text-[11px]">
                <div>
                  <span className="text-stone-400 block text-[10px]">Người giao:</span>
                  <span className="font-semibold text-stone-800 inline-flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3 text-stone-500" />
                    {viewingTask.createdBy?.name || "Quản trị viên"}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px]">Hạn hoàn thành:</span>
                  <span
                    className={`font-semibold inline-flex items-center gap-1 mt-0.5 ${
                      viewingTask.deadline &&
                      new Date(viewingTask.deadline) < new Date() &&
                      viewingTask.status !== "APPROVED"
                        ? "text-rose-600 font-bold"
                        : "text-stone-800"
                    }`}
                  >
                    <Calendar className="w-3 h-3 text-stone-500" />
                    {viewingTask.deadline
                      ? new Date(viewingTask.deadline).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "Không giới hạn"}
                  </span>
                </div>
              </div>

              {/* Task Description (Full, Read-only, Selectable) */}
              <div>
                <label className="text-[11px] font-bold text-stone-700 block mb-1.5 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  Nội dung chi tiết công việc:
                </label>
                {viewingTask.description ? (
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-stone-800 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words select-text">
                    {viewingTask.description}
                  </div>
                ) : (
                  <div className="bg-stone-50 border border-dashed border-stone-200 rounded-xl p-3 text-stone-400 text-xs italic">
                    Không có phần mô tả thêm cho công việc này.
                  </div>
                )}
              </div>

              {/* Admin Note / Reject Reason (if any) */}
              {(viewingTask.adminNote || viewingTask.rejectReason) && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1">
                  <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                    Yêu cầu / Ghi chú từ Quản trị viên:
                  </span>
                  <p className="text-xs text-rose-900 whitespace-pre-wrap">
                    {viewingTask.adminNote || viewingTask.rejectReason}
                  </p>
                </div>
              )}

              {/* Submitted Evidence & Note (if staff submitted before) */}
              {(viewingTask.evidenceLink || viewingTask.evidenceNote || viewingTask.notes) && (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 space-y-1.5 text-xs">
                  <span className="font-bold text-indigo-900 block text-[11px]">
                    Báo cáo kết quả đã gửi:
                  </span>
                  {viewingTask.evidenceLink && (
                    <div className="text-indigo-700 break-all">
                      <span className="text-stone-500 font-medium">Link: </span>
                      <a
                        href={viewingTask.evidenceLink}
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-semibold hover:text-indigo-900 inline-flex items-center gap-1"
                      >
                        {viewingTask.evidenceLink}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {(viewingTask.evidenceNote || viewingTask.notes) && (
                    <p className="text-stone-700 whitespace-pre-wrap">
                      <span className="text-stone-500 font-medium">Ghi chú: </span>
                      {viewingTask.evidenceNote || viewingTask.notes}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-stone-100 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setViewingTask(null)}
                className="flex-1 h-9 text-xs font-bold border-stone-200 text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                Đóng
              </Button>
              {viewingTask.status === "TODO" && (
                <Button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => {
                    const id = viewingTask.id;
                    setViewingTask(null);
                    handleStartTask(id);
                  }}
                  className="flex-1 h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                >
                  <Play className="w-3 h-3 mr-1" /> Bắt đầu làm
                </Button>
              )}
              {(viewingTask.status === "DOING" || viewingTask.status === "REJECTED") && (
                <Button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => {
                    const taskToFinish = viewingTask;
                    setViewingTask(null);
                    setFinishingTask(taskToFinish);
                    setEvidenceLink(taskToFinish.evidenceLink || "");
                    setNote(taskToFinish.notes || taskToFinish.evidenceNote || "");
                  }}
                  className="flex-1 h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  <Send className="w-3 h-3 mr-1" /> Báo hoàn thành
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FINISH TASK MODAL */}
      {finishingTask && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-6 max-w-sm sm:max-w-lg w-full space-y-4 shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                Báo cáo hoàn thành: {finishingTask.title || (finishingTask as any).name || "Công việc"}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Nhập link bằng chứng hình ảnh hoặc ghi chú kết quả công việc
              </p>
            </div>

            <form onSubmit={handleFinishSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Link bằng chứng kết quả (Google Drive / Ảnh)
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={evidenceLink}
                  onChange={(e) => setEvidenceLink(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Ghi chú kết quả thực hiện
                </label>
                <textarea
                  rows={3}
                  placeholder="Mô tả kết quả đã làm..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-stone-200 text-xs focus:outline-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessing}
                  onClick={() => setFinishingTask(null)}
                  className="flex-1 h-9 text-xs font-bold cursor-pointer"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  {isProcessing ? "Đang gửi..." : "Gửi kết quả"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffTasksView;
