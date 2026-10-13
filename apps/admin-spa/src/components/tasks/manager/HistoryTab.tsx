import React from "react";
import {
  RefreshCw,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { useManagerTasksStore } from "@/stores/useManagerTasksStore";
import { StatsHistoryData, DailyDetailItem } from "@/types/manager-tasks";

export function HistoryTab() {
  const {
    selectedUserId,
    selectedDate,
    setSelectedDate,
    isHistoryDetailOpen,
    historyItem,
    openHistoryDetail,
    closeHistoryDetail,
    setIsHistoryDetailOpen,
  } = useManagerTasksStore();

  // Stats History
  const {
    data: rawHistory,
    isLoading: historyLoading,
    mutate: mutateHistory,
  } = useAdminQuery<any>(
    selectedUserId
      ? `/api/manager-tasks/stats-history?userId=${selectedUserId}&date=${selectedDate}`
      : null
  );
  const historyStats: StatsHistoryData | null =
    rawHistory?.data || rawHistory || null;

  // Derived stats
  const daysWorked = historyStats?.daysWorked || 0;
  const deficiencies = historyStats?.totalDeficiencies || 0;
  const completedDays = Math.max(0, daysWorked - deficiencies);
  const completionRate =
    daysWorked > 0 ? Math.round((completedDays / daysWorked) * 100) : 100;

  return (
    <>
      <Card className="border-indigo-100 shadow-md">
        <CardHeader className="pb-3 border-b flex justify-between items-center flex-row flex-wrap gap-4">
          <div>
            <CardTitle className="text-lg font-bold text-slate-800">
              Lịch sử hoàn thành checklist
            </CardTitle>
            <CardDescription className="text-xs">
              Đối chiếu trạng thái hoàn thành checklist và số lỗi quy trình tính theo tháng.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Quick Date Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border rounded-lg px-2.5 py-1 text-xs">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="Chọn ngày đối chiếu lịch sử"
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none border-0 p-0 focus:ring-0"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => mutateHistory()}
              disabled={historyLoading}
              className="font-semibold text-xs h-8"
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${
                  historyLoading ? "animate-spin" : ""
                }`}
              />
              Tải lại
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {historyLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
              Đang đối chiếu dữ liệu lịch sử...
            </div>
          ) : !historyStats ||
            !historyStats.dailyDetails ||
            historyStats.dailyDetails.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu chấm công hoặc làm việc tháng này để đối chiếu lịch sử checklist.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-slate-50 rounded-xl border">
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Ngày đi làm
                  </span>
                  <span className="text-xl font-extrabold text-slate-800 font-mono mt-0.5 block">
                    {historyStats.daysWorked} ngày
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Giờ công
                  </span>
                  <span className="text-xl font-extrabold text-slate-800 font-mono mt-0.5 block">
                    {historyStats.totalHours?.toFixed(1)}h
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Đi muộn
                  </span>
                  <span className="text-xl font-extrabold text-amber-600 font-mono mt-0.5 block">
                    {historyStats.lateCount} lần
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Lỗi Quy Trình
                  </span>
                  <span className="text-xl font-extrabold text-rose-600 font-mono mt-0.5 block">
                    {historyStats.totalDeficiencies} ngày
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Tỷ Lệ Chuẩn
                  </span>
                  <span
                    className={`text-xl font-extrabold font-mono mt-0.5 block ${
                      completionRate >= 90
                        ? "text-emerald-600"
                        : completionRate >= 75
                        ? "text-amber-600"
                        : "text-rose-600"
                    }`}
                  >
                    {completionRate}%
                  </span>
                </div>
              </div>

              {/* Grid table */}
              <div className="border rounded-lg overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
                <table className="min-w-full divide-y text-sm min-w-[550px]">
                  <thead className="bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">Ngày</th>
                      <th className="px-4 py-3 text-center">Ca làm việc</th>
                      <th className="px-4 py-3 text-center">Giờ công</th>
                      <th className="px-4 py-3 text-right">Trạng thái Checklist</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y">
                    {historyStats.dailyDetails.map((day, idx) => {
                      const hasChecklistError =
                        day.error && day.error.includes("Thiếu checklist");
                      return (
                        <tr
                          key={idx}
                          onClick={() => openHistoryDetail(day)}
                          className="cv-auto-table-row hover:bg-slate-50/70 cursor-pointer transition-colors"
                          title="Nhấp để xem chi tiết ngày làm việc"
                        >
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {new Date(day.date).toLocaleDateString("vi-VN", {
                              weekday: "short",
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                            {day.shift || "N/A"}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs">
                            {day.hours > 0 ? day.hours.toFixed(1) + "h" : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {day.hours === 0 && !day.error?.includes("WFH") ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border">
                                Nghỉ làm
                              </span>
                            ) : hasChecklistError ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                                ⚠️ Thiếu sót quy trình
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ✓ Hoàn chỉnh
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Detail Modal */}
      <Dialog
        open={isHistoryDetailOpen}
        onOpenChange={setIsHistoryDetailOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Info className="h-4 w-4 text-indigo-600" />
              Chi tiết ngày làm việc
            </DialogTitle>
            <DialogDescription className="text-xs">
              Đối chiếu thông tin ca làm và ghi nhận hoàn thành quy trình checklist.
            </DialogDescription>
          </DialogHeader>

          {historyItem && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Ngày:</span>
                <span className="font-semibold text-slate-800">
                  {new Date(historyItem.date).toLocaleDateString("vi-VN", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Ca làm việc:</span>
                <span className="font-semibold text-slate-800">
                  {historyItem.shift || "N/A"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Giờ công ghi nhận:</span>
                <span className="font-mono font-bold text-slate-800">
                  {historyItem.hours > 0 ? `${historyItem.hours.toFixed(1)}h` : "0h (Nghỉ)"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Đánh giá checklist:</span>
                {historyItem.error && historyItem.error.includes("Thiếu checklist") ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                    <AlertTriangle className="h-3 w-3" /> Thiếu sót quy trình
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> Hoàn chỉnh quy trình
                  </span>
                )}
              </div>

              {historyItem.error && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  <b>Ghi chú hệ thống:</b> {historyItem.error}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeHistoryDetail}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
