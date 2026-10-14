import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleCompleteShiftDuty, ShiftDutyItem } from "@/lib/api-client";
import { toast } from "sonner";

const ShiftDutyDetailsModal = React.lazy(() => import("./ShiftDutyDetailsModal"));

interface ShiftDutyHomeWidgetProps {
  currentUserId?: string;
  isAdmin?: boolean;
  duties?: ShiftDutyItem[];
  activeUsers?: {
    id: string;
    name: string | null;
    email: string | null;
    image?: string | null;
    role?: string;
    duties?: ShiftDutyItem[];
  }[];
}

export default function ShiftDutyHomeWidget({
  currentUserId,
  isAdmin = false,
  duties = [],
  activeUsers = [],
}: ShiftDutyHomeWidgetProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"MY_DUTIES" | "TEAMMATES">("MY_DUTIES");
  const [localDuties, setLocalDuties] = useState<ShiftDutyItem[]>(duties);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  React.useEffect(() => {
    setLocalDuties(duties);
  }, [duties]);

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    setLocalDuties((prev) =>
      (prev || []).map((d) => (d.id === id ? { ...d, isCompleted: !d.isCompleted } : d))
    );

    try {
      const res = await toggleCompleteShiftDuty(id);
      if (!res.success) {
        toast.error(res.error || "Không thể cập nhật");
      } else {
        toast.success(
          res.data?.isCompleted
            ? "✅ Đã hoàn thành nhiệm vụ!"
            : "Đã hủy đánh dấu hoàn thành"
        );
      }
    } finally {
      setTogglingId(null);
    }
  };

  const completedCount = (localDuties || []).filter((d) => d.isCompleted).length;

  const otherDutyUsers = React.useMemo(() => {
    return (activeUsers || []).filter(
      (u) => (!currentUserId || u.id !== currentUserId) && (u.duties?.length || 0) > 0
    );
  }, [activeUsers, currentUserId]);

  const totalTeamDuties = React.useMemo(() => {
    return otherDutyUsers.reduce(
      (acc, c) => acc + (c.duties?.length || 0),
      0
    );
  }, [otherDutyUsers]);

  const handleOpenModal = () => {
    const shouldDefaultToTeammates = (localDuties || []).length === 0 && totalTeamDuties > 0;
    setActiveTab(shouldDefaultToTeammates ? "TEAMMATES" : "MY_DUTIES");
    setModalOpen(true);
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            📋
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Nhiệm vụ ca làm việc</h3>
            <p className="text-[11px] text-gray-500">
              {(localDuties || []).length > 0
                ? `Hoàn thành ${completedCount}/${(localDuties || []).length} công việc`
                : totalTeamDuties > 0
                ? `${totalTeamDuties} việc trong ca của đồng nghiệp`
                : "Xem nhiệm vụ của ca làm"}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenModal}
          onMouseEnter={() => import("./ShiftDutyDetailsModal")}
          onTouchStart={() => import("./ShiftDutyDetailsModal")}
          className="text-xs h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
        >
          Xem chi tiết
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      {(localDuties || []).length === 0 ? (
        <div className="text-center py-3 bg-gray-50/50 rounded-lg text-xs text-gray-400">
          Chưa có nhiệm vụ đặc biệt nào được giao cho ca hôm nay.
        </div>
      ) : (
        <div className="space-y-1.5">
          {(localDuties || []).slice(0, 3).map((d) => (
            <div
              key={d.id}
              onClick={() => handleToggle(d.id)}
              className="flex items-center justify-between p-2 rounded-lg bg-gray-50/70 hover:bg-gray-100/70 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <button type="button" className="text-slate-400 hover:text-emerald-600">
                  {d.isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300" />
                  )}
                </button>
                <span
                  className={cn(
                    "text-xs truncate",
                    d.isCompleted ? "line-through text-slate-400" : "text-slate-800 font-medium"
                  )}
                >
                  {d.title}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">
                {d.isCompleted ? "Xong" : "Chờ"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      {modalOpen && (
        <React.Suspense fallback={null}>
          <ShiftDutyDetailsModal
            modalOpen={modalOpen}
            setModalOpen={setModalOpen}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            myDuties={localDuties || []}
            teammateDuties={otherDutyUsers}
            completedCount={completedCount}
            totalMyDuties={(localDuties || []).length}
            totalTeamDuties={totalTeamDuties}
            togglingId={togglingId}
            handleToggleDuty={handleToggle}
          />
        </React.Suspense>
      )}
    </div>
  );
}
