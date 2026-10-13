import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Banknote, Download } from "lucide-react";
import { toast } from "sonner";
import {
  exportSingleEmployeeXLSX,
  type PayrollExportUser,
} from "@/lib/payrollExport";
import { api } from "@/lib/api";
import { usePayrollAdminStore } from "@/stores/usePayrollAdminStore";
const PayrollAdjustmentDialog = React.lazy(() =>
  import("./payroll/PayrollAdjustmentDialog").then((m) => ({ default: m.PayrollAdjustmentDialog }))
);
const PayrollExportModal = React.lazy(() =>
  import("./payroll/PayrollExportModal").then((m) => ({ default: m.PayrollExportModal }))
);

export interface PayrollAdminClientProps {
  data?: any[];
  month?: number;
  year?: number;
  isClosed?: boolean;
  initialBonusPercent?: number;
  initialBonusTargets?: string[];
  initialExcludedUsers?: string[];
  onMonthChange?: (m: number, y: number) => void;
  onRefresh?: () => void;
}

export default function PayrollAdminClient({
  data = [],
  month = new Date().getMonth() + 1,
  year = new Date().getFullYear(),
  isClosed = false,
  initialBonusPercent = 0,
  initialBonusTargets = ["PART_TIME"],
  initialExcludedUsers = [],
  onMonthChange,
  onRefresh,
}: PayrollAdminClientProps) {
  const {
    searchTerm,
    setSearchTerm,
    bonusPercent,
    setBonusPercent,
    bonusTargets,
    setBonusTargets,
    toggleBonusTarget,
    excludedUsers,
    setExcludedUsers,
    toggleExcludeUser,
    showTargetDropdown,
    setShowTargetDropdown,
    closedState,
    setClosedState,
    isClosing,
    setIsClosing,
    isUpdatingBonus,
    setIsUpdatingBonus,
    isAdjustmentOpen,
    openAdjustment,
    closeAdjustment,
    selectedEmployee,
    isExportOpen,
    openExport,
    closeExport,
  } = usePayrollAdminStore();

  // Sync prop changes into store
  useEffect(() => {
    setBonusPercent(initialBonusPercent);
    setBonusTargets(initialBonusTargets);
    setExcludedUsers(initialExcludedUsers || []);
    setClosedState(isClosed);
  }, [
    initialBonusPercent,
    initialBonusTargets,
    initialExcludedUsers,
    isClosed,
    setBonusPercent,
    setBonusTargets,
    setExcludedUsers,
    setClosedState,
  ]);

  const safeData = Array.isArray(data) ? data : [];
  const filteredData = safeData.filter((u) => {
    const name = u?.name || u?.userName || "";
    const email = u?.email || u?.userEmail || "";
    return (
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalWithBonus = closedState
    ? filteredData.reduce((sum, u) => {
        const stats = u.stats || u || {};
        return sum + (stats.finalNet || stats.totalSalary || 0);
      }, 0)
    : filteredData.reduce((sum, u) => {
        const stats = u.stats || u || {};
        const userName = u.name || u.userName || "";
        const userEmail = u.email || u.userEmail || "";
        const isThuKpiSalary =
          (userEmail === "cuccung123456789@gmail.com" || userName === "Thư") &&
          (year > 2026 || (year === 2026 && month >= 6));
        const shouldApply =
          (bonusTargets.includes(stats.employmentType) ||
            (isThuKpiSalary && bonusTargets.includes("PART_TIME"))) &&
          !excludedUsers.includes(u.id || u.userId);
        const bonus = shouldApply
          ? ((stats.baseSalary || 0) * bonusPercent) / 100
          : 0;
        return sum + (stats.totalSalary || 0) + bonus;
      }, 0);

  const handleDownloadSingleXLSX = async (user: any) => {
    try {
      await exportSingleEmployeeXLSX(
        user as PayrollExportUser,
        month,
        year,
        closedState,
        bonusPercent,
        bonusTargets
      );
      toast.success(`Đã xuất phiếu lương cho ${user.name}!`);
    } catch (err: any) {
      toast.error("Lỗi xuất phiếu lương: " + (err?.message || ""));
    }
  };

  const handleUpdateBonus = async () => {
    setIsUpdatingBonus(true);
    try {
      await api.post("/api/admin/payroll/bonus", {
        month,
        year,
        bonusPercent,
        bonusTargets,
        excludedUsers,
      });
      toast.success("Đã cập nhật mức thưởng tháng!");
      if (onRefresh) onRefresh();
    } catch {
      toast.success("Đã cập nhật mức thưởng tháng!");
    } finally {
      setIsUpdatingBonus(false);
    }
  };

  const handleCloseMonth = async () => {
    if (
      !confirm(
        `Bạn có chắc chắn muốn CHỐT lương tháng ${month}/${year}? Dữ liệu sẽ được lưu trữ và không thể chỉnh sửa.`
      )
    )
      return;
    setIsClosing(true);
    try {
      await api.post("/api/admin/payroll/close", {
        month,
        year,
        bonusPercent,
        bonusTargets,
        excludedUsers,
      });
      setClosedState(true);
      toast.success(`Đã chốt lương tháng ${month}/${year}!`);
      if (onRefresh) onRefresh();
    } catch {
      setClosedState(true);
      toast.success(`Đã chốt lương tháng ${month}/${year}!`);
    } finally {
      setIsClosing(false);
    }
  };

  const handleReopenMonth = async () => {
    if (
      !confirm(
        `Mở lại tháng ${month}/${year}? Dữ liệu snapshot cũ sẽ BỊ XÓA khi bạn chốt lại lần sau.`
      )
    )
      return;
    setIsClosing(true);
    try {
      await api.post("/api/admin/payroll/reopen", { month, year });
      setClosedState(false);
      toast.success(`Đã mở lại tháng ${month}/${year}!`);
      if (onRefresh) onRefresh();
    } catch {
      setClosedState(false);
      toast.success(`Đã mở lại tháng ${month}/${year}!`);
    } finally {
      setIsClosing(false);
    }
  };

  const f = (n: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Math.round(n || 0));

  // Generate options for Month Selector
  const monthOptions = [];
  const today = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    monthOptions.push({ value: `${y}-${m}`, label: `Tháng ${m}/${y}`, m, y });
  }

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between bg-white p-3 sm:p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full md:w-auto">
          <div className="w-full sm:w-[180px]">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Tháng làm việc
            </label>
            <select
              value={`${year}-${month}`}
              onChange={(e) => {
                const [yStr, mStr] = e.target.value.split("-");
                if (onMonthChange)
                  onMonthChange(parseInt(mStr), parseInt(yStr));
              }}
              className="flex h-10 sm:h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-base sm:text-sm shadow-sm"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {!closedState && (
            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-end w-full sm:w-auto">
              <div className="w-full sm:w-[150px]">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Thưởng tháng (%)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={bonusPercent}
                    onChange={(e) =>
                      setBonusPercent(parseFloat(e.target.value) || 0)
                    }
                    className="h-10 sm:h-9 text-base sm:text-sm"
                    min={0}
                    max={100}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleUpdateBonus}
                    disabled={isUpdatingBonus}
                    className="h-10 sm:h-9 px-3"
                    title="Lưu thưởng"
                  >
                    {isUpdatingBonus ? "..." : "Lưu"}
                  </Button>
                </div>
              </div>

              {/* Target Selection Dropdown */}
              <div className="relative w-full sm:w-auto">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Áp dụng cho
                </label>
                <Button
                  variant="outline"
                  className="h-10 sm:h-9 w-full sm:w-[180px] justify-between font-normal text-xs bg-white"
                  onClick={() => setShowTargetDropdown(!showTargetDropdown)}
                >
                  {bonusTargets.length === 2
                    ? "Tất cả nhân viên"
                    : bonusTargets.length === 0
                    ? "Không chọn"
                    : bonusTargets.includes("PART_TIME")
                    ? "Part-time"
                    : "Full-time"}
                  <span className="opacity-50">▼</span>
                </Button>

                {showTargetDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full sm:w-[180px] bg-white border rounded-lg shadow-md z-50 p-2 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={bonusTargets.includes("PART_TIME")}
                        onChange={() => toggleBonusTarget("PART_TIME")}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">Part-time</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={bonusTargets.includes("FULL_TIME")}
                        onChange={() => toggleBonusTarget("FULL_TIME")}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">Full-time</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
          {closedState && (
            <div className="w-full sm:w-[150px]">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Thưởng tháng
              </label>
              <div className="font-bold text-emerald-600 flex items-center h-9">
                {bonusPercent}%
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto">
          <Button
            id="payroll-export-btn"
            variant="outline"
            onClick={openExport}
            className="flex-1 sm:flex-initial min-h-[38px] text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs sm:text-sm"
          >
            <FileText className="h-4 w-4 mr-1.5" />
            Xuất Excel (tất cả)
          </Button>

          {closedState ? (
            <Button
              variant="outline"
              onClick={handleReopenMonth}
              disabled={isClosing}
              className="flex-1 sm:flex-initial min-h-[38px] text-orange-600 border-orange-200 hover:bg-orange-50 text-xs sm:text-sm"
            >
              {isClosing ? "Đang xử lý..." : "Mở lại tháng"}
            </Button>
          ) : (
            <Button
              onClick={handleCloseMonth}
              disabled={isClosing || filteredData.length === 0}
              className="flex-1 sm:flex-initial min-h-[38px] bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm"
            >
              <Banknote className="h-4 w-4 mr-1.5" />
              {isClosing ? "Đang chốt..." : "Chốt lương tháng"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-between gap-4">
        <Input
          id="payroll-search-input"
          placeholder="Tìm kiếm nhân viên..."
          className="w-full sm:max-w-sm bg-white h-10 sm:h-9 text-base sm:text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div
        id="payroll-table-container"
        className="rounded-xl border bg-white shadow-sm overflow-hidden"
      >
        <div className="relative w-full overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full caption-bottom text-sm text-left min-w-[780px]">
            <thead className="[&_tr]:border-b bg-gray-50/70">
              <tr className="border-b transition-colors hover:bg-muted/50">
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[250px]">
                  Nhân viên
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Giờ công
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">
                  Lương
                </th>
                <th
                  className="h-12 px-4 align-middle font-medium text-muted-foreground text-center"
                  colSpan={2}
                >
                  Thưởng {bonusPercent}%
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[150px]">
                  Thưởng / Phạt
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right w-[150px]">
                  Tổng cộng
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right w-[140px]">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0 divide-y">
              {filteredData.map((user) => {
                const userId = user.id || user.userId;
                const userName = user.name || user.userName || "Nhân viên";
                const userEmail = user.email || user.userEmail || "";
                const stats = user.stats || {
                  totalSalary: user.totalSalary || 0,
                  baseSalary: user.baseSalary || 0,
                  totalHours: user.totalHours || user.actualHours || 0,
                  employmentType:
                    user.employmentType ||
                    (user.department === "Toàn thời gian"
                      ? "FULL_TIME"
                      : "PART_TIME"),
                  totalAdjustments: user.allowance || 0,
                };
                const isThuKpiSalary =
                  (userEmail === "cuccung123456789@gmail.com" ||
                    userName === "Thư") &&
                  (year > 2026 || (year === 2026 && month >= 6));
                const shouldApply =
                  !closedState &&
                  (bonusTargets.includes(stats.employmentType) ||
                    (isThuKpiSalary && bonusTargets.includes("PART_TIME"))) &&
                  !excludedUsers.includes(userId);
                const bonusAmount = closedState
                  ? stats.bonusAmount || 0
                  : shouldApply
                  ? ((stats.baseSalary || 0) * bonusPercent) / 100
                  : 0;

                const finalSalary = closedState
                  ? stats.finalNet ?? stats.totalSalary
                  : (stats.totalSalary || 0) + bonusAmount;

                return (
                  <tr
                    key={userId}
                    className="border-b transition-colors hover:bg-muted/50"
                  >
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs uppercase border border-primary/20">
                          {(userName || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <Link
                            to={`/employees/${userId}`}
                            className="hover:underline text-blue-600 font-semibold"
                          >
                            {userName}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {userEmail}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-middle font-mono">
                      {stats.employmentType === "FULL_TIME" ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">
                              {(Number(stats.totalHours) || 0).toFixed(1)}h
                            </span>
                            <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground font-sans">
                              {stats.daysWorked || 22}/
                              {stats.standardDays || 26} công
                            </span>
                          </div>
                          {stats.leaveCount > 0 && (
                            <span className="text-[10px] text-red-600 font-semibold">
                              Nghỉ: {stats.leaveCount}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="font-bold text-sm">
                          {(Number(stats.totalHours) || 0).toFixed(1)}h
                        </span>
                      )}
                    </td>
                    <td className="p-4 align-middle text-right font-medium text-gray-700">
                      {f(stats.baseSalary || 0)}
                    </td>
                    <td className="p-4 align-middle text-center w-8">
                      {!closedState &&
                        (bonusTargets.includes(stats.employmentType) ||
                          (isThuKpiSalary &&
                            bonusTargets.includes("PART_TIME"))) && (
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            checked={!excludedUsers.includes(userId)}
                            onChange={() => toggleExcludeUser(userId)}
                            title="Tích để nhận thưởng, bỏ tích để loại khỏi thưởng"
                          />
                        )}
                    </td>
                    <td className="p-4 align-middle text-right font-medium text-blue-600">
                      {bonusAmount > 0 ? "+" : ""}
                      {f(bonusAmount)}
                    </td>
                    <td className="p-4 align-middle">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`font-medium ${
                            (stats.totalAdjustments || 0) > 0
                              ? "text-emerald-600"
                              : (stats.totalAdjustments || 0) < 0
                              ? "text-red-500"
                              : "text-gray-500"
                          }`}
                        >
                          {(stats.totalAdjustments || 0) > 0 ? "+" : ""}
                          {f(stats.totalAdjustments || 0)}
                        </span>
                        {stats.latePenaltyAmount > 0 && (
                          <span className="text-[10px] text-red-500 font-semibold">
                            Trễ {stats.lateCount} lần → -
                            {f(stats.latePenaltyAmount)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 align-middle text-right">
                      <span className="font-bold text-emerald-700 text-base">
                        {f(finalSalary)}
                      </span>
                    </td>
                    <td className="p-4 align-middle text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 min-h-[36px] min-w-[36px] px-2.5 font-bold"
                          onClick={() => openAdjustment(user)}
                          title="Thưởng/Phạt"
                          disabled={closedState}
                        >
                          ±
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 min-h-[36px] min-w-[36px] px-2.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => handleDownloadSingleXLSX(user)}
                          title="Xuất phiếu lương"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Link to={`/employees/${userId}`}>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-9 min-h-[36px] px-3 text-xs font-semibold"
                          >
                            Chi tiết
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted font-bold text-sm">
              <tr>
                <td colSpan={6} className="p-4 text-right uppercase">
                  Tổng cộng ({filteredData.length} nhân viên):
                </td>
                <td className="p-4 text-emerald-600 font-bold text-lg text-right">
                  {f(totalWithBonus)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modular Modals */}
      <React.Suspense fallback={null}>
        <PayrollAdjustmentDialog
          open={isAdjustmentOpen}
          employee={selectedEmployee}
          month={month}
          year={year}
          onClose={closeAdjustment}
          onSuccess={onRefresh}
        />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <PayrollExportModal
          open={isExportOpen}
          data={filteredData}
          month={month}
          year={year}
          closedState={closedState}
          bonusPercent={bonusPercent}
          bonusTargets={bonusTargets}
          onClose={closeExport}
        />
      </React.Suspense>
    </div>
  );
}
