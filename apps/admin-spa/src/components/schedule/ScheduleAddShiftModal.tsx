import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminSchedulePageStore } from "@/stores/useAdminSchedulePageStore";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ScheduleAddShiftModalProps {
  employees: any[];
  onSuccess?: () => void;
}

export function ScheduleAddShiftModal({
  employees,
  onSuccess,
}: ScheduleAddShiftModalProps) {
  const {
    isAddModalOpen,
    closeAddModal,
    setIsAddModalOpen,
    selectedUserId,
    setSelectedUserId,
    selectedDate,
    setSelectedDate,
    shiftPreset,
    setShiftPreset,
    isSubmitting,
    setIsSubmitting,
    resetAddForm,
  } = useAdminSchedulePageStore();

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      toast.error("Vui lòng chọn nhân viên");
      return;
    }
    if (!selectedDate) {
      toast.error("Vui lòng chọn ngày");
      return;
    }

    setIsSubmitting(true);
    try {
      let startHour = 8;
      let startMin = 0;
      let endHour = 12;
      let endMin = 0;

      if (shiftPreset === "AFTERNOON") {
        startHour = 13;
        startMin = 0;
        endHour = 17;
        endMin = 0;
      } else if (shiftPreset === "EVENING") {
        startHour = 17;
        startMin = 30;
        endHour = 21;
        endMin = 30;
      } else if (shiftPreset === "FULL") {
        startHour = 8;
        startMin = 30;
        endHour = 17;
        endMin = 30;
      }

      const start = new Date(
        `${selectedDate}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00+07:00`
      ).toISOString();
      const end = new Date(
        `${selectedDate}T${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00+07:00`
      ).toISOString();

      await api.post("/api/admin/schedule", {
        userId: selectedUserId,
        start,
        end,
        shiftType: shiftPreset,
      });

      toast.success("Đã thêm ca trực thành công!");
      closeAddModal();
      resetAddForm();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "Không thể tạo ca trực");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Thêm Ca Trực Thủ Công</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCreateShift} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Chọn nhân sự</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhân viên" />
              </SelectTrigger>
              <SelectContent>
                {(Array.isArray(employees) ? employees : []).map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} ({emp.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ngày làm việc</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Ca trực</Label>
            <Select value={shiftPreset} onValueChange={setShiftPreset}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn khung giờ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">
                  Ca Sáng (08:00 - 12:00)
                </SelectItem>
                <SelectItem value="AFTERNOON">
                  Ca Chiều (13:00 - 17:00)
                </SelectItem>
                <SelectItem value="EVENING">
                  Ca Tối (17:30 - 21:30)
                </SelectItem>
                <SelectItem value="FULL">
                  Cả ngày (08:30 - 17:30)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeAddModal}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? "Đang lưu..." : "Xác nhận tạo ca"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleAddShiftModal;
