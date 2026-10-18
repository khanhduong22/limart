import React from "react";
import { useAppQuery } from "@/lib/api-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/lib/router";

const HistoryGantt = React.lazy(() => import("@/components/HistoryGantt"));
const CheckinHistoryTable = React.lazy(
  () => import("@/components/history/CheckinHistoryTable")
);

export const HistoryView: React.FC = () => {
  const { data: response, isLoading } = useAppQuery<{
    success: boolean;
    data: any[];
  }>("/api/staff/history");

  const history = Array.isArray(response?.data) ? response.data : [];

  return (
    <div className="p-3 sm:p-4 pb-32 max-w-md max-w-full mx-auto w-full space-y-3 select-none overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-orange-100 text-stone-700 cursor-pointer">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-base font-bold text-stone-900 tracking-tight">Lịch sử chấm công</h1>
        </div>
      </div>

      {/* Gantt Chart */}
      <React.Suspense fallback={<div className="h-32 w-full animate-pulse rounded-2xl bg-orange-50/50" />}>
        <HistoryGantt checkins={history} />
      </React.Suspense>

      {/* Check-in Log Table Card */}
      <React.Suspense
        fallback={
          <div className="h-64 w-full animate-pulse rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xs text-gray-400">
            Đang tải lịch sử chấm công...
          </div>
        }
      >
        <CheckinHistoryTable history={history} isLoading={isLoading} />
      </React.Suspense>
    </div>
  );
};

export default HistoryView;
