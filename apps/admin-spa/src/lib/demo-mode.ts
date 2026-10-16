import { useSyncExternalStore } from "react";

export interface DemoModulesConfig {
  attendance: boolean;
  piecework: boolean;
  operations: boolean;
  payroll: boolean;
  gamification: boolean;
  ai_sop: boolean;
}

export type DemoRole = "ADMIN" | "PARTNER" | "USER";

export const DEMO_MODULES_STORAGE_KEY = "limart_demo_modules";
export const DEMO_MODULES_CHANGE_EVENT = "limart-demo-modules-change";

export const DEFAULT_DEMO_MODULES: DemoModulesConfig = {
  attendance: true,
  piecework: true,
  operations: true,
  payroll: true,
  gamification: true,
  ai_sop: true,
};

export interface DemoModuleDefinition {
  key: keyof DemoModulesConfig;
  label: string;
  isCore?: boolean;
}

export const DEMO_MODULE_DEFINITIONS: DemoModuleDefinition[] = [
  { key: "attendance", label: "Chấm công & Lịch ca [Core]", isCore: true },
  { key: "piecework", label: "Khoán Đóng gói & Bốc vác" },
  { key: "operations", label: "Giao việc Ca & Checklist" },
  { key: "payroll", label: "Tính lương tự động & VietQR" },
  { key: "gamification", label: "Gamification (Gacha & Vòng quay)" },
  { key: "ai_sop", label: "Trợ lý AI Nội quy SOP" },
];

export interface DemoStatusResponse {
  enabled: boolean;
  role?: DemoRole;
  user?: {
    id: string;
    name: string;
    email?: string;
    role: DemoRole;
  };
  modules?: Partial<DemoModulesConfig>;
}

export interface DemoSwitchRoleResponse {
  ok: boolean;
  status: number;
  token?: string;
  role?: DemoRole;
  user?: {
    id: string;
    name: string;
    email?: string;
    role: DemoRole;
  };
}

export interface DemoResetResponse {
  ok: boolean;
  message?: string;
}

export function isLikelyDemoHost(): boolean {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }
  const hostname = window.location.hostname || "";
  const search = window.location.search || "";
  return (
    hostname.startsWith("limart2.") ||
    hostname.startsWith("demo") ||
    search.includes("demo=1")
  );
}

let cachedRawJson: string | null = null;
let cachedSnapshot: DemoModulesConfig = DEFAULT_DEMO_MODULES;
let productionDemoDisabled = false;
const memoryStorageFallback = new Map<string, string>();

function safeGetStorageItem(key: string): string | null {
  try {
    if (
      typeof window !== "undefined" &&
      window.localStorage &&
      typeof window.localStorage.getItem === "function"
    ) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Fall through to memory fallback
  }
  return memoryStorageFallback.get(key) ?? null;
}

function safeSetStorageItem(key: string, value: string): void {
  memoryStorageFallback.set(key, value);
  try {
    if (
      typeof window !== "undefined" &&
      window.localStorage &&
      typeof window.localStorage.setItem === "function"
    ) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage errors
  }
}

function normalizeModulesConfig(
  input?: Partial<DemoModulesConfig> | null
): DemoModulesConfig {
  return {
    attendance: input?.attendance ?? DEFAULT_DEMO_MODULES.attendance,
    piecework: input?.piecework ?? DEFAULT_DEMO_MODULES.piecework,
    operations: input?.operations ?? DEFAULT_DEMO_MODULES.operations,
    payroll: input?.payroll ?? DEFAULT_DEMO_MODULES.payroll,
    gamification: input?.gamification ?? DEFAULT_DEMO_MODULES.gamification,
    ai_sop: input?.ai_sop ?? DEFAULT_DEMO_MODULES.ai_sop,
  };
}

export function getDemoModules(): DemoModulesConfig {
  if (typeof window === "undefined") {
    return DEFAULT_DEMO_MODULES;
  }
  if (productionDemoDisabled && !isLikelyDemoHost()) {
    return DEFAULT_DEMO_MODULES;
  }
  try {
    const raw = safeGetStorageItem(DEMO_MODULES_STORAGE_KEY);
    if (!raw) {
      cachedRawJson = null;
      cachedSnapshot = DEFAULT_DEMO_MODULES;
      return cachedSnapshot;
    }
    if (raw === cachedRawJson) {
      return cachedSnapshot;
    }
    const parsed = JSON.parse(raw) as Partial<DemoModulesConfig>;
    cachedRawJson = raw;
    cachedSnapshot = normalizeModulesConfig(parsed);
    return cachedSnapshot;
  } catch {
    return DEFAULT_DEMO_MODULES;
  }
}

function notifyDemoModulesChanged(next: DemoModulesConfig) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DEMO_MODULES_CHANGE_EVENT, { detail: next })
  );
}

export function setDemoModules(
  partial: Partial<DemoModulesConfig>
): DemoModulesConfig {
  const current = getDemoModules();
  const next = normalizeModulesConfig({ ...current, ...partial });
  productionDemoDisabled = false;
  if (typeof window !== "undefined") {
    const serialized = JSON.stringify(next);
    safeSetStorageItem(DEMO_MODULES_STORAGE_KEY, serialized);
    cachedRawJson = serialized;
    cachedSnapshot = next;
    notifyDemoModulesChanged(next);
  }
  return next;
}

function subscribeDemoModules(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handleCustomEvent = () => onStoreChange();
  const handleStorageEvent = (e: StorageEvent) => {
    if (!e.key || e.key === DEMO_MODULES_STORAGE_KEY) {
      onStoreChange();
    }
  };
  window.addEventListener(DEMO_MODULES_CHANGE_EVENT, handleCustomEvent);
  window.addEventListener("storage", handleStorageEvent);
  return () => {
    window.removeEventListener(DEMO_MODULES_CHANGE_EVENT, handleCustomEvent);
    window.removeEventListener("storage", handleStorageEvent);
  };
}

export function useDemoModules(): DemoModulesConfig {
  return useSyncExternalStore(
    subscribeDemoModules,
    getDemoModules,
    () => DEFAULT_DEMO_MODULES
  );
}

function unwrapApiPayload<T extends Record<string, any>>(raw: any): T {
  if (raw && typeof raw === "object") {
    if ("data" in raw && raw.data && typeof raw.data === "object") {
      return { ...raw, ...raw.data } as T;
    }
    return raw as T;
  }
  return {} as T;
}

export async function fetchDemoStatus(): Promise<DemoStatusResponse> {
  try {
    const res = await fetch("/api/demo/status", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { enabled: false, modules: DEFAULT_DEMO_MODULES };
    }
    const raw = await res.json();
    const data = unwrapApiPayload<DemoStatusResponse>(raw);
    const enabled = Boolean(data.enabled);

    if (!enabled && !isLikelyDemoHost()) {
      productionDemoDisabled = true;
      notifyDemoModulesChanged(DEFAULT_DEMO_MODULES);
      return { enabled: false, modules: DEFAULT_DEMO_MODULES };
    }

    productionDemoDisabled = false;
    if (
      enabled &&
      data.modules &&
      typeof window !== "undefined" &&
      !safeGetStorageItem(DEMO_MODULES_STORAGE_KEY)
    ) {
      setDemoModules(data.modules);
    }

    return {
      ...data,
      enabled,
      modules: getDemoModules(),
    };
  } catch {
    return { enabled: false, modules: DEFAULT_DEMO_MODULES };
  }
}

export async function switchDemoRole(
  role: DemoRole,
  userId?: string
): Promise<DemoSwitchRoleResponse> {
  try {
    const res = await fetch("/api/demo/switch-role", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userId ? { role, userId } : { role }),
    });

    let data: Partial<DemoSwitchRoleResponse> = {};
    try {
      const raw = await res.json();
      data = unwrapApiPayload<DemoSwitchRoleResponse>(raw);
    } catch {
      data = {};
    }

    if (res.ok && data.token && typeof window !== "undefined") {
      safeSetStorageItem("auth_token", data.token);
    }

    return {
      ...data,
      ok: res.ok,
      status: res.status,
      role: data.role ?? role,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      role,
    };
  }
}

export async function toggleDemoModule(
  key: keyof DemoModulesConfig
): Promise<DemoModulesConfig> {
  const current = getDemoModules();
  const nextValue = !current[key];
  const next = setDemoModules({ [key]: nextValue });

  try {
    await fetch("/api/demo/modules", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        enabled: nextValue,
        modules: next,
      }),
    });
  } catch {
    // Keep optimistic localStorage state if offline or mocked
  }

  return next;
}

export async function resetDemoData(): Promise<DemoResetResponse> {
  try {
    const res = await fetch("/api/demo/reset", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    let data: Partial<DemoResetResponse> = {};
    try {
      const raw = await res.json();
      data = unwrapApiPayload<DemoResetResponse>(raw);
    } catch {
      data = {};
    }
    return {
      ok: res.ok,
      message: data.message,
    };
  } catch {
    return { ok: false };
  }
}
