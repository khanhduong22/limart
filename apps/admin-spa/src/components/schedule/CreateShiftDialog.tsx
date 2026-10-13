import React from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useScheduleStore } from '@/stores/useScheduleStore';

interface CreateShiftDialogProps {
  isAdmin: boolean;
  users?: any[];
  onConfirmRegister: () => Promise<void>;
}

// Generate dropdown time options (07:00 - 23:59)
const timeOptions: string[] = [];
for (let h = 7; h <= 23; h++) {
  const hStr = h.toString().padStart(2, '0');
  timeOptions.push(`${hStr}:00`);
  if (h !== 23) {
    timeOptions.push(`${hStr}:30`);
  }
}
timeOptions.push('23:59');

export default function CreateShiftDialog({
  isAdmin,
  users = [],
  onConfirmRegister,
}: CreateShiftDialogProps) {
  const {
    modalOpen,
    setModalOpen,
    pendingEvent,
    setPendingEvent,
    targetUserId,
    setTargetUserId,
    isSeniorRegister,
    setIsSeniorRegister,
  } = useScheduleStore();

  const handleStartTimeChange = (val: string) => {
    if (!pendingEvent) return;
    const [h, m] = val.split(':').map(Number);
    const newStart = new Date(pendingEvent.start);
    newStart.setHours(h, m, 0, 0);

    let newEnd = new Date(pendingEvent.end);
    if (newEnd <= newStart) {
      newEnd = new Date(newStart.getTime() + 4 * 60 * 60 * 1000);
    }
    setPendingEvent({ start: newStart, end: newEnd });
  };

  const handleEndTimeChange = (val: string) => {
    if (!pendingEvent) return;
    const [h, m] = val.split(':').map(Number);
    const newEnd = new Date(pendingEvent.end);
    newEnd.setHours(h, m, 0, 0);
    setPendingEvent({ start: pendingEvent.start, end: newEnd });
  };

  return (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DialogContent className="max-w-[400px] rounded-xl">
        <DialogHeader>
          <DialogTitle>Xác nhận đăng ký ca làm</DialogTitle>
          <DialogDescription>
            Bạn muốn đăng ký làm việc vào ngày{' '}
            {pendingEvent && format(new Date(pendingEvent.start), 'dd/MM/yyyy')}. Điều
            chỉnh khung giờ bên dưới:
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500">
                Giờ bắt đầu
              </Label>
              <select
                value={
                  pendingEvent ? format(new Date(pendingEvent.start), 'HH:mm') : '08:00'
                }
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {timeOptions.map((t) => (
                  <option key={`start-${t}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500">
                Giờ kết thúc
              </Label>
              <select
                value={
                  pendingEvent ? format(new Date(pendingEvent.end), 'HH:mm') : '12:00'
                }
                onChange={(e) => handleEndTimeChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {timeOptions.map((t) => (
                  <option key={`end-${t}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 italic">
            * Ca làm việc phải tối thiểu 4 tiếng.
          </div>
        </div>

        {isAdmin && users && users.length > 0 && (
          <div className="pb-2 space-y-3">
            <div className="space-y-1.5">
              <Label className="block text-sm font-medium">
                Chọn nhân viên (Quyền Admin)
              </Label>
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Chọn nhân viên
                </option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.nickname || u.name || u.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg">
              <div className="space-y-0.5">
                <Label
                  htmlFor="register-senior-switch"
                  className="text-xs font-bold text-amber-950 cursor-pointer flex items-center gap-1 select-none"
                >
                  👑 Đặt làm Trưởng ca (+3k/h)
                </Label>
                <p className="text-[11px] text-amber-800/80">
                  Gán làm Trưởng ca hôm đó, lương được cộng thêm 3.000đ/giờ
                </p>
              </div>
              <Switch
                id="register-senior-switch"
                checked={isSeniorRegister}
                onCheckedChange={setIsSeniorRegister}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-row justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>
            Hủy
          </Button>
          <Button
            onClick={onConfirmRegister}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            Đăng ký ngay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
