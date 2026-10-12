import React from "react";
import { StaffTaskFilter } from "@/stores/useStaffTasksStore";

interface TaskFilterTabsProps {
  currentFilter: StaffTaskFilter;
  onFilterChange: (filter: StaffTaskFilter) => void;
  counts?: Partial<Record<StaffTaskFilter, number>>;
  totalCount?: number;
}

export const TaskFilterTabs: React.FC<TaskFilterTabsProps> = ({
  currentFilter,
  onFilterChange,
  counts,
  totalCount,
}) => {
  const tabs: Array<{ key: StaffTaskFilter; label: string }> = [
    {
      key: "ALL",
      label: `Tất cả (${totalCount ?? counts?.ALL ?? 0})`,
    },
    {
      key: "TODO",
      label: counts?.TODO !== undefined ? `Cần làm (${counts.TODO})` : "Cần làm",
    },
    {
      key: "DOING",
      label: counts?.DOING !== undefined ? `Đang làm (${counts.DOING})` : "Đang làm",
    },
    {
      key: "DONE",
      label: counts?.DONE !== undefined ? `Chờ duyệt (${counts.DONE})` : "Chờ duyệt",
    },
    {
      key: "APPROVED",
      label: counts?.APPROVED !== undefined ? `Đã duyệt (${counts.APPROVED})` : "Đã duyệt",
    },
  ];

  return (
    <div className="flex gap-1.5 md:gap-2 overflow-x-auto py-1 text-xs no-scrollbar">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onFilterChange(tab.key)}
          className={`px-3.5 py-1.5 md:px-4 md:py-2 rounded-full whitespace-nowrap text-xs md:text-sm font-bold transition-all cursor-pointer ${
            currentFilter === tab.key
              ? "bg-indigo-700 text-white shadow-xs ring-2 ring-indigo-200"
              : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default TaskFilterTabs;
