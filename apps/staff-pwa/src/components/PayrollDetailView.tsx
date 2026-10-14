import React from "react";
import { Card } from "@/components/ui/card";
import { Clock, DollarSign, Calendar, Gift } from "lucide-react";

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(amount) || 0);
}

export default function PayrollDetailView({
  stats,
  userName,
  monthStr,
  isClosed,
}: {
  stats: any;
  userName?: string;
  monthStr: string;
  isClosed?: boolean;
}) {
  if (!stats) return <div className="text-center py-6 text-xs text-slate-400">Không có dữ liệu</div>;

  const displayTotal = isClosed && stats.finalNet != null ? stats.finalNet : stats.totalSalary || 0;
  const bonusAmount: number = stats.bonusAmount || 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2">
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="flex items-center gap-2 text-emerald-700 mb-2">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Thực lãnh ({monthStr})</span>
          </div>
          <div className="text-xl font-bold text-emerald-900">
            {formatVND(displayTotal)}
          </div>
          <p className="text-[11px] text-emerald-600 mt-1">
            Lương cứng: {formatVND(stats.baseSalary || 0)}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Tổng giờ làm</span>
          </div>
          <div className="text-xl font-bold">
            {(Number(stats.totalHours) || 0).toFixed(1)}h
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-[11px] text-muted-foreground">{stats.daysWorked || 0} ngày đi làm</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Thưởng / Phạt</span>
          </div>
          <div
            className={`text-xl font-bold ${
              (stats.totalAdjustments || 0) >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {(stats.totalAdjustments || 0) > 0 ? "+" : ""}
            {formatVND(stats.totalAdjustments || 0)}
          </div>
        </Card>

        {/* Show Thưởng doanh thu card when month is closed and bonusAmount > 0 */}
        {isClosed && bonusAmount > 0 ? (
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="flex items-center gap-2 text-blue-700 mb-2">
              <Gift className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">
                Thưởng doanh thu ({stats.bonusPercent}%)
              </span>
            </div>
            <div className="text-xl font-bold text-blue-700">
              +{formatVND(bonusAmount)}
            </div>
            <div className="text-xs text-blue-600/80 mt-1">
              (Đã cộng vào Thực lãnh)
            </div>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Lương theo giờ</span>
            </div>
            <div className="text-xl font-bold">
              {formatVND(stats.hourlyRate || 25000)}/h
            </div>
          </Card>
        )}
      </div>

      {/* Adjustments History */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-gray-50/50 border-b">
          <h3 className="font-bold text-gray-900 text-sm">Lịch sử Thưởng / Phạt</h3>
        </div>
        <div className="p-4">
          {!Array.isArray(stats?.adjustments) || stats.adjustments.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              Không có khoản thưởng/phạt nào trong tháng.
            </div>
          ) : (
            <div className="space-y-3">
              {(Array.isArray(stats.adjustments) ? stats.adjustments : []).map((adj: any) => (
                <div
                  key={adj.id}
                  className="flex justify-between items-start border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-xs text-gray-800">{adj.reason}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(adj.date).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div
                    className={`font-bold text-xs ${
                      adj.amount > 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {adj.amount > 0 ? "+" : ""}
                    {formatVND(adj.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Daily Shift Details */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-gray-50/50 border-b">
          <h3 className="font-bold text-gray-900 text-sm">Chi tiết ngày công</h3>
        </div>
        <div className="overflow-x-auto">
          {!Array.isArray(stats?.dailyDetails) || stats.dailyDetails.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Chưa có dữ liệu chấm công tháng này.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50/80 border-b text-[10px] font-bold text-muted-foreground uppercase">
                <tr>
                  <th className="p-2 text-left">Ngày</th>
                  <th className="p-2 text-center">Vào</th>
                  <th className="p-2 text-center">Ra</th>
                  <th className="p-2 text-center">Giờ</th>
                  <th className="p-2 text-right">Lương</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(Array.isArray(stats.dailyDetails) ? stats.dailyDetails : []).map((day: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="p-2 font-medium">
                      {new Date(day.date).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </td>
                    <td className="p-2 text-center font-mono text-gray-600">
                      {day.rawCheckIn
                        ? new Date(day.rawCheckIn).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "--:--"}
                    </td>
                    <td className="p-2 text-center font-mono text-gray-600">
                      {day.rawCheckOut
                        ? new Date(day.rawCheckOut).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "--:--"}
                    </td>
                    <td className="p-2 text-center font-mono font-bold text-blue-900">
                      {(Number(day?.hours) || 0) > 0 ? `${(Number(day.hours) || 0).toFixed(1)}h` : "-"}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-emerald-700">
                      {(Number(day?.salary) || 0) > 0 ? formatVND(day.salary) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
