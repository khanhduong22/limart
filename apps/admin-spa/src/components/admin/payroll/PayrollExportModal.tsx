import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileSpreadsheet, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  exportFullPayrollXLSX,
  type PayrollExportUser,
} from "@/lib/payrollExport";

export interface PayrollExportModalProps {
  open: boolean;
  onClose: () => void;
  data: any[];
  month: number;
  year: number;
  closedState: boolean;
  bonusPercent: number;
  bonusTargets: string[];
}

export function PayrollExportModal({
  open,
  onClose,
  data,
  month,
  year,
  closedState,
  bonusPercent,
  bonusTargets,
}: PayrollExportModalProps) {
  const [includeDailyDetails, setIncludeDailyDetails] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    try {
      exportFullPayrollXLSX(
        data as PayrollExportUser[],
        month,
        year,
        closedState,
        bonusPercent,
        bonusTargets
      );
      toast.success(`Đã xuất bảng lương tháng ${month}/${year} thành công!`);
      onClose();
    } catch (err: any) {
      toast.error("Lỗi khi xuất file Excel: " + (err?.message || ""));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="bg-white max-w-md rounded-xl p-6">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold">
              Xuất Báo Cáo Bảng Lương
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Tải xuống file Excel (.xlsx) bảng lương tháng {month}/{year} cho{" "}
            {data.length} nhân viên.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-700 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Kỳ làm việc:</span>
              <span className="font-semibold">
                Tháng {month}/{year}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Trạng thái kỳ:</span>
              <span
                className={`font-semibold ${
                  closedState ? "text-purple-600" : "text-amber-600"
                }`}
              >
                {closedState ? "Đã chốt lương" : "Đang mở (Tạm tính)"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Số lượng nhân viên:</span>
              <span className="font-semibold">{data.length} người</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Mức thưởng tháng:</span>
              <span className="font-semibold text-emerald-600">
                {bonusPercent}%
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer p-2 rounded-md hover:bg-slate-50">
              <input
                type="checkbox"
                checked={includeDailyDetails}
                onChange={(e) => setIncludeDailyDetails(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Kèm bảng chi tiết chấm công từng ngày (sheet riêng biệt)</span>
            </label>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Hủy
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || data.length === 0}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Đang xuất file..." : "Tải Excel (.xlsx)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
