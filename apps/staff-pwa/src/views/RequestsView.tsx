import React from "react";
import { useAppQuery } from "@/lib/api-query";

const RequestListClient = React.lazy(() => import("@/components/requests/RequestListClient"));

export const RequestsView: React.FC = () => {
  const { data: response, mutate } = useAppQuery<{
    success: boolean;
    data: any[];
  }>("/api/staff/requests");

  const requests = response?.data || [];

  return (
    <div className="p-3 sm:p-4 pb-32 max-w-md max-w-full mx-auto w-full select-none overflow-x-hidden">
      <React.Suspense
        fallback={
          <div className="h-64 w-full flex items-center justify-center text-xs text-slate-400 animate-pulse bg-slate-50/50 rounded-2xl border border-slate-100">
            Đang tải danh sách đơn từ...
          </div>
        }
      >
        <RequestListClient requests={requests} onRefresh={() => mutate()} />
      </React.Suspense>
    </div>
  );
};

export default RequestsView;
