import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { queryClient as defaultQueryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  DEMO_MODULE_DEFINITIONS,
  fetchDemoStatus,
  resetDemoData,
  switchDemoRole,
  toggleDemoModule,
  useDemoModules,
  type DemoModulesConfig,
  type DemoRole,
} from "@/lib/demo-mode";

export interface DemoSandboxWidgetProps {
  onNavigate?: (path: string) => void;
}

export function DemoSandboxWidget({ onNavigate }: DemoSandboxWidgetProps = {}) {
  const queryClient = useQueryClient(defaultQueryClient);
  const modules = useDemoModules();

  const [enabled, setEnabled] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeRole, setActiveRole] = useState<DemoRole>("ADMIN");
  const [isBusy, setIsBusy] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    fetchDemoStatus().then((status) => {
      if (!mounted) return;
      if (status.enabled) {
        setEnabled(true);
        if (status.role) {
          setActiveRole(status.role);
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

  const totalCount = DEMO_MODULE_DEFINITIONS.length;
  const enabledCount = DEMO_MODULE_DEFINITIONS.filter(
    (item) => modules[item.key] !== false
  ).length;

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    if (typeof window !== "undefined") {
      try {
        window.location.href = path;
      } catch {
        // Ignore JSDOM navigation warning in unit test environments
      }
    }
  };

  const handleSwitchRole = async (role: DemoRole, targetPath: string) => {
    setIsBusy(true);
    try {
      const res = await switchDemoRole(role);
      setActiveRole(role);
      await queryClient.invalidateQueries();
      if (role !== "ADMIN" || (res.ok && targetPath !== "/admin")) {
        navigateTo(targetPath);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleModule = async (key: keyof DemoModulesConfig) => {
    await toggleDemoModule(key);
  };

  const handleResetDemo = async () => {
    setIsBusy(true);
    try {
      await resetDemoData();
      toast.success("Đã random lại tên & mức lương nhân viên mới!");
      await queryClient.invalidateQueries();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 select-none font-sans">
      {isOpen && (
        <div
          role="dialog"
          aria-label="DemoMart — Hệ Điều Hành Bán Lẻ Modular"
          className="mb-3 w-80 sm:w-96 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* 1. Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-white flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold tracking-tight">
                DemoMart — Hệ Điều Hành Bán Lẻ Modular
              </h3>
              <p className="text-[11px] text-emerald-100 mt-0.5">
                Dữ liệu nhân sự & lương đã được ẩn danh tự động
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng bảng Demo Studio"
              className="rounded-lg p-1 text-emerald-100 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* 2. 1-Click Role Switcher */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Chuyển nhanh góc nhìn (1-Click Role Switcher)
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleSwitchRole("ADMIN", "/admin")}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                    activeRole === "ADMIN"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-200"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  )}
                >
                  <span>👑 Chủ Shop (Admin)</span>
                  {activeRole === "ADMIN" && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                      Active
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleSwitchRole("PARTNER", "/staff-tasks")}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                    activeRole === "PARTNER"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-200"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  )}
                >
                  <span>📋 Quản Lý Ca (Partner)</span>
                  <span className="text-[10px] text-slate-400">/staff-tasks</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleSwitchRole("USER", "/")}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                    activeRole === "USER"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-200"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  )}
                >
                  <span>👷 Nhân Viên (Staff PWA)</span>
                  <span className="text-[10px] text-slate-400">/</span>
                </button>
              </div>
            </div>

            {/* 3. Live Feature Flags */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Bật / Tắt Module Bán Theo Gói
                </p>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  {enabledCount}/{totalCount} Modules
                </span>
              </div>

              <div className="space-y-1.5">
                {DEMO_MODULE_DEFINITIONS.map((mod) => {
                  const isChecked = modules[mod.key] !== false;
                  return (
                    <label
                      key={mod.key}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-slate-100/80 transition-colors cursor-pointer"
                    >
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        {mod.label}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isChecked}
                        aria-label={mod.label}
                        onClick={() => handleToggleModule(mod.key)}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer",
                          isChecked
                            ? "bg-emerald-600"
                            : "bg-slate-300 dark:bg-slate-600"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-xs",
                            isChecked ? "translate-x-4" : "translate-x-1"
                          )}
                        />
                      </button>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 4. Reset Demo Data Button */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isBusy}
                onClick={handleResetDemo}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs transition-all cursor-pointer active:scale-98 disabled:opacity-60"
              >
                🔄 Random lại Lương & Tên NV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Pill Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 shadow-xl border border-slate-700 transition-all hover:scale-102 active:scale-98 cursor-pointer"
      >
        <span className="text-xs sm:text-sm font-bold">
          🧩 Super App Demo Studio
        </span>
        <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-extrabold">
          {enabledCount}/{totalCount} Modules
        </span>
      </button>
    </div>
  );
}

export default DemoSandboxWidget;
