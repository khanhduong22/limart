import React from "react";
import {
  Search,
  Filter,
  Calendar,
  User,
  Plus,
  RefreshCw,
  LayoutGrid,
  List,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminStaffTasksStore } from "@/stores/useAdminStaffTasksStore";
import type { StaffTaskUserOption } from "@/types/staff-tasks";

export interface StaffTasksFilterBarProps {
  assignableUsers: StaffTaskUserOption[];
  totalCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOpenCreateTask?: () => void;
  onOpenCreateDefinition?: () => void;
}

export function StaffTasksFilterBar({
  assignableUsers,
  totalCount,
  onRefresh,
  isRefreshing,
  onOpenCreateTask,
  onOpenCreateDefinition,
}: StaffTasksFilterBarProps) {
  const {
    searchKeyword,
    setSearchKeyword,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    frequencyFilter,
    setFrequencyFilter,
    selectedAssignee,
    setSelectedAssignee,
    selectedWeekFilter,
    setSelectedWeekFilter,
    viewMode,
    setViewMode,
    openCreateDefinition,
    openAssignTask,
  } = useAdminStaffTasksStore();

  const handleCreateTask = () => {
    if (onOpenCreateTask) {
      onOpenCreateTask();
    } else {
      openAssignTask();
    }
  };

  const handleCreateDefinition = () => {
    if (onOpenCreateDefinition) {
      onOpenCreateDefinition();
    } else {
      openCreateDefinition();
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action bar: Search, Refresh, View Toggle, and Create Buttons */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Tìm theo tiêu đề, mô tả hoặc tên nhân viên..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="pl-9 bg-white border-slate-200 h-10 text-sm rounded-xl shadow-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle (Kanban vs Table) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              title="Xem dạng cột Kanban"
              className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "kanban"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Xem dạng bảng chi tiết"
              className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "table"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-xs text-slate-600 gap-1.5 font-medium min-h-[38px] rounded-xl"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
              Làm mới
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateDefinition}
            className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold gap-1.5 text-xs min-h-[38px] rounded-xl"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            Thêm định mức
          </Button>

          <Button
            onClick={handleCreateTask}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5 shadow-sm text-xs sm:text-sm min-h-[38px] rounded-xl"
          >
            <Plus className="h-4 w-4" />
            Giao việc mới
          </Button>
        </div>
      </div>

      {/* Filter Row: Assignee, Time, Status, Priority, Frequency */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Assignee Filter */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <User className="h-4 w-4 text-indigo-500 shrink-0" />
            <select
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="w-full border rounded-lg text-sm px-2.5 py-1.5 bg-slate-50 border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium h-9"
              aria-label="Lọc theo nhân sự"
            >
              <option value="ALL">Tất cả nhân sự (Quyền KPI)</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.email ? `(${u.email})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Time/Week Filter */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[170px]">
            <Calendar className="h-4 w-4 text-indigo-500 shrink-0" />
            <select
              value={selectedWeekFilter}
              onChange={(e) => setSelectedWeekFilter(e.target.value as any)}
              className="w-full border rounded-lg text-sm px-2.5 py-1.5 bg-slate-50 border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 h-9"
              aria-label="Lọc theo thời gian"
            >
              <option value="THIS_WEEK">Tuần này</option>
              <option value="LAST_WEEK">Tuần trước</option>
              <option value="NEXT_WEEK">Tuần sau</option>
              <option value="THIS_MONTH">Tháng này</option>
              <option value="ALL">Tất cả thời gian</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 min-w-[140px]">
            <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border rounded-lg text-xs px-2.5 py-1.5 bg-slate-50 border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 h-9"
              aria-label="Lọc theo trạng thái"
            >
              <option value="ALL">Mọi trạng thái</option>
              <option value="TODO">Cần làm</option>
              <option value="DOING">Đang làm</option>
              <option value="DONE">Chờ duyệt</option>
              <option value="APPROVED">Đã duyệt</option>
              <option value="REJECTED">Cần sửa lại</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1.5 min-w-[130px]">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full border rounded-lg text-xs px-2.5 py-1.5 bg-slate-50 border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 h-9"
              aria-label="Lọc theo độ ưu tiên"
            >
              <option value="ALL">Mọi ưu tiên</option>
              <option value="URGENT">Khẩn cấp</option>
              <option value="HIGH">Cao</option>
              <option value="MEDIUM">Trung bình</option>
              <option value="LOW">Thấp</option>
            </select>
          </div>

          {/* Frequency Filter */}
          <div className="flex items-center gap-1.5 min-w-[130px]">
            <select
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
              className="w-full border rounded-lg text-xs px-2.5 py-1.5 bg-slate-50 border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 h-9"
              aria-label="Lọc theo chu kỳ"
            >
              <option value="ALL">Mọi tần suất</option>
              <option value="DAILY">Hàng ngày</option>
              <option value="WEEKLY">Hàng tuần</option>
              <option value="MONTHLY">Hàng tháng</option>
              <option value="ONCE">Một lần</option>
            </select>
          </div>
        </div>

        {typeof totalCount === "number" && (
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-1 border-t border-slate-100">
            <span>
              Hiển thị <b>{totalCount}</b> công việc
            </span>
            {(searchKeyword ||
              statusFilter !== "ALL" ||
              priorityFilter !== "ALL" ||
              frequencyFilter !== "ALL" ||
              selectedAssignee !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSearchKeyword("");
                  setStatusFilter("ALL");
                  setPriorityFilter("ALL");
                  setFrequencyFilter("ALL");
                  setSelectedAssignee("ALL");
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
