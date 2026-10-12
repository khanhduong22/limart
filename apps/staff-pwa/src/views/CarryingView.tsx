import React, { useState, useEffect } from "react";
import { useAppQuery } from "@/lib/api-query";
import {
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  submitCarryingTask,
} from "@/lib/api-client";

interface CarryingPriceItem {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  baseReward: number;
  unit: string;
}

interface CarryingHistoryItem {
  id: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  quantity: number;
  finalAmount?: number;
  unitPrice: number;
  note?: string;
  evidenceLink?: string;
  rejectReason?: string;
  adminNote?: string;
  createdAt: string;
  submittedAt?: string;
  taskDefinition?: {
    id?: string;
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  };
  taskDef?: {
    id?: string;
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  };
}

interface CarryingSummaryData {
  totalPoints: number;
  approvedCount: number;
  pendingCount: number;
  conversionList: CarryingPriceItem[];
  history: CarryingHistoryItem[];
}

export const CarryingView: React.FC = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"conversion" | "history">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "history") return "history";
    }
    return "conversion";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "history") setActiveTab("history");
    }
  }, []);

  const { data: res, mutate, isLoading } = useAppQuery<{
    success: boolean;
    data: CarryingSummaryData;
  }>("/api/staff/tasks/carrying-summary", { revalidateOnFocus: true });

  const summary = res?.data;
  const totalPoints = summary?.totalPoints || 0;
  const approvedCount = summary?.approvedCount || 0;
  const pendingCount = summary?.pendingCount || 0;
  const conversionList = summary?.conversionList || [];
  const history = summary?.history || [];

  // Submission modal state
  const [selectedTaskDef, setSelectedTaskDef] = useState<CarryingPriceItem | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [evidenceLink, setEvidenceLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenModal = (item: CarryingPriceItem) => {
    setSelectedTaskDef(item);
    setQuantity("1");
    setNote("");
    setEvidenceLink("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskDef) return;

    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) {
      toast.error("Vui lòng nhập số lượng hợp lệ (> 0)");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitCarryingTask({
        taskDefId: selectedTaskDef.id,
        quantity: q,
        note: note.trim() || undefined,
        evidenceLink: evidenceLink.trim() || undefined,
      });

      if (result.success) {
        toast.success("🛗 Khai báo bưng hàng lên lầu thành công! Chờ Admin duyệt.");
        setSelectedTaskDef(null);
        mutate();
        setActiveTab("history");
      } else {
        toast.error(result.error || "Không thể gửi khai báo");
      }
    } finally {
      setIsSubmitting(false);
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
            className="h-8 w-8 rounded-full hover:bg-amber-100 text-stone-700 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-1.5">
              <span>🛗</span> Chiến Thần Bưng Hàng
            </h1>
            <p className="text-[10px] text-stone-500">
              Khai báo số lượt bưng hàng lên lầu để tích điểm thưởng cuối tháng (+200K cho Top 1)
            </p>
          </div>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-amber-700">Điểm bưng tháng này</span>
          <span className="text-2xl font-black text-amber-900 mt-0.5 font-mono">
            {isLoading ? "..." : totalPoints}
          </span>
        </div>
        <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700">Lượt đã duyệt</span>
          <span className="text-2xl font-black text-emerald-900 mt-0.5 font-mono">
            {isLoading ? "..." : approvedCount}
          </span>
        </div>
        <div className="bg-orange-50/80 border border-orange-200/80 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-orange-700">Đang chờ</span>
          <span className="text-2xl font-black text-orange-900 mt-0.5 font-mono">
            {isLoading ? "..." : pendingCount}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 bg-stone-200/70 p-1 rounded-xl text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("conversion")}
          className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "conversion"
              ? "bg-white text-amber-800 shadow-xs font-bold"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Bảng Quy Đổi Điểm ({conversionList.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "history"
              ? "bg-white text-amber-800 shadow-xs font-bold"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Lịch Sử Khai Báo ({history.length})</span>
        </button>
      </div>

      {/* TAB 1: BẢNG QUY ĐỔI ĐIỂM */}
      {activeTab === "conversion" && (
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-stone-400">Đang tải bảng quy đổi...</div>
          ) : conversionList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center text-xs text-stone-500">
              Chưa có danh mục bưng hàng nào.
            </div>
          ) : (
            (conversionList || []).map((item) => {
              const title = item.name || item.title || (item as any).title || "Bưng hàng";
              const unit = item.unit || "lượt";
              const baseReward = item.baseReward || 0;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-white border border-amber-100 p-3.5 shadow-xs flex items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">{title}</h3>
                    {item.description && (
                      <p className="text-xs text-stone-500 mt-0.5">{item.description}</p>
                    )}
                    <span className="inline-block mt-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      +{baseReward.toLocaleString()}đ / 1 {unit}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleOpenModal(item)}
                    className="shrink-0 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 rounded-xl cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Khai báo
                  </Button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: LỊCH SỬ KHAI BÁO */}
      {activeTab === "history" && (
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-stone-400">Đang tải lịch sử...</div>
          ) : history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center space-y-1">
              <span className="text-2xl">🛗</span>
              <p className="text-xs font-bold text-stone-700">Chưa có lượt khai báo bưng hàng nào</p>
              <p className="text-[11px] text-stone-500">
                Hãy chuyển sang tab Bảng Quy Đổi Điểm để gửi báo cáo nhé!
              </p>
            </div>
          ) : (
            (history || []).map((t) => {
              const taskDef = t.taskDefinition || (t as any).taskDef || {};
              const title = taskDef.name || taskDef.title || (t as any).title || "Khai báo bưng hàng";
              const unit = taskDef.unit || "lượt";

              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border p-3.5 shadow-xs space-y-2 ${
                    t.status === "APPROVED"
                      ? "bg-emerald-50/40 border-emerald-200"
                      : t.status === "REJECTED"
                      ? "bg-rose-50/50 border-rose-200"
                      : "bg-white border-stone-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-stone-900">
                        {title}
                      </h3>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        Số lượt: <span className="font-semibold text-stone-800">{t.quantity} {unit}</span>
                        {t.submittedAt && (
                          <span className="text-stone-400 ml-2">
                            {new Date(t.submittedAt).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      {t.status === "APPROVED" && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> +{t.finalAmount || t.quantity} điểm bưng
                        </span>
                      )}
                      {(t.status === "SUBMITTED" || t.status === "PENDING") && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Đang chờ duyệt
                        </span>
                      )}
                      {t.status === "REJECTED" && (
                        <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Bị từ chối
                        </span>
                      )}
                    </div>
                  </div>

                  {t.note && (
                    <p className="text-[11px] text-stone-600 bg-stone-50 p-2 rounded-lg">
                      📝 {t.note}
                    </p>
                  )}

                  {/* Reject Reason Alert */}
                  {t.status === "REJECTED" && (t.rejectReason || t.adminNote) && (
                    <div className="bg-rose-100/70 border border-rose-200 p-2 rounded-lg text-xs text-rose-800">
                      <p className="font-bold text-[11px]">Lý do từ chối:</p>
                      <p className="text-[11px] mt-0.5">{t.rejectReason || t.adminNote}</p>
                    </div>
                  )}

                  {t.evidenceLink && (
                    <div className="text-[11px] text-amber-700 truncate">
                      🔗 <a href={t.evidenceLink} target="_blank" rel="noreferrer" className="underline hover:text-amber-900">
                        {t.evidenceLink}
                      </a>
                    </div>
                  )}

                  {/* Actions for rejected carrying item */}
                  {t.status === "REJECTED" && (
                    <div className="flex justify-end pt-1 border-t border-stone-100">
                      <Button
                        size="sm"
                        onClick={() => {
                          const def = t.taskDefinition || t.taskDef;
                          if (def) {
                            handleOpenModal({
                              id: (t as any).taskDefId || def.id || (t as any).id,
                              name: def.name || def.title,
                              title: def.title || def.name,
                              baseReward: def.baseReward || t.unitPrice || 0,
                              unit: def.unit || "điểm-bưng",
                            });
                          } else {
                            setActiveTab("conversion");
                          }
                        }}
                        className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 cursor-pointer"
                      >
                        Khai báo nộp lại
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
      {selectedTaskDef && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                Khai báo: {selectedTaskDef.name || selectedTaskDef.title || "Bưng hàng"}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Nhập số lượt hoặc số thùng đã bưng lên lầu trong ca làm
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Số lượng ({selectedTaskDef.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Link ảnh hoặc bằng chứng (nếu có)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={evidenceLink}
                  onChange={(e) => setEvidenceLink(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Ghi chú (loại thùng hàng / ca bưng)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ví dụ: Bưng 2 kiện hàng áo thun lên kho lầu 2..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-stone-200 text-xs focus:outline-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => setSelectedTaskDef(null)}
                  className="flex-1 h-9 text-xs font-bold cursor-pointer"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                >
                  {isSubmitting ? "Đang gửi..." : "Gửi khai báo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarryingView;
