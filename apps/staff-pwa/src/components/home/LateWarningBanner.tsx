import React from "react";

export interface LateWarningBannerProps {
  lateCount?: number;
  latePenaltyHours?: number;
  latePenaltyAmount?: number;
}

export const LateWarningBanner: React.FC<LateWarningBannerProps> = ({
  lateCount = 0,
  latePenaltyHours = 0,
  latePenaltyAmount = 0,
}) => {
  if (lateCount < 2) return null;

  const isSevere = lateCount >= 4;

  return (
    <div
      className={`border rounded-xl p-3.5 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 text-left ${
        isSevere
          ? "bg-red-100/90 border-red-400"
          : "bg-red-50/90 border-red-200"
      }`}
    >
      <div
        className={`p-2 rounded-full shrink-0 ${
          isSevere ? "bg-red-200" : "bg-red-100"
        }`}
      >
        <span className="text-xl">{isSevere ? "🚨" : "⚠️"}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-red-800">
          {isSevere ? "⛔ Bị trừ lương do đi trễ" : "Cảnh báo đi trễ"}
        </h3>
        <p className="text-xs text-red-700 mt-1">
          Bạn đã đi trễ <span className="font-bold">{lateCount}</span> lần trong tháng này.
        </p>
        {latePenaltyHours > 0 && (
          <div className="mt-2 bg-red-200/60 rounded-md px-2 py-1.5 text-xs text-red-900 space-y-0.5">
            <div className="flex justify-between">
              <span>⏱ Số giờ bị trừ:</span>
              <span className="font-bold">{latePenaltyHours} giờ</span>
            </div>
            <div className="flex justify-between border-t border-red-300/60 pt-0.5">
              <span>💸 Tiền bị trừ:</span>
              <span className="font-bold text-red-700">
                −{" "}
                {new Intl.NumberFormat("vi-VN", {
                  style: "currency",
                  currency: "VND",
                }).format(latePenaltyAmount)}
              </span>
            </div>
            <p className="text-[10px] text-red-600 pt-0.5 border-t border-red-300/60">
              Từ lần trễ thứ 4, mỗi lần trễ thêm sẽ bị trừ 1 giờ lương.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LateWarningBanner;
