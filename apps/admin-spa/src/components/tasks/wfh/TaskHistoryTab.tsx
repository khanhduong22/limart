import React from "react";
import { format } from "date-fns";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { AdminTaskItem } from "@/types";

export interface TaskHistoryTabProps {
  reviewedTasks: AdminTaskItem[];
  historyMonth: string;
  onHistoryMonthChange: (val: string) => void;
}

export function TaskHistoryTab({
  reviewedTasks,
  historyMonth,
  onHistoryMonthChange,
}: TaskHistoryTabProps) {
  return (
    <Card className="bg-white border border-stone-200/80 shadow-sm rounded-2xl">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold text-stone-900">
              Review History
            </CardTitle>
            <CardDescription className="text-stone-500 text-sm">
              Xem lại danh sách các task đã được duyệt hoặc bị từ chối gần đây.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-stone-700">
              Lọc theo:
            </span>
            <Select value={historyMonth} onValueChange={onHistoryMonthChange}>
              <SelectTrigger className="w-[160px] bg-white border-stone-200 h-10 sm:h-9 text-xs sm:text-sm">
                <SelectValue placeholder="All/Recent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Gần đây (100)</SelectItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={m.toString()}>
                    Tháng {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {reviewedTasks.length === 0 ? (
          <div className="py-12 text-center text-stone-500 font-medium">
            No reviewed tasks found.
          </div>
        ) : (
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch] rounded-xl border border-stone-200/80">
            <Table className="w-full min-w-[650px]">
              <TableHeader className="bg-stone-50/60">
                <TableRow className="border-b border-stone-200 hover:bg-transparent">
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Date
                  </TableHead>
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
                    Result
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5 text-right">
                    Admin Note
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewedTasks.map((task) => (
                  <TableRow
                    key={task.id}
                    className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors"
                  >
                    <TableCell className="whitespace-nowrap text-xs text-stone-600 font-mono py-3.5">
                      {task.reviewedAt
                        ? format(new Date(task.reviewedAt), "dd/MM HH:mm")
                        : task.submittedAt
                        ? format(new Date(task.submittedAt), "dd/MM HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium text-stone-900 whitespace-nowrap py-3.5">
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
                    <TableCell className="whitespace-nowrap text-stone-800 font-medium text-sm py-3.5">
                      {task.quantity || 1} {task.unit || "điểm"}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          variant={
                            task.status === "APPROVED" ? "default" : "destructive"
                          }
                          className={
                            task.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-red-100 text-red-800 border-red-200"
                          }
                        >
                          {task.status}
                        </Badge>
                        {task.status === "APPROVED" && (
                          <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">
                            +{(task.totalReward || 0).toLocaleString()}{" "}
                            {task.unit === "điểm" ? "điểm" : "đ"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-stone-600 max-w-[200px] truncate py-3.5">
                      {task.adminNote || "-"}
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
