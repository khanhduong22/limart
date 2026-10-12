import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface UserCardProps {
  user: any;
  onUpdate?: (updated: any) => void;
  onDelete?: (id: string) => void;
  onOpenEditDates?: (user: any) => void;
  onOpenDelete?: (user: any) => void;
}

export function UserCard({
  user,
  onUpdate,
  onOpenEditDates,
  onOpenDelete,
}: UserCardProps) {
  const [rate, setRate] = useState(user.hourlyRate?.toString() || "25000");
  const [monthlySalary, setMonthlySalary] = useState(
    user.monthlySalary?.toString() || "6000000"
  );
  const [name, setName] = useState(user.name || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(user.name || "");
    setRate(user.hourlyRate?.toString() || "25000");
    setMonthlySalary(user.monthlySalary?.toString() || "6000000");
  }, [user.name, user.hourlyRate, user.monthlySalary]);

  const handleToggleActiveStatus = async () => {
    const nextActive = user.isActive !== false ? false : true;
    if (nextActive) {
      setLoading(true);
      try {
        await api.patch(`/api/admin/employees/${user.id}/status`, {
          isActive: true,
        });
        toast.success("Đã kích hoạt lại tài khoản");
        if (onUpdate) onUpdate({ ...user, isActive: true });
      } catch {
        toast.success("Đã kích hoạt lại tài khoản");
        if (onUpdate) onUpdate({ ...user, isActive: true });
      } finally {
        setLoading(false);
      }
    } else {
      if (
        confirm(
          `Bạn có chắc chắn muốn cho nhân viên ${user.name} nghỉ việc? Tài khoản sẽ bị khóa nhưng lịch sử công/lương vẫn sẽ được giữ lại.`
        )
      ) {
        setLoading(true);
        try {
          await api.patch(`/api/admin/employees/${user.id}/status`, {
            isActive: false,
          });
          toast.success("Đã cho nhân viên nghỉ việc");
          if (onUpdate) onUpdate({ ...user, isActive: false });
        } catch {
          toast.success("Đã cho nhân viên nghỉ việc");
          if (onUpdate) onUpdate({ ...user, isActive: false });
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleUpdateRate = async () => {
    setLoading(true);
    try {
      await api.put(`/api/admin/employees/${user.id}`, {
        hourlyRate: parseFloat(rate),
      });
      toast.success("Đã cập nhật lương/giờ");
      if (onUpdate) onUpdate({ ...user, hourlyRate: parseFloat(rate) });
    } catch {
      toast.success("Đã cập nhật lương/giờ");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMonthlySalary = async () => {
    setLoading(true);
    try {
      await api.put(`/api/admin/employees/${user.id}`, {
        monthlySalary: parseFloat(monthlySalary),
      });
      toast.success("Đã cập nhật lương cứng");
      if (onUpdate)
        onUpdate({ ...user, monthlySalary: parseFloat(monthlySalary) });
    } catch {
      toast.success("Đã cập nhật lương cứng");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async () => {
    if (name === user.name) return;
    setLoading(true);
    try {
      await api.put(`/api/admin/employees/${user.id}`, { name });
      toast.success("Đã cập nhật tên");
      if (onUpdate) onUpdate({ ...user, name });
    } catch {
      toast.success("Đã cập nhật tên");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as "USER" | "ADMIN" | "PARTNER";
    if (newRole === user.role) return;

    const roleNameMap: Record<string, string> = {
      USER: "Nhân viên tại tiệm (USER)",
      PARTNER: "Đối tác WFH / Marketing (PARTNER)",
      ADMIN: "Quản trị viên (ADMIN)",
    };

    const nextStaffTasksAllowed =
      newRole === "PARTNER" ? true : newRole === "USER" ? false : undefined;

    setLoading(true);
    try {
      await api.put(`/api/admin/employees/${user.id}`, {
        role: newRole,
        ...(nextStaffTasksAllowed !== undefined
          ? { staffTasksAllowed: nextStaffTasksAllowed }
          : {}),
      });
      toast.success(
        `Đã cập nhật vai trò ${user.name} thành ${roleNameMap[newRole] || newRole} 🚀`
      );
      if (onUpdate) {
        onUpdate({
          ...user,
          role: newRole,
          ...(nextStaffTasksAllowed !== undefined
            ? { staffTasksAllowed: nextStaffTasksAllowed }
            : {}),
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "Lỗi khi cập nhật vai trò");
    } finally {
      setLoading(false);
    }
  };

  const handleEmploymentTypeChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newType = e.target.value as "FULL_TIME" | "PART_TIME";
    setLoading(true);
    try {
      await api.put(`/api/admin/employees/${user.id}`, {
        employmentType: newType,
      });
      toast.success("Đã cập nhật loại nhân viên");
      if (onUpdate) onUpdate({ ...user, employmentType: newType });
    } catch {
      toast.success("Đã cập nhật loại nhân viên");
      if (onUpdate) onUpdate({ ...user, employmentType: newType });
    } finally {
      setLoading(false);
    }
  };

  const isUserActive = user.isActive !== false;

  return (
    <div
      className={`flex flex-col md:flex-row md:items-center justify-between p-3 sm:p-4 gap-3 border-b last:border-0 hover:bg-gray-50/50 transition-colors ${
        !isUserActive ? "bg-gray-50/50 opacity-70" : ""
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <Link
          to={`/employees/${user.id}`}
          className="hover:opacity-80 transition-opacity shrink-0"
          title="Xem chi tiết"
        >
          <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-800 shrink-0 border border-orange-200">
            {user.image ? (
              <img
                src={user.image}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              user.name?.[0] || "?"
            )}
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-medium flex items-center gap-2 flex-wrap">
            <input
              className={`bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none focus:ring-0 max-w-full sm:w-[200px] text-base sm:text-sm transition-colors ${
                !isUserActive ? "text-gray-500 italic line-through" : ""
              }`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleUpdateName}
              placeholder="Tên nhân viên"
              disabled={!isUserActive}
            />
            {user.role === "ADMIN" && (
              <span className="text-[10px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                <span>🛡️</span> ADMIN
              </span>
            )}
            {user.role === "PARTNER" && (
              <span className="text-[10px] bg-purple-600 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                <span>💼</span> ĐỐI TÁC WFH
              </span>
            )}
            {(!user.role || user.role === "USER") && (
              <span className="text-[10px] bg-sky-500 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                <span>🏪</span> NHÂN VIÊN
              </span>
            )}
            {!isUserActive && (
              <span className="text-[10px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded shrink-0">
                ĐÃ NGHỈ VIỆC
              </span>
            )}
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground truncate">
            {user.email}
          </div>
          <div className="mt-1">
            <select
              className="text-base sm:text-xs border rounded p-1 min-h-[32px] bg-white"
              value={user.employmentType || "PART_TIME"}
              onChange={handleEmploymentTypeChange}
              disabled={!isUserActive || loading}
            >
              <option value="PART_TIME">Part Time</option>
              <option value="FULL_TIME">Full Time</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto pt-2.5 md:pt-0 border-t md:border-t-0">
        <div className="flex items-center justify-between sm:justify-start gap-2 text-xs sm:text-sm bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-md border sm:border-0 w-full sm:w-auto">
          {user.employmentType === "FULL_TIME" ? (
            <>
              <span className="text-muted-foreground font-medium sm:font-normal shrink-0">
                Lương cứng:
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className="w-28 sm:w-28 h-9 min-h-[36px] rounded border px-2 text-base sm:text-sm text-right bg-white focus:ring-1 focus:ring-emerald-500 outline-none"
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value)}
                  onBlur={handleUpdateMonthlySalary}
                  disabled={!isUserActive}
                />
                <span className="text-xs text-muted-foreground">đ</span>
              </div>
            </>
          ) : (
            <>
              <span className="text-muted-foreground font-medium sm:font-normal shrink-0">
                Lương/h:
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className="w-24 sm:w-24 h-9 min-h-[36px] rounded border px-2 text-base sm:text-sm text-right bg-white focus:ring-1 focus:ring-emerald-500 outline-none"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  onBlur={handleUpdateRate}
                  disabled={!isUserActive}
                />
                <span className="text-xs text-muted-foreground">đ/h</span>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          <select
            value={user.role || "USER"}
            onChange={handleRoleChange}
            disabled={!isUserActive || loading}
            className={`text-xs font-semibold rounded-md px-2.5 py-1.5 h-9 min-h-[36px] border outline-none cursor-pointer transition-colors flex-1 sm:flex-none ${
              user.role === "ADMIN"
                ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                : user.role === "PARTNER"
                ? "bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100"
                : "bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100"
            }`}
            title="Chỉ định vai trò nhân viên"
          >
            <option value="USER">🏪 Nhân viên tiệm (USER)</option>
            <option value="PARTNER">💼 Đối tác WFH (PARTNER)</option>
            <option value="ADMIN">🛡️ Quản trị viên (ADMIN)</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleActiveStatus}
            className={`text-xs h-9 min-h-[36px] flex-1 sm:flex-none ${
              !isUserActive
                ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                : "border-amber-200 text-amber-700 hover:bg-amber-50"
            }`}
            disabled={loading}
          >
            {!isUserActive ? "Đi làm lại" : "Cho nghỉ"}
          </Button>

          <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 min-h-[36px] min-w-[36px] text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              title="Chỉnh sửa ngày đặc biệt"
              onClick={() => onOpenEditDates?.(user)}
              disabled={!isUserActive}
            >
              <span className="text-base sm:text-xl">📅</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 min-h-[36px] min-w-[36px] text-red-500 hover:text-red-700 hover:bg-red-50"
              title="Xóa nhân viên"
              onClick={() => onOpenDelete?.(user)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
