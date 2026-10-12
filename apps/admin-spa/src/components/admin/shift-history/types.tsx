import React from "react";
import { Badge } from "@/components/ui/badge";

export type ShiftHistoryFilterType =
  | "7_days"
  | "today"
  | "this_week"
  | "last_week"
  | "custom_date"
  | "all";

export interface ShiftHistoryLog {
  id: string | number;
  action: "CREATE" | "UPDATE" | "DELETE" | "IMPORT" | "TAKE_SWAP" | string;
  createdAt: string;
  oldStart?: string | null;
  oldEnd?: string | null;
  newStart?: string | null;
  newEnd?: string | null;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    department?: string;
  };
  changedBy?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

export interface GroupedShiftHistory {
  dateKey: string;
  title: string;
  isToday: boolean;
  isYesterday: boolean;
  logs: ShiftHistoryLog[];
}

export function getVnNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 3600000 * 7);
}

export function getVnDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const vnTime = new Date(utc + 3600000 * 7);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${vnTime.getFullYear()}-${pad(vnTime.getMonth() + 1)}-${pad(vnTime.getDate())}`;
}

export function getVnDateLabel(dateKey: string): {
  title: string;
  isToday: boolean;
  isYesterday: boolean;
} {
  const [y, m, d] = dateKey.split("-").map(Number);
  const targetDate = new Date(y, m - 1, d);
  const vnNow = getVnNow();
  const pad = (n: number) => n.toString().padStart(2, "0");

  const todayKey = `${vnNow.getFullYear()}-${pad(vnNow.getMonth() + 1)}-${pad(vnNow.getDate())}`;

  const yesterdayDate = new Date(vnNow);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = `${yesterdayDate.getFullYear()}-${pad(yesterdayDate.getMonth() + 1)}-${pad(yesterdayDate.getDate())}`;

  const daysOfWeek = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const dayOfWeek = daysOfWeek[targetDate.getDay()];
  const formattedDate = `${pad(d)}/${pad(m)}/${y}`;

  const isToday = dateKey === todayKey;
  const isYesterday = dateKey === yesterdayKey;

  if (isToday) {
    return {
      title: `Hôm nay - ${dayOfWeek}, ${formattedDate}`,
      isToday: true,
      isYesterday: false,
    };
  }
  if (isYesterday) {
    return {
      title: `Hôm qua - ${dayOfWeek}, ${formattedDate}`,
      isToday: false,
      isYesterday: true,
    };
  }
  return {
    title: `${dayOfWeek}, ${formattedDate}`,
    isToday: false,
    isYesterday: false,
  };
}

export function getDateRange(
  type: ShiftHistoryFilterType,
  customDate?: string
): { startDate?: string; endDate?: string } {
  const vnNow = getVnNow();

  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const endOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy;
  };

  switch (type) {
    case "7_days": {
      const start = new Date(vnNow);
      start.setDate(start.getDate() - 6);
      return {
        startDate: startOfDay(start).toISOString(),
        endDate: endOfDay(vnNow).toISOString(),
      };
    }
    case "today": {
      return {
        startDate: startOfDay(vnNow).toISOString(),
        endDate: endOfDay(vnNow).toISOString(),
      };
    }
    case "this_week": {
      const day = vnNow.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(vnNow);
      monday.setDate(monday.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return {
        startDate: startOfDay(monday).toISOString(),
        endDate: endOfDay(sunday).toISOString(),
      };
    }
    case "last_week": {
      const day = vnNow.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(vnNow);
      monday.setDate(monday.getDate() + diffToMonday - 7);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return {
        startDate: startOfDay(monday).toISOString(),
        endDate: endOfDay(sunday).toISOString(),
      };
    }
    case "custom_date": {
      if (!customDate) return {};
      const [y, m, d] = customDate.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return {
        startDate: startOfDay(date).toISOString(),
        endDate: endOfDay(date).toISOString(),
      };
    }
    case "all":
    default:
      return {};
  }
}

export function formatShiftDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const vnTime = new Date(utc + 3600000 * 7);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const dayName = days[vnTime.getDay()];
  const day = pad(vnTime.getDate());
  const month = pad(vnTime.getMonth() + 1);
  const hours = pad(vnTime.getHours());
  const minutes = pad(vnTime.getMinutes());

  return `${dayName} ${day}/${month} ${hours}:${minutes}`;
}

export function formatLogTime(dateStr: string): string {
  const date = new Date(dateStr);
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const vnTime = new Date(utc + 3600000 * 7);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(vnTime.getDate());
  const month = pad(vnTime.getMonth() + 1);
  const year = vnTime.getFullYear();
  const hours = pad(vnTime.getHours());
  const minutes = pad(vnTime.getMinutes());

  return `${hours}:${minutes} ${day}/${month}/${year}`;
}

export function formatTimeOnly(dateStr: string): string {
  const date = new Date(dateStr);
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const vnTime = new Date(utc + 3600000 * 7);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const hours = pad(vnTime.getHours());
  const minutes = pad(vnTime.getMinutes());

  return `${hours}:${minutes}`;
}

export function renderActionBadge(action: string) {
  switch (action) {
    case "CREATE":
      return (
        <Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-700 border-emerald-200">
          Thêm mới
        </Badge>
      );
    case "UPDATE":
      return (
        <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-700 border-amber-200">
          Cập nhật
        </Badge>
      );
    case "DELETE":
      return (
        <Badge className="bg-rose-100 hover:bg-rose-100 text-rose-700 border-rose-200">
          Hủy/Xóa
        </Badge>
      );
    case "IMPORT":
      return (
        <Badge className="bg-blue-100 hover:bg-blue-100 text-blue-700 border-blue-200">
          Import Excel
        </Badge>
      );
    case "TAKE_SWAP":
      return (
        <Badge className="bg-purple-100 hover:bg-purple-100 text-purple-700 border-purple-200">
          Nhận đổi ca
        </Badge>
      );
    default:
      return <Badge variant="outline">{action}</Badge>;
  }
}

export function formatLogDetail(log: any) {
  switch (log.action) {
    case "CREATE":
      return (
        <span>
          Gán ca:{" "}
          <span className="font-semibold text-slate-700 dark:text-stone-300">
            {formatShiftDateTime(log.newStart)} -{" "}
            {formatShiftDateTime(log.newEnd).split(" ").slice(2).join(" ")}
          </span>
        </span>
      );
    case "DELETE":
      return (
        <span>
          Hủy ca:{" "}
          <span className="font-semibold text-rose-700 dark:text-rose-400 line-through">
            {formatShiftDateTime(log.oldStart)} -{" "}
            {formatShiftDateTime(log.oldEnd).split(" ").slice(2).join(" ")}
          </span>
        </span>
      );
    case "UPDATE":
      return (
        <div className="flex flex-col text-xs space-y-0.5">
          <span className="text-slate-400 line-through">
            Cũ: {formatShiftDateTime(log.oldStart)} -{" "}
            {formatShiftDateTime(log.oldEnd).split(" ").slice(2).join(" ")}
          </span>
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
            Mới: {formatShiftDateTime(log.newStart)} -{" "}
            {formatShiftDateTime(log.newEnd).split(" ").slice(2).join(" ")}
          </span>
        </div>
      );
    case "IMPORT":
      return (
        <span>
          Import từ file Excel:{" "}
          <span className="font-semibold text-slate-700 dark:text-stone-300">
            {formatShiftDateTime(log.newStart)} -{" "}
            {formatShiftDateTime(log.newEnd).split(" ").slice(2).join(" ")}
          </span>
        </span>
      );
    case "TAKE_SWAP":
      return (
        <span>
          Nhận ca đổi từ chợ ca:{" "}
          <span className="font-semibold text-slate-700 dark:text-stone-300">
            {formatShiftDateTime(log.newStart)} -{" "}
            {formatShiftDateTime(log.newEnd).split(" ").slice(2).join(" ")}
          </span>
        </span>
      );
    default:
      return <span>Hành động khác</span>;
  }
}
