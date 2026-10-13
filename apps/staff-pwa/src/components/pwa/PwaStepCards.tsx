import React from "react";
import { Share, MoreVertical, PlusSquare, CheckCircle2 } from "lucide-react";

interface PwaStepCardsProps {
  isIos: boolean;
}

export const PwaStepCards: React.FC<PwaStepCardsProps> = ({ isIos }) => {
  return (
    <div className="grid grid-cols-4 gap-2">
      {/* Step 1 */}
      <div className="flex flex-col items-center text-center p-2 rounded-xl bg-white dark:bg-stone-900/90 border border-orange-100/80 dark:border-stone-800 shadow-2xs">
        <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-stone-800 text-[11px] font-bold flex items-center justify-center text-amber-800 dark:text-amber-300 mb-1">
          1
        </span>
        <div className="h-9 flex items-center justify-center text-amber-600 dark:text-amber-400">
          {isIos ? (
            <Share className="w-5 h-5" />
          ) : (
            <MoreVertical className="w-5 h-5" />
          )}
        </div>
        <span className="text-[10px] text-stone-500 dark:text-stone-400">Nhấn</span>
        <span className="text-[11px] font-bold text-stone-800 dark:text-stone-200 leading-tight line-clamp-2">
          {isIos ? "Chia sẻ" : "Menu (⋮)"}
        </span>
      </div>

      {/* Step 2 */}
      <div className="flex flex-col items-center text-center p-2 rounded-xl bg-white dark:bg-stone-900/90 border border-orange-100/80 dark:border-stone-800 shadow-2xs">
        <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-stone-800 text-[11px] font-bold flex items-center justify-center text-amber-800 dark:text-amber-300 mb-1">
          2
        </span>
        <div className="h-9 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <PlusSquare className="w-5 h-5" />
        </div>
        <span className="text-[10px] text-stone-500 dark:text-stone-400">Chọn</span>
        <span className="text-[10px] font-bold text-stone-800 dark:text-stone-200 leading-tight line-clamp-2">
          {isIos ? "Thêm vào MH chính" : "Cài đặt app"}
        </span>
      </div>

      {/* Step 3 */}
      <div className="flex flex-col items-center text-center p-2 rounded-xl bg-white dark:bg-stone-900/90 border border-orange-100/80 dark:border-stone-800 shadow-2xs">
        <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-stone-800 text-[11px] font-bold flex items-center justify-center text-amber-800 dark:text-amber-300 mb-1">
          3
        </span>
        <div className="h-9 flex items-center justify-center">
          <div className="w-7 h-7 rounded-lg overflow-hidden border border-orange-200 dark:border-stone-700 bg-orange-50 dark:bg-stone-800 flex items-center justify-center p-0.5 shadow-2xs">
            <img
              src="/icons/icon-192x192.png"
              alt="LimArt Staff"
              className="w-full h-full object-cover rounded"
              onError={(e) => {
                e.currentTarget.onerror = null;
                const target = e.currentTarget;
                if (!target.src.endsWith("/capybara_mascot.webp")) {
                  target.src = "/capybara_mascot.webp";
                }
              }}
            />
          </div>
        </div>
        <span className="text-[9px] text-stone-500 dark:text-stone-400 leading-tight">Kiểm tra &</span>
        <span className="text-[11px] font-bold text-stone-800 dark:text-stone-200 leading-tight">nhấn Thêm</span>
      </div>

      {/* Step 4 */}
      <div className="flex flex-col items-center text-center p-2 rounded-xl bg-white dark:bg-stone-900/90 border border-orange-100/80 dark:border-stone-800 shadow-2xs">
        <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-[11px] font-bold flex items-center justify-center text-emerald-700 dark:text-emerald-400 mb-1">
          4
        </span>
        <div className="h-9 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        </div>
        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 leading-tight">
          Hoàn tất!
        </span>
        <span className="text-[9px] text-stone-400 leading-tight mt-0.5">Mở từ icon</span>
      </div>
    </div>
  );
};
