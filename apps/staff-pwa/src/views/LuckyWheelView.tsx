import React, { lazy } from "react";
import { useAppQuery } from "@/lib/api-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";

const LuckyWheelGame = lazy(() => import("@/components/LuckyWheelGame"));

export const LuckyWheelView: React.FC = () => {
  const { data: response } = useAppQuery<{ success: boolean; prizes: any[] }>(
    "/api/staff/lucky-wheel"
  );

  const prizes = response?.prizes || [];

  return (
    <div className="w-full max-w-full md:max-w-md mx-auto p-3 sm:p-4 pb-32 space-y-3 select-none box-border min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-orange-100 text-stone-700 cursor-pointer">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Vòng quay may mắn
          </h1>
        </div>
      </div>

        {/* Wheel game */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border text-center">
          <p className="text-xs text-muted-foreground mb-4">
            Mỗi nhân viên có 1 lượt quay may mắn mỗi ngày sau khi đã hoàn thành Check-in.
          </p>
          <React.Suspense
            fallback={
              <div className="h-64 w-full flex items-center justify-center text-xs text-stone-400 animate-pulse">
                Đang tải vòng quay may mắn...
              </div>
            }
          >
            <LuckyWheelGame prizes={prizes} />
          </React.Suspense>
        </div>
      </div>
    );
  };

export default LuckyWheelView;
