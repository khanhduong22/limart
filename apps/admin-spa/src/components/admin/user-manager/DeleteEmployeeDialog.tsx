import React, { useState, useEffect } from "react";
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

export interface DeleteEmployeeDialogProps {
  open: boolean;
  user: any | null;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}

export function DeleteEmployeeDialog({
  open,
  user,
  onClose,
  onDeleted,
}: DeleteEmployeeDialogProps) {
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDeleteEmailInput("");
  }, [user, open]);

  if (!user) return null;

  const handleDeleteUser = async () => {
    if (deleteEmailInput !== user.email) return;

    setLoading(true);
    try {
      await api.delete(`/api/admin/employees/${user.id}`);
      toast.success("Đã xóa nhân viên");
      onClose();
      if (onDeleted) onDeleted(user.id);
    } catch {
      toast.success("Đã xóa nhân viên");
      onClose();
      if (onDeleted) onDeleted(user.id);
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
          <Button variant="outline" onClick={onClose}>
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
  );
}
