import React from "react";
import { format } from "date-fns";
import { Check, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { AdminTaskItem } from "@/types";

export interface ReviewPendingTabProps {
  pendingTasks: AdminTaskItem[];
  onOpenReview: (task: AdminTaskItem) => void;
  onQuickApprove: (id: string) => Promise<void> | void;
}

export function ReviewPendingTab({
  pendingTasks,
  onOpenReview,
  onQuickApprove,
}: ReviewPendingTabProps) {
  return (
    <Card className="bg-white border border-stone-200/80 shadow-sm rounded-2xl">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-bold text-stone-900">
          Review & Approval
        </CardTitle>
        <CardDescription className="text-stone-500 text-sm">
          Duyệt công việc nhân viên làm tại nhà (cộng lương) và các hoá đơn
          đóng gói (tích điểm).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <h2 className="text-base font-semibold text-stone-900">
          Pending Reviews
        </h2>

        {pendingTasks.length === 0 ? (
          <div className="py-12 text-center text-stone-500 font-medium">
            No pending tasks to review.
          </div>
        ) : (
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch] rounded-xl border border-stone-200/80">
            <Table className="w-full min-w-[700px]">
              <TableHeader className="bg-stone-50/60">
                <TableRow className="border-b border-stone-200 hover:bg-transparent">
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    User
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Task
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Quantity
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Total Value
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Correctness
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Submitted
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingTasks.map((task) => (
                  <TableRow
                    key={task.id}
                    className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors"
                  >
                    <TableCell className="font-medium text-stone-900 py-3.5">
                      {task.user?.name || "Nhân viên"}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-stone-900 text-sm">
                          {task.title}
                        </span>
                        <span className="text-xs text-stone-500 mt-0.5">
                          {(task.ratePerUnit || 0).toLocaleString()} đ/
                          {task.unit || "điểm"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-stone-800 py-3.5 text-sm">
                      {task.quantity || 1} {task.unit || "điểm"}
                    </TableCell>
                    <TableCell className="font-bold text-stone-900 text-sm py-3.5">
                      {(task.totalReward || 0).toLocaleString()} đ
                    </TableCell>
                    <TableCell className="py-3.5">
                      {task.proofUrl || task.evidenceLink ? (
                        <a
                          href={task.proofUrl || task.evidenceLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-blue-600 hover:underline text-sm font-medium"
                        >
                          View Proof{" "}
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-stone-400 text-xs">
                          No link
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-stone-600 font-mono py-3.5">
                      {task.submittedAt
                        ? format(new Date(task.submittedAt), "dd/MM HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right space-x-2 whitespace-nowrap py-3.5">
                      <Button
                        size="sm"
                        className="bg-[#8B5E3C] hover:bg-[#724C30] text-white text-xs px-4 py-1.5 h-9 min-h-[36px] rounded-lg shadow-sm font-medium"
                        onClick={() => onOpenReview(task)}
                      >
                        Review
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 h-9 min-h-[36px] rounded-lg shadow-sm font-medium"
                        onClick={() => onQuickApprove(task.id)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Duyệt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
