import React from "react";
import { useEmployees } from "@/hooks/useAdminData";

const UserManager = React.lazy(() => import("@/components/admin/UserManager"));

export function EmployeesPage() {
  const { employees, mutate } = useEmployees();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Quản lý Nhân sự
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Quản lý quyền hạn, mức lương theo giờ / theo tháng và kích hoạt tài khoản
          </p>
        </div>
      </div>

      {/* Employee list rows rendered via UserManager -> UserCard with .cv-auto-table-row */}
      <React.Suspense
        fallback={
          <div className="h-64 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Đang tải danh sách nhân sự...
          </div>
        }
      >
        <UserManager users={employees} onRefresh={mutate} />
      </React.Suspense>
    </div>
  );
}
