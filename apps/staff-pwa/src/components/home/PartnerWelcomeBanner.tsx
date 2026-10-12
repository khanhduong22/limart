import React from "react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";

export const PartnerWelcomeBanner: React.FC = () => {
  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-xs text-left">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl shrink-0">
          🎨
        </div>
        <div>
          <h3 className="text-sm font-bold text-stone-900 leading-tight">
            Chào mừng Đối tác LimArt!
          </h3>
          <p className="text-[11px] text-stone-600 mt-0.5">
            Tài khoản WFH / Marketing / Đối tác gia công. Tự do thời gian, nhận việc và tính lương theo KPI hiệu suất.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <Link to="/tasks" className="block w-full">
          <Button
            variant="default"
            className="w-full text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer py-2 h-auto"
          >
            💼 Vào Sàn việc (WFH)
          </Button>
        </Link>
        <Link to="/packing" className="block w-full">
          <Button
            variant="outline"
            className="w-full text-xs font-bold border-amber-300 text-amber-900 bg-white hover:bg-amber-50 shadow-xs cursor-pointer py-2 h-auto"
          >
            📦 Báo cáo Đóng gói
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default PartnerWelcomeBanner;
