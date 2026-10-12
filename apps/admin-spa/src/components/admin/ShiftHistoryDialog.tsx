import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { api } from "@/lib/api";
import {
  useShiftHistoryStore,
  ShiftHistoryFilterType,
} from "@/stores/useShiftHistoryStore";
import {
  ShiftHistoryFilterBar,
  ShiftHistoryTable,
  getDateRange,
} from "./shift-history";

export function ShiftHistoryDialog() {
  const {
    isOpen,
    setIsOpen,
    page,
    setPage,
    filterType,
    customDate,
    setLogs,
    appendLogs,
    setLoading,
    setHasMore,
    resetFilter,
  } = useShiftHistoryStore();

  const fetchLogs = async (
    pageNum: number,
    append = false,
    type: ShiftHistoryFilterType = filterType,
    cDate: string = customDate
  ) => {
    setLoading(true);
    try {
      const range = getDateRange(type, cDate);
      let url = `/api/admin/schedule/history?page=${pageNum}&pageSize=100`;
      if (range.startDate) url += `&startDate=${encodeURIComponent(range.startDate)}`;
      if (range.endDate) url += `&endDate=${encodeURIComponent(range.endDate)}`;

      const result = await api.get<any>(url);
      const list =
        result?.logs || result?.data || (Array.isArray(result) ? result : []);
      if (append) {
        appendLogs(list);
      } else {
        setLogs(list);
      }
      setHasMore(list.length === 100);
    } catch (e) {
      console.error("Failed to load shift history:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      resetFilter();
      fetchLogs(1, false, "7_days", "");
    }
  }, [isOpen]);

  const handleFilterChange = (
    type: ShiftHistoryFilterType,
    cDate?: string
  ) => {
    setPage(1);
    fetchLogs(1, false, type, cDate || (type === "custom_date" ? customDate : ""));
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLogs(nextPage, true, filterType, customDate);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-2 border-emerald-200 text-emerald-800 hover:bg-emerald-50 cursor-pointer"
        >
          <History className="w-4 h-4" />
          Lịch sử thay đổi ca
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-4 sm:p-6 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800 dark:text-stone-100 flex items-center gap-2">
            <History className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            Lịch sử Thay đổi Đăng ký Ca làm
          </DialogTitle>
          <DialogDescription className="text-stone-500 dark:text-stone-400 text-xs sm:text-sm">
            Xem toàn bộ nhật ký thêm, sửa, xóa ca làm việc của nhân viên trong hệ thống.
          </DialogDescription>
        </DialogHeader>

        {/* Filter bar: search, presets, and date picker */}
        <ShiftHistoryFilterBar onFilterChange={handleFilterChange} />

        {/* History table & pagination */}
        <ShiftHistoryTable onLoadMore={handleLoadMore} />
      </DialogContent>
    </Dialog>
  );
}

export default ShiftHistoryDialog;
