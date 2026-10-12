import React, { useState } from "react";
import { useAppQuery } from "@/lib/api-query";
import ScheduleClient from "@/components/schedule/ScheduleClient";

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
      <ScheduleClient
        shifts={shifts}
        currentUserId={currentUserId}
        viewDate={currentDate}
        onMonthChange={(newDate) => setCurrentDate(newDate)}
        onRefresh={() => mutate()}
        isLoading={isLoading}
      />
    </div>
  );
};

export default ScheduleView;
