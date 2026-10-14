import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface EmployeePayrollDailyDetail {
  date: string | Date;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  hours?: number;
  salary?: number;
  shift?: string;
  error?: string;
  isValid?: boolean;
  [key: string]: any;
}

export interface EmployeePayrollDailyTableProps {
  dailyDetails?: EmployeePayrollDailyDetail[] | any[];
  formatVND: (n: number) => string;
}

export function EmployeePayrollDailyTable({
  dailyDetails,
  formatVND,
}: EmployeePayrollDailyTableProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 bg-slate-50/70 border-b">
        <CardTitle className="font-bold text-slate-800 text-sm">
          Chi tiết công theo từng ngày
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
          {!dailyDetails || dailyDetails.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Chưa có dữ liệu chấm công tháng này.
            </div>
          ) : (
            <table className="w-full text-xs min-w-[500px]">
              <thead className="bg-slate-50 border-b text-[10px] font-bold text-muted-foreground uppercase">
                <tr>
                  <th className="p-3 text-left">Ngày</th>
                  <th className="p-3 text-center">Vào</th>
                  <th className="p-3 text-center">Ra</th>
                  <th className="p-3 text-center">Giờ</th>
                  <th className="p-3 text-right">Lương</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyDetails.map((day: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-slate-800">
                      {new Date(day.date).toLocaleDateString("vi-VN", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </td>
                    <td className="p-3 text-center font-mono text-slate-600">
                      {day.checkIn
                        ? new Date(day.checkIn).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "--:--"}
                    </td>
                    <td className="p-3 text-center font-mono text-slate-600">
                      {day.checkOut
                        ? new Date(day.checkOut).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "--:--"}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-blue-900">
                      {day.hours > 0 ? `${day.hours.toFixed(1)}h` : "-"}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">
                      {day.salary > 0 ? formatVND(day.salary) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default EmployeePayrollDailyTable;
