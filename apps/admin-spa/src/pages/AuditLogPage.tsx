import React, { useState } from "react";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import {
  ShieldAlert,
  Clock,
  Laptop,
  Smartphone,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  RefreshCw,
} from "lucide-react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AuditLog {
  id: string;
  userId?: string | null;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: string;
  } | null;
  action: string;
  status: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  device?: string | null;
  city?: string | null;
  details?: Record<string, any> | null;
  createdAt: string;
}

const columnHelper = createColumnHelper<AuditLog>();

export function AuditLogPage() {
  const [globalFilter, setGlobalFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");

  const { data, isValidating, mutate } = useAdminQuery<{
    success: boolean;
    logs: AuditLog[];
  }>("/api/auth/audit-logs", {
    fallbackData: {
      success: true,
      logs: [],
    },
  });

  const logs = data?.logs || [];

  const filteredLogs = React.useMemo(() => {
    let result = logs;
    if (actionFilter !== "ALL") {
      result = result.filter((log) => log.action === actionFilter);
    }
    if (globalFilter.trim()) {
      const q = globalFilter.toLowerCase();
      result = result.filter(
        (log) =>
          log.user?.name?.toLowerCase().includes(q) ||
          log.user?.email?.toLowerCase().includes(q) ||
          log.ipAddress?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, actionFilter, globalFilter]);

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("createdAt", {
        header: "Thời Gian",
        cell: (info) => (
          <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {new Date(info.getValue()).toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        ),
      }),
      columnHelper.accessor("user", {
        header: "Tài Khoản",
        cell: (info) => {
          const user = info.getValue();
          return (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center text-xs font-bold text-orange-800">
                {user?.name?.[0] || "?"}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {user?.name || "Khách / Ẩn danh"}
                </p>
                <p className="text-xs text-slate-500">
                  {user?.email || "Chưa xác thực"}
                </p>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("action", {
        header: "Hành Động",
        cell: (info) => {
          const action = info.getValue();
          const badgeConfig: Record<
            string,
            { bg: string; text: string; label: string }
          > = {
            LOGIN: {
              bg: "bg-emerald-50 border-emerald-200",
              text: "text-emerald-700",
              label: "🔑 Đăng Nhập",
            },
            LOGOUT: {
              bg: "bg-slate-100 border-slate-200",
              text: "text-slate-700",
              label: "🚪 Đăng Xuất",
            },
            CHECKIN: {
              bg: "bg-blue-50 border-blue-200",
              text: "text-blue-700",
              label: "🟢 Vào Ca",
            },
            CHECKOUT: {
              bg: "bg-amber-50 border-amber-200",
              text: "text-amber-800",
              label: "👋 Tan Ca",
            },
            MANUAL_CHECKIN: {
              bg: "bg-purple-50 border-purple-200",
              text: "text-purple-700",
              label: "✍️ Chấm Công Hộ",
            },
            FAILED_LOGIN: {
              bg: "bg-rose-50 border-rose-200",
              text: "text-rose-700",
              label: "⚠️ Sai Mật Khẩu",
            },
          };
          const config = badgeConfig[action] || {
            bg: "bg-gray-100 border-gray-200",
            text: "text-gray-700",
            label: action,
          };
          return (
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${config.bg} ${config.text}`}
            >
              {config.label}
            </span>
          );
        },
      }),
      columnHelper.accessor("status", {
        header: "Trạng Thái",
        cell: (info) => {
          const isSuccess = info.getValue() === "SUCCESS";
          return (
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">
                    Thành công
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span className="text-rose-700 font-semibold">Thất bại</span>
                </>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("ipAddress", {
        header: "Địa Chỉ IP",
        cell: (info) => {
          const ip = info.getValue() || "N/A";
          return (
            <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-700">
              {ip}
            </span>
          );
        },
      }),
      columnHelper.accessor("device", {
        header: "Thiết Bị",
        cell: (info) => {
          const device = info.getValue() || "Desktop";
          return (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              {device === "Mobile" ? (
                <Smartphone className="w-4 h-4 text-purple-600" />
              ) : (
                <Laptop className="w-4 h-4 text-blue-600" />
              )}
              <span>{device}</span>
            </div>
          );
        },
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredLogs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 15,
      },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 shrink-0" />
            <span>Nhật Ký Phiên & Giám Sát Truy Cập</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Theo dõi đăng nhập, địa chỉ IP, thiết bị và các thao tác nhạy cảm theo thời gian thực.
          </p>
        </div>
        <Button
          onClick={() => mutate()}
          disabled={isValidating}
          variant="outline"
          size="sm"
          className="w-full sm:w-auto bg-white border-gray-200 gap-2 text-xs min-h-[38px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative flex-1 max-w-full sm:max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên, email, IP..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-base sm:text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary min-h-[38px] h-10 sm:h-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full sm:w-auto bg-white border border-gray-200 rounded-lg text-base sm:text-xs text-slate-700 px-3 py-2 focus:outline-none focus:border-primary cursor-pointer min-h-[38px] h-10 sm:h-9"
          >
            <option value="ALL">Tất cả hành động</option>
            <option value="LOGIN">🔑 Đăng nhập</option>
            <option value="LOGOUT">🚪 Đăng xuất</option>
            <option value="CHECKIN">🟢 Vào ca</option>
            <option value="CHECKOUT">👋 Tan ca</option>
            <option value="MANUAL_CHECKIN">✍️ Chấm công hộ</option>
          </select>
        </div>
      </div>

      {/* TanStack Table */}
      <div className="overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full text-left text-sm min-w-[720px]">
            <thead className="bg-gray-50/80 border-b border-gray-200 text-xs text-slate-600 font-semibold uppercase tracking-wider">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="py-3.5 px-4">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-8 text-center text-xs text-slate-400 italic"
                  >
                    Chưa ghi nhận sự kiện phiên nào phù hợp.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-3 px-4">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {table.getPageCount() > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 border-t bg-gray-50/50 text-xs text-slate-600">
            <div>
              Trang <span className="font-semibold text-slate-900">{table.getState().pagination.pageIndex + 1}</span> /{" "}
              <span className="font-semibold text-slate-900">{table.getPageCount()}</span> (Tổng {filteredLogs.length} sự kiện)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="h-9 min-h-[36px] px-3 text-xs"
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="h-9 min-h-[36px] px-3 text-xs"
              >
                Tiếp theo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
