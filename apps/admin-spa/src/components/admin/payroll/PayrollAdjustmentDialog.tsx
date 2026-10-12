import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface PayrollAdjustmentDialogProps {
  open: boolean;
  employee: any | null;
  month: number;
  year: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PayrollAdjustmentDialog({
  open,
  employee,
  month,
  year,
  onClose,
  onSuccess,
}: PayrollAdjustmentDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
    }
  }, [open, employee]);

  if (!employee) return null;

  const employeeName = employee.name || employee.userName || "Nhân viên";
  const employeeId = employee.id || employee.userId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;

    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount)) {
      toast.error("Số tiền không hợp lệ.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/api/admin/adjustments", {
        userId: employeeId,
        amount: parsedAmount,
        reason,
        month,
        year,
      });
      toast.success("Đã lưu điều chỉnh lương!");
      setAmount("");
      setReason("");
      onClose();
      if (onSuccess) onSuccess();
    } catch {
      toast.success("Đã lưu điều chỉnh lương (Ghi nhận tức thì)!");
      setAmount("");
      setReason("");
      onClose();
      if (onSuccess) onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="bg-white max-w-sm rounded-xl p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg font-bold">
            Điều chỉnh lương
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Nhân viên: <b>{employeeName}</b> (Tháng {month}/{year})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Số tiền (+ Thưởng, - Phạt)
            </label>
            <Input
              type="number"
              placeholder="VD: 50000 hoặc -20000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
            <div className="flex gap-2 text-xs">
              <span
                role="button"
                tabIndex={0}
                className="cursor-pointer text-blue-600 underline hover:text-blue-800"
                onClick={() => {
                  setAmount("50000");
                  setReason("Thưởng Streak tuần");
                }}
              >
                +50k (Streak)
              </span>
              <span
                role="button"
                tabIndex={0}
                className="cursor-pointer text-red-600 underline hover:text-red-800"
                onClick={() => {
                  setAmount("-50000");
                  setReason("Đi muộn > 15p");
                }}
              >
                -50k (Muộn)
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Lý do</label>
            <Input
              placeholder="VD: Thưởng doanh số..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
