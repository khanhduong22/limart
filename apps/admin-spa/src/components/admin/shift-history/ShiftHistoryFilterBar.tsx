import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Calendar } from "lucide-react";
import {
  useShiftHistoryStore,
  ShiftHistoryFilterType,
} from "@/stores/useShiftHistoryStore";

interface ShiftHistoryFilterBarProps {
  onFilterChange: (type: ShiftHistoryFilterType, customDate?: string) => void;
}

const PRESETS: { id: ShiftHistoryFilterType; label: string }[] = [
  { id: "7_days", label: "7 ngày gần nhất" },
  { id: "today", label: "Hôm nay" },
  { id: "this_week", label: "Tuần này" },
  { id: "last_week", label: "Tuần trước" },
  { id: "all", label: "Tất cả" },
];

export function ShiftHistoryFilterBar({
  onFilterChange,
}: ShiftHistoryFilterBarProps) {
  const { filterType, search, setSearch, customDate, setCustomDate } =
    useShiftHistoryStore();

  const handleSelectPreset = (type: ShiftHistoryFilterType) => {
    onFilterChange(type);
  };

  const handleCustomDateChange = (val: string) => {
    setCustomDate(val);
    if (val) {
      onFilterChange("custom_date", val);
    } else {
      onFilterChange("7_days");
    }
  };

  const handleClearCustomDate = () => {
    setCustomDate("");
    onFilterChange("7_days");
  };

  return (
    <div className="space-y-2">
      {/* Search Input */}
      <div className="relative mt-2">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
        <Input
          placeholder="Tìm theo tên nhân viên hoặc người thực hiện..."
          className="pl-9 h-9 text-xs sm:text-sm rounded-xl border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/60"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter Toolbar: Presets & Custom Date */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-1">
        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => {
            const isSelected = filterType === preset.id;
            return (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => handleSelectPreset(preset.id)}
                className={`h-7 px-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  isSelected
                    ? "bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
                    : "border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>

        {/* Date Picker */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Calendar className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-[11px] text-stone-500 font-medium">Lọc ngày:</span>
          <Input
            type="date"
            value={customDate}
            onChange={(e) => handleCustomDateChange(e.target.value)}
            className="h-7 w-34 text-xs px-2 py-0 border-stone-200 dark:border-stone-700 rounded-lg cursor-pointer bg-transparent"
          />
          {customDate && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleClearCustomDate}
              className="h-7 w-7 p-0 text-stone-400 hover:text-stone-700 text-xs cursor-pointer"
              title="Bỏ lọc ngày"
            >
              ✕
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShiftHistoryFilterBar;
