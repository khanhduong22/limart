import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, Circle, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftDutyItem } from "@/lib/api-client";

export interface ShiftDutyTeammate {
  id: string;
  name: string | null;
  email: string | null;
  image?: string | null;
  role?: string;
  duties?: ShiftDutyItem[];
}

export interface ShiftDutyDetailsModalProps {
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  activeTab: "MY_DUTIES" | "TEAMMATES";
  setActiveTab: (tab: "MY_DUTIES" | "TEAMMATES") => void;
  myDuties: ShiftDutyItem[];
  teammateDuties: ShiftDutyTeammate[];
  completedCount?: number;
  totalMyDuties?: number;
  totalTeamDuties?: number;
  togglingId?: string | null;
  handleToggleDuty: (id: string) => void | Promise<void>;
}

export function ShiftDutyDetailsModal({
  modalOpen,
  setModalOpen,
  activeTab,
  setActiveTab,
  myDuties = [],
  teammateDuties = [],
  completedCount,
  totalMyDuties,
  totalTeamDuties,
  togglingId = null,
  handleToggleDuty,
}: ShiftDutyDetailsModalProps) {
  const safeMyDuties = myDuties || [];
  const safeTeammateDuties = teammateDuties || [];
  const resolvedTotalMyDuties = totalMyDuties ?? safeMyDuties.length;
  const resolvedCompletedCount =
    completedCount ?? safeMyDuties.filter((d) => d.isCompleted).length;
  const resolvedTotalTeamDuties =
    totalTeamDuties ??
    safeTeammateDuties.reduce((acc, c) => acc + (c.duties?.length || 0), 0);

  return (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <span>📋</span> Danh sách nhiệm vụ ca trực
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Nhấn vào từng nhiệm vụ để đánh dấu hoàn thành hoặc xem đồng nghiệp trong ca.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Selector: Default MY_DUTIES */}
        <div className="flex gap-2 bg-stone-100 p-1 rounded-xl">
          <button
            type="button"
            data-completed-count={resolvedCompletedCount}
            onClick={() => setActiveTab("MY_DUTIES")}
            className={cn(
              "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === "MY_DUTIES"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            )}
          >
            <User className="w-3.5 h-3.5" />
            <span>Việc của tôi ({resolvedTotalMyDuties})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("TEAMMATES")}
            className={cn(
              "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === "TEAMMATES"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Cả ca làm ({safeTeammateDuties.length})</span>
          </button>
        </div>

        <div className="space-y-2.5 py-2 max-h-80 overflow-y-auto pr-0.5">
          {activeTab === "MY_DUTIES" ? (
            safeMyDuties.length === 0 ? (
              <div className="space-y-3">
                {resolvedTotalTeamDuties > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">👥</span>
                      <div className="text-xs text-emerald-950 font-medium">
                        Ca hôm nay có <span className="font-bold">{resolvedTotalTeamDuties}</span> việc của đồng nghiệp.
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs font-bold border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-100 shrink-0 cursor-pointer"
                      onClick={() => setActiveTab("TEAMMATES")}
                    >
                      Xem cả ca
                    </Button>
                  </div>
                )}
                <div className="text-center py-6 text-xs text-stone-400">
                  Không có nhiệm vụ nào được giao cho bạn ca hôm nay.
                </div>
              </div>
            ) : (
              safeMyDuties.map((d) => {
                const isToggling = togglingId === d.id;
                return (
                  <div
                    key={d.id}
                    onClick={() => !isToggling && handleToggleDuty(d.id)}
                    aria-busy={isToggling || undefined}
                    className={cn(
                      "p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all",
                      d.isCompleted
                        ? "bg-emerald-50/40 border-emerald-200"
                        : "bg-white border-slate-200 hover:border-emerald-300",
                      isToggling && "opacity-60 pointer-events-none"
                    )}
                  >
                    <button type="button" disabled={isToggling} className="mt-0.5">
                      {d.isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          d.isCompleted ? "line-through text-slate-400" : "text-slate-800"
                        )}
                      >
                        {d.title}
                      </p>
                      {d.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-line">
                          {d.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : safeTeammateDuties.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-stone-500 bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
              <div className="text-2xl mb-1.5">☕</div>
              <p className="font-medium text-stone-600">
                Hôm nay chưa có đồng nghiệp nào được giao nhiệm vụ ca trực.
              </p>
            </div>
          ) : (
            safeTeammateDuties.map((u) => {
              const userDuties = u.duties || [];
              const completedUserDuties = userDuties.filter((d) => d.isCompleted).length;

              return (
                <div
                  key={u.id}
                  className="p-3 rounded-xl border border-stone-200 bg-white shadow-2xs space-y-2.5"
                >
                  {/* Colleague Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">
                        {(u.name || "U")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-xs text-stone-900 block truncate">
                          {u.name || u.email || "Đồng nghiệp"}
                        </span>
                        <span className="text-[10px] text-stone-400 block truncate">
                          {completedUserDuties}/{userDuties.length} hoàn thành
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 shrink-0">
                      {userDuties.length} nhiệm vụ
                    </span>
                  </div>

                  {/* Duties list for this colleague */}
                  <div className="space-y-1.5 pt-1 border-t border-stone-100">
                    {userDuties.map((d) => (
                      <div
                        key={d.id}
                        className={cn(
                          "p-2 rounded-lg text-xs flex items-start gap-2 transition-colors",
                          d.isCompleted
                            ? "bg-emerald-50/50 text-slate-500"
                            : "bg-stone-50/70 text-slate-800"
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {d.isCompleted ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-amber-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-xs leading-snug",
                              d.isCompleted ? "line-through text-slate-400" : "font-medium text-slate-800"
                            )}
                          >
                            {d.title}
                          </p>
                          {d.description && (
                            <p className="text-[10px] text-slate-400 mt-0.5 whitespace-pre-line truncate">
                              {d.description}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                            d.isCompleted
                              ? "bg-emerald-100/60 text-emerald-700"
                              : "bg-amber-100/60 text-amber-700"
                          )}
                        >
                          {d.isCompleted ? "Đã xong" : "Đang chờ"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 cursor-pointer"
            onClick={() => setModalOpen(false)}
          >
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ShiftDutyDetailsModal;
