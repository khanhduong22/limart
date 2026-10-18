import React, { useState, Suspense, lazy } from "react";
import { useAppQuery } from "@/lib/api-query";
const PayrollMonthSelector = lazy(() => import("@/components/PayrollMonthSelector"));
const PayrollExplanationModal = lazy(() => import("@/components/PayrollExplanationModal"));
const PayrollDetailView = lazy(() => import("@/components/PayrollDetailView"));
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";

export const PayrollView: React.FC = () => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const { data: response, isLoading } = useAppQuery<{
    success: boolean;
    data: {
      stats: any;
      isClosed: boolean;
      month: number;
      year: number;
    };
  }>(`/api/staff/payroll?month=${selectedMonth}&year=${selectedYear}`);

  const monthOptions = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push({
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`,
    });
  }

  const handleMonthChange = (val: string) => {
    if (!val || typeof val !== "string") return;
    const parts = val.split("-");
    if (parts.length >= 2) {
      setSelectedYear(parseInt(parts[0], 10) || now.getFullYear());
      setSelectedMonth(parseInt(parts[1], 10) || (now.getMonth() + 1));
    }
  };

  const payrollData = response?.data;
  const isClosed = payrollData?.isClosed ?? false;
  const stats = payrollData?.stats || {
    totalHours: 0,
    totalSalary: 0,
    daysWorked: 0,
    baseSalary: 0,
    hourlyRate: 0,
    totalAdjustments: 0,
    adjustments: [],
    dailyDetails: [],
  };

  return (
    <div className="w-full max-w-full md:max-w-md mx-auto p-3 sm:p-4 pb-32 space-y-3 select-none box-border min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link to="/">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-orange-100 text-stone-700 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-base font-bold text-stone-900 tracking-tight flex-1">Chi tiết lương</h1>
        <Suspense fallback={null}>
          <PayrollExplanationModal />
        </Suspense>
      </div>

      {/* Rewards Banner */}
      <Link to="/rewards" className="block w-full">
        <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-yellow-500/15 to-orange-500/10 border border-amber-300/80 shadow-2xs flex items-center justify-between transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-white flex items-center justify-center text-lg sm:text-xl shadow-xs shrink-0">
              🏆
            </div>
            <div className="min-w-0 text-left">
              <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5 truncate">
                Bảng Vàng &amp; Khen Thưởng
                <span className="text-[10px] bg-amber-200/90 text-amber-900 font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                  Thưởng 200k
                </span>
              </p>
              <p className="text-[10.5px] sm:text-[11px] text-amber-800/85 truncate">
                Vinh danh Top 1 chăm chỉ &amp; Vua đóng hàng nhận thưởng!
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-700 shrink-0 ml-1" />
        </div>
      </Link>

        {/* Period Selector Card */}
        <div className="bg-white p-4 rounded-xl shadow-xs border">
          <label className="text-xs text-muted-foreground font-semibold mb-2 block uppercase tracking-wider">
            Kỳ lương
          </label>
          <Suspense fallback={<div className="h-9 w-full bg-slate-100 rounded-md animate-pulse" />}>
            <PayrollMonthSelector
              current={`${selectedYear}-${selectedMonth}`}
              options={monthOptions}
              onSelect={handleMonthChange}
            />
          </Suspense>
        </div>

        {/* Main Payroll Container */}
        <div className="bg-white rounded-xl shadow-xs border overflow-hidden">
          <div className="p-4 bg-gray-50/80 border-b flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900 text-sm">Bảng Lương Nhân Viên</p>
              <p className="text-xs text-muted-foreground">Kỳ tháng {selectedMonth}/{selectedYear}</p>
            </div>
            {isClosed ? (
              <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full">
                Đã chốt lương
              </span>
            ) : (
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full">
                Tạm tính
              </span>
            )}
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
                Đang tải dữ liệu kỳ lương...
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
                    Đang tải chi tiết bảng lương...
                  </div>
                }
              >
                <PayrollDetailView
                  stats={stats}
                  monthStr={`${selectedMonth}/${selectedYear}`}
                  userName="Bạn"
                  isClosed={isClosed}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    );
  };

export default PayrollView;
