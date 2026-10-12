import React, { useState, useEffect } from "react";
import { Sparkles, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStaffTasksStore } from "@/stores/useAdminStaffTasksStore";
import { toast } from "sonner";

export interface TaskDefinitionFormData {
  name: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "ONCE";
  targetRoles: string;
  kpiWeight: number;
  baseReward?: number;
  unit?: string;
}

export interface CreateTaskDefinitionDialogProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSave?: (data: TaskDefinitionFormData) => Promise<void> | void;
  isSubmitting?: boolean;
}

export function CreateTaskDefinitionDialog({
  isOpen: propIsOpen,
  onClose: propOnClose,
  onSave,
  isSubmitting = false,
}: CreateTaskDefinitionDialogProps) {
  const {
    isCreateDefinitionOpen,
    closeCreateDefinition,
    editingDefinition,
  } = useAdminStaffTasksStore();

  const isOpen = propIsOpen !== undefined ? propIsOpen : isCreateDefinitionOpen;

  const [form, setForm] = useState<TaskDefinitionFormData>({
    name: "",
    description: "",
    priority: "MEDIUM",
    frequency: "DAILY",
    targetRoles: "STAFF",
    kpiWeight: 1.0,
    baseReward: 0,
    unit: "nhiệm vụ",
  });

  useEffect(() => {
    if (editingDefinition) {
      setForm({
        name: editingDefinition.name || "",
        description: editingDefinition.description || "",
        priority: editingDefinition.priority || "MEDIUM",
        frequency: editingDefinition.frequency || "DAILY",
        targetRoles: editingDefinition.targetRoles || "STAFF",
        kpiWeight: editingDefinition.kpiWeight ?? 1.0,
        baseReward: editingDefinition.baseReward ?? 0,
        unit: editingDefinition.unit || "nhiệm vụ",
      });
    } else {
      setForm({
        name: "",
        description: "",
        priority: "MEDIUM",
        frequency: "DAILY",
        targetRoles: "STAFF",
        kpiWeight: 1.0,
        baseReward: 0,
        unit: "nhiệm vụ",
      });
    }
  }, [editingDefinition, isOpen]);

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      closeCreateDefinition();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên định mức nhiệm vụ");
      return;
    }

    try {
      if (onSave) {
        await onSave({
          ...form,
          name: form.name.trim(),
          description: form.description?.trim() || undefined,
          kpiWeight: Number(form.kpiWeight) || 1.0,
          baseReward: Number(form.baseReward) || 0,
          unit: form.unit?.trim() || "nhiệm vụ",
        });
      } else {
        toast.success(
          editingDefinition ? "Cập nhật định mức thành công!" : "Tạo định mức nhiệm vụ thành công!"
        );
      }
      handleClose();
    } catch {
      // Handled by parent
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              {editingDefinition ? "Chỉnh sửa định mức nhiệm vụ" : "Thêm định mức nhiệm vụ mới"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Thiết lập chuẩn công việc, chu kỳ thực hiện, vai trò áp dụng và trọng số tính KPI.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs sm:text-sm">
            {/* Task Name */}
            <div className="space-y-1">
              <Label htmlFor="def-name" className="text-xs font-semibold text-slate-700">
                Tên định mức nhiệm vụ <span className="text-red-500">*</span>
              </Label>
              <Input
                id="def-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Đăng bài Fanpage, Kiểm kho cuối ca, Livestream..."
                className="bg-white border-slate-200"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label htmlFor="def-desc" className="text-xs font-semibold text-slate-700">
                Mô tả tiêu chuẩn thực hiện
              </Label>
              <Textarea
                id="def-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Yêu cầu cụ thể, hình ảnh hoặc link cần đính kèm..."
                rows={3}
                className="bg-white border-slate-200 text-xs"
              />
            </div>

            {/* Priority & Frequency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="def-priority" className="text-xs font-semibold text-slate-700">
                  Độ ưu tiên
                </Label>
                <select
                  id="def-priority"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      priority: e.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
                    })
                  }
                  className="w-full border rounded-lg p-2 bg-slate-50 border-slate-200 text-xs font-medium"
                >
                  <option value="LOW">Thấp (Low)</option>
                  <option value="MEDIUM">Trung bình (Medium)</option>
                  <option value="HIGH">Cao (High)</option>
                  <option value="URGENT">Khẩn cấp (Urgent)</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="def-freq" className="text-xs font-semibold text-slate-700">
                  Chu kỳ lặp lại
                </Label>
                <select
                  id="def-freq"
                  value={form.frequency}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      frequency: e.target.value as "DAILY" | "WEEKLY" | "MONTHLY" | "ONCE",
                    })
                  }
                  className="w-full border rounded-lg p-2 bg-slate-50 border-slate-200 text-xs font-medium"
                >
                  <option value="DAILY">Hàng ngày</option>
                  <option value="WEEKLY">Hàng tuần</option>
                  <option value="MONTHLY">Hàng tháng</option>
                  <option value="ONCE">Một lần</option>
                </select>
              </div>
            </div>

            {/* Target Roles & KPI Weight */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="def-role" className="text-xs font-semibold text-slate-700">
                  Vai trò áp dụng
                </Label>
                <select
                  id="def-role"
                  value={form.targetRoles}
                  onChange={(e) => setForm({ ...form, targetRoles: e.target.value })}
                  className="w-full border rounded-lg p-2 bg-slate-50 border-slate-200 text-xs font-medium"
                >
                  <option value="STAFF">Nhân viên (Staff)</option>
                  <option value="PARTNER">Đối tác / Cộng tác viên (Partner)</option>
                  <option value="ALL">Tất cả nhân sự</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="def-weight" className="text-xs font-semibold text-slate-700">
                  Trọng số KPI
                </Label>
                <Input
                  id="def-weight"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={form.kpiWeight}
                  onChange={(e) => setForm({ ...form, kpiWeight: parseFloat(e.target.value) || 1.0 })}
                  className="bg-white border-slate-200 text-xs"
                />
              </div>
            </div>

            {/* Optional Unit and Base Reward */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div className="space-y-1">
                <Label htmlFor="def-unit" className="text-[11px] font-medium text-slate-500">
                  Đơn vị tính (nếu có)
                </Label>
                <Input
                  id="def-unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="nhiệm vụ, bài, video..."
                  className="bg-white border-slate-200 text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="def-reward" className="text-[11px] font-medium text-slate-500">
                  Đơn giá thưởng VND (nếu có)
                </Label>
                <Input
                  id="def-reward"
                  type="number"
                  min="0"
                  value={form.baseReward}
                  onChange={(e) => setForm({ ...form, baseReward: Number(e.target.value) || 0 })}
                  className="bg-white border-slate-200 text-xs h-8 font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Đang lưu..." : editingDefinition ? "Cập nhật" : "Tạo định mức"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
