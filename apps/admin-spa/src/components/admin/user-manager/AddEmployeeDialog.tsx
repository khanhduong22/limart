import React, { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface AddEmployeeDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function AddEmployeeDialog({
  open,
  onClose,
  onCreated,
}: AddEmployeeDialogProps) {
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
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
