import React from "react";
import { useRequests } from "@/hooks/useAdminData";

const RequestAdminClient = React.lazy(
  () => import("@/components/admin/RequestAdminClient")
);

export function RequestsPage() {
  const { requests, mutate } = useRequests();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Duyệt yêu cầu nhân sự
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Danh sách đơn xin nghỉ phép, làm việc tại nhà (WFH), và giải trình chấm công
          </p>
        </div>
      </div>

      <React.Suspense
        fallback={
          <div className="h-96 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Đang tải danh sách yêu cầu nhân sự...
          </div>
        }
      >
        <RequestAdminClient requests={requests} onRefresh={mutate} />
      </React.Suspense>
    </div>
  );
}
