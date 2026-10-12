import React, { useState, useEffect } from "react";
import useSWR from "swr";
import {
  Briefcase,
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Flame,
  FileCheck,
  Send,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  fetcher,
  claimMarketTask,
  startWfhTask,
  submitWfhTask,
} from "@/lib/api-client";

interface MarketItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  taskDefinition?: {
    id: string;
    name?: string;
    title?: string;
    baseReward: number;
    unit: string;
  };
  taskDef?: {
    id: string;
    name?: string;
    title?: string;
    baseReward: number;
    unit: string;
  };
}

interface TaskDefItem {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  baseReward: number;
  unit: string;
  category?: string;
}

interface UserTaskRecord {
  id: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  quantity: number;
  unitPrice: number;
  finalAmount?: number;
  evidenceLink?: string;
  note?: string;
  rejectReason?: string;
  adminNote?: string;
  createdAt: string;
  submittedAt?: string;
  taskDefinition?: {
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  };
  taskDef?: {
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  };
  taskItem?: {
    name?: string;
    title?: string;
  };
}

export const TasksView: React.FC = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"market" | "general" | "history">(() => {
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

  // Fetch data with SWR
  const { data: marketRes, mutate: mutateMarket, isLoading: loadingMarket } = useSWR<{
    success: boolean;
    data: MarketItem[];
  }>("/api/staff/tasks/market", fetcher, { revalidateOnFocus: true });

  const { data: availableRes, mutate: mutateAvailable, isLoading: loadingAvailable } = useSWR<{
    success: boolean;
    data: TaskDefItem[];
  }>("/api/staff/tasks/available", fetcher, { revalidateOnFocus: true });

  const { data: myTasksRes, mutate: mutateMyTasks, isLoading: loadingMyTasks } = useSWR<{
    success: boolean;
    data: UserTaskRecord[];
  }>("/api/staff/tasks/my", fetcher, { revalidateOnFocus: true });

  const marketItems = Array.isArray(marketRes?.data) ? marketRes.data : [];
  // Filter out packing & carrying from WFH general list
  const generalTasks = (Array.isArray(availableRes?.data) ? availableRes.data : []).filter(
    (t) => t && t.unit !== "điểm" && t.unit !== "điểm-bưng"
  );
  // Filter out packing & carrying from WFH history
  const myTasks = (Array.isArray(myTasksRes?.data) ? myTasksRes.data : []).filter((t) => {
    if (!t) return false;
    const taskDef = t.taskDefinition || (t as any).taskDef;
    const unit = taskDef?.unit || (t as any).unit;
    return unit !== "điểm" && unit !== "điểm-bưng";
  });

  // Submit Modal state
  const [submittingTask, setSubmittingTask] = useState<{
    userTaskId?: string;
    taskDefId?: string;
    title: string;
    unit: string;
  } | null>(null);
  const [submitQuantity, setSubmitQuantity] = useState("1");
  const [submitEvidence, setSubmitEvidence] = useState("");
  const [submitNote, setSubmitNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Claim a market task
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

  // Start a general WFH task
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

  // Open submit modal for user task
  const openSubmitModal = (t: UserTaskRecord) => {
    const taskDef = t.taskDefinition || (t as any).taskDef || {};
    const title = t.taskItem?.title || (t.taskItem as any)?.name || taskDef.name || taskDef.title || (t as any).title || "Nhiệm vụ WFH";
    const unit = taskDef.unit || (t as any).unit || "lần";
    setSubmittingTask({
      userTaskId: t.id,
      title,
      unit,
    });
    setSubmitQuantity(String(t.quantity || 1));
    setSubmitEvidence(t.evidenceLink || "");
    setSubmitNote(t.note || "");
  };

  // Submit task completion
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingTask) return;

    const q = parseInt(submitQuantity, 10);
    if (isNaN(q) || q <= 0) {
      toast.error("Vui lòng nhập số lượng hợp lệ (> 0)");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await submitWfhTask({
        userTaskId: submittingTask.userTaskId,
        taskDefId: submittingTask.taskDefId,
        quantity: q,
        evidenceLink: submitEvidence.trim(),
        note: submitNote.trim(),
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
      {/* Top Header */}
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
          <div>
            <h1 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-1.5">
              <span>💼</span> WFH & Sàn Việc
            </h1>
            <p className="text-[10px] text-stone-500">
              Nhận việc làm thêm ngoài giờ để tăng thu nhập
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Control */}
      <div className="grid grid-cols-3 bg-stone-200/70 p-1 rounded-xl text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("market")}
          className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "market"
              ? "bg-white text-indigo-700 shadow-xs font-bold"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Sàn việc ({marketItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "general"
              ? "bg-white text-indigo-700 shadow-xs font-bold"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Nhiệm vụ chung</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "history"
              ? "bg-white text-indigo-700 shadow-xs font-bold"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          <span>Lịch sử ({myTasks.length})</span>
        </button>
      </div>

      {/* TAB 1: SÀN VIỆC (MARKETPLACE) */}
      {activeTab === "market" && (
        <div className="space-y-2.5">
          {loadingMarket ? (
            <div className="p-8 text-center text-xs text-stone-400">Đang tải sàn việc...</div>
          ) : marketItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center space-y-2">
              <span className="text-3xl">🧺</span>
              <p className="text-xs font-bold text-stone-700">Hiện chưa có việc mở nào trên sàn</p>
              <p className="text-[11px] text-stone-500">
                Hãy quay lại sau hoặc xem tab Nhiệm vụ chung nhé!
              </p>
            </div>
          ) : (
            (marketItems || []).map((item) => {
              const taskDef = item.taskDefinition || (item as any).taskDef || {};
              const title = item.title || (item as any).name || taskDef.name || taskDef.title || "Nhiệm vụ";
              const categoryTitle = taskDef.name || taskDef.title || (item as any).title || "Nhiệm vụ";
              const baseReward = taskDef.baseReward || 0;
              const unit = taskDef.unit || "lượt";

              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-white border border-indigo-100 p-3.5 shadow-xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-stone-900">{title}</h3>
                      {item.description && (
                        <p className="text-xs text-stone-600 mt-0.5 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md font-mono">
                      +{baseReward.toLocaleString()}đ/{unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                    <span className="text-[11px] text-stone-500">
                      Phân loại: <span className="font-semibold text-stone-700">{categoryTitle}</span>
                    </span>
                    <Button
                      size="sm"
                      disabled={isProcessing}
                      onClick={() => handleClaim(item.id)}
                      className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 cursor-pointer"
                    >
                      Nhận Job Này
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: NHIỆM VỤ CHUNG (GENERAL TASKS) */}
      {activeTab === "general" && (
        <div className="space-y-2.5">
          {loadingAvailable ? (
            <div className="p-8 text-center text-xs text-stone-400">Đang tải danh sách nhiệm vụ...</div>
          ) : generalTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center text-xs text-stone-500">
              Không có nhiệm vụ chung nào đang hoạt động.
            </div>
          ) : (
            (generalTasks || []).map((t) => {
              const title = (t as any).name || t.title || "Nhiệm vụ";
              const baseReward = t.baseReward || 0;
              const unit = t.unit || "lượt";

              return (
                <div
                  key={t.id}
                  className="rounded-2xl bg-white border border-stone-200 p-3.5 shadow-xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-stone-900">{title}</h3>
                      {t.description && (
                        <p className="text-xs text-stone-600 mt-0.5">{t.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-mono">
                      +{baseReward.toLocaleString()}đ/{unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-100">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isProcessing}
                      onClick={() => handleStart(t.id)}
                      className="h-7 text-xs font-semibold cursor-pointer"
                    >
                      Bắt đầu nhận việc
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: LỊCH SỬ CỦA TÔI */}
      {activeTab === "history" && (
        <div className="space-y-2.5">
          {loadingMyTasks ? (
            <div className="p-8 text-center text-xs text-stone-400">Đang tải lịch sử...</div>
          ) : myTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center space-y-1">
              <span className="text-2xl">📋</span>
              <p className="text-xs font-bold text-stone-700">Chưa có nhiệm vụ nào</p>
              <p className="text-[11px] text-stone-500">
                Hãy qua tab Sàn việc hoặc Nhiệm vụ chung để nhận job nhé!
              </p>
            </div>
          ) : (
            (myTasks || []).map((t) => {
              const taskDef = t.taskDefinition || (t as any).taskDef || {};
              const title = t.taskItem?.title || (t.taskItem as any)?.name || taskDef.name || taskDef.title || (t as any).title || "Nhiệm vụ WFH";
              const unit = taskDef.unit || (t as any).unit || "lần";
              const amount = t.finalAmount || (t.quantity || 1) * (t.unitPrice || 0);

              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border p-3.5 shadow-xs space-y-2 ${
                    t.status === "APPROVED"
                      ? "bg-emerald-50/40 border-emerald-200"
                      : t.status === "REJECTED"
                      ? "bg-rose-50/50 border-rose-200"
                      : t.status === "SUBMITTED"
                      ? "bg-amber-50/40 border-amber-200"
                      : "bg-white border-stone-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-stone-900">{title}</h3>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        Số lượng: <span className="font-semibold text-stone-700">{t.quantity} {unit}</span>
                      </p>
                    </div>
                    {/* Status Badge */}
                    <div>
                      {t.status === "APPROVED" && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Đã duyệt (+{amount.toLocaleString()}đ)
                        </span>
                      )}
                      {t.status === "SUBMITTED" && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Chờ Admin duyệt
                        </span>
                      )}
                      {t.status === "PENDING" && (
                        <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100 border border-indigo-300 px-2 py-0.5 rounded-full">
                          Đang thực hiện
                        </span>
                      )}
                      {t.status === "REJECTED" && (
                        <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Bị từ chối
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reject Reason Alert */}
                  {t.status === "REJECTED" && (t.rejectReason || t.adminNote) && (
                    <div className="bg-rose-100/70 border border-rose-200 p-2 rounded-lg text-xs text-rose-800">
                      <p className="font-bold text-[11px]">Lý do từ chối:</p>
                      <p className="text-[11px] mt-0.5">{t.rejectReason || t.adminNote}</p>
                    </div>
                  )}

                  {/* Evidence link & Notes */}
                  {t.evidenceLink && (
                    <div className="text-[11px] text-indigo-700 truncate">
                      🔗 <a href={t.evidenceLink} target="_blank" rel="noreferrer" className="underline hover:text-indigo-900">
                        {t.evidenceLink}
                      </a>
                    </div>
                  )}

                  {/* Actions */}
                  {(t.status === "PENDING" || t.status === "REJECTED") && (
                    <div className="flex justify-end pt-1 border-t border-stone-100">
                      <Button
                        size="sm"
                        onClick={() => openSubmitModal(t)}
                        className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 cursor-pointer"
                      >
                        {t.status === "REJECTED" ? "Nộp lại kết quả" : "Nộp kết quả"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBMISSION MODAL */}
      {submittingTask && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                Nộp kết quả: {submittingTask.title}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Nhập số lượng thực tế và link hình ảnh/bằng chứng hoàn thành
              </p>
            </div>

            <form onSubmit={handleSubmitTask} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Số lượng hoàn thành ({submittingTask.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={submitQuantity}
                  onChange={(e) => setSubmitQuantity(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Link bằng chứng (Google Drive / Link ảnh)
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={submitEvidence}
                  onChange={(e) => setSubmitEvidence(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Ghi chú thêm (tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú chi tiết nếu có..."
                  value={submitNote}
                  onChange={(e) => setSubmitNote(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-stone-200 text-xs focus:outline-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessing}
                  onClick={() => setSubmittingTask(null)}
                  className="flex-1 h-9 text-xs font-bold cursor-pointer"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                >
                  {isProcessing ? "Đang gửi..." : "Xác nhận nộp"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksView;
