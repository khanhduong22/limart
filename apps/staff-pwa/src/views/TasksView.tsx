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

export const TasksView: React.FC = () => {
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
    <div className="space-y-3 pb-24 max-w-md mx-auto px-3 sm:px-4 pt-2 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="h-8 w-8 rounded-full hover:bg-orange-100 text-stone-700 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-left">
            <h1 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-1.5">
              <span>💼</span> WFH & Sàn Việc
            </h1>
            <p className="text-[10px] text-stone-500">
              Nhận việc làm thêm ngoài giờ để tăng thu nhập
            </p>
          </div>
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
