import { useState, useEffect, useCallback } from "react";
import {
  setAuthToken,
  saveCachedProfile,
  getAuthHeaders,
} from "./api-client";
import { queryClient } from "./queryClient";

export interface DemoModulesConfig {
  attendance: boolean;
  piecework: boolean;
  operations: boolean;
  payroll: boolean;
  gamification: boolean;
  ai_sop: boolean;
}

export const DEFAULT_DEMO_MODULES: DemoModulesConfig = {
  attendance: true,
  piecework: true,
  operations: true,
  payroll: true,
  gamification: true,
  ai_sop: true,
};

export interface DemoModuleMetadata {
  key: keyof DemoModulesConfig;
  label: string;
  description: string;
  badge: string;
}

export const DEMO_MODULE_LIST: DemoModuleMetadata[] = [
  {
    key: "attendance",
    label: "Chấm công & Lịch trực",
    description: "Check-in Wi-Fi/GPS, đăng ký lịch ca & xin giải trình",
    badge: "Core",
  },
  {
    key: "piecework",
    label: "Khoán Đóng gói & Bưng lầu",
    description: "Tính công theo sản phẩm, đơn hàng & hệ số lầu",
    badge: "Add-on",
  },
  {
    key: "operations",
    label: "Giao việc & KPI Ca trực",
    description: "Checklist nhiệm vụ ca, giao việc & duyệt KPI",
    badge: "Pro",
  },
  {
    key: "payroll",
    label: "Bảng Lương Real-time",
    description: "Tự động tính lương giờ, phụ cấp, thưởng & phạt trễ",
    badge: "Core",
  },
  {
    key: "gamification",
    label: "Game Hóa (Gacha & Bảng Vàng)",
    description: "Quay thưởng nhân phẩm, chuỗi streak & đua top",
    badge: "Add-on",
  },
  {
    key: "ai_sop",
    label: "Trợ Lý AI SOP Nội Quy",
    description: "Hỏi đáp quy trình cửa hàng tự động cùng Bé Capybara",
    badge: "AI",
  },
];

export interface DemoPersona {
  id: string;
  name: string;
  email?: string;
  role: "ADMIN" | "PARTNER" | "USER" | string;
  employmentType?: string;
  hourlyRate?: number;
  image?: string | null;
  label?: string;
}

export interface DemoStatusResponse {
  enabled: boolean;
  personas?: DemoPersona[];
  modules?: Partial<DemoModulesConfig>;
  currentUser?: DemoPersona | null;
}

export interface SwitchDemoRoleResponse {
  success: boolean;
  token?: string;
  user?: DemoPersona & {
    achievements?: Array<{
      id: string;
      code: string;
      title: string;
      icon: string;
      description: string;
    }>;
  };
  redirectTo?: string;
  error?: string;
}

export interface ResetDemoDataResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export const DEMO_MODULES_STORAGE_KEY = "limart_demo_modules";
const DEMO_MODULES_EVENT = "limart:demo-modules-changed";

export function isLikelyDemoHost(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const host = (window.location.hostname || "").toLowerCase();
    const search = window.location.search || "";
    return (
      host.startsWith("limart2.") ||
      host.startsWith("demo") ||
      search.includes("demo=1")
    );
  } catch {
    return false;
  }
}

export function getEnterpriseInitials(name?: string | null): string {
  if (!name || typeof name !== "string") return "DM";
  const cleaned = name.replace(/\([^)]*\)/g, "").trim();
  if (!cleaned) return "DM";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DM";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || "DM";
  }
  const secondLast = parts[parts.length - 2]?.[0] || "";
  const last = parts[parts.length - 1]?.[0] || "";
  const initials = `${secondLast}${last}`.toUpperCase();
  return initials || "DM";
}

export function getDemoModules(): DemoModulesConfig {
  try {
    if (typeof localStorage === "undefined") {
      return { ...DEFAULT_DEMO_MODULES };
    }
    const raw = localStorage.getItem(DEMO_MODULES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          attendance: parsed.attendance ?? true,
          piecework: parsed.piecework ?? true,
          operations: parsed.operations ?? true,
          payroll: parsed.payroll ?? true,
          gamification: parsed.gamification ?? true,
          ai_sop: parsed.ai_sop ?? true,
        };
      }
    }
  } catch {}
  return { ...DEFAULT_DEMO_MODULES };
}

export function toggleDemoModule(key: keyof DemoModulesConfig): DemoModulesConfig {
  const current = getDemoModules();
  const updated: DemoModulesConfig = {
    ...current,
    [key]: !current[key],
  };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DEMO_MODULES_STORAGE_KEY, JSON.stringify(updated));
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DEMO_MODULES_EVENT, { detail: updated }));
    }
  } catch {}
  return updated;
}

export async function fetchDemoStatus(): Promise<DemoStatusResponse> {
  try {
    const res = await fetch("/api/demo/status", {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...getAuthHeaders(),
      },
    });
    if (!res.ok) {
      return { enabled: false };
    }
    const json = await res.json();
    const payload =
      json?.data && typeof json.data === "object" ? { ...json, ...json.data } : json;
    const enabled = Boolean(payload?.enabled);
    if (!enabled) {
      return { enabled: false };
    }
    const personas: DemoPersona[] | undefined = Array.isArray(payload?.personas)
      ? payload.personas
      : Array.isArray(payload?.users)
      ? payload.users
      : undefined;

    return {
      enabled: true,
      personas,
      modules: payload?.modules,
      currentUser: payload?.currentUser || payload?.user || null,
    };
  } catch {
    return { enabled: false };
  }
}

export async function switchDemoRole(
  role: "ADMIN" | "PARTNER" | "USER",
  userId?: string
): Promise<SwitchDemoRoleResponse> {
  try {
    const res = await fetch("/api/demo/switch-role", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ role, ...(userId ? { userId } : {}) }),
    });

    const json = await res.json().catch(() => ({}));
    const payload =
      json?.data && typeof json.data === "object" ? { ...json, ...json.data } : json;

    if (!res.ok) {
      return {
        success: false,
        error: payload?.error || payload?.message || `HTTP ${res.status}`,
      };
    }

    if (payload?.token) {
      setAuthToken(payload.token);
      if (role === "ADMIN") {
        try {
          localStorage.setItem("admin_token", payload.token);
        } catch {}
      }
    }

    const user = payload?.user;
    if (user && user.id) {
      saveCachedProfile({
        id: user.id,
        name: user.name || "Nhân viên Demo",
        email: user.email || "",
        role: user.role || role,
        avatarUrl: user.image || "/capybara_mascot.webp",
        employmentType:
          user.employmentType === "FULL_TIME" ? "FULL_TIME" : "PART_TIME",
        hourlyRate: typeof user.hourlyRate === "number" ? user.hourlyRate : 25000,
        streakDays: 0,
        gachaTickets: 1,
        achievements: Array.isArray(user.achievements) ? user.achievements : [],
      });
    }

    try {
      localStorage.removeItem("limart_staff_home_data_cache");
    } catch {}
    queryClient.invalidateQueries();

    return {
      success: true,
      token: payload?.token,
      user,
      redirectTo: payload?.redirectTo,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Không thể chuyển đổi vai trò Demo",
    };
  }
}

export async function resetDemoData(): Promise<ResetDemoDataResponse> {
  try {
    const res = await fetch("/api/demo/reset", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
    });

    const json = await res.json().catch(() => ({}));
    const payload =
      json?.data && typeof json.data === "object" ? { ...json, ...json.data } : json;

    if (!res.ok) {
      return {
        success: false,
        error: payload?.error || payload?.message || `HTTP ${res.status}`,
      };
    }

    if (payload?.token) {
      setAuthToken(payload.token);
    }

    if (payload?.user && payload.user.id) {
      saveCachedProfile({
        id: payload.user.id,
        name: payload.user.name || "Nhân viên Demo",
        email: payload.user.email || "",
        role: payload.user.role || "USER",
        avatarUrl: payload.user.image || "/capybara_mascot.webp",
        employmentType:
          payload.user.employmentType === "FULL_TIME" ? "FULL_TIME" : "PART_TIME",
        hourlyRate:
          typeof payload.user.hourlyRate === "number" ? payload.user.hourlyRate : 25000,
        streakDays: 0,
        gachaTickets: 1,
        achievements: Array.isArray(payload.user.achievements)
          ? payload.user.achievements
          : [],
      });
    }

    try {
      localStorage.removeItem("limart_staff_home_data_cache");
    } catch {}
    queryClient.invalidateQueries();

    return {
      success: true,
      message:
        payload?.message ||
        "Đã random lại tên nhân viên, bảng lương và dữ liệu mẫu!",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Không thể làm mới dữ liệu Demo",
    };
  }
}

export function useDemoModules() {
  const [modules, setModules] = useState<DemoModulesConfig>(() => getDemoModules());

  useEffect(() => {
    const syncModules = () => {
      setModules(getDemoModules());
    };
    window.addEventListener(DEMO_MODULES_EVENT, syncModules);
    window.addEventListener("storage", syncModules);
    return () => {
      window.removeEventListener(DEMO_MODULES_EVENT, syncModules);
      window.removeEventListener("storage", syncModules);
    };
  }, []);

  const toggleModule = useCallback((key: keyof DemoModulesConfig) => {
    const updated = toggleDemoModule(key);
    setModules(updated);
    return updated;
  }, []);

  return {
    ...modules,
    modules,
    toggleModule,
  };
}
