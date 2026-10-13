import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserPlus, Search, X } from "lucide-react";
import {
  useUserManagerStore,
  type RoleFilter,
  type EmploymentFilter,
} from "@/stores/useUserManagerStore";
import { UserCard } from "./user-manager";

const AddEmployeeDialog = React.lazy(() =>
  import("./user-manager").then((m) => ({ default: m.AddEmployeeDialog }))
);
const EditEmployeeDatesDialog = React.lazy(() =>
  import("./user-manager").then((m) => ({ default: m.EditEmployeeDatesDialog }))
);
const DeleteEmployeeDialog = React.lazy(() =>
  import("./user-manager").then((m) => ({ default: m.DeleteEmployeeDialog }))
);

export interface UserManagerProps {
  users?: any[];
  onRefresh?: () => void;
}

export default function UserManager({
  users = [],
  onRefresh,
}: UserManagerProps) {
  const [localUsers, setLocalUsers] = useState<any[]>(
    Array.isArray(users) ? users : []
  );

  // Sync with prop changes
  useEffect(() => {
    setLocalUsers(Array.isArray(users) ? users : []);
  }, [users]);

  // Zustand Store UI & Dialog State
  const {
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    employmentFilter,
    setEmploymentFilter,
    showResigned,
    setShowResigned,
    isAddOpen,
    openAddEmployee,
    closeAddEmployee,
    isEditDatesOpen,
    openEditDates,
    closeEditDates,
    isDeleteOpen,
    openDeleteUser,
    closeDeleteUser,
    selectedUser,
    resetFilters,
  } = useUserManagerStore();

  const handleUserUpdate = (updated: any) => {
    setLocalUsers((prev) =>
      prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
    );
    if (onRefresh) onRefresh();
  };

  const handleUserDelete = (deletedId: string) => {
    setLocalUsers((prev) => prev.filter((u) => u.id !== deletedId));
    if (onRefresh) onRefresh();
  };

  const safeLocalUsers = Array.isArray(localUsers) ? localUsers : [];

  // Filter users by search and active filters
  const filteredUsers = useMemo(() => {
    return safeLocalUsers.filter((u) => {
      // Search text match
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = (u.name || "").toLowerCase().includes(query);
        const emailMatch = (u.email || "").toLowerCase().includes(query);
        if (!nameMatch && !emailMatch) return false;
      }

      // Role filter
      if (roleFilter !== "ALL" && (u.role || "USER") !== roleFilter) {
        return false;
      }

      // Employment filter
      if (
        employmentFilter !== "ALL" &&
        (u.employmentType || "PART_TIME") !== employmentFilter
      ) {
        return false;
      }

      return true;
    });
  }, [safeLocalUsers, searchQuery, roleFilter, employmentFilter]);

  const adminUsers = useMemo(() => {
    return filteredUsers
      .filter((u) => u?.isActive !== false && u?.role === "ADMIN")
      .sort((a, b) => {
        const salA =
          Number(a.monthlySalary) || 0 || Number(a.hourlyRate) || 0;
        const salB =
          Number(b.monthlySalary) || 0 || Number(b.hourlyRate) || 0;
        if (salB !== salA) return salB - salA;
        return (a.name || "").localeCompare(b.name || "", "vi");
      });
  }, [filteredUsers]);

  const partnerUsers = useMemo(() => {
    return filteredUsers
      .filter((u) => u?.isActive !== false && u?.role === "PARTNER")
      .sort((a, b) => {
        const salA =
          Number(a.monthlySalary) || 0 || Number(a.hourlyRate) || 0;
        const salB =
          Number(b.monthlySalary) || 0 || Number(b.hourlyRate) || 0;
        if (salB !== salA) return salB - salA;
        return (a.name || "").localeCompare(b.name || "", "vi");
      });
  }, [filteredUsers]);

  const fullTimeUsers = useMemo(() => {
    return filteredUsers
      .filter(
        (u) =>
          u?.isActive !== false &&
          u?.role !== "ADMIN" &&
          u?.role !== "PARTNER" &&
          u?.employmentType === "FULL_TIME"
      )
      .sort((a, b) => {
        const salA = Number(a.monthlySalary) || 0;
        const salB = Number(b.monthlySalary) || 0;
        if (salB !== salA) return salB - salA;
        return (a.name || "").localeCompare(b.name || "", "vi");
      });
  }, [filteredUsers]);

  const partTimeUsers = useMemo(() => {
    return filteredUsers
      .filter(
        (u) =>
          u?.isActive !== false &&
          u?.role !== "ADMIN" &&
          u?.role !== "PARTNER" &&
          u?.employmentType !== "FULL_TIME"
      )
      .sort((a, b) => {
        const rateA = Number(a.hourlyRate) || 0;
        const rateB = Number(b.hourlyRate) || 0;
        if (rateB !== rateA) return rateB - rateA;
        return (a.name || "").localeCompare(b.name || "", "vi");
      });
  }, [filteredUsers]);

  const resignedUsers = useMemo(() => {
    return filteredUsers
      .filter((u) => u?.isActive === false)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));
  }, [filteredUsers]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    roleFilter !== "ALL" ||
    employmentFilter !== "ALL";

  return (
    <>
      <Card id="user-manager-card" className="border-emerald-100 bg-white">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
          <div>
            <CardTitle className="text-emerald-900 text-xl font-bold">
              Danh sách nhân viên
            </CardTitle>
            <CardDescription>
              Quản lý quyền hạn, mức lương và trạng thái hoạt động
            </CardDescription>
          </div>
          <Button
            onClick={openAddEmployee}
            className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            Thêm nhân viên
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Quick Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pb-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm nhân viên theo tên, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 sm:h-9 text-base sm:text-sm bg-slate-50/50 focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="h-10 sm:h-9 text-xs border rounded-md px-2.5 bg-white font-medium text-slate-700 min-h-[36px]"
              >
                <option value="ALL">Tất cả vai trò</option>
                <option value="ADMIN">🛡️ Admin</option>
                <option value="PARTNER">💼 Đối tác WFH</option>
                <option value="USER">🏪 Nhân viên</option>
              </select>

              <select
                value={employmentFilter}
                onChange={(e) =>
                  setEmploymentFilter(e.target.value as EmploymentFilter)
                }
                className="h-10 sm:h-9 text-xs border rounded-md px-2.5 bg-white font-medium text-slate-700 min-h-[36px]"
              >
                <option value="ALL">Tất cả loại</option>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
              </select>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-10 sm:h-9 text-xs text-muted-foreground hover:text-slate-900"
                >
                  Đặt lại
                </Button>
              )}
            </div>
          </div>

          {/* Group 1: QUẢN TRỊ VIÊN (ADMIN) */}
          <div className="rounded-md border border-amber-200 overflow-hidden bg-white shadow-xs">
            <div className="bg-amber-50/70 px-4 py-2.5 text-xs font-bold text-amber-900 border-b border-amber-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>🛡️</span> QUẢN TRỊ VIÊN ({adminUsers.length})
              </span>
            </div>
            {adminUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                Không có nhân viên trong nhóm này
              </div>
            ) : (
              adminUsers.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  onUpdate={handleUserUpdate}
                  onOpenEditDates={openEditDates}
                  onOpenDelete={openDeleteUser}
                />
              ))
            )}
          </div>

          {/* Group 2: ĐỐI TÁC WFH / MARKETING (PARTNER) */}
          <div className="rounded-md border border-purple-200 overflow-hidden bg-white shadow-xs">
            <div className="bg-purple-50/70 px-4 py-2.5 text-xs font-bold text-purple-900 border-b border-purple-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>💼</span> ĐỐI TÁC WFH / MARKETING ({partnerUsers.length})
              </span>
            </div>
            {partnerUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                Không có đối tác trong nhóm này
              </div>
            ) : (
              partnerUsers.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  onUpdate={handleUserUpdate}
                  onOpenEditDates={openEditDates}
                  onOpenDelete={openDeleteUser}
                />
              ))
            )}
          </div>

          {/* Group 3: TOÀN THỜI GIAN (FULL TIME) */}
          <div className="rounded-md border border-blue-200 overflow-hidden bg-white shadow-xs">
            <div className="bg-blue-50/70 px-4 py-2.5 text-xs font-bold text-blue-900 border-b border-blue-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>🏪</span> TOÀN THỜI GIAN ({fullTimeUsers.length})
              </span>
            </div>
            {fullTimeUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                Không có nhân viên trong nhóm này
              </div>
            ) : (
              fullTimeUsers.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  onUpdate={handleUserUpdate}
                  onOpenEditDates={openEditDates}
                  onOpenDelete={openDeleteUser}
                />
              ))
            )}
          </div>

          {/* Group 4: BÁN THỜI GIAN (PART TIME) */}
          <div className="rounded-md border border-emerald-200 overflow-hidden bg-white shadow-xs">
            <div className="bg-emerald-50/70 px-4 py-2.5 text-xs font-bold text-emerald-900 border-b border-emerald-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>⏱️</span> BÁN THỜI GIAN ({partTimeUsers.length})
              </span>
            </div>
            {partTimeUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                Không có nhân viên trong nhóm này
              </div>
            ) : (
              partTimeUsers.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  onUpdate={handleUserUpdate}
                  onOpenEditDates={openEditDates}
                  onOpenDelete={openDeleteUser}
                />
              ))
            )}
          </div>

          {/* Group 5: NHÂN VIÊN ĐÃ NGHỈ VIỆC */}
          {resignedUsers.length > 0 && (
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResigned(!showResigned)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1.5 focus:outline-none transition-colors cursor-pointer py-1.5 px-1 -ml-1 rounded active:bg-gray-100"
              >
                <span>{showResigned ? "▼" : "▶"}</span>
                <span>NHÂN VIÊN ĐÃ NGHỈ VIỆC ({resignedUsers.length})</span>
              </button>

              {showResigned && (
                <div className="rounded-md border border-gray-200 overflow-hidden bg-white">
                  {resignedUsers.map((u) => (
                    <UserCard
                      key={u.id}
                      user={u}
                      onUpdate={handleUserUpdate}
                      onOpenEditDates={openEditDates}
                      onOpenDelete={openDeleteUser}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modular Dialogs */}
      <React.Suspense fallback={null}>
        <AddEmployeeDialog
          open={isAddOpen}
          onClose={closeAddEmployee}
          onCreated={onRefresh}
        />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <EditEmployeeDatesDialog
          open={isEditDatesOpen}
          user={selectedUser}
          onClose={closeEditDates}
          onUpdated={handleUserUpdate}
        />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <DeleteEmployeeDialog
          open={isDeleteOpen}
          user={selectedUser}
          onClose={closeDeleteUser}
          onDeleted={handleUserDelete}
        />
      </React.Suspense>
    </>
  );
}
