import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface DailyAttendanceDetail {
  date: string | Date;
  shift?: string;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  hours: number;
  salary: number;
  [key: string]: any;
}

export interface EmployeeAttendanceTableProps {
  month: number;
  year: number;
  dailyDetails?: DailyAttendanceDetail[];
}

const formatVND = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);

export function EmployeeAttendanceTable({
  month,
  year,
  dailyDetails,
}: EmployeeAttendanceTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-800">
              Bảng Chấm Công Chi Tiết
            </CardTitle>
            <CardDescription className="text-xs">
              Dữ liệu chấm công tháng {month}/{year}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full text-xs min-w-[500px]">
            <thead className="bg-slate-50 border-b text-muted-foreground uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3 text-left font-semibold">Ngày</th>
                <th className="py-2.5 px-3 text-left font-semibold">Ca</th>
                <th className="py-2.5 px-3 text-left font-semibold">Vào / Ra</th>
                <th className="py-2.5 px-3 text-right font-semibold">Giờ công</th>
                <th className="py-2.5 px-3 text-right font-semibold">Lương</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dailyDetails && dailyDetails.length > 0 ? (
                dailyDetails.map((day: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-medium text-slate-800">
                      {new Date(day.date).toLocaleDateString("vi-VN", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </td>
                    <td className="p-3 text-muted-foreground">{day.shift || "Thường"}</td>
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5">
                        {day.checkIn ? (
                          <span className="text-emerald-700 font-mono font-semibold">
                            IN: {new Date(day.checkIn).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : (
                          <span className="text-rose-400">Thiếu IN</span>
                        )}
                        {day.checkOut ? (
                          <span className="text-blue-700 font-mono font-semibold">
                            OUT: {new Date(day.checkOut).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : day.checkIn ? (
                          <span className="text-rose-400">Thiếu OUT</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">
                      {day.hours > 0 ? `${day.hours.toFixed(1)}h` : "-"}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold text-emerald-700">
                      {day.salary > 0 ? formatVND(day.salary) : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                    Chưa có dữ liệu chấm công trong tháng {month}/{year}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default EmployeeAttendanceTable;
