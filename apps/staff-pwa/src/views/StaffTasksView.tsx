import React from "react";
import { useAppQuery } from "@/lib/api-query";
import {
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { toggleStaffTaskStatus } from "@/lib/api-client";
import {
  useStaffTasksStore,
  StaffTask,
  KPIStats,
} from "@/stores/useStaffTasksStore";
import {
  TaskFilterTabs,
  StaffTaskCard,
} from "@/components/tasks";

const TaskDetailModal = React.lazy(() =>
  import("@/components/tasks").then((m) => ({ default: m.TaskDetailModal }))
);
const TaskSubmitModal = React.lazy(() =>
  import("@/components/tasks").then((m) => ({ default: m.TaskSubmitModal }))
);

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

  const {
    filter,
    finishingTask,
    viewingTask,
    evidenceLink,
    note,
    isProcessing,
    setFilter,
    openSubmitModal,
    closeSubmitModal,
    setEvidenceLink,
    setNote,
    setIsProcessing,
    openDetailModal,
    closeDetailModal,
  } = useStaffTasksStore();

  const { data: res, error, mutate, isLoading } = useAppQuery<{
    success: boolean;
    allowed?: boolean;
    data: StaffTasksResponse["data"];
    error?: string;
  }>("/api/staff/staff-tasks", { revalidateOnFocus: true });

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
        closeSubmitModal();
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
      <TaskFilterTabs
        currentFilter={filter}
        onFilterChange={setFilter}
        totalCount={tasks.length}
      />

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
            {(filteredTasks || []).map((t) => (
              <StaffTaskCard
                key={t.id}
                task={t}
                isProcessing={isProcessing}
                onViewDetails={openDetailModal}
                onStartTask={handleStartTask}
                onSubmitTask={openSubmitModal}
              />
            ))}
          </div>
        )}
      </div>

      {/* READ-ONLY TASK DETAILS MODAL */}
      <React.Suspense fallback={null}>
        <TaskDetailModal
          task={viewingTask}
          isProcessing={isProcessing}
          onClose={closeDetailModal}
          onStartTask={handleStartTask}
          onSubmitTask={openSubmitModal}
        />
      </React.Suspense>

      {/* FINISH TASK MODAL */}
      <React.Suspense fallback={null}>
        <TaskSubmitModal
          task={finishingTask}
          evidenceLink={evidenceLink}
          note={note}
          isProcessing={isProcessing}
          onEvidenceLinkChange={setEvidenceLink}
          onNoteChange={setNote}
          onSubmit={handleFinishSubmit}
          onClose={closeSubmitModal}
        />
      </React.Suspense>
    </div>
  );
};

export default StaffTasksView;
