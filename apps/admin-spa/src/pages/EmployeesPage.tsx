import React from "react";
import UserManager from "@/components/admin/UserManager";
import { useEmployees } from "@/hooks/useAdminData";

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
      <UserManager users={employees} onRefresh={mutate} />
    </div>
  );
}
