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
  PackingPriceItem,
  PackingHistoryItem,
} from "@/components/packing/PackingHistoryList";

const PackingSubmitModal = React.lazy(() => import("@/components/packing/PackingSubmitModal"));
const PackingHistoryList = React.lazy(
  () => import("@/components/packing/PackingHistoryList")
);

interface PackingSummaryData {
  totalPoints: number;
  approvedCount: number;
  pendingCount: number;
  priceList: PackingPriceItem[];
  history: PackingHistoryItem[];
}

export const PackingView: React.FC = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pricelist" | "history">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "history") return "history";
    }
    return "pricelist";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "history") setActiveTab("history");
    }
  }, []);

  const { data: res, mutate, isLoading } = useAppQuery<{
    success: boolean;
    data: PackingSummaryData;
  }>("/api/staff/tasks/packing-summary", { revalidateOnFocus: true });

  const summary = res?.data;
  const totalPoints = summary?.totalPoints || 0;
  const approvedCount = summary?.approvedCount || 0;
  const pendingCount = summary?.pendingCount || 0;
  const priceList = summary?.priceList || [];
  const history = summary?.history || [];

  // Submission modal state
  const [selectedTaskDef, setSelectedTaskDef] = useState<PackingPriceItem | null>(null);

  const handleOpenModal = (item: PackingPriceItem) => {
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
            className="h-8 w-8 rounded-full hover:bg-purple-100 text-stone-700 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-1.5">
              <span>📦</span> Khu Vực Đóng Gói
            </h1>
            <p className="text-[10px] text-stone-500">
              Khai báo số lượng đơn hàng đóng gói để tích điểm thưởng
            </p>
          </div>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-purple-50/80 border border-purple-200/80 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-purple-700">Điểm tháng này</span>
          <span className="text-2xl font-black text-purple-900 mt-0.5 font-mono">
            {isLoading ? "..." : totalPoints}
          </span>
        </div>
        <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700">Đơn đã duyệt</span>
          <span className="text-2xl font-black text-emerald-900 mt-0.5 font-mono">
            {isLoading ? "..." : approvedCount}
          </span>
        </div>
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-amber-700">Đang chờ</span>
          <span className="text-2xl font-black text-amber-900 mt-0.5 font-mono">
            {isLoading ? "..." : pendingCount}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 bg-stone-200/70 p-1 rounded-xl text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("pricelist")}
          className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "pricelist"
              ? "bg-white text-purple-800 shadow-xs font-bold"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Bảng Giá Điểm ({priceList.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "history"
              ? "bg-white text-purple-800 shadow-xs font-bold"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Lịch Sử Khai Báo ({history.length})</span>
        </button>
      </div>

      {/* TAB 1: BẢNG GIÁ ĐIỂM */}
      {activeTab === "pricelist" && (
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-stone-400">Đang tải bảng quy đổi...</div>
          ) : priceList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center text-xs text-stone-500">
              Chưa có danh mục đóng gói nào.
            </div>
          ) : (
            (priceList || []).map((item) => {
              const title = item.name || item.title || (item as any).title || "Đóng gói";
              const unit = item.unit || "đơn";
              const baseReward = item.baseReward || 0;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-white border border-purple-100 p-3.5 shadow-xs flex items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">{title}</h3>
                    {item.description && (
                      <p className="text-xs text-stone-500 mt-0.5">{item.description}</p>
                    )}
                    <span className="inline-block mt-1 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                      +{baseReward.toLocaleString()}đ / 1 {unit}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleOpenModal(item)}
                    className="shrink-0 h-8 text-xs bg-purple-700 hover:bg-purple-800 text-white font-bold px-3 rounded-xl cursor-pointer"
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
        <Suspense
          fallback={
            <div className="h-64 w-full animate-pulse rounded-2xl bg-purple-50/50 flex items-center justify-center text-xs text-purple-400">
              Đang tải lịch sử...
            </div>
          }
        >
          <PackingHistoryList
            history={history}
            isLoading={isLoading}
            onOpenModal={handleOpenModal}
            onSwitchToPricelist={() => setActiveTab("pricelist")}
          />
        </Suspense>
      )}

      {/* SUBMISSION MODAL */}
      {selectedTaskDef && (
        <Suspense fallback={null}>
          <PackingSubmitModal
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

export default PackingView;
