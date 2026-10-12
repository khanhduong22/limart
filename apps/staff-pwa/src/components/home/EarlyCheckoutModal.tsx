import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface EarlyCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftEnd?: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
}

export const EarlyCheckoutModal: React.FC<EarlyCheckoutModalProps> = ({
  open,
  onOpenChange,
  shiftEnd,
  reason,
  onReasonChange,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-sm mx-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Bạn đang về sớm!</DialogTitle>
          <DialogDescription className="text-xs">
            Chưa đến giờ tan ca theo lịch đăng ký. Vui lòng nhập lý do để được duyệt
            Check-out.
            <br />
            {shiftEnd && (
              <span className="font-bold text-emerald-600 block mt-1">
                Giờ tan ca:{" "}
                {new Date(shiftEnd).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2 text-left">
          <Label className="text-xs font-semibold">Lý do về sớm</Label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Nhập lý do..."
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </div>
        <DialogFooter className="flex flex-row justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Hủy
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
          >
            Xác nhận & Check-out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EarlyCheckoutModal;
