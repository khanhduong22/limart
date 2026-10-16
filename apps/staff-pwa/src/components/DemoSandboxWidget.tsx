import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, RefreshCw, Check } from "lucide-react";
import {
  fetchDemoStatus,
  switchDemoRole,
  resetDemoData,
  useDemoModules,
  DEMO_MODULE_LIST,
  DemoPersona,
  DemoModulesConfig,
} from "../lib/demo-mode";
import { useRouter } from "../lib/router";
import { getCachedProfile } from "../lib/api-client";

export const DemoSandboxWidget: React.FC = () => {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [personas, setPersonas] = useState<DemoPersona[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [switchingRole, setSwitchingRole] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const { modules, toggleModule } = useDemoModules();

  const currentProfile = getCachedProfile();

  useEffect(() => {
    let mounted = true;
    fetchDemoStatus().then((status) => {
      if (!mounted) return;
      if (status.enabled) {
        setEnabled(true);
        if (Array.isArray(status.personas)) {
          setPersonas(status.personas);
        }
      } else {
        setEnabled(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!enabled) {
    return null;
  }

  const staffPersonas = personas.filter(
    (p) => !p.role || p.role === "USER" || p.role === "STAFF"
  );

  const handleRoleSwitch = async (
    role: "ADMIN" | "PARTNER" | "USER",
    userId?: string,
    personaName?: string
  ) => {
    const loadingKey = userId ? `USER:${userId}` : role;
    setSwitchingRole(loadingKey);
    try {
      const res = await switchDemoRole(role, userId);
      if (!res.success) {
        toast.error(res.error || "Không thể chuyển đổi vai trò Demo");
        return;
      }

      if (role === "ADMIN") {
        toast.success("Đang mở giao diện Chủ Shop (Admin)...");
        setIsOpen(false);
        window.location.href = "/admin";
        return;
      }

      if (role === "PARTNER") {
        toast.success("Đã chuyển sang giao diện Quản Lý Ca (Partner)!");
        setIsOpen(false);
        router.push("/staff-tasks");
        return;
      }

      toast.success(
        personaName
          ? `Đã chuyển sang nhân viên: ${personaName}!`
          : "Đã chuyển sang giao diện Nhân Viên (Staff)!"
      );
      setIsOpen(false);
      router.push("/");
    } finally {
      setSwitchingRole(null);
    }
  };

  const handleToggleModule = (key: keyof DemoModulesConfig, label: string) => {
    const next = toggleModule(key);
    const isNowOn = next[key];
    toast.info(
      isNowOn ? `Đã bật module: ${label}` : `Đã tạm ẩn module: ${label}`
    );
  };

  const handleResetDemo = async () => {
    setIsResetting(true);
    try {
      const res = await resetDemoData();
      if (res.success) {
        toast.success(
          res.message || "Đã random lại bảng lương & tên nhân viên mẫu!"
        );
        const updatedStatus = await fetchDemoStatus();
        if (Array.isArray(updatedStatus.personas)) {
          setPersonas(updatedStatus.personas);
        }
        router.refresh();
      } else {
        toast.error(res.error || "Không thể làm mới dữ liệu Demo");
      }
    } finally {
      setIsResetting(false);
    }
  };

  // Dynamic CSS rules to live-filter modules on Staff PWA views when toggled off
  const disabledCssRules: string[] = [];
  if (!modules.attendance) {
    disabledCssRules.push(
      `#home-checkin-buttons, a[href="/schedule"], a[href="/history"], a[href="/requests"] { display: none !important; }`
    );
  }
  if (!modules.piecework) {
    disabledCssRules.push(
      `a[href="/packing"], a[href="/carrying"], a[href="/tasks"] { display: none !important; }`
    );
  }
  if (!modules.operations) {
    disabledCssRules.push(
      `#home-shift-duties, a[href="/staff-tasks"] { display: none !important; }`
    );
  }
  if (!modules.payroll) {
    disabledCssRules.push(
      `#home-privacy-stats, a[href="/payroll"] { display: none !important; }`
    );
  }
  if (!modules.gamification) {
    disabledCssRules.push(
      `#home-gacha, a[href="/lucky-wheel"], a[href="/rewards"] { display: none !important; }`
    );
  }
  if (!modules.ai_sop) {
    disabledCssRules.push(`#home-sticky { display: none !important; }`);
  }

  return (
    <>
      {disabledCssRules.length > 0 && (
        <style data-testid="demo-module-filter-styles">
          {disabledCssRules.join("\n")}
        </style>
      )}

      {/* Compact Floating Pill above BottomNavigation */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        data-testid="demo-sandbox-pill"
        className="fixed bottom-20 right-3 z-50 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xl ring-2 ring-white/90 transition-all hover:scale-105 active:scale-95 cursor-pointer"
      >
        <span>🧩 Demo Super App</span>
      </button>

      {/* Modal / Drawer Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Demo Super App Studio"
            className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl bg-white p-4 sm:p-5 text-stone-900 shadow-2xl border border-orange-200 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-orange-100 pb-3 mb-3.5">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-extrabold text-orange-800 mb-1">
                  <span>SANDBOX MODE</span>
                  <span>•</span>
                  <span>1-CLICK STUDIO</span>
                </div>
                <h2 className="text-base font-extrabold text-stone-900 leading-tight">
                  🧩 Demo Super App
                </h2>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Chuyển nhanh vai trò & tuỳ chỉnh gói tính năng theo mô hình cửa hàng
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng bảng Demo"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Section 1: 1-Click Role Switcher */}
            <div className="mb-4">
              <p className="text-xs font-extrabold uppercase tracking-wider text-orange-900 mb-2">
                1. Đổi vai trò 1-Click
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={switchingRole !== null}
                  onClick={() => handleRoleSwitch("ADMIN")}
                  className="w-full flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100/80 px-3.5 py-2.5 text-left text-xs font-bold text-amber-950 transition-all cursor-pointer disabled:opacity-60"
                >
                  <span>👑 Chủ Shop (Mở trang Quản trị /admin)</span>
                  <span className="text-[10px] font-semibold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                    Admin SPA
                  </span>
                </button>

                <button
                  type="button"
                  disabled={switchingRole !== null}
                  onClick={() => handleRoleSwitch("PARTNER")}
                  className={`w-full flex items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left text-xs font-bold transition-all cursor-pointer disabled:opacity-60 ${
                    currentProfile.role === "PARTNER"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-400"
                      : "border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/70 text-indigo-950"
                  }`}
                >
                  <span>📋 Quản Lý Ca (Giao việc & KPI)</span>
                  {currentProfile.role === "PARTNER" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-indigo-700">
                      <Check className="h-3 w-3" /> Đang chọn
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                      Partner
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={switchingRole !== null}
                  onClick={() => handleRoleSwitch("USER")}
                  className={`w-full flex items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left text-xs font-bold transition-all cursor-pointer disabled:opacity-60 ${
                    currentProfile.role === "USER"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-400"
                      : "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 text-emerald-950"
                  }`}
                >
                  <span>👷 Nhân Viên (Chấm công, Đóng gói, Gacha)</span>
                  {currentProfile.role === "USER" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700">
                      <Check className="h-3 w-3" /> Đang chọn
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      Staff
                    </span>
                  )}
                </button>
              </div>

              {/* Staff Personas Sub-selector if multiple staff exist */}
              {staffPersonas.length > 0 && (
                <div className="mt-2.5 rounded-2xl bg-stone-50 border border-stone-200/80 p-2.5">
                  <p className="text-[11px] font-bold text-stone-600 mb-1.5">
                    Chọn nhân sự mẫu (Đã ẩn danh):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {staffPersonas.map((persona) => {
                      const isCurrent = currentProfile.id === persona.id;
                      return (
                        <button
                          key={persona.id}
                          type="button"
                          disabled={switchingRole !== null}
                          onClick={() =>
                            handleRoleSwitch("USER", persona.id, persona.name)
                          }
                          className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                            isCurrent
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-white border border-stone-200 text-stone-700 hover:border-emerald-400 hover:text-emerald-800"
                          }`}
                        >
                          {persona.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Module Toggles */}
            <div className="mb-4">
              <p className="text-xs font-extrabold uppercase tracking-wider text-orange-900 mb-2">
                2. Bật / Tắt Module Bán Theo Gói
              </p>
              <div className="space-y-1.5">
                {DEMO_MODULE_LIST.map((mod) => {
                  const isOn = modules[mod.key];
                  return (
                    <div
                      key={mod.key}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-stone-200/80 bg-stone-50/70 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-stone-800 truncate">
                            {mod.label}
                          </span>
                          <span className="rounded-md bg-orange-100 px-1.5 py-0.2 text-[9px] font-bold text-orange-800">
                            {mod.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-500 truncate">
                          {mod.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isOn}
                        aria-label={`Bật tắt ${mod.label}`}
                        data-testid={`toggle-module-${mod.key}`}
                        onClick={() => handleToggleModule(mod.key, mod.label)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          isOn ? "bg-emerald-600" : "bg-stone-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                            isOn ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Reset / Randomize Demo Data */}
            <div className="pt-2 border-t border-orange-100">
              <button
                type="button"
                disabled={isResetting}
                onClick={handleResetDemo}
                data-testid="demo-reset-button"
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isResetting ? "animate-spin" : ""}`}
                />
                <span>🔄 Random lại Lương & Tên NV</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DemoSandboxWidget;
