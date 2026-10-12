export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export const DAY_NAMES = [
  { short: "T2", full: "Thứ Hai", color: "bg-blue-600 text-white shadow-blue-500/25" },
  { short: "T3", full: "Thứ Ba", color: "bg-purple-600 text-white shadow-purple-500/25" },
  { short: "T4", full: "Thứ Tư", color: "bg-teal-600 text-white shadow-teal-500/25" },
  { short: "T5", full: "Thứ Năm", color: "bg-orange-500 text-white shadow-orange-500/25" },
  { short: "T6", full: "Thứ Sáu", color: "bg-indigo-600 text-white shadow-indigo-500/25" },
  { short: "T7", full: "Thứ Bảy", color: "bg-pink-600 text-white shadow-pink-500/25" },
  { short: "CN", full: "Chủ Nhật", color: "bg-red-600 text-white shadow-red-500/25" },
];

export const START_HOURS = Array.from({ length: 10 }, (_, i) => String(i + 8).padStart(2, "0")); // 08..17
export const END_HOURS = Array.from({ length: 11 }, (_, i) => String(i + 11).padStart(2, "0")); // 11..21
export const MINUTES = ["00", "15", "30", "45"];

export const MORNING_PRESETS = [
  { label: "8h - 12h", sH: "08", sM: "00", eH: "12", eM: "00" },
  { label: "8h - 14h", sH: "08", sM: "00", eH: "14", eM: "00" },
  { label: "8h - 15h", sH: "08", sM: "00", eH: "15", eM: "00" },
  { label: "9h - 14h", sH: "09", sM: "00", eH: "14", eM: "00" },
  { label: "10h - 14h30", sH: "10", sM: "00", eH: "14", eM: "30" },
];

export const AFTERNOON_PRESETS = [
  { label: "12h - 16h30", sH: "12", sM: "00", eH: "16", eM: "30" },
  { label: "12h - 17h", sH: "12", sM: "00", eH: "17", eM: "00" },
  { label: "12h30 - 17h", sH: "12", sM: "30", eH: "17", eM: "00" },
  { label: "13h - 17h", sH: "13", sM: "00", eH: "17", eM: "00" },
];

export function formatShiftLabel(type?: string, start?: string, end?: string): string {
  if (type === "MORNING") return "Sáng (8:30 - 12:00)";
  if (type === "AFTERNOON") return "Chiều (13:30 - 17:30)";
  if (type === "FULL") return "Cả ngày (8:30 - 17:30)";
  if (start && end) {
    const s = new Date(start).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const e = new Date(end).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return `${s} - ${e}`;
  }
  return type || "Ca tự do";
}

export function calculateDuration(s: string, e: string): string | null {
  if (!s || !e) return null;
  const [sH, sM] = s.split(":").map(Number);
  const [eH, eM] = e.split(":").map(Number);
  const totalMinutes = eH * 60 + eM - (sH * 60 + sM);
  if (isNaN(totalMinutes) || totalMinutes <= 0) return null;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h} tiếng`;
  return `${h} tiếng ${m} phút`;
}
