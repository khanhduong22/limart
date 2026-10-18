import React, { useState, useEffect } from "react";
import { useAppQuery } from "@/lib/api-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  claimMarketTask,
  startWfhTask,
  submitWfhTask,
} from "@/lib/api-client";
import { WfhTaskTabs } from "@/components/tasks/WfhTaskTabs";
import type {
  MarketItem,
  TaskDefItem,
  UserTaskRecord,
  SubmittingWfhTask,
  WfhTabType,
} from "@/components/tasks/WfhTaskTypes";

const MarketTaskList = React.lazy(() =>
  import("@/components/tasks/MarketTaskList").then((m) => ({ default: m.MarketTaskList }))
);
const GeneralTaskList = React.lazy(() =>
  import("@/components/tasks/GeneralTaskList").then((m) => ({ default: m.GeneralTaskList }))
);
const UserTaskHistoryList = React.lazy(() =>
  import("@/components/tasks/UserTaskHistoryList").then((m) => ({ default: m.UserTaskHistoryList }))
);
const WfhTaskSubmitModal = React.lazy(() =>
  import("@/components/tasks/WfhTaskSubmitModal").then((m) => ({ default: m.WfhTaskSubmitModal }))
);

export interface TasksViewProps {
  userRole?: string;
}

export const TasksView: React.FC<TasksViewProps> = ({ userRole }) => {
  const isPartner = userRole === "PARTNER";
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WfhTabType>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "history") return "history";
      if (params.get("tab") === "general") return "general";
    }
    return "market";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "history") setActiveTab("history");
      else if (tab === "general") setActiveTab("general");
    }
  }, []);

  const { data: marketRes, mutate: mutateMarket, isLoading: loadingMarket } = useAppQuery<{
    success: boolean;
    data: MarketItem[];
  }>("/api/staff/tasks/market", { revalidateOnFocus: true });

  const { data: availableRes, mutate: mutateAvailable, isLoading: loadingAvailable } = useAppQuery<{
    success: boolean;
    data: TaskDefItem[];
  }>("/api/staff/tasks/available", { revalidateOnFocus: true });

  const { data: myTasksRes, mutate: mutateMyTasks, isLoading: loadingMyTasks } = useAppQuery<{
    success: boolean;
    data: UserTaskRecord[];
  }>("/api/staff/tasks/my", { revalidateOnFocus: true });

  const marketItems = Array.isArray(marketRes?.data) ? marketRes.data : [];
  const generalTasks = (Array.isArray(availableRes?.data) ? availableRes.data : []).filter(
    (t) => t && t.unit !== "điểm" && t.unit !== "điểm-bưng"
  );
  const myTasks = (Array.isArray(myTasksRes?.data) ? myTasksRes.data : []).filter((t) => {
    if (!t) return false;
    const taskDef = t.taskDefinition || (t as any).taskDef;
    const unit = taskDef?.unit || (t as any).unit;
    return unit !== "điểm" && unit !== "điểm-bưng";
  });

  const [submittingTask, setSubmittingTask] = useState<SubmittingWfhTask | null>(null);
  const [initialQuantity, setInitialQuantity] = useState(1);
  const [initialEvidence, setInitialEvidence] = useState("");
  const [initialNote, setInitialNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClaim = async (taskItemId: string) => {
    setIsProcessing(true);
    try {
      const res = await claimMarketTask(taskItemId);
      if (res.success) {
        toast.success("🎉 Nhận việc thành công! Kiểm tra tab Lịch sử.");
        mutateMarket();
        mutateMyTasks();
        setActiveTab("history");
      } else {
        toast.error(res.error || "Không thể nhận việc này");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStart = async (taskDefId: string) => {
    setIsProcessing(true);
    try {
      const res = await startWfhTask(taskDefId);
      if (res.success) {
        toast.success("🚀 Đã bắt đầu nhận việc! Hoàn thành và nộp kết quả nhé.");
        mutateMyTasks();
        setActiveTab("history");
      } else {
        toast.error(res.error || "Không thể bắt đầu việc này");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const openSubmitModal = (t: UserTaskRecord) => {
    const taskDef = t.taskDefinition || (t as any).taskDef || {};
    const title =
      t.taskItem?.title ||
      (t.taskItem as any)?.name ||
      taskDef.name ||
      taskDef.title ||
      (t as any).title ||
      "Nhiệm vụ WFH";
    const unit = taskDef.unit || (t as any).unit || "lần";
    setSubmittingTask({ userTaskId: t.id, title, unit });
    setInitialQuantity(t.quantity || 1);
    setInitialEvidence(t.evidenceLink || "");
    setInitialNote(t.note || "");
  };

  const handleSubmitTask = async ({
    quantity,
    evidenceLink,
    note,
  }: {
    quantity: number;
    evidenceLink: string;
    note: string;
  }) => {
    if (!submittingTask) return;
    setIsProcessing(true);
    try {
      const res = await submitWfhTask({
        userTaskId: submittingTask.userTaskId,
        taskDefId: submittingTask.taskDefId,
        quantity,
        evidenceLink,
        note,
      });

      if (res.success) {
        toast.success("✅ Đã nộp kết quả thành công! Chờ Admin phê duyệt.");
        setSubmittingTask(null);
        mutateMyTasks();
      } else {
        toast.error(res.error || "Lỗi khi nộp kết quả");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-full md:max-w-md mx-auto px-3 sm:px-4 pt-2 pb-32 space-y-3 select-none box-border min-w-0 overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="h-8 w-8 rounded-full hover:bg-orange-100 text-stone-700 cursor-pointer shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-left min-w-0">
            <h1 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-1.5 truncate">
              <span className="shrink-0">💼</span> <span className="truncate">Trung Tâm Công Việc &amp; Tác Nghiệp</span>
            </h1>
            <p className="text-[10px] text-stone-500 truncate">
              Quản lý nhiệm vụ ca làm, công tác kho &amp; sàn việc WFH
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid (Tác nghiệp kho & KPI) */}
      {!isPartner ? (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => router.push("/staff-tasks")}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-white/95 border border-amber-200/90 shadow-2xs hover:bg-amber-50/60 active:scale-95 transition-all text-center cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-lg mb-1.5 group-hover:scale-105 transition-transform">
              🎯
            </div>
            <span className="text-xs font-bold text-stone-900 leading-tight">
              Nhiệm vụ &amp; KPI
            </span>
            <span className="text-[9.5px] text-stone-500 mt-0.5 line-clamp-1">
              Ca trực &amp; tiến độ
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/packing")}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-white/95 border border-blue-200/90 shadow-2xs hover:bg-blue-50/60 active:scale-95 transition-all text-center cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center text-lg mb-1.5 group-hover:scale-105 transition-transform">
              📦
            </div>
            <span className="text-xs font-bold text-stone-900 leading-tight">
              Đóng gói đơn
            </span>
            <span className="text-[9.5px] text-stone-500 mt-0.5 line-clamp-1">
              Quét mã &amp; điểm
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/carrying")}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-white/95 border border-emerald-200/90 shadow-2xs hover:bg-emerald-50/60 active:scale-95 transition-all text-center cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-lg mb-1.5 group-hover:scale-105 transition-transform">
              🛗
            </div>
            <span className="text-xs font-bold text-stone-900 leading-tight">
              Bưng vác hàng
            </span>
            <span className="text-[9.5px] text-stone-500 mt-0.5 line-clamp-1">
              Ghi nhận lên lầu
            </span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => router.push("/staff-tasks")}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 shadow-2xs hover:from-amber-100/70 hover:to-orange-100/70 active:scale-[0.99] transition-all text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xl shadow-xs group-hover:scale-105 transition-transform">
              🎯
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-stone-900">Nhiệm Vụ Được Giao &amp; Chỉ Tiêu KPI</h3>
              <p className="text-[10px] sm:text-[11px] text-stone-500 mt-0.5">Theo dõi nhiệm vụ WFH, nội dung &amp; hoàn thành chỉ tiêu</p>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-700 bg-white/90 px-2.5 py-1 rounded-lg border border-amber-200 shrink-0">
            Xem việc →
          </span>
        </button>
      )}

      {/* Section Divider & Title for WFH Marketplace */}
      <div className="pt-2 flex items-center justify-between border-t border-stone-200/60">
        <div className="text-left">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
            <span>💼</span> Sàn Việc WFH &amp; Ngoài Giờ
          </h2>
          <p className="text-[10px] text-stone-400">
            Nhận việc làm thêm ngoài giờ để tăng thêm thu nhập
          </p>
        </div>
      </div>

      <WfhTaskTabs
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        marketCount={marketItems.length}
        historyCount={myTasks.length}
      />

      {activeTab === "market" && (
        <React.Suspense
          fallback={
            <div className="h-64 w-full animate-pulse rounded-2xl bg-stone-100 flex items-center justify-center text-xs text-stone-400">
              Đang tải chợ nhiệm vụ...
            </div>
          }
        >
          <MarketTaskList
            items={marketItems}
            isLoading={loadingMarket}
            isProcessing={isProcessing}
            onClaim={handleClaim}
          />
        </React.Suspense>
      )}

      {activeTab === "general" && (
        <React.Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Đang tải danh sách...</div>}>
          <GeneralTaskList
            tasks={generalTasks}
            isLoading={loadingAvailable}
            isProcessing={isProcessing}
            onStart={handleStart}
          />
        </React.Suspense>
      )}

      {activeTab === "history" && (
        <React.Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Đang tải danh sách...</div>}>
          <UserTaskHistoryList
            tasks={myTasks}
            isLoading={loadingMyTasks}
            onOpenSubmit={openSubmitModal}
          />
        </React.Suspense>
      )}

      <React.Suspense fallback={null}>
        <WfhTaskSubmitModal
          task={submittingTask}
          initialQuantity={initialQuantity}
          initialEvidence={initialEvidence}
          initialNote={initialNote}
          isProcessing={isProcessing}
          onClose={() => setSubmittingTask(null)}
          onSubmit={handleSubmitTask}
        />
      </React.Suspense>
    </div>
  );
};

export default TasksView;
