import React from "react";
import { Button } from "@/components/ui/button";

export interface RejectedTasksAlertBannerProps {
  count: number;
  onOpenModal: () => void;
}

export const RejectedTasksAlertBanner: React.FC<RejectedTasksAlertBannerProps> = ({
  count,
  onOpenModal,
}) => {
  if (count <= 0) return null;

  return (
    <div className="border border-rose-200 bg-rose-50/90 rounded-xl p-4 flex items-start gap-3 shadow-2xs animate-in fade-in slide-in-from-top-3 duration-300 text-left">
      <div className="p-2 bg-rose-100 rounded-full text-rose-700 leading-none shrink-0">
        <span className="text-base">⚠️</span>
      </div>
      <div className="flex-grow space-y-1">
        <h3 className="text-sm font-bold text-rose-800">
          Yêu cầu sửa đổi công việc
        </h3>
        <p className="text-xs text-rose-700 leading-relaxed">
          Bạn có <span className="font-extrabold text-rose-900">{count}</span> công việc khoán/KPI bị Admin từ chối và yêu cầu sửa đổi.
        </p>
        <div className="pt-1.5">
          <Button
            size="sm"
            onClick={onOpenModal}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-7 text-xs px-3 shadow-2xs cursor-pointer"
          >
            Xem chi tiết & sửa ngay
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RejectedTasksAlertBanner;
