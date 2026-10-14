import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PackingPriceItem } from "./PackingHistoryList";

export interface PackingPriceListProps {
  priceList: PackingPriceItem[];
  isLoading: boolean;
  onOpenModal: (item: PackingPriceItem) => void;
}

export const PackingPriceList: React.FC<PackingPriceListProps> = ({
  priceList,
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

  if (!priceList || priceList.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center text-xs text-stone-500">
        Chưa có danh mục đóng gói nào.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {priceList.map((item) => {
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
              onClick={() => onOpenModal(item)}
              className="shrink-0 h-8 text-xs bg-purple-700 hover:bg-purple-800 text-white font-bold px-3 rounded-xl cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Khai báo
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default PackingPriceList;
