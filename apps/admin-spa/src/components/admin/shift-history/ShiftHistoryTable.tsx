import React, { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useShiftHistoryStore } from "@/stores/useShiftHistoryStore";
import {
  getVnDateKey,
  getVnDateLabel,
  formatLogTime,
  formatTimeOnly,
  renderActionBadge,
  formatLogDetail,
  GroupedShiftHistory,
} from "./types";

interface ShiftHistoryTableProps {
  onLoadMore: () => void;
}

export function ShiftHistoryTable({ onLoadMore }: ShiftHistoryTableProps) {
  const { logs, loading, search, hasMore } = useShiftHistoryStore();

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const userName = (log.user?.name || "").toLowerCase();
      const userEmail = (log.user?.email || "").toLowerCase();
      const changedByName = (log.changedBy?.name || "").toLowerCase();
      const changedByEmail = (log.changedBy?.email || "").toLowerCase();
      const query = search.toLowerCase();

      return (
        userName.includes(query) ||
        userEmail.includes(query) ||
        changedByName.includes(query) ||
        changedByEmail.includes(query)
      );
    });
  }, [logs, search]);

  const groupedLogs: GroupedShiftHistory[] = useMemo(() => {
    const groupsMap = new Map<string, any[]>();
    for (const log of filteredLogs) {
      const key = getVnDateKey(log.createdAt);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(log);
    }

    const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) =>
      b.localeCompare(a)
    );
    return sortedKeys.map((key) => {
      const { title, isToday, isYesterday } = getVnDateLabel(key);
      return {
        dateKey: key,
        title,
        isToday,
        isYesterday,
        logs: groupsMap.get(key)!,
      };
    });
  }, [filteredLogs]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ScrollArea className="flex-1 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden bg-white dark:bg-stone-900">
        <Table>
          <TableHeader className="bg-stone-50 dark:bg-stone-800/90 sticky top-0 z-20 shadow-2xs">
            <TableRow className="border-b border-stone-200 dark:border-stone-700">
              <TableHead className="w-[100px] text-xs font-bold">Thời gian</TableHead>
              <TableHead className="w-[140px] text-xs font-bold">Người thực hiện</TableHead>
              <TableHead className="w-[140px] text-xs font-bold">Nhân viên</TableHead>
              <TableHead className="w-[110px] text-xs font-bold">Thao tác</TableHead>
              <TableHead className="text-xs font-bold">Chi tiết ca làm</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                    <span>Đang tải lịch sử thay đổi ca...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : groupedLogs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-40 text-center text-muted-foreground"
                >
                  Không tìm thấy bản ghi lịch sử nào trong khoảng thời gian này.
                </TableCell>
              </TableRow>
            ) : (
              groupedLogs.map((group) => (
                <React.Fragment key={group.dateKey}>
                  {/* Date Group Header */}
                  <TableRow className="bg-stone-100/90 dark:bg-stone-800/90 hover:bg-stone-100/90 dark:hover:bg-stone-800/90 border-t-2 border-stone-200 dark:border-stone-700">
                    <TableCell colSpan={5} className="py-2 px-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                            {group.title}
                          </span>
                          {group.isToday && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-500 text-white leading-tight">
                              Hôm nay
                            </span>
                          )}
                          {group.isYesterday && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 leading-tight">
                              Hôm qua
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                          {group.logs.length} thao tác
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Rows in this date group */}
                  {group.logs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="hover:bg-stone-50/70 dark:hover:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800/60"
                    >
                      <TableCell
                        className="font-mono text-xs font-semibold text-stone-600 dark:text-stone-400"
                        title={formatLogTime(log.createdAt)}
                      >
                        {formatTimeOnly(log.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium text-stone-800 dark:text-stone-200 text-xs">
                        {log.changedBy?.name || log.changedBy?.email?.split("@")[0]}
                        <span className="block text-[10px] text-stone-400 dark:text-stone-500 font-normal">
                          {log.changedBy?.role === "ADMIN" ? "Admin" : "Staff"}
                        </span>
                      </TableCell>
                      <TableCell className="text-stone-800 dark:text-stone-200 font-semibold text-xs">
                        {log.user?.name || log.user?.email?.split("@")[0]}
                      </TableCell>
                      <TableCell>{renderActionBadge(log.action)}</TableCell>
                      <TableCell className="text-stone-700 dark:text-stone-300 text-xs">
                        {formatLogDetail(log)}
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {hasMore && !loading && (
        <div className="flex justify-center mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            className="text-xs rounded-xl border-stone-200 dark:border-stone-700 cursor-pointer"
          >
            Tải thêm dữ liệu
          </Button>
        </div>
      )}

      {loading && logs.length > 0 && (
        <div className="flex justify-center mt-3 text-xs text-muted-foreground items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-amber-600" /> Đang tải thêm...
        </div>
      )}
    </div>
  );
}

export default ShiftHistoryTable;
