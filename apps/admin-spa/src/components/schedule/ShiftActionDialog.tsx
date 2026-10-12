import React, { useState, useEffect } from 'react';
import moment from 'moment';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ListTodo, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { isShiftLocked } from '@/lib/schedule-lock';
import { useScheduleStore } from '@/stores/useScheduleStore';
import type { CalendarEvent, ShiftDutyItem } from './types';

interface ShiftActionDialogProps {
  isAdmin: boolean;
  userId: string;
  events: CalendarEvent[];
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  onEventsChange?: () => void;
}

export default function ShiftActionDialog({
  isAdmin,
  userId,
  events,
  setEvents,
  onEventsChange,
}: ShiftActionDialogProps) {
  const {
    actionModalOpen,
    setActionModalOpen,
    selectedEvent,
    setSelectedEvent,
    showAddShiftTask,
    setShowAddShiftTask,
  } = useScheduleStore();

  const [togglingSenior, setTogglingSenior] = useState(false);
  const [shiftTasks, setShiftTasks] = useState<ShiftDutyItem[]>([]);
  const [loadingShiftTasks, setLoadingShiftTasks] = useState(false);
  const [newShiftTaskTitle, setNewShiftTaskTitle] = useState('');
  const [newShiftTaskDesc, setNewShiftTaskDesc] = useState('');
  const [savingShiftTask, setSavingShiftTask] = useState(false);

  // Fetch shift duties when modal opens for an admin
  useEffect(() => {
    if (!actionModalOpen || !selectedEvent || !isAdmin) {
      setShiftTasks([]);
      setShowAddShiftTask(false);
      setNewShiftTaskTitle('');
      setNewShiftTaskDesc('');
      return;
    }

    setLoadingShiftTasks(true);
    api
      .get<any>(`/api/admin/schedule/${selectedEvent.id}/duties`)
      .then((res) => {
        const duties = res?.data || (Array.isArray(res) ? res : []);
        setShiftTasks(duties);
      })
      .catch((err) => console.error('Error loading shift duties:', err))
      .finally(() => setLoadingShiftTasks(false));
  }, [actionModalOpen, selectedEvent, isAdmin, setShowAddShiftTask]);

  const handleCreateShiftTask = async () => {
    if (!newShiftTaskTitle.trim()) {
      toast.error('Vui lòng nhập tên công việc');
      return;
    }
    if (!selectedEvent) return;
    const targetId = selectedEvent.resource?.userId || userId;
    setSavingShiftTask(true);
    try {
      const res: any = await api.post('/api/admin/schedule/duties', {
        title: newShiftTaskTitle.trim(),
        description: newShiftTaskDesc.trim() || null,
        userId: targetId,
        shiftId: Number(selectedEvent.id),
        date: new Date(selectedEvent.start).toISOString(),
      });
      if (res.success && res.data) {
        toast.success('Đã giao nhiệm vụ cho ca làm!');
        const newDuty = res.data;
        setShiftTasks((prev) => [...prev, newDuty]);
        setEvents((prev) =>
          prev.map((ev) => {
            if (ev.id === selectedEvent.id) {
              const curDuties = ev.duties || ev.resource?.duties || [];
              const nextDuties = [...curDuties, newDuty];
              return {
                ...ev,
                duties: nextDuties,
                resource: { ...ev.resource, duties: nextDuties },
              };
            }
            return ev;
          })
        );
        setNewShiftTaskTitle('');
        setNewShiftTaskDesc('');
        setShowAddShiftTask(false);
        if (onEventsChange) onEventsChange();
      } else {
        toast.error(res.error || 'Lỗi khi giao việc');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi giao việc');
    } finally {
      setSavingShiftTask(false);
    }
  };

  const handleDeleteShiftTask = async (dutyId: string, dutyTitle: string) => {
    if (
      !confirm(
        `Bạn có chắc muốn xóa nhiệm vụ "${dutyTitle}" không? (Dành cho Admin khi giao nhầm việc)`
      )
    )
      return;
    try {
      const res: any = await api.delete(`/api/admin/schedule/duties/${dutyId}`);
      if (res.success) {
        toast.success('Đã xóa nhiệm vụ!');
        setShiftTasks((prev) => prev.filter((t) => t.id !== dutyId));
        setEvents((prev) =>
          prev.map((ev) => {
            const curDuties = ev.duties || ev.resource?.duties || [];
            if (curDuties.some((d: any) => d.id === dutyId)) {
              const nextDuties = curDuties.filter((d: any) => d.id !== dutyId);
              return {
                ...ev,
                duties: nextDuties,
                resource: { ...ev.resource, duties: nextDuties },
              };
            }
            return ev;
          })
        );
        if (onEventsChange) onEventsChange();
      } else {
        toast.error(res.error || 'Lỗi khi xóa nhiệm vụ');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi xóa nhiệm vụ');
    }
  };

  const handleToggleSenior = async () => {
    if (!selectedEvent) return;
    const currentIsSenior = Boolean(
      selectedEvent.isSenior || selectedEvent.resource?.isSenior
    );
    const nextSenior = !currentIsSenior;
    setTogglingSenior(true);
    try {
      const res: any = await api.patch(
        `/api/admin/schedule/${selectedEvent.id}/senior`,
        { isSenior: nextSenior }
      );
      if (res.success) {
        toast.success(res.message);
        setEvents((prev) =>
          prev.map((ev) => {
            if (ev.id === selectedEvent.id) {
              return {
                ...ev,
                isSenior: nextSenior,
                resource: { ...ev.resource, isSenior: nextSenior },
              };
            }
            if (nextSenior && res.unsetShiftIds?.includes(ev.id)) {
              return {
                ...ev,
                isSenior: false,
                resource: { ...ev.resource, isSenior: false },
              };
            }
            return ev;
          })
        );
        setSelectedEvent({
          ...selectedEvent,
          isSenior: nextSenior,
          resource: { ...selectedEvent.resource, isSenior: nextSenior },
        });
        if (onEventsChange) onEventsChange();
      } else {
        toast.error(res.error || 'Lỗi khi cập nhật Trưởng ca');
      }
    } catch (err: any) {
      console.error('Error toggling senior:', err);
      toast.error('Lỗi mạng hoặc hệ thống khi cập nhật');
    } finally {
      setTogglingSenior(false);
    }
  };

  const handleToggleSwap = async () => {
    if (!selectedEvent) return;
    setActionModalOpen(false);
    try {
      const res: any = await api.post(
        `/api/admin/schedule/${selectedEvent.id}/swap`,
        { isOpen: !selectedEvent.resource?.isOpenForSwap }
      );
      if (res.success) {
        toast.success(res.message || 'Đã cập nhật trạng thái đổi ca');
        setEvents((prev) =>
          prev.map((e) =>
            e.id === selectedEvent.id
              ? {
                  ...e,
                  title: selectedEvent.resource?.isOpenForSwap
                    ? e.title.replace('🔄 Đổi ca: ', '')
                    : e.title.startsWith('🔄')
                    ? e.title
                    : `🔄 Đổi ca: ${e.title}`,
                  resource: {
                    ...e.resource,
                    isOpenForSwap: !selectedEvent.resource?.isOpenForSwap,
                  },
                }
              : e
          )
        );
        if (onEventsChange) onEventsChange();
      } else {
        toast.error(res.message || 'Lỗi hệ thống');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi hệ thống');
    }
  };

  const handleDeleteShift = async () => {
    if (!selectedEvent) return;
    if (confirm('Bạn có chắc chắn muốn xóa ca làm này?')) {
      setActionModalOpen(false);
      try {
        const res: any = await api.delete(
          `/api/admin/schedule/${selectedEvent.id}`
        );
        if (res.success) {
          toast.success('Đã xóa lịch làm việc');
          setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id));
          if (onEventsChange) onEventsChange();
        } else {
          toast.error(res.error || 'Không thể xóa lịch này');
        }
      } catch (err: any) {
        toast.error(err?.message || 'Không thể xóa lịch này');
      }
    }
  };

  const handleTakeShift = async () => {
    if (!selectedEvent) return;
    setActionModalOpen(false);
    try {
      const res: any = await api.post(
        `/api/admin/schedule/${selectedEvent.id}/take`
      );
      if (res.success) {
        toast.success(res.message || 'Đã nhận ca thành công!');
        setEvents((prev) =>
          prev.map((e) =>
            e.id === selectedEvent.id
              ? {
                  ...e,
                  title: e.resource?.title || 'Staff',
                  isOwner: true,
                  resource: {
                    ...e.resource,
                    userId: userId,
                    isOpenForSwap: false,
                  },
                }
              : e
          )
        );
        if (onEventsChange) onEventsChange();
      } else {
        toast.error(res.message || 'Lỗi khi nhận ca');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi nhận ca');
    }
  };

  return (
    <Dialog open={actionModalOpen} onOpenChange={setActionModalOpen}>
      <DialogContent className="max-w-[480px] max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {isAdmin
              ? `Quản lý ca làm: ${selectedEvent?.title}`
              : selectedEvent?.isOwner
              ? 'Quản lý ca làm việc của bạn'
              : 'Nhận ca làm từ đồng nghiệp'}
          </DialogTitle>
          <DialogDescription>
            {selectedEvent && (
              <>
                Khung giờ:{' '}
                <span className="font-bold text-emerald-600 block text-lg my-1">
                  {moment(selectedEvent.start).format('HH:mm')} -{' '}
                  {moment(selectedEvent.end).format('HH:mm')}
                </span>
                Ngày:{' '}
                <span className="font-semibold text-slate-800">
                  {moment(selectedEvent.start).format('DD/MM/YYYY')}
                </span>
                {(selectedEvent.isSenior || selectedEvent.resource?.isSenior) && (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-950 px-2.5 py-0.5 rounded-full text-xs font-bold border border-amber-300 shadow-2xs">
                      👑 Trưởng ca hôm nay
                      {isAdmin || selectedEvent.resource?.userId === userId
                        ? ' (+3k/h)'
                        : ''}
                    </span>
                  </div>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {selectedEvent && selectedEvent.isOwner ? (
          <div className="space-y-4 py-2">
            {/* Admin Shift Senior Role Toggle Section */}
            {isAdmin && (
              <div className="border rounded-xl p-3 bg-amber-50/70 border-amber-200/90 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-950 flex items-center gap-1.5 uppercase tracking-wide">
                    👑 Vai trò Trưởng ca (Senior)
                  </span>
                  {selectedEvent.isSenior || selectedEvent.resource?.isSenior ? (
                    <Badge className="bg-amber-400 text-amber-950 font-bold border-amber-300 shadow-2xs">
                      👑 Trưởng ca (+3k/h)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-500 bg-white">
                      Nhân viên ca thường
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-amber-900/80 leading-relaxed">
                  Mỗi ca làm sẽ có 1 Senior do Admin chọn làm trưởng ca. Người được
                  giao làm Trưởng ca sẽ có huy hiệu 👑 trên lịch và được cộng thêm{' '}
                  <strong>3.000đ / 1 giờ</strong> vào lương ca làm này.
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={togglingSenior}
                  onClick={handleToggleSenior}
                  className={cn(
                    'w-full font-bold text-xs shadow-xs',
                    selectedEvent.isSenior || selectedEvent.resource?.isSenior
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-amber-950 border border-amber-400 font-extrabold'
                  )}
                >
                  {togglingSenior
                    ? 'Đang xử lý...'
                    : selectedEvent.isSenior || selectedEvent.resource?.isSenior
                    ? '🚫 Hủy làm Trưởng ca'
                    : '👑 Đặt làm Trưởng ca (+3k/1h)'}
                </Button>
              </div>
            )}

            {/* Admin Shift Task Management Section */}
            {isAdmin && (
              <div className="border rounded-xl p-3 bg-slate-50/60 border-slate-200/90 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                    <ListTodo className="h-4 w-4 text-emerald-600" />
                    Nhiệm vụ ca làm ({shiftTasks.length})
                  </span>
                  {!showAddShiftTask && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1 font-semibold"
                      onClick={() => setShowAddShiftTask(true)}
                    >
                      <Plus className="h-3 w-3" /> Giao việc ca này
                    </Button>
                  )}
                </div>

                {showAddShiftTask && (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-2 text-xs animate-in fade-in">
                    <div className="font-semibold text-emerald-950 flex items-center justify-between">
                      <span>Giao việc mới cho ca này</span>
                      <button
                        type="button"
                        onClick={() => setShowAddShiftTask(false)}
                        className="text-slate-400 hover:text-slate-600 text-[10px]"
                      >
                        Hủy
                      </button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-slate-700">
                        Tên công việc <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        placeholder="VD: Kiểm tra quầy hàng, kiểm kê date bánh..."
                        value={newShiftTaskTitle}
                        onChange={(e) => setNewShiftTaskTitle(e.target.value)}
                        className="h-8 text-xs bg-white"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-slate-700">
                        Mô tả chi tiết
                      </Label>
                      <Textarea
                        placeholder="Mô tả cụ thể công việc cần làm..."
                        value={newShiftTaskDesc}
                        onChange={(e) => setNewShiftTaskDesc(e.target.value)}
                        className="text-xs bg-white resize-none"
                        rows={2}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowAddShiftTask(false)}
                      >
                        Đóng
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        onClick={handleCreateShiftTask}
                        disabled={savingShiftTask}
                      >
                        {savingShiftTask ? 'Đang lưu...' : 'Lưu & Giao việc'}
                      </Button>
                    </div>
                  </div>
                )}

                {loadingShiftTasks ? (
                  <div className="text-center py-2 text-xs text-muted-foreground animate-pulse">
                    Đang tải nhiệm vụ ca này...
                  </div>
                ) : shiftTasks.length === 0 ? (
                  !showAddShiftTask && (
                    <div className="text-center py-3 bg-white border border-dashed rounded-lg text-xs text-muted-foreground">
                      Chưa có nhiệm vụ nào được giao cho ca này.
                    </div>
                  )
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {shiftTasks.map((t) => (
                      <div
                        key={t.id}
                        className="border border-slate-200 rounded-lg p-2.5 bg-white shadow-2xs space-y-1 text-xs hover:border-emerald-200 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h5 className="font-bold text-slate-800 leading-tight">
                            {t.title}
                          </h5>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[9px] px-1.5 py-0 font-semibold',
                                t.isCompleted
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              )}
                            >
                              {t.isCompleted ? '✅ Đã xong' : '⏳ Chưa xong'}
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteShiftTask(t.id, t.title)}
                              title="Xóa nhiệm vụ (nếu giao nhầm)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {t.description && (
                          <p className="text-[11px] text-slate-500 bg-slate-50 rounded p-1.5 border border-slate-100 whitespace-pre-wrap">
                            {t.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isAdmin && isShiftLocked(selectedEvent.start) ? (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-lg">
                ⚠️ Lịch làm của tuần này đã được chốt. Chỉ Admin mới có quyền sửa đổi.
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  Trạng thái đổi ca:{' '}
                  <span className="font-bold text-gray-700">
                    {selectedEvent.resource?.isOpenForSwap
                      ? 'Đang treo trên chợ đổi ca'
                      : 'Chưa đăng đổi ca'}
                  </span>
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant={
                      selectedEvent.resource?.isOpenForSwap ? 'secondary' : 'default'
                    }
                    onClick={handleToggleSwap}
                  >
                    {selectedEvent.resource?.isOpenForSwap
                      ? '🚫 Gỡ khỏi chợ đổi ca'
                      : '🔄 Đăng lên chợ đổi ca (Pass ca)'}
                  </Button>

                  <Button variant="destructive" onClick={handleDeleteShift}>
                    ❌ Xóa ca làm này
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : selectedEvent ? (
          <div className="space-y-4 py-2 text-center">
            {!isAdmin && isShiftLocked(selectedEvent.start) ? (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-lg">
                ⚠️ Lịch làm của tuần này đã được chốt. Không thể nhận ca này nữa!
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Ca làm này được đăng bởi{' '}
                  <span className="font-bold">
                    {selectedEvent.resource?.title || 'Đồng nghiệp'}
                  </span>
                  . Bạn có muốn nhận làm ca này không?
                </p>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold"
                  onClick={handleTakeShift}
                >
                  ✅ Đồng ý nhận ca làm
                </Button>
              </>
            )}
          </div>
        ) : null}

        <DialogFooter className="pt-2 border-t">
          <Button variant="ghost" onClick={() => setActionModalOpen(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
