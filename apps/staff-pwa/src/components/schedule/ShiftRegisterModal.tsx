import React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { useStaffScheduleStore } from "@/stores/useStaffScheduleStore";
import {
  START_HOURS,
  END_HOURS,
  MINUTES,
  MORNING_PRESETS,
  AFTERNOON_PRESETS,
  calculateDuration,
} from "./schedule-utils";

interface ShiftRegisterModalProps {
  isOpen?: boolean;
  selectedDate?: Date | null;
  onClose?: () => void;
  onSuccess?: () => void;
}

export const ShiftRegisterModal: React.FC<ShiftRegisterModalProps> = ({
  isOpen: propIsOpen,
  selectedDate: propSelectedDate,
  onClose: propOnClose,
  onSuccess,
}) => {
  const store = useStaffScheduleStore();

  const isModalOpen = propIsOpen !== undefined ? propIsOpen : store.isRegisterModalOpen;
  const targetDate = propSelectedDate !== undefined ? propSelectedDate : store.selectedDate;

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      store.closeRegisterModal();
    }
  };

  const startTime = `${store.startHour}:${store.startMinute}`;
  const endTime = `${store.endHour}:${store.endMinute}`;
  const durationText = calculateDuration(startTime, endTime);

  const handleRegister = async () => {
    if (!targetDate) return;
    if (!startTime || !endTime) {
      toast.error("Vui lòng chọn giờ bắt đầu và kết thúc");
      return;
    }
    const [sH, sM] = startTime.split(":").map(Number);
    const [eH, eM] = endTime.split(":").map(Number);
    if (eH * 60 + eM <= sH * 60 + sM) {
      toast.error("Giờ kết thúc phải sau giờ bắt đầu!");
      return;
    }

    store.setIsSubmitting(true);
    try {
      const res = await authFetch("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: targetDate.toISOString(),
          startTime,
          endTime,
          shift: store.activePreset || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success("Đăng ký giờ làm thành công!");
        handleClose();
        if (onSuccess) onSuccess();
      } else {
        toast.error(json.error || "Không thể đăng ký ca làm");
      }
    } catch {
      toast.error("Lỗi kết nối khi đăng ký");
    } finally {
      store.setIsSubmitting(false);
    }
  };

  if (!isModalOpen || !targetDate) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-5 space-y-3.5 animate-in zoom-in-95 duration-150 border border-orange-100 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div>
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
            Đăng ký giờ làm
          </span>
          <h3 className="text-sm font-bold text-stone-900">
            {targetDate.toLocaleDateString("vi-VN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h3>
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
            disabled={store.isSubmitting}
            onClick={handleRegister}
            className="w-full h-9 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-xs"
          >
            {store.isSubmitting ? "Đang lưu..." : "Xác nhận đăng ký giờ làm"}
          </Button>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs h-8 rounded-xl text-stone-600 hover:bg-stone-100 cursor-pointer"
          >
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShiftRegisterModal;
