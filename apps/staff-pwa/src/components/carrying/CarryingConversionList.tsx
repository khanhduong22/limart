import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CarryingPriceItem } from "./CarryingHistoryList";

export interface CarryingConversionListProps {
  conversionList: CarryingPriceItem[];
  isLoading: boolean;
  onOpenModal: (item: CarryingPriceItem) => void;
}

export const CarryingConversionList: React.FC<CarryingConversionListProps> = ({
  conversionList,
  isLoading,
  onOpenModal,
}) => {
  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-stone-400">
        Đang tải bảng quy đổi...
      </div>
    );
  }

  if (conversionList.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center text-xs text-stone-500">
        Chưa có danh mục bưng hàng nào.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {conversionList.map((item) => {
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
              onClick={() => onOpenModal(item)}
              className="shrink-0 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 rounded-xl cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Khai báo
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default CarryingConversionList;
