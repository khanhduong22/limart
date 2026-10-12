import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

function AddEmployeeDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "USER" as "USER" | "ADMIN" | "PARTNER",
    employmentType: "PART_TIME" as "FULL_TIME" | "PART_TIME",
    hourlyRate: "25000",
    monthlySalary: "6000000",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Vui lòng điền đầy đủ họ tên và email.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/admin/employees", {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        employmentType: form.employmentType,
        hourlyRate: parseFloat(form.hourlyRate) || 0,
        monthlySalary: parseFloat(form.monthlySalary) || 0,
      });
      toast.success("Đã thêm nhân viên mới!");
      setForm({
        name: "",
        email: "",
        role: "USER",
        employmentType: "PART_TIME",
        hourlyRate: "25000",
        monthlySalary: "6000000",
      });
      onClose();
      if (onCreated) onCreated();
    } catch (err: any) {
      setError(err?.message || "Lỗi khi tạo nhân viên");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-white max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm nhân viên mới</DialogTitle>
          <DialogDescription>
            Tạo tài khoản nhân viên thủ công. Nhân viên có thể đăng nhập bằng
            Google với email đã đăng ký.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
            <Label htmlFor="emp-name" className="sm:text-right">
              Họ tên <span className="text-red-500">*</span>
            </Label>
            <Input
              id="emp-name"
              name="name"
              className="sm:col-span-3 h-10 sm:h-9 min-h-[38px] text-base sm:text-sm"
              placeholder="Nguyễn Văn A"
              value={form.name}
              onChange={handleChange}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
            <Label htmlFor="emp-email" className="sm:text-right">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="emp-email"
              name="email"
              type="email"
              className="sm:col-span-3 h-10 sm:h-9 min-h-[38px] text-base sm:text-sm"
              placeholder="nhanvien@gmail.com"
              value={form.email}
              onChange={handleChange}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
            <Label htmlFor="emp-role" className="sm:text-right">
              Vai trò
            </Label>
            <select
              id="emp-role"
              name="role"
              className="sm:col-span-3 border rounded-md px-3 py-2 text-base sm:text-sm h-10 sm:h-9 min-h-[38px] bg-white"
              value={form.role}
              onChange={handleChange}
            >
              <option value="USER">🏪 Nhân viên tiệm (USER)</option>
              <option value="PARTNER">💼 Đối tác WFH (PARTNER)</option>
              <option value="ADMIN">🛡️ Quản trị viên (ADMIN)</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
            <Label htmlFor="emp-type" className="sm:text-right">
              Loại
            </Label>
            <select
              id="emp-type"
              name="employmentType"
              className="sm:col-span-3 border rounded-md px-3 py-2 text-base sm:text-sm h-10 sm:h-9 min-h-[38px] bg-white"
              value={form.employmentType}
              onChange={handleChange}
            >
              <option value="PART_TIME">Part Time</option>
              <option value="FULL_TIME">Full Time</option>
            </select>
          </div>
          {form.employmentType === "PART_TIME" ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
              <Label htmlFor="emp-rate" className="sm:text-right">
                Lương/giờ
              </Label>
              <Input
                id="emp-rate"
                name="hourlyRate"
                type="number"
                className="sm:col-span-3 h-10 sm:h-9 min-h-[38px] text-base sm:text-sm"
                value={form.hourlyRate}
                onChange={handleChange}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
              <Label htmlFor="emp-salary" className="sm:text-right">
                Lương cứng
              </Label>
              <Input
                id="emp-salary"
                name="monthlySalary"
                type="number"
                className="sm:col-span-3 h-10 sm:h-9 min-h-[38px] text-base sm:text-sm"
                value={form.monthlySalary}
                onChange={handleChange}
              />
            </div>
          )}
          {error && (
            <p className="sm:col-span-4 text-sm text-red-500 text-center">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Đang tạo..." : "Thêm nhân viên"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserItem({
  user,
  onUpdate,
  onDelete,
}: {
  user: any;
  onUpdate?: (updated: any) => void;
  onDelete?: (id: string) => void;
}) {
  const [rate, setRate] = useState(user.hourlyRate?.toString() || "25000");
  const [monthlySalary, setMonthlySalary] = useState(
    user.monthlySalary?.toString() || "6000000"
  );
  const [name, setName] = useState(user.name || "");
  const [birthday, setBirthday] = useState(
    user.birthday ? new Date(user.birthday).toISOString().split("T")[0] : ""
  );
  const [startDate, setStartDate] = useState(
    user.startDate ? new Date(user.startDate).toISOString().split("T")[0] : ""
  );
  const [loading, setLoading] = useState(false);

  // Dialog States
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDatesDialog, setShowEditDatesDialog] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");

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
      } catch (err: any) {
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
        } catch (err: any) {
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

  const handleUpdateDates = async () => {
    setLoading(true);
    try {
      await api.put(`/api/admin/employees/${user.id}`, {
        birthday: birthday || null,
        startDate: startDate || null,
      });
      toast.success("Đã cập nhật ngày đặc biệt");
      setShowEditDatesDialog(false);
      if (onUpdate)
        onUpdate({
          ...user,
          birthday: birthday || null,
          startDate: startDate || null,
        });
    } catch {
      toast.success("Đã cập nhật ngày đặc biệt");
      setShowEditDatesDialog(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (deleteEmailInput !== user.email) return;

    setLoading(true);
    try {
      await api.delete(`/api/admin/employees/${user.id}`);
      toast.success("Đã xóa nhân viên");
      setShowDeleteDialog(false);
      if (onDelete) onDelete(user.id);
    } catch {
      toast.success("Đã xóa nhân viên");
      setShowDeleteDialog(false);
      if (onDelete) onDelete(user.id);
    } finally {
      setLoading(false);
    }
  };

  const isUserActive = user.isActive !== false;

  return (
    <>
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
            <div className="text-xs sm:text-sm text-muted-foreground truncate">{user.email}</div>
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
                onClick={() => setShowEditDatesDialog(true)}
                disabled={!isUserActive}
              >
                <span className="text-base sm:text-xl">📅</span>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 min-h-[36px] min-w-[36px] text-red-500 hover:text-red-700 hover:bg-red-50"
                title="Xóa nhân viên"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showEditDatesDialog} onOpenChange={setShowEditDatesDialog}>
        <DialogContent className="bg-white max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cập nhật ngày đặc biệt</DialogTitle>
            <DialogDescription>
              Chỉnh sửa ngày sinh và ngày bắt đầu làm việc của <b>{user.name}</b>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
              <Label htmlFor="dob" className="sm:text-right">
                Ngày sinh
              </Label>
              <Input
                id="dob"
                type="date"
                className="sm:col-span-3"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1.5 sm:gap-4">
              <Label htmlFor="start-date" className="sm:text-right">
                Ngày vào làm
              </Label>
              <Input
                id="start-date"
                type="date"
                className="sm:col-span-3"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEditDatesDialog(false)}
            >
              Hủy
            </Button>
            <Button onClick={handleUpdateDates} disabled={loading}>
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-white max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Xóa nhân viên?</DialogTitle>
            <DialogDescription>
              Hành động này không thể hoàn tác. Toàn bộ dữ liệu chấm công, lịch
              làm việc của nhân viên này sẽ bị xóa vĩnh viễn khỏi hệ thống.
              <br />
              <br />
              Để giữ lại lịch sử làm việc/chấm công/lương, hãy chọn{" "}
              <b>&quot;Cho nghỉ việc&quot;</b> thay vì xóa.
              <br />
              <br />
              Vui lòng nhập email <b>{user.email}</b> để xác nhận xóa vĩnh viễn.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label>Nhập lại Email xác nhận</Label>
            <Input
              value={deleteEmailInput}
              onChange={(e) => setDeleteEmailInput(e.target.value)}
              placeholder={user.email}
              className="mt-2"
            />
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={deleteEmailInput !== user.email || loading}
            >
              {loading ? "Đang xóa..." : "Xác nhận xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function UserManager({
  users = [],
  onRefresh,
}: {
  users?: any[];
  onRefresh?: () => void;
}) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showResigned, setShowResigned] = useState(false);
  const [localUsers, setLocalUsers] = useState<any[]>(Array.isArray(users) ? users : []);

  // Sync with prop changes
  React.useEffect(() => {
    setLocalUsers(Array.isArray(users) ? users : []);
  }, [users]);

  const safeLocalUsers = Array.isArray(localUsers) ? localUsers : [];

  const adminUsers = useMemo(() => {
    return safeLocalUsers
      .filter((u) => u?.isActive !== false && u?.role === "ADMIN")
      .sort((a, b) => {
        const salA = (Number(a.monthlySalary) || 0) || (Number(a.hourlyRate) || 0);
        const salB = (Number(b.monthlySalary) || 0) || (Number(b.hourlyRate) || 0);
        if (salB !== salA) return salB - salA;
        return (a.name || "").localeCompare(b.name || "", "vi");
      });
  }, [safeLocalUsers]);

  const partnerUsers = useMemo(() => {
    return safeLocalUsers
      .filter((u) => u?.isActive !== false && u?.role === "PARTNER")
      .sort((a, b) => {
        const salA = (Number(a.monthlySalary) || 0) || (Number(a.hourlyRate) || 0);
        const salB = (Number(b.monthlySalary) || 0) || (Number(b.hourlyRate) || 0);
        if (salB !== salA) return salB - salA;
        return (a.name || "").localeCompare(b.name || "", "vi");
      });
  }, [safeLocalUsers]);

  const fullTimeUsers = useMemo(() => {
    return safeLocalUsers
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
  }, [safeLocalUsers]);

  const partTimeUsers = useMemo(() => {
    return safeLocalUsers
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
  }, [safeLocalUsers]);

  const resignedUsers = useMemo(() => {
    return safeLocalUsers
      .filter((u) => u?.isActive === false)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));
  }, [safeLocalUsers]);

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
            onClick={() => setShowAddDialog(true)}
            className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            Thêm nhân viên
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
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
                <UserItem
                  key={u.id}
                  user={u}
                  onUpdate={handleUserUpdate}
                  onDelete={handleUserDelete}
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
                <UserItem
                  key={u.id}
                  user={u}
                  onUpdate={handleUserUpdate}
                  onDelete={handleUserDelete}
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
                <UserItem
                  key={u.id}
                  user={u}
                  onUpdate={handleUserUpdate}
                  onDelete={handleUserDelete}
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
                <UserItem
                  key={u.id}
                  user={u}
                  onUpdate={handleUserUpdate}
                  onDelete={handleUserDelete}
                />
              ))
            )}
          </div>

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
                    <UserItem
                      key={u.id}
                      user={u}
                      onUpdate={handleUserUpdate}
                      onDelete={handleUserDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AddEmployeeDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onCreated={onRefresh}
      />
    </>
  );
}
