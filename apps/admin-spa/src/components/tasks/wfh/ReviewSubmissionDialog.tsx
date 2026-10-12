import React from "react";
import { Check, X, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminTaskItem } from "@/types";

export interface ReviewSubmissionDialogProps {
  reviewingTask: AdminTaskItem | null;
  bonusPenalty: number;
  onBonusPenaltyChange: (val: number) => void;
  adminNote: string;
  onAdminNoteChange: (val: string) => void;
  isSubmittingReview: boolean;
  onClose: () => void;
  onSubmitReview: (decision: "APPROVED" | "REJECTED") => Promise<void> | void;
}

export function ReviewSubmissionDialog({
  reviewingTask,
  bonusPenalty,
  onBonusPenaltyChange,
  adminNote,
  onAdminNoteChange,
  isSubmittingReview,
  onClose,
  onSubmitReview,
}: ReviewSubmissionDialogProps) {
  if (!reviewingTask) return null;

  return (
    <Dialog open={Boolean(reviewingTask)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-white border border-stone-200/80 rounded-2xl shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-stone-900">
            Review Submission
          </DialogTitle>
          <DialogDescription className="text-stone-500 text-sm">
            Review work from <b>{reviewingTask.user?.name}</b> for task{" "}
            <b>{reviewingTask.title}</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 text-stone-800">
          <div className="grid grid-cols-2 gap-4 text-sm bg-stone-50/70 p-3.5 rounded-xl border border-stone-200">
            <div>
              <span className="font-semibold block text-stone-600 text-xs uppercase tracking-wider">
                Quantity:
              </span>
              <span className="font-medium text-stone-900 text-sm mt-0.5 block">
                {reviewingTask.quantity || 1} {reviewingTask.unit || "điểm"}
              </span>
            </div>
            <div>
              <span className="font-semibold block text-stone-600 text-xs uppercase tracking-wider">
                Base Total:
              </span>
              <span className="font-medium text-stone-900 text-sm mt-0.5 block">
                {(
                  (reviewingTask.quantity || 1) *
                  (reviewingTask.ratePerUnit || 0)
                ).toLocaleString()}{" "}
                đ
              </span>
            </div>
            <div className="col-span-2">
              <span className="font-semibold block text-stone-600 text-xs uppercase tracking-wider">
                User Note:
              </span>
              <p className="bg-white p-2.5 rounded-lg border border-stone-200 text-xs text-stone-700 mt-1 whitespace-pre-wrap">
                {reviewingTask.notes || reviewingTask.note || "No note"}
              </p>
            </div>
            <div className="col-span-2">
              <span className="font-semibold block text-stone-600 text-xs uppercase tracking-wider">
                Evidence:
              </span>
              {reviewingTask.proofUrl || reviewingTask.evidenceLink ? (
                <a
                  href={reviewingTask.proofUrl || reviewingTask.evidenceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline break-all text-xs inline-flex items-center gap-1 mt-1 font-medium"
                >
                  {reviewingTask.proofUrl || reviewingTask.evidenceLink}{" "}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-stone-400 text-xs mt-1 block">None</span>
              )}
            </div>
          </div>

          <div className="border-t border-stone-200 pt-4 space-y-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label
                htmlFor="wfh-bonus"
                className="text-right text-stone-700 font-medium text-xs"
              >
                Bonus/Penalty
              </Label>
              <Input
                id="wfh-bonus"
                type="number"
                value={bonusPenalty}
                onChange={(e) => onBonusPenaltyChange(Number(e.target.value))}
                className="col-span-3 bg-white border-stone-200"
              />
            </div>
            <p className="text-[11px] text-stone-500 text-right italic">
              Negative for penalty, positive for bonus.
            </p>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label
                htmlFor="wfh-note"
                className="text-right text-stone-700 font-medium text-xs pt-2"
              >
                Admin Note
              </Label>
              <Textarea
                id="wfh-note"
                value={adminNote}
                onChange={(e) => onAdminNoteChange(e.target.value)}
                className="col-span-3 bg-white border-stone-200"
                placeholder="Reason for penalty/bonus or rejection..."
                rows={2}
              />
            </div>

            <div className="bg-[#FAF6F0] border border-[#EADFD7] p-3.5 rounded-xl flex justify-between items-center shadow-sm">
              <span className="font-bold text-stone-900 text-sm">
                Final Payout:
              </span>
              <span className="text-xl font-bold text-[#8B5E3C] font-mono">
                {Math.max(
                  0,
                  (reviewingTask.quantity || 1) *
                    (reviewingTask.ratePerUnit || 0) +
                    bonusPenalty
                ).toLocaleString()}{" "}
                đ
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="destructive"
            onClick={() => onSubmitReview("REJECTED")}
            disabled={isSubmittingReview}
            className="text-xs"
          >
            {isSubmittingReview ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            Reject
          </Button>
          <div className="flex-1" />
          <Button
            className="bg-[#8B5E3C] hover:bg-[#724C30] text-white text-xs"
            onClick={() => onSubmitReview("APPROVED")}
            disabled={isSubmittingReview}
          >
            {isSubmittingReview ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
