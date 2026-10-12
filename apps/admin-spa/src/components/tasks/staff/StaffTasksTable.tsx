import React from "react";
import { format } from "date-fns";
import {
  Calendar,
  User,
  Edit2,
  Trash2,
  Check,
  RotateCcw,
  ExternalLink,
  FileText,
  Eye,
  AlertCircle,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminStaffTasksStore } from "@/stores/useAdminStaffTasksStore";
import { type StaffTask, COLUMNS } from "@/types/staff-tasks";

export interface StaffTasksTableProps {
  tasks: StaffTask[];
  onSelectTask: (task: StaffTask) => void;
  onEditTask?: (task: StaffTask, e: React.MouseEvent) => void;
  onDeleteTask?: (taskId: string, e: React.MouseEvent) => void;
  onApproveTask?: (task: StaffTask, e?: React.MouseEvent) => void;
  onRejectTask?: (task: StaffTask) => void;
  submitting?: boolean;
}

function safeFormatDate(dateVal: string | Date | null | undefined, fmt = "dd/MM/yyyy"): string {
  if (!dateVal) return "—";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "—";
  return format(d, fmt);
}

function getPriorityBadge(priority?: string) {
  switch (priority?.toUpperCase()) {
    case "URGENT":
      return <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px]">Khẩn cấp</Badge>;
    case "HIGH":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">Cao</Badge>;
    case "LOW":
      return <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">Thấp</Badge>;
    case "MEDIUM":
    default:
      return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">Trung bình</Badge>;
  }
}

export function StaffTasksTable({
  tasks,
  onSelectTask,
  onEditTask,
  onDeleteTask,
  onApproveTask,
  onRejectTask,
  submitting = false,
}: StaffTasksTableProps) {
  const { viewMode, openReviewModal } = useAdminStaffTasksStore();

  const handleOpenDetail = (task: StaffTask) => {
    onSelectTask(task);
    openReviewModal(task);
  };

  // TABLE VIEW
  if (viewMode === "table") {
    if (tasks.length === 0) {
      return (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 font-medium">
          Không có nhiệm vụ nào phù hợp với bộ lọc hiện tại.
        </div>
      );
    }

    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
          <Table className="w-full min-w-[760px]">
            <TableHeader className="bg-slate-50/70">
              <TableRow className="border-b border-slate-200 hover:bg-transparent">
                <TableHead className="font-semibold text-slate-600 text-xs py-3.5 pl-4">
                  Nhiệm vụ
                </TableHead>
                <TableHead className="font-semibold text-slate-600 text-xs py-3.5">
                  Nhân sự phụ trách
                </TableHead>
                <TableHead className="font-semibold text-slate-600 text-xs py-3.5">
                  Ưu tiên
                </TableHead>
                <TableHead className="font-semibold text-slate-600 text-xs py-3.5">
                  Hạn chót
                </TableHead>
                <TableHead className="font-semibold text-slate-600 text-xs py-3.5">
                  Báo cáo / Link
                </TableHead>
                <TableHead className="font-semibold text-slate-600 text-xs py-3.5">
                  Trạng thái
                </TableHead>
                <TableHead className="font-semibold text-slate-600 text-xs py-3.5 text-right pr-4">
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const statusCol = COLUMNS.find((c) => c.id === task.status);
                const hasEvidence = Boolean(task.evidenceLink || task.evidenceNote);

                return (
                  <TableRow
                    key={task.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => handleOpenDetail(task)}
                  >
                    {/* Task Title & Description */}
                    <TableCell className="py-3.5 pl-4 max-w-[280px]">
                      <div>
                        <div className="font-bold text-slate-900 text-sm line-clamp-1">
                          {task.title}
                        </div>
                        {task.description && (
                          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {task.description}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Assignee */}
                    <TableCell className="py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                          {task.assignee?.name?.[0] || "?"}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800 text-xs">
                            {task.assignee?.name || "Nhân viên"}
                          </div>
                          {task.assignee?.email && (
                            <div className="text-[10px] text-slate-400">
                              {task.assignee.email.split("@")[0]}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Priority */}
                    <TableCell className="py-3.5 whitespace-nowrap">
                      {getPriorityBadge((task as any).priority)}
                    </TableCell>

                    {/* Deadline */}
                    <TableCell className="py-3.5 whitespace-nowrap text-xs text-slate-600 font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-400" />
                        {safeFormatDate(task.deadline)}
                      </span>
                    </TableCell>

                    {/* Evidence Preview */}
                    <TableCell className="py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {task.evidenceLink ? (
                        <a
                          href={task.evidenceLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Xem link
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : hasEvidence ? (
                        <span className="text-xs text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded">
                          Có ghi chú
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="py-3.5 whitespace-nowrap">
                      <Badge className={statusCol?.color || "bg-slate-100 text-slate-800"}>
                        {statusCol?.label || task.status}
                      </Badge>
                    </TableCell>

                    {/* Action Buttons */}
                    <TableCell
                      className="py-3.5 text-right whitespace-nowrap pr-4 space-x-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-600 hover:text-indigo-600"
                        title="Xem chi tiết & Kiểm duyệt"
                        onClick={() => handleOpenDetail(task)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>

                      {task.status === "DONE" && onApproveTask && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 text-xs px-2.5"
                          onClick={(e) => onApproveTask(task, e)}
                          disabled={submitting}
                          title="Duyệt hoàn thành"
                        >
                          <Check className="h-3 w-3 mr-1" /> Duyệt
                        </Button>
                      )}

                      {task.status === "DONE" && onRejectTask && (
                        <Button
                          size="sm"
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-7 text-xs px-2.5"
                          onClick={() => onRejectTask(task)}
                          disabled={submitting}
                          title="Yêu cầu sửa lại"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Từ chối
                        </Button>
                      )}

                      {onEditTask && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                          onClick={(e) => onEditTask(task, e)}
                          title="Chỉnh sửa nhiệm vụ"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      )}

                      {onDeleteTask && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-600"
                          onClick={(e) => onDeleteTask(task.id, e)}
                          disabled={submitting}
                          title="Xóa nhiệm vụ"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // KANBAN BOARD VIEW
  return (
    <div className="flex gap-4 overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch] pb-6 pt-2">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        return (
          <div key={col.id} className="shrink-0 w-72 flex flex-col" style={{ width: 290 }}>
            <div className="bg-slate-100 border border-b-0 rounded-t-xl px-4 py-2.5 flex items-center justify-between shadow-2xs">
              <span className="font-bold text-sm text-slate-800">{col.label}</span>
              <Badge variant="secondary" className="font-mono bg-white font-bold text-slate-700">
                {colTasks.length}
              </Badge>
            </div>

            <div className="flex-1 min-h-[400px] border border-slate-200 rounded-b-xl p-3 space-y-3 bg-slate-50/50 shadow-2xs">
              {colTasks.length === 0 ? (
                <div className="h-[120px] border border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground italic p-4 text-center">
                  Không có nhiệm vụ
                </div>
              ) : (
                colTasks.map((task) => (
                  <Card
                    key={task.id}
                    className="hover:shadow-md hover:scale-[1.01] transition-all duration-200 border-slate-200/80 cursor-pointer overflow-hidden bg-white"
                    onClick={() => handleOpenDetail(task)}
                  >
                    <div className="p-3.5 space-y-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 justify-between">
                          <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-100">
                            {task.assignee?.name || "Nhân viên"}
                          </span>
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {onEditTask && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-slate-400 hover:text-indigo-600"
                                onClick={(e) => onEditTask(task, e)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            )}
                            {onDeleteTask && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-slate-400 hover:text-red-600"
                                onClick={(e) => onDeleteTask(task.id, e)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 leading-snug line-clamp-2 mt-1">
                          {task.title}
                        </h4>
                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>{safeFormatDate(task.deadline)}</span>
                        </div>
                        {task.status === "DONE" && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 border-amber-200 font-bold animate-pulse"
                          >
                            Cần duyệt
                          </Badge>
                        )}
                      </div>

                      {/* Direct actions for quick review */}
                      {task.status === "DONE" && (
                        <div
                          className="flex gap-2 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {onApproveTask && (
                            <Button
                              size="sm"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 text-[10px] gap-1"
                              onClick={(e) => onApproveTask(task, e)}
                              disabled={submitting}
                            >
                              <Check className="h-3 w-3" /> Duyệt
                            </Button>
                          )}
                          {onRejectTask && (
                            <Button
                              size="sm"
                              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold h-7 text-[10px] gap-1"
                              onClick={() => onRejectTask(task)}
                              disabled={submitting}
                            >
                              <RotateCcw className="h-3 w-3" /> Trả lại
                            </Button>
                          )}
                        </div>
                      )}

                      {task.status === "REJECTED" && onApproveTask && (
                        <div
                          className="flex gap-2 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 text-[10px] gap-1"
                            onClick={(e) => onApproveTask(task, e)}
                            disabled={submitting}
                          >
                            <Check className="h-3 w-3" /> Duyệt
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
