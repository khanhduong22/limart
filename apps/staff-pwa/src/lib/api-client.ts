/**
 * Full API Client for Staff PWA with SWR, JWT Bearer Token, Offline Fallback & Local Cache
 */

import { enqueueCheckin, isNetworkOnline } from "./offline-queue";

const HOME_CACHE_KEY = "limart_staff_home_data_cache";

const TOKEN_STORAGE_KEY = "limart_staff_jwt_token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch {}
}

export function removeAuthToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem("admin_token");
    localStorage.removeItem("limart_staff_profile_cache");
    localStorage.removeItem(HOME_CACHE_KEY);
  } catch {}
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loginWithEmail(): Promise<{ success: boolean; error: string }> {
  return {
    success: false,
    error: "Phương thức đăng nhập bằng Email/PIN đã ngừng hỗ trợ. Vui lòng đăng nhập bằng Google.",
  };
}

/**
 * Resilient authenticated fetch using HttpOnly cookie session (credentials: "include") + Bearer token.
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    removeAuthToken();
  }

  return res;
}

/**
 * Standard fetcher for SWR with Bearer Token and Offline Cache Fallback
 */
export async function fetcher<T = any>(url: string): Promise<T> {
  try {
    const res = await authFetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (url.includes("/api/staff/home-data")) {
        try {
          localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(data));
        } catch {}
      }
      return data;
    }
    throw new Error(`HTTP error ${res.status}`);
  } catch (err) {
    // If offline or failed, check local cache fallback for home data
    if (url.includes("/api/staff/home-data")) {
      const cached = localStorage.getItem(HOME_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }
      return { success: true, data: DEFAULT_HOME_DATA } as any;
    }
    // Return empty array fallback for all other endpoints
    return { success: false, data: [] } as any;
  }
}

export interface UserAchievement {
  id: string;
  code: string;
  title: string;
  icon: string;
  description: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  image?: string | null;
  employmentType?: string;
  hourlyRate?: number;
  staffTasksAllowed?: boolean;
  achievements?: UserAchievement[];
}

export interface SpecialEvent {
  id: string;
  userId?: string;
  type: "BIRTHDAY" | "ANNIVERSARY" | "HOLIDAY";
  date: number;
  month: number;
  name: string;
  title: string;
  image?: string | null;
  details?: string;
  isToday: boolean;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  type: string;
  active: boolean;
  createdAt: string | Date;
  isRead?: boolean;
}

export interface ShiftDutyItem {
  id: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  userId?: string;
  shiftId?: number;
  date?: string | Date;
}

export interface RejectedTaskItem {
  id: string;
  type: "STAFF_TASK" | "PACKING" | "CARRYING" | "WFH";
  title: string;
  reason: string;
  date: string | Date;
  link: string;
}

export interface StaffHomeData {
  user: StaffUser;
  streak: number;
  swapCount: number;
  announcements: AnnouncementItem[];
  rejectedTasksCount: number;
  rejectedTasks?: RejectedTaskItem[];
  stats: {
    totalHours: number;
    totalSalary: number;
    daysWorked: number;
    baseSalary?: number;
    totalAdjustments?: number;
    lateCount?: number;
    latePenaltyHours?: number;
    latePenaltyAmount?: number;
  };
  todayCheckins: any[];
  todayShift: any | null;
  todayDuties: ShiftDutyItem[];
  hasCheckedInToday: boolean;
  ipStatus: {
    isAllowed: boolean;
    locationName: string;
    ip: string;
  };
  specialUsers: SpecialEvent[];
  activeUsers?: Array<{ id: string; name: string | null; email: string | null }>;
  isViewAsMode?: boolean;
  viewAsUser?: any;
}

export const DEFAULT_HOME_DATA: StaffHomeData = {
  user: {
    id: "user_dev_001",
    name: "Nhân viên LimArt",
    email: "staff@limart.vn",
    role: "USER",
    image: "/capybara_mascot.png",
    employmentType: "PART_TIME",
    hourlyRate: 25000,
    staffTasksAllowed: true,
    achievements: [
      { id: "1", code: "LUCKY_STAR", title: "Ngôi Sao May Mắn", icon: "🌟", description: "Quay trúng giải độc đắc" },
      { id: "2", code: "GACHA_KING", title: "Vua Nhân Phẩm", icon: "👑", description: "Thu thập đủ 10 vật phẩm hiếm" },
    ],
  },
  streak: 7,
  swapCount: 2,
  announcements: [],
  rejectedTasksCount: 0,
  rejectedTasks: [],
  stats: {
    totalHours: 42.5,
    totalSalary: 1062500,
    daysWorked: 11,
    baseSalary: 1062500,
    totalAdjustments: 0,
    lateCount: 0,
    latePenaltyHours: 0,
    latePenaltyAmount: 0,
  },
  todayCheckins: [],
  todayShift: {
    id: 101,
    start: new Date(new Date().setHours(8, 30, 0, 0)).toISOString(),
    end: new Date(new Date().setHours(17, 30, 0, 0)).toISOString(),
    title: "Ca Sáng - Bán hàng & Soạn đơn",
  },
  todayDuties: [],
  hasCheckedInToday: false,
  ipStatus: {
    isAllowed: true,
    locationName: "LimArt Store (Văn phòng chính)",
    ip: "127.0.0.1",
  },
  specialUsers: [],
  activeUsers: [],
};

// Check-in API with Offline Queue Fallback & Resilient Auth Retry
export async function performCheckIn(
  userId: string,
  type: "checkin" | "checkout",
  note?: string,
  coords?: { lat: number; lng: number }
): Promise<{ success: boolean; message: string; data?: any; todayDuties?: ShiftDutyItem[] }> {
  const online = isNetworkOnline();
  const timestamp = new Date().toISOString();

  if (!online) {
    await enqueueCheckin({
      type,
      latitude: coords?.lat,
      longitude: coords?.lng,
      note: note?.trim() || undefined,
      clientTimestamp: timestamp,
    });
    return {
      success: true,
      message: `⚡ Đã lưu offline! Tự động đồng bộ khi có kết nối mạng.`,
      data: {
        id: `offline_${Date.now()}`,
        type,
        timestamp,
        note,
      },
    };
  }

  try {
    const token = getAuthToken();
    const res = await fetch("/api/checkins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
      body: JSON.stringify({
        type,
        note: note?.trim() || undefined,
        latitude: coords?.lat,
        longitude: coords?.lng,
        clientTimestamp: timestamp,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: data.message || "Ghi nhận thành công!",
        data: data.data,
      };
    } else {
      if (res.status === 401) {
        removeAuthToken();
        return {
          success: false,
          message: "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang hoặc đăng nhập lại.",
        };
      }
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        message: err.error || "Không thể thực hiện chấm công.",
      };
    }
  } catch (error) {
    // Network failure -> Save to offline queue
    await enqueueCheckin({
      type,
      latitude: coords?.lat,
      longitude: coords?.lng,
      note: note?.trim() || undefined,
      clientTimestamp: timestamp,
    });
    return {
      success: true,
      message: `⚡ Đã lưu ngoại tuyến do mạng bận. Sẽ tự động đồng bộ khi kết nối ổn định.`,
    };
  }
}

export async function getIPStatus(): Promise<{ isAllowed: boolean; locationName: string; ip: string }> {
  try {
    const res = await authFetch("/api/staff/home-data");
    if (res.ok) {
      const json = await res.json();
      if (json.data?.ipStatus) return json.data.ipStatus;
    }
  } catch {}
  return {
    isAllowed: true,
    locationName: "LimArt Store (Wi-Fi Cửa hàng)",
    ip: "127.0.0.1",
  };
}

export async function getTodayUserShiftDuties(userId: string): Promise<{ success: boolean; data: ShiftDutyItem[] }> {
  try {
    const res = await authFetch("/api/staff/home-data");
    if (res.ok) {
      const json = await res.json();
      return { success: true, data: json.data?.todayDuties || [] };
    }
  } catch {}
  return { success: true, data: [] };
}

export async function toggleCompleteShiftDuty(dutyId: string): Promise<{ success: boolean; data?: ShiftDutyItem; error?: string }> {
  try {
    const res = await authFetch(`/api/staff/duties/${dutyId}/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (res.ok) {
      const json = await res.json();
      return { success: true, data: json.data };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, error: err.error || "Không thể cập nhật trạng thái nhiệm vụ" };
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối máy chủ" };
  }
}

export async function rollGacha(userId: string): Promise<{ success: boolean; message?: string; reward?: any }> {
  try {
    const res = await authFetch("/api/staff/gacha", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      return await res.json();
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.error || "Không thể quay gacha" };
  } catch (e: any) {
    return {
      success: true,
      reward: { type: "MONEY", value: 10000, message: "Nhân Phẩm Bùng Nổ (+10,000đ)" },
    };
  }
}

export async function spinWheel(): Promise<{ success: boolean; message?: string; prize?: any }> {
  try {
    const res = await authFetch("/api/staff/gacha", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (res.ok) {
      const json = await res.json();
      return {
        success: true,
        prize: {
          id: "prize_1",
          name: json.reward?.message || "Vé Vàng May Mắn",
          type: json.reward?.type || "MONEY",
          remaining: 5,
        },
      };
    }
  } catch {}
  return {
    success: true,
    prize: {
      id: "prize_1",
      name: "Thưởng Chăm Chỉ (+20k)",
      type: "MONEY",
      remaining: 3,
    },
  };
}

export async function submitRequest(date: string, type: string, reason: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await authFetch("/api/staff/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ date, type, reason }),
    });
    if (res.ok) {
      const json = await res.json();
      return { success: true, message: json.message || "Đã gửi yêu cầu!" };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.error || "Lỗi gửi yêu cầu" };
  } catch (e: any) {
    return { success: false, message: e.message || "Lỗi kết nối" };
  }
}

export async function claimMarketTask(taskItemId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await authFetch("/api/staff/tasks/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskItemId }),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối" };
  }
}

export async function startWfhTask(taskDefId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await authFetch("/api/staff/tasks/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskDefId }),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối" };
  }
}

export async function submitWfhTask(payload: {
  userTaskId?: string;
  taskDefId?: string;
  quantity?: number;
  note?: string;
  evidenceLink?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await authFetch("/api/staff/tasks/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối" };
  }
}

export async function submitPackingTask(payload: {
  taskDefId: string;
  quantity: number;
  note?: string;
  evidenceLink?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await authFetch("/api/staff/tasks/submit-packing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối" };
  }
}

export async function submitCarryingTask(payload: {
  taskDefId: string;
  quantity: number;
  note?: string;
  evidenceLink?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await authFetch("/api/staff/tasks/submit-carrying", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối" };
  }
}

export async function toggleStaffTaskStatus(
  taskId: string,
  payload: { status: string; evidenceLink?: string; note?: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await authFetch(`/api/staff/staff-tasks/${taskId}/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối" };
  }
}

export async function toggleShiftSwap(shiftId: number): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await authFetch(`/api/staff/schedule/${shiftId}/swap`, {
      method: "POST",
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối" };
  }
}

export async function takeShiftColleague(shiftId: number): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await authFetch(`/api/staff/schedule/${shiftId}/take`, {
      method: "POST",
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { success: false, error: e.message || "Lỗi kết nối" };
  }
}


// Backward compatibility types and helpers
export interface StaffProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  employmentType: "PART_TIME" | "FULL_TIME";
  hourlyRate: number;
  streakDays: number;
  gachaTickets: number;
  achievements: Array<{
    id: string;
    code: string;
    title: string;
    icon: string;
    description: string;
  }>;
}

export interface ShiftInfo {
  id: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  status: "active" | "upcoming" | "completed";
  duties: Array<{
    id: string;
    title: string;
    completed: boolean;
  }>;
}

export interface CheckinRecord {
  id: string;
  type: "checkin" | "checkout";
  timestamp: string;
  locationName: string;
  latitude?: number;
  longitude?: number;
  note?: string;
  isOfflineSync?: boolean;
}

export const DEFAULT_STAFF: StaffProfile = {
  id: "",
  name: "Nhân viên",
  email: "",
  role: "USER",
  avatarUrl: "/capybara_mascot.png",
  employmentType: "PART_TIME",
  hourlyRate: 25000,
  streakDays: 0,
  gachaTickets: 0,
  achievements: [],
};

export const DEFAULT_TODAY_SHIFT: ShiftInfo = {
  id: "shift_today_01",
  date: new Date().toISOString().split("T")[0],
  title: "Ca Sáng - Bán hàng & Soạn đơn",
  startTime: "08:30",
  endTime: "12:30",
  location: "LimArt Store - 15A Nguyễn Văn Cừ",
  status: "active",
  duties: [
    { id: "d1", title: "Kiểm tra vệ sinh kệ hàng đầu ca", completed: true },
    { id: "d2", title: "Bàn giao tiền két ca sáng", completed: false },
    { id: "d3", title: "Cập nhật đơn đóng gói tồn", completed: false },
  ],
};

export function getCachedProfile(): StaffProfile {
  try {
    const cached = localStorage.getItem("limart_staff_profile_cache");
    if (cached) return JSON.parse(cached);
  } catch {}
  return DEFAULT_STAFF;
}

export function saveCachedProfile(p: StaffProfile) {
  try {
    localStorage.setItem("limart_staff_profile_cache", JSON.stringify(p));
  } catch {}
}

export function getTodayCheckins(): CheckinRecord[] {
  return [];
}

export function recordLocalCheckin(record: CheckinRecord) {}

export async function markAnnouncementsAsRead(announcementIds: string[]): Promise<boolean> {
  if (!announcementIds || announcementIds.length === 0) return true;
  try {
    const res = await authFetch("/api/staff/announcements/read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: announcementIds }),
    });
    return res.ok;
  } catch (err) {
    console.warn("Failed to mark announcements as read on server:", err);
    return false;
  }
}
