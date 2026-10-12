import React from "react";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, ArrowLeftRight } from "lucide-react";
import { useStaffScheduleStore, ShiftItem } from "@/stores/useStaffScheduleStore";
import {
  START_HOURS,
  END_HOURS,
  MINUTES,
  MORNING_PRESETS,
  AFTERNOON_PRESETS,
  formatShiftLabel,
  calculateDuration,
} from "./schedule-utils";

interface ShiftDetailsModalProps {
  selectedDate: Date | null;
  myShifts: ShiftItem[];
  isSubmitting?: boolean;
  onClose: () => void;
  onCancelShift: (shiftId: number | string) => void;
  onRegisterShift: () => void;
  onOpenSwap?: (shift: ShiftItem) => void;
}

export const ShiftDetailsModal: React.FC<ShiftDetailsModalProps> = ({
  selectedDate,
  myShifts,
  isSubmitting = false,
  onClose,
  onCancelShift,
  onRegisterShift,
  onOpenSwap,
}) => {
  const store = useStaffScheduleStore();

  if (!selectedDate) return null;

  const startTime = `${store.startHour}:${store.startMinute}`;
  const endTime = `${store.endHour}:${store.endMinute}`;
  const durationText = calculateDuration(startTime, endTime);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-5 space-y-3.5 animate-in zoom-in-95 duration-150 border border-orange-100 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div>
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
            Lịch chi tiết
          </span>
          <h3 className="text-sm font-bold text-stone-900">
            {selectedDate.toLocaleDateString("vi-VN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h3>
        </div>

        {/* List of User's Registered Shifts on this Date */}
        {myShifts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700">
                Ca làm của bạn ({myShifts.length}):
              </span>
              {!store.showAddForm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => store.setShowAddForm(true)}
                  className="text-[11px] h-7 px-2 text-amber-700 hover:bg-amber-50 cursor-pointer font-semibold"
                >
                  + Thêm ca khác
                </Button>
              )}
            </div>

            {myShifts.map((myShift) => (
              <div
                key={myShift.id}
                className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200/80 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">
                    {myShift.start && myShift.end
                      ? `${new Date(myShift.start).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} - ${new Date(myShift.end).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : formatShiftLabel(myShift.shiftType || myShift.shift)}
                  </span>
                  <div className="flex items-center gap-1">
                    {myShift.isOpenForSwap && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-200 text-purple-800 font-semibold animate-pulse">
                        Đang pass
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 font-semibold">
                      Đã xếp ca
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-emerald-800">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    {myShift.start && myShift.end
                      ? `Thời lượng: ${
                          calculateDuration(
                            new Date(myShift.start).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Ho_Chi_Minh",
                            }),
                            new Date(myShift.end).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Ho_Chi_Minh",
                            })
                          ) || "Linh hoạt"
                        }`
                      : "Theo quy định ca"}
                  </span>
                </div>

                <div className="pt-1 flex gap-2">
                  {onOpenSwap && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => onOpenSwap(myShift)}
                      className="flex-1 text-xs h-8 cursor-pointer rounded-xl border-amber-300 text-amber-800 hover:bg-amber-50"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 mr-1 text-amber-600" />
                      {myShift.isOpenForSwap ? "Quản lý đổi ca" : "Pass ca"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => onCancelShift(myShift.id)}
                    className="flex-1 text-xs h-8 cursor-pointer rounded-xl bg-red-600 hover:bg-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Hủy ca này
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Flexible Time Registration Form */}
        {(myShifts.length === 0 || store.showAddForm) && (
          <div className="space-y-3 pt-1 border-t border-orange-100">
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-700 font-bold">
                {myShifts.length > 0
                  ? "Đăng ký thêm giờ làm:"
                  : "Đăng ký giờ làm tự do:"}
              </p>
              {store.showAddForm && myShifts.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => store.setShowAddForm(false)}
                  className="text-[10px] h-6 px-1.5 text-stone-500"
                >
                  Thu gọn
                </Button>
              )}
            </div>

            {/* Quick Presets */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                Gợi ý ca làm nhanh:
              </span>

              {/* Ca sáng */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                  ☀️ Ca sáng:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {MORNING_PRESETS.map((p) => {
                    const isSelected = store.activePreset === p.label;
                    return (
                      <Button
                        key={p.label}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => store.setTimeRange(p.sH, p.sM, p.eH, p.eM, p.label)}
                        className={`h-8 px-2.5 text-[11px] rounded-xl cursor-pointer ${
                          isSelected
                            ? "bg-amber-600 hover:bg-amber-700 text-white font-bold"
                            : "border-stone-200 text-stone-700 hover:bg-stone-50"
                        }`}
                      >
                        {p.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Ca chiều */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                  🌙 Ca chiều:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AFTERNOON_PRESETS.map((p) => {
                    const isSelected = store.activePreset === p.label;
                    return (
                      <Button
                        key={p.label}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => store.setTimeRange(p.sH, p.sM, p.eH, p.eM, p.label)}
                        className={`h-8 px-2.5 text-[11px] rounded-xl cursor-pointer ${
                          isSelected
                            ? "bg-amber-600 hover:bg-amber-700 text-white font-bold"
                            : "border-stone-200 text-stone-700 hover:bg-stone-50"
                        }`}
                      >
                        {p.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Free Custom Hours Inputs */}
            <div className="p-3 bg-stone-50/80 rounded-2xl border border-stone-200 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-stone-600 block mb-1">
                    Bắt đầu (8h - 17h):
                  </label>
                  <div className="flex items-center gap-1">
                    <select
                      value={store.startHour}
                      onChange={(e) => store.setStartHour(e.target.value)}
                      className="h-9 flex-1 text-xs font-semibold bg-white rounded-xl border border-stone-200 px-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer text-stone-800"
                    >
                      {START_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {h}h
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-bold text-stone-400">:</span>
                    <select
                      value={store.startMinute}
                      onChange={(e) => store.setStartMinute(e.target.value)}
                      className="h-9 flex-1 text-xs font-semibold bg-white rounded-xl border border-stone-200 px-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer text-stone-800"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}p
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-600 block mb-1">
                    Kết thúc (11h - 21h):
                  </label>
                  <div className="flex items-center gap-1">
                    <select
                      value={store.endHour}
                      onChange={(e) => store.setEndHour(e.target.value)}
                      className="h-9 flex-1 text-xs font-semibold bg-white rounded-xl border border-stone-200 px-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer text-stone-800"
                    >
                      {END_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {h}h
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-bold text-stone-400">:</span>
                    <select
                      value={store.endMinute}
                      onChange={(e) => store.setEndMinute(e.target.value)}
                      className="h-9 flex-1 text-xs font-semibold bg-white rounded-xl border border-stone-200 px-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer text-stone-800"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}p
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {durationText && (
                <div className="text-[11px] text-amber-800 font-bold flex items-center justify-between px-1">
                  <span>⏱️ Thời lượng:</span>
                  <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                    {durationText}
                  </span>
                </div>
              )}

              <Button
                type="button"
                disabled={isSubmitting}
                onClick={onRegisterShift}
                className="w-full h-9 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-xs"
              >
                {isSubmitting ? "Đang lưu..." : "Xác nhận đăng ký giờ làm"}
              </Button>
            </div>
          </div>
        )}

        {/* Close Modal Button */}
        <div className="flex justify-end pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs h-8 rounded-xl text-stone-600 hover:bg-stone-100 cursor-pointer"
          >
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShiftDetailsModal;
