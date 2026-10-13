import React, { useState } from "react";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { ShieldAlert, Search, Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditLog } from "@/components/admin/audit/AuditLogTable";

const AuditLogTable = React.lazy(
  () => import("@/components/admin/audit/AuditLogTable")
);

interface AuditLogResponse {
  success: boolean;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  logs: AuditLog[];
}

export function AuditLogPage() {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filterAction, setFilterAction] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");

  const queryUrl = `/api/auth/audit-logs?page=${pageIndex + 1}&limit=${pageSize}&action=${filterAction}&status=${filterStatus}&search=${encodeURIComponent(search.trim())}`;

  const { data, isValidating, mutate } = useAdminQuery<AuditLogResponse>(
    queryUrl,
    {
      fallbackData: {
        success: true,
        total: 0,
        page: 1,
        limit: pageSize,
        totalPages: 1,
        logs: [],
      },
    }
  );

  const logs = data?.logs || [];
  const totalPages = data?.totalPages || 1;
  const totalCount = data?.total ?? logs.length;

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
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPageIndex(0);
            }}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-base sm:text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary min-h-[38px] h-10 sm:h-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              aria-label="Lọc theo hành động"
              value={filterAction}
              onChange={(e) => {
                setFilterAction(e.target.value);
                setPageIndex(0);
              }}
              className="w-full sm:w-auto bg-white border border-gray-200 rounded-lg text-base sm:text-xs text-slate-700 px-3 py-2 focus:outline-none focus:border-primary cursor-pointer min-h-[38px] h-10 sm:h-9"
            >
              <option value="ALL">Tất cả hành động</option>
              <option value="LOGIN">🔑 Đăng nhập</option>
              <option value="LOGOUT">🚪 Đăng xuất</option>
              <option value="CHECKIN">🟢 Vào ca</option>
              <option value="CHECKOUT">👋 Tan ca</option>
              <option value="MANUAL_CHECKIN">✍️ Chấm công hộ</option>
              <option value="FAILED_LOGIN">⚠️ Sai mật khẩu</option>
            </select>
          </div>

          <select
            aria-label="Lọc theo trạng thái"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPageIndex(0);
            }}
            className="w-full sm:w-auto bg-white border border-gray-200 rounded-lg text-base sm:text-xs text-slate-700 px-3 py-2 focus:outline-none focus:border-primary cursor-pointer min-h-[38px] h-10 sm:h-9"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="SUCCESS">✅ Thành công</option>
            <option value="FAILED">❌ Thất bại</option>
          </select>
        </div>
      </div>

      {/* TanStack Table (Lazy Loaded) */}
      <React.Suspense
        fallback={
          <div className="h-64 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Đang tải nhật ký phiên...
          </div>
        }
      >
        <AuditLogTable
          logs={logs}
          totalPages={totalPages}
          totalCount={totalCount}
          pageIndex={pageIndex}
          pageSize={pageSize}
          setPageIndex={setPageIndex}
          setPageSize={setPageSize}
        />
      </React.Suspense>
    </div>
  );
}

export default AuditLogPage;
