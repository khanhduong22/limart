import React, { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Laptop,
  Smartphone,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";

export interface AuditLog {
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

export interface AuditLogTableProps {
  logs: AuditLog[];
  totalPages: number;
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;
}

const columnHelper = createColumnHelper<AuditLog>();

export function AuditLogTable({
  logs,
  totalPages,
  totalCount,
  pageIndex,
  pageSize,
  setPageIndex,
  setPageSize,
}: AuditLogTableProps) {
  const [jumpPage, setJumpPage] = useState("1");

  useEffect(() => {
    setJumpPage(String(pageIndex + 1));
  }, [pageIndex]);

  const columns = useMemo(
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

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  const table = useReactTable({
    data: logs,
    columns,
    pageCount: totalPages,
    state: {
      pagination,
    },
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      setPageIndex(nextPagination.pageIndex);
      setPageSize(nextPagination.pageSize);
    },
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const handleJump = () => {
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p) && p >= 1 && (totalPages <= 1 || p <= totalPages)) {
      setPageIndex(p - 1);
    } else {
      setJumpPage(String(pageIndex + 1));
    }
  };

  return (
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
                  className="cv-auto-table-row hover:bg-slate-50/60 transition-colors"
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 border-t bg-gray-50/50 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            Trang <span className="font-semibold text-slate-900">{pageIndex + 1}</span> /{" "}
            <span className="font-semibold text-slate-900">{totalPages}</span> (Tổng {totalCount} sự kiện)
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="text-slate-500">Hiển thị:</span>
            <select
              aria-label="Số dòng mỗi trang"
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                table.setPageSize(newSize);
                setPageIndex(0);
              }}
              className="bg-white border border-gray-200 rounded-md px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-primary cursor-pointer h-8"
            >
              <option value={10}>10 / trang</option>
              <option value={25}>25 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="h-8 px-2 text-xs"
            title="Trang đầu"
            aria-label="Trang đầu"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-8 px-2.5 text-xs gap-1"
            aria-label="Trang trước"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Trước</span>
          </Button>

          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleJump();
                }
              }}
              className="w-12 h-8 px-1.5 border border-gray-200 rounded-md text-xs text-center focus:outline-none focus:border-primary"
              aria-label="Nhập số trang"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleJump}
              className="h-8 px-2 text-xs"
            >
              Nhảy
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-8 px-2.5 text-xs gap-1"
            aria-label="Trang sau"
          >
            <span>Tiếp theo</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(totalPages - 1)}
            disabled={!table.getCanNextPage()}
            className="h-8 px-2 text-xs"
            title="Trang cuối"
            aria-label="Trang cuối"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AuditLogTable;
