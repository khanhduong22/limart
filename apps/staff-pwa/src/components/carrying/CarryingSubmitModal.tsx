import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitCarryingTask } from "@/lib/api-client";

export interface CarryingSubmitModalProps {
  taskDef: {
    id?: string;
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CarryingSubmitModal: React.FC<CarryingSubmitModalProps> = ({
  taskDef,
  onClose,
  onSuccess,
}) => {
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [evidenceLink, setEvidenceLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!taskDef) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDef.id) return;

    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) {
      toast.error("Vui lòng nhập số lượng hợp lệ (> 0)");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitCarryingTask({
        taskDefId: taskDef.id,
        quantity: q,
        note: note.trim() || undefined,
        evidenceLink: evidenceLink.trim() || undefined,
      });

      if (result.success) {
        toast.success("🛗 Khai báo bưng hàng lên lầu thành công! Chờ Admin duyệt.");
        onSuccess();
      } else {
        toast.error(result.error || "Không thể gửi khai báo");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
        <div>
          <h2 className="text-sm font-bold text-stone-900">
            Khai báo: {taskDef.name || taskDef.title || "Bưng hàng"}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Nhập số lượt hoặc số thùng đã bưng lên lầu trong ca làm
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Số lượng ({taskDef.unit || "lượt"})
            </label>
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-amber-500 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Link ảnh hoặc bằng chứng (nếu có)
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={evidenceLink}
              onChange={(e) => setEvidenceLink(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Ghi chú (loại thùng hàng / ca bưng)
            </label>
            <textarea
              rows={2}
              placeholder="Ví dụ: Bưng 2 kiện hàng áo thun lên kho lầu 2..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-stone-200 text-xs focus:outline-amber-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 h-9 text-xs font-bold cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
            >
              {isSubmitting ? "Đang gửi..." : "Gửi khai báo"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CarryingSubmitModal;
