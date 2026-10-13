import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitRequest } from "@/lib/api-client";
import { toast } from "sonner";
import { REQUEST_TYPES } from "./request-constants";

export interface CreateRequestModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateRequestModal: React.FC<CreateRequestModalProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [type, setType] = useState<string>("LATE");
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Vui lòng nhập lý do giải trình");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await submitRequest(date, type, reason);
      if (res.success) {
        toast.success("✅ Đã gửi yêu cầu thành công!");
        setReason("");
        onClose();
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.message || "Gửi yêu cầu thất bại");
      }
    } catch {
      toast.error("Gửi yêu cầu thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-900">Gửi yêu cầu / giải trình</h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="request-date" className="text-xs">Ngày áp dụng</Label>
            <Input
              id="request-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 text-xs"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="request-type" className="text-xs">Loại yêu cầu</Label>
            <select
              id="request-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {REQUEST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="request-reason" className="text-xs">Lý do cụ thể</Label>
            <textarea
              id="request-reason"
              className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Nhập lý do chi tiết..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs cursor-pointer"
            >
              {isSubmitting ? "Đang gửi..." : "Gửi yêu cầu"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRequestModal;
