import React from "react";
import { ShoppingBag, Sparkles, FileCheck } from "lucide-react";

export type WfhTabType = "market" | "general" | "history";

export interface WfhTaskTabsProps {
  activeTab: WfhTabType;
  onChangeTab: (tab: WfhTabType) => void;
  marketCount: number;
  historyCount: number;
}

export const WfhTaskTabs: React.FC<WfhTaskTabsProps> = ({
  activeTab,
  onChangeTab,
  marketCount,
  historyCount,
}) => {
  return (
    <div className="grid grid-cols-3 bg-stone-200/70 p-1 rounded-xl text-xs font-semibold">
      <button
        type="button"
        onClick={() => onChangeTab("market")}
        className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
          activeTab === "market"
            ? "bg-white text-indigo-700 shadow-2xs font-bold"
            : "text-stone-600 hover:text-stone-900"
        }`}
      >
        <ShoppingBag className="w-3.5 h-3.5" />
        <span>Sàn việc ({marketCount})</span>
      </button>
      <button
        type="button"
        onClick={() => onChangeTab("general")}
        className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
          activeTab === "general"
            ? "bg-white text-indigo-700 shadow-2xs font-bold"
            : "text-stone-600 hover:text-stone-900"
        }`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Nhiệm vụ chung</span>
      </button>
      <button
        type="button"
        onClick={() => onChangeTab("history")}
        className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
          activeTab === "history"
            ? "bg-white text-indigo-700 shadow-2xs font-bold"
            : "text-stone-600 hover:text-stone-900"
        }`}
      >
        <FileCheck className="w-3.5 h-3.5" />
        <span>Lịch sử ({historyCount})</span>
      </button>
    </div>
  );
};

export default WfhTaskTabs;
