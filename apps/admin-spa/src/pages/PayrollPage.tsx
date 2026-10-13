import React, { useState } from "react";
import { usePayroll } from "@/hooks/useAdminData";
import { BulkSendPayslipButton } from "@/components/admin/BulkSendPayslipButton";

const PayrollAdminClient = React.lazy(
  () => import("@/components/admin/PayrollAdminClient")
);

export function PayrollPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const {
    payroll,
    isClosed,
    bonusPercent,
    bonusTargets,
    excludedBonusUsers,
    mutate,
  } = usePayroll(selectedMonth, selectedYear);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Quản lý Bảng Lương
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Bảng tổng hợp công, mức lương cơ bản, % thưởng tháng và xuất file Excel
          </p>
        </div>
        {isClosed && (
          <div className="flex items-center gap-2">
            <BulkSendPayslipButton
              month={selectedMonth}
              year={selectedYear}
              isClosed={isClosed}
              payslipCount={Array.isArray(payroll) ? payroll.length : 0}
              onSuccess={mutate}
            />
          </div>
        )}
      </div>

      <React.Suspense
        fallback={
          <div className="h-64 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Đang tải bảng tính lương...
          </div>
        }
      >
        <PayrollAdminClient
          data={payroll}
          month={selectedMonth}
          year={selectedYear}
          isClosed={isClosed}
          initialBonusPercent={bonusPercent}
          initialBonusTargets={bonusTargets}
          initialExcludedUsers={excludedBonusUsers}
          onMonthChange={(m, y) => {
            setSelectedMonth(m);
            setSelectedYear(y);
          }}
          onRefresh={mutate}
        />
      </React.Suspense>
    </div>
  );
}
