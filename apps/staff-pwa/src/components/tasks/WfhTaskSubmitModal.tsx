import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SubmittingWfhTask } from "./WfhTaskTypes";

export interface WfhTaskSubmitModalProps {
  task: SubmittingWfhTask | null;
  initialQuantity?: number;
  initialEvidence?: string;
  initialNote?: string;
  isProcessing: boolean;
  onClose: () => void;
  onSubmit: (params: {
    quantity: number;
    evidenceLink: string;
    note: string;
  }) => Promise<void>;
}

export const WfhTaskSubmitModal: React.FC<WfhTaskSubmitModalProps> = ({
  task,
  initialQuantity = 1,
  initialEvidence = "",
  initialNote = "",
  isProcessing,
  onClose,
  onSubmit,
}) => {
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [evidence, setEvidence] = useState(initialEvidence);
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    setQuantity(String(initialQuantity));
    setEvidence(initialEvidence);
    setNote(initialNote);
  }, [task, initialQuantity, initialEvidence, initialNote]);

  if (!task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) {
      toast.error("Vui lòng nhập số lượng hợp lệ (> 0)");
      return;
    }
    await onSubmit({
      quantity: q,
      evidenceLink: evidence.trim(),
      note: note.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 text-left">
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
        <div>
          <h2 className="text-sm font-bold text-stone-900">
            Nộp kết quả: {task.title}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Nhập số lượng thực tế và link hình ảnh/bằng chứng hoàn thành
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Số lượng hoàn thành ({task.unit})
            </label>
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Link bằng chứng (Google Drive / Link ảnh)
            </label>
            <input
              type="url"
              placeholder="https://drive.google.com/..."
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm focus:outline-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Ghi chú thêm (tùy chọn)
            </label>
            <textarea
              rows={2}
              placeholder="Ghi chú chi tiết nếu có..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-stone-200 text-xs focus:outline-indigo-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isProcessing}
              onClick={onClose}
              className="flex-1 h-9 text-xs font-bold cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isProcessing}
              className="flex-1 h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
            >
              {isProcessing ? "Đang gửi..." : "Xác nhận nộp"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WfhTaskSubmitModal;
