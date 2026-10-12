import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, Clock, Calendar, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { toggleShiftSwap } from "@/lib/api-client";
import { useStaffScheduleStore, ShiftItem } from "@/stores/useStaffScheduleStore";
import { formatShiftLabel } from "./schedule-utils";

interface ShiftSwapModalProps {
  isOpen?: boolean;
  shift?: ShiftItem | null;
  onClose?: () => void;
  onSuccess?: () => void;
}

export const ShiftSwapModal: React.FC<ShiftSwapModalProps> = ({
  isOpen: propIsOpen,
  shift: propShift,
  onClose: propOnClose,
  onSuccess,
}) => {
  const store = useStaffScheduleStore();
  const [isProcessing, setIsProcessing] = useState(false);

  const isModalOpen = propIsOpen !== undefined ? propIsOpen : store.isSwapModalOpen;
  const currentShift = propShift !== undefined ? propShift : store.swapTargetShift;

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      store.closeSwapModal();
    }
  };

  if (!isModalOpen || !currentShift) return null;

  const rawDate = currentShift.start || currentShift.date;
  const dateStr = rawDate
    ? new Date(rawDate).toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Hôm nay";

  const shiftTime =
    currentShift.start && currentShift.end
      ? `${new Date(currentShift.start).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })} - ${new Date(currentShift.end).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : formatShiftLabel(currentShift.shiftType || currentShift.shift);

  const isOpenForSwap = Boolean(currentShift.isOpenForSwap);

  const handleToggleSwap = async () => {
    const shiftId = Number(currentShift.id);
    if (!shiftId) {
      toast.error("Mã ca làm việc không hợp lệ");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await toggleShiftSwap(shiftId);
      if (res.success) {
        toast.success(
          isOpenForSwap
            ? "Đã gỡ ca khỏi danh sách đổi ca."
            : "🎉 Đã đăng ca lên chợ đổi ca thành công!"
        );
        handleClose();
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.error || "Không thể thực hiện yêu cầu đổi ca");
      }
    } catch {
      toast.error("Lỗi kết nối khi gửi yêu cầu đổi ca");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-150 border border-orange-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900">
              {isOpenForSwap ? "Quản lý đổi ca" : "Đổi / Pass ca trực"}
            </h3>
            <p className="text-[11px] text-stone-500">
              Hỗ trợ tìm đồng nghiệp trực thay khi có việc đột xuất
            </p>
          </div>
        </div>

        {/* Shift Details Box */}
        <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
            <Calendar className="w-3.5 h-3.5 text-stone-500" />
            <span>{dateStr}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-amber-800 font-semibold">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Giờ trực: {shiftTime}</span>
          </div>
        </div>

        {/* Explanation / Status Banner */}
        {isOpenForSwap ? (
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
              Đang đăng tìm người đổi ca
            </div>
            <p className="text-[11px] text-purple-700 leading-relaxed">
              Ca này đang được hiển thị cho các nhân viên khác nhận giúp. Bạn có thể gỡ bài nếu đã sắp xếp được lịch.
            </p>
          </div>
        ) : (
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              Lưu ý khi đăng đổi ca
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Ca làm việc của bạn sẽ được thông báo cho đồng nghiệp. Nếu có người nhận thay, hệ thống sẽ tự động chuyển lịch trực.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <Button
            type="button"
            disabled={isProcessing}
            onClick={handleToggleSwap}
            className={`w-full h-10 rounded-xl text-xs font-bold cursor-pointer shadow-xs ${
              isOpenForSwap
                ? "bg-stone-700 hover:bg-stone-800 text-white"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            }`}
          >
            {isProcessing
              ? "Đang xử lý..."
              : isOpenForSwap
              ? "Gỡ khỏi chợ đổi ca"
              : "🔄 Xác nhận đăng đổi ca"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="w-full text-xs h-8 rounded-xl text-stone-600 hover:bg-stone-100 cursor-pointer"
          >
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShiftSwapModal;
