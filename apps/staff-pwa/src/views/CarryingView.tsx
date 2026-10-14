import React, { useState, useEffect, Suspense } from "react";
import { useAppQuery } from "@/lib/api-query";
import {
  ChevronLeft,
  Clock,
  Plus,
  Sparkles,
} from "lucide-react";
import { useRouter } from "@/lib/router";
import { Button } from "@/components/ui/button";
import type {
  CarryingPriceItem,
  CarryingHistoryItem,
} from "@/components/carrying/CarryingHistoryList";

const CarryingSubmitModal = React.lazy(() => import("@/components/carrying/CarryingSubmitModal"));
const CarryingHistoryList = React.lazy(
  () => import("@/components/carrying/CarryingHistoryList")
);

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

  const handleOpenModal = (item: CarryingPriceItem) => {
    setSelectedTaskDef(item);
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
        <React.Suspense
          fallback={
            <div className="h-64 w-full animate-pulse rounded-2xl bg-stone-100 flex items-center justify-center text-xs text-stone-400">
              Đang tải lịch sử bưng hàng...
            </div>
          }
        >
          <CarryingHistoryList
            history={history}
            isLoading={isLoading}
            onOpenModal={handleOpenModal}
            onSwitchTab={() => setActiveTab("conversion")}
          />
        </React.Suspense>
      )}

      {/* SUBMISSION MODAL */}
      {selectedTaskDef && (
        <Suspense fallback={null}>
          <CarryingSubmitModal
            taskDef={selectedTaskDef}
            onClose={() => setSelectedTaskDef(null)}
            onSuccess={() => {
              setSelectedTaskDef(null);
              mutate();
              setActiveTab("history");
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default CarryingView;
