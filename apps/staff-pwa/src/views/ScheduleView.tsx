import React, { useState } from "react";
import { useAppQuery } from "@/lib/api-query";

const ScheduleClient = React.lazy(() => import("@/components/schedule/ScheduleClient"));

export const ScheduleView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  const { data: response, mutate, isLoading } = useAppQuery<{
    success: boolean;
    data: any[];
    currentUserId?: string;
  }>(`/api/staff/schedule?month=${month}&year=${year}`, {
    revalidateOnFocus: true,
  });

  const shifts = Array.isArray(response?.data) ? response.data : [];
  const currentUserId = response?.currentUserId;

  return (
    <div className="pb-24 pt-2 px-3 sm:px-4 max-w-md mx-auto w-full select-none">
      <React.Suspense
        fallback={
          <div className="h-96 w-full flex items-center justify-center text-xs text-slate-400 animate-pulse bg-slate-50/50 rounded-2xl border border-slate-100">
            Đang tải lịch làm việc...
          </div>
        }
      >
        <ScheduleClient
          shifts={shifts}
          currentUserId={currentUserId}
          viewDate={currentDate}
          onMonthChange={(newDate) => setCurrentDate(newDate)}
          onRefresh={() => mutate()}
          isLoading={isLoading}
        />
      </React.Suspense>
    </div>
  );
};

export default ScheduleView;
