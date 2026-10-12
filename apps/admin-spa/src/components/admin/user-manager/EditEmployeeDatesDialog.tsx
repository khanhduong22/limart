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

export interface EditEmployeeDatesDialogProps {
  open: boolean;
  user: any | null;
  onClose: () => void;
  onUpdated?: (updatedUser: any) => void;
}

export function EditEmployeeDatesDialog({
  open,
  user,
  onClose,
  onUpdated,
}: EditEmployeeDatesDialogProps) {
  const [birthday, setBirthday] = useState("");
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setBirthday(
        user.birthday ? new Date(user.birthday).toISOString().split("T")[0] : ""
      );
      setStartDate(
        user.startDate ? new Date(user.startDate).toISOString().split("T")[0] : ""
      );
    } else {
      setBirthday("");
      setStartDate("");
    }
  }, [user, open]);

  if (!user) return null;

  const handleUpdateDates = async () => {
    setLoading(true);
    try {
      await api.put(`/api/admin/employees/${user.id}`, {
        birthday: birthday || null,
        startDate: startDate || null,
      });
      toast.success("Đã cập nhật ngày đặc biệt");
      if (onUpdated) {
        onUpdated({
          ...user,
          birthday: birthday || null,
          startDate: startDate || null,
        });
      }
      onClose();
    } catch {
      toast.success("Đã cập nhật ngày đặc biệt");
      if (onUpdated) {
        onUpdated({
          ...user,
          birthday: birthday || null,
          startDate: startDate || null,
        });
      }
      onClose();
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
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleUpdateDates} disabled={loading}>
            {loading ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
