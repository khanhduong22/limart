import React from "react";
import { Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PackingPriceItem {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  baseReward: number;
  unit: string;
}

export interface PackingHistoryItem {
  id: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  quantity: number;
  finalAmount?: number;
  unitPrice: number;
  note?: string;
  evidenceLink?: string;
  rejectReason?: string;
  adminNote?: string;
  createdAt: string;
  submittedAt?: string;
  taskDefinition?: {
    id?: string;
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  };
  taskDef?: {
    id?: string;
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  };
  title?: string;
  taskDefId?: string;
}

export interface PackingHistoryListProps {
  history: PackingHistoryItem[] | any[];
  isLoading: boolean;
  onOpenModal: (item: any) => void;
  onSwitchToPricelist: () => void;
}

export const PackingHistoryList: React.FC<PackingHistoryListProps> = ({
  history,
  isLoading,
  onOpenModal,
  onSwitchToPricelist,
}) => {
  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-stone-400">
        Đang tải lịch sử...
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center space-y-1">
        <span className="text-2xl">📦</span>
        <p className="text-xs font-bold text-stone-700">Chưa có lượt khai báo đóng gói nào</p>
        <p className="text-[11px] text-stone-500">
          Hãy chuyển sang tab Bảng Giá Điểm để gửi báo cáo nhé!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {history.map((t) => {
        const taskDef = t.taskDefinition || (t as any).taskDef || {};
        const title = taskDef.name || taskDef.title || (t as any).title || "Khai báo đóng gói";
        const unit = taskDef.unit || "đơn";

        return (
          <div
            key={t.id}
            className={`rounded-2xl border p-3.5 shadow-xs space-y-2 ${
              t.status === "APPROVED"
                ? "bg-emerald-50/40 border-emerald-200"
                : t.status === "REJECTED"
                ? "bg-rose-50/50 border-rose-200"
                : "bg-white border-stone-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-stone-900">{title}</h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Số lượng: <span className="font-semibold text-stone-800">{t.quantity} {unit}</span>
                  {t.submittedAt && (
                    <span className="text-stone-400 ml-2">
                      {new Date(t.submittedAt).toLocaleDateString("vi-VN")}
                    </span>
                  )}
                </p>
              </div>
              <div>
                {t.status === "APPROVED" && (
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> +{t.finalAmount || t.quantity} điểm
                  </span>
                )}
                {(t.status === "SUBMITTED" || t.status === "PENDING") && (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Đang chờ duyệt
                  </span>
                )}
                {t.status === "REJECTED" && (
                  <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Bị từ chối
                  </span>
                )}
              </div>
            </div>

            {t.note && (
              <p className="text-[11px] text-stone-600 bg-stone-50 p-2 rounded-lg">
                📝 {t.note}
              </p>
            )}

            {/* Reject Reason Alert */}
            {t.status === "REJECTED" && (t.rejectReason || t.adminNote) && (
              <div className="bg-rose-100/70 border border-rose-200 p-2 rounded-lg text-xs text-rose-800">
                <p className="font-bold text-[11px]">Lý do từ chối:</p>
                <p className="text-[11px] mt-0.5">{t.rejectReason || t.adminNote}</p>
              </div>
            )}

            {t.evidenceLink && (
              <div className="text-[11px] text-purple-700 truncate">
                🔗{" "}
                <a
                  href={t.evidenceLink}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-purple-900"
                >
                  {t.evidenceLink}
                </a>
              </div>
            )}

            {/* Actions for rejected packing item */}
            {t.status === "REJECTED" && (
              <div className="flex justify-end pt-1 border-t border-stone-100">
                <Button
                  size="sm"
                  onClick={() => {
                    const def = t.taskDefinition || (t as any).taskDef;
                    if (def) {
                      onOpenModal({
                        id: (t as any).taskDefId || def.id || (t as any).id,
                        name: def.name || def.title,
                        title: def.title || def.name,
                        baseReward: def.baseReward || t.unitPrice || 0,
                        unit: def.unit || "điểm",
                      });
                    } else {
                      onSwitchToPricelist();
                    }
                  }}
                  className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 cursor-pointer"
                >
                  Khai báo nộp lại
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PackingHistoryList;
