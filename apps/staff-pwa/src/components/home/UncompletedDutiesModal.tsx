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
import { ShiftDutyItem } from "@/lib/api-client";

export interface UncompletedDutiesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uncompletedDuties: ShiftDutyItem[];
  onReviewDuties: () => void;
  onConfirmCheckout: () => void;
}

export const UncompletedDutiesModal: React.FC<UncompletedDutiesModalProps> = ({
  open,
  onOpenChange,
  uncompletedDuties,
  onReviewDuties,
  onConfirmCheckout,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm mx-auto rounded-2xl border-amber-200">
        <DialogHeader className="space-y-2 text-left">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl">
            ⚠️
          </div>
          <DialogTitle className="text-base font-bold text-slate-900">
            Nhiệm vụ ca làm chưa hoàn thành!
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 leading-relaxed">
            Bạn còn{" "}
            <span className="font-extrabold text-amber-700">
              {uncompletedDuties.length}
            </span>{" "}
            nhiệm vụ trong ca hôm nay chưa được đánh dấu hoàn thành. Bạn có chắc chắn
            muốn Check-out không?
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 space-y-2 max-h-48 overflow-y-auto bg-amber-50/50 p-3 rounded-xl border border-amber-200/80 text-left">
          {uncompletedDuties.map((d, idx) => (
            <div
              key={d.id}
              className="text-xs text-amber-950 font-medium flex items-start gap-2 bg-white/70 p-2 rounded-lg border border-amber-100"
            >
              <span className="font-bold text-amber-700 shrink-0">{idx + 1}.</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">{d.title}</p>
                {d.description && (
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                    {d.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2 pt-2 border-t">
          <Button
            variant="outline"
            className="flex-1 text-xs h-9 border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-semibold cursor-pointer"
            onClick={onReviewDuties}
          >
            📋 Kiểm tra nhiệm vụ
          </Button>
          <Button
            variant="destructive"
            className="flex-1 text-xs h-9 font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
            onClick={onConfirmCheckout}
          >
            Vẫn Check-out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UncompletedDutiesModal;
