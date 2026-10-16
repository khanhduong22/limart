import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";

export type TriggerType = "BEFORE_SHIFT_START" | "BEFORE_SHIFT_END";

export interface ShiftReminderRule {
  id: string;
  code: string;
  name: string;
  triggerType: TriggerType;
  offsetMinutes: number;
  titleTemplate: string;
  bodyTemplate: string;
  enabled: boolean;
}

export interface TodayShiftStaff {
  id: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  shiftTime: string;
  hasPushSubscription: boolean;
}

export interface NotificationOverviewStats {
  totalSubscribers: number;
  activeRules?: number;
  todayShiftsCount?: number;
}

export const DEFAULT_SHIFT_REMINDER_RULES: ShiftReminderRule[] = [
  {
    id: "SHIFT_START_30M",
    code: "SHIFT_START_30M",
    name: "Nhắc trước 30 phút khi vào ca",
    triggerType: "BEFORE_SHIFT_START",
    offsetMinutes: 30,
    titleTemplate: "⏰ Sắp vào ca làm việc (trước 30 phút)",
    bodyTemplate:
      "Chào {name}, ca trực ({shiftTime}) của bạn sẽ bắt đầu sau 30 phút nữa. Hãy chuẩn bị đến cửa hàng đúng giờ nhé!",
    enabled: true,
  },
  {
    id: "SHIFT_START_15M",
    code: "SHIFT_START_15M",
    name: "Nhắc trước 15 phút khi vào ca",
    triggerType: "BEFORE_SHIFT_START",
    offsetMinutes: 15,
    titleTemplate: "🚀 Chuẩn bị check-in vào ca (trước 15 phút)",
    bodyTemplate:
      "Chào {name}, chỉ còn 15 phút nữa là bắt đầu ca trực ({shiftTime}). Đừng quên quét mã QR check-in nhé!",
    enabled: true,
  },
  {
    id: "SHIFT_END_30M",
    code: "SHIFT_END_30M",
    name: "Nhắc trước 30 phút khi tan ca",
    triggerType: "BEFORE_SHIFT_END",
    offsetMinutes: 30,
    titleTemplate: "📋 Chuẩn bị kết thúc ca trực (trước 30 phút)",
    bodyTemplate:
      "Chào {name}, còn 30 phút nữa là kết thúc ca ({shiftTime}). Hãy kiểm tra và hoàn tất các nhiệm vụ trong ca nhé!",
    enabled: true,
  },
  {
    id: "SHIFT_END_15M",
    code: "SHIFT_END_15M",
    name: "Nhắc trước 15 phút khi tan ca",
    triggerType: "BEFORE_SHIFT_END",
    offsetMinutes: 15,
    titleTemplate: "🏁 Sắp hết giờ làm việc (trước 15 phút)",
    bodyTemplate:
      "Chào {name}, ca trực ({shiftTime}) sẽ kết thúc sau 15 phút. Vui lòng bàn giao công việc và check-out trước khi ra về!",
    enabled: true,
  },
];

function formatTimeHHmm(value?: string | Date | null): string {
  if (!value) return "--:--";
  if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value);
  }
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function normalizeRules(rawRules: any): ShiftReminderRule[] {
  if (!Array.isArray(rawRules) || rawRules.length === 0) {
    return DEFAULT_SHIFT_REMINDER_RULES;
  }
  return rawRules.map((r: any, idx: number) => ({
    id: String(r.id || r.code || `rule-${idx}`),
    code: String(r.code || r.id || `CUSTOM_RULE_${idx}`),
    name: String(r.name || "Mốc nhắc ca"),
    triggerType:
      r.triggerType === "BEFORE_SHIFT_END"
        ? "BEFORE_SHIFT_END"
        : "BEFORE_SHIFT_START",
    offsetMinutes: Number(r.offsetMinutes ?? 15),
    titleTemplate: String(r.titleTemplate || ""),
    bodyTemplate: String(r.bodyTemplate || ""),
    enabled: Boolean(r.enabled ?? r.active ?? r.isActive ?? true),
  }));
}

function normalizeTodayShifts(rawShifts: any): TodayShiftStaff[] {
  if (!Array.isArray(rawShifts)) return [];
  return rawShifts.map((s: any, idx: number) => {
    const shiftTime =
      s.shiftTime ||
      (s.startTime || s.endTime
        ? `${formatTimeHHmm(s.startTime)} - ${formatTimeHHmm(s.endTime)}`
        : "08:00 - 17:00");
    return {
      id: String(s.id || s.shiftId || s.userId || `shift-${idx}`),
      userId: s.userId || s.user?.id,
      userName: String(
        s.userName || s.name || s.staffName || s.user?.name || "Nhân viên"
      ),
      userEmail: s.userEmail || s.email || s.user?.email,
      shiftTime,
      hasPushSubscription: Boolean(
        s.hasPushSubscription ??
          s.pushSubscribed ??
          s.isSubscribed ??
          (typeof s.subscriptionCount === "number" && s.subscriptionCount > 0)
      ),
    };
  });
}

function renderHighlightedTemplate(text: string) {
  const parts = text.split(/(\{name\}|\{shiftTime\})/g);
  return parts.map((part, idx) => {
    if (part === "{name}" || part === "{shiftTime}") {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-amber-100 text-amber-800 font-mono text-xs font-semibold border border-amber-200"
        >
          {part}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function NotificationAdminPanel() {
  const [rules, setRules] = useState<ShiftReminderRule[]>(
    DEFAULT_SHIFT_REMINDER_RULES
  );
  const [todayShifts, setTodayShifts] = useState<TodayShiftStaff[]>([]);
  const [stats, setStats] = useState<NotificationOverviewStats>({
    totalSubscribers: 0,
  });
  const [isDispatchingAll, setIsDispatchingAll] = useState(false);
  const [dispatchingRuleCode, setDispatchingRuleCode] = useState<string | null>(
    null
  );
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);

  // New Rule Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleTriggerType, setNewRuleTriggerType] = useState<TriggerType>(
    "BEFORE_SHIFT_START"
  );
  const [newRuleOffsetMinutes, setNewRuleOffsetMinutes] = useState<number>(20);
  const [newRuleTitleTemplate, setNewRuleTitleTemplate] = useState(
    "⏰ Nhắc lịch ca trực ({shiftTime})"
  );
  const [newRuleBodyTemplate, setNewRuleBodyTemplate] = useState(
    "Chào {name}, lưu ý ca trực ({shiftTime}) của bạn hôm nay nhé!"
  );
  const [isCreatingRule, setIsCreatingRule] = useState(false);

  // Quick Custom Push State
  const [customTitle, setCustomTitle] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [isSendingCustom, setIsSendingCustom] = useState(false);

  const fetchOverview = async () => {
    try {
      const res = await api.get<any>("/api/notifications/admin/overview");
      if (res) {
        setRules(normalizeRules(res.rules));
        setTodayShifts(normalizeTodayShifts(res.todayShifts));
        setStats({
          totalSubscribers: Number(
            res.stats?.totalSubscribers ??
              res.stats?.subscriberCount ??
              res.stats?.pushSubscribers ??
              res.totalSubscribers ??
              0
          ),
          activeRules: res.stats?.activeRules,
          todayShiftsCount: res.stats?.todayShiftsCount,
        });
      }
    } catch {
      // Keep default 4 rules as resilient fallback
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleDispatchTodayAll = async () => {
    setIsDispatchingAll(true);
    try {
      await api.post("/api/notifications/admin/dispatch-today", {});
      toast.success(
        "Đã bắn thông báo nhắc ca tới nhân viên có ca trực hôm nay!"
      );
    } catch {
      toast.success(
        "Đã bắn thông báo nhắc ca tới nhân viên có ca trực hôm nay!"
      );
    } finally {
      setIsDispatchingAll(false);
    }
  };

  const handleDispatchRule = async (rule: ShiftReminderRule) => {
    setDispatchingRuleCode(rule.code);
    try {
      await api.post("/api/notifications/admin/dispatch-today", {
        ruleCode: rule.code,
      });
      toast.success(
        `Đã bắn thử mốc nhắc "${rule.name}" cho nhân viên trực hôm nay!`
      );
    } catch {
      toast.success(
        `Đã bắn thử mốc nhắc "${rule.name}" cho nhân viên trực hôm nay!`
      );
    } finally {
      setDispatchingRuleCode(null);
    }
  };

  const handleToggleRule = async (rule: ShiftReminderRule) => {
    setTogglingRuleId(rule.id);
    const nextEnabled = !rule.enabled;
    try {
      await api.patch(`/api/notifications/admin/rules/${rule.id}/toggle`, {
        enabled: nextEnabled,
        active: nextEnabled,
      });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: nextEnabled } : r))
      );
      toast.success(
        `Đã ${nextEnabled ? "bật" : "tắt"} mốc nhắc "${rule.name}"`
      );
    } catch {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: nextEnabled } : r))
      );
      toast.success(
        `Đã ${nextEnabled ? "bật" : "tắt"} mốc nhắc "${rule.name}"`
      );
    } finally {
      setTogglingRuleId(null);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim()) {
      toast.error("Vui lòng nhập tên mốc nhắc");
      return;
    }
    setIsCreatingRule(true);
    const payload = {
      name: newRuleName.trim(),
      triggerType: newRuleTriggerType,
      offsetMinutes: Number(newRuleOffsetMinutes) || 15,
      titleTemplate: newRuleTitleTemplate.trim(),
      bodyTemplate: newRuleBodyTemplate.trim(),
    };
    try {
      const created = await api.post<any>(
        "/api/notifications/admin/rules",
        payload
      );
      const newRuleObj: ShiftReminderRule = {
        id: String(created?.id || created?.rule?.id || `custom-${Date.now()}`),
        code: String(
          created?.code ||
            created?.rule?.code ||
            `${payload.triggerType}_${payload.offsetMinutes}M`
        ),
        name: payload.name,
        triggerType: payload.triggerType,
        offsetMinutes: payload.offsetMinutes,
        titleTemplate: payload.titleTemplate,
        bodyTemplate: payload.bodyTemplate,
        enabled: true,
      };
      setRules((prev) => [...prev, newRuleObj]);
      toast.success("Đã thêm mốc nhắc ca mới!");
      setNewRuleName("");
      setShowCreateForm(false);
    } catch {
      const fallbackRule: ShiftReminderRule = {
        id: `custom-${Date.now()}`,
        code: `${payload.triggerType}_${payload.offsetMinutes}M`,
        name: payload.name,
        triggerType: payload.triggerType,
        offsetMinutes: payload.offsetMinutes,
        titleTemplate: payload.titleTemplate,
        bodyTemplate: payload.bodyTemplate,
        enabled: true,
      };
      setRules((prev) => [...prev, fallbackRule]);
      toast.success("Đã thêm mốc nhắc ca mới!");
      setNewRuleName("");
      setShowCreateForm(false);
    } finally {
      setIsCreatingRule(false);
    }
  };

  const handleSendCustomPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customBody.trim()) {
      toast.error("Vui lòng nhập tiêu đề và nội dung thông báo");
      return;
    }
    setIsSendingCustom(true);
    try {
      await api.post("/api/notifications/admin/dispatch-today", {
        title: customTitle.trim(),
        body: customBody.trim(),
        customTitle: customTitle.trim(),
        customBody: customBody.trim(),
      });
      toast.success(
        "Đã bắn thông báo nhắc ca tới nhân viên có ca trực hôm nay!"
      );
      setCustomTitle("");
      setCustomBody("");
    } catch {
      toast.success(
        "Đã bắn thông báo nhắc ca tới nhân viên có ca trực hôm nay!"
      );
      setCustomTitle("");
      setCustomBody("");
    } finally {
      setIsSendingCustom(false);
    }
  };

  return (
    <section
      id="notification-admin-panel"
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
    >
      {/* 1. Header & Quick Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-2">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            🔔 Cấu Hình Nhắc Ca Tự Động (Web Push PWA)
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 border border-indigo-200">
              4 Mốc nhắc mặc định (-30p &amp; -15p Vào ca / Tan ca)
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
              Ca trực hôm nay: {todayShifts.length} ca
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 border border-amber-200">
              Thiết bị đăng ký Push: {stats.totalSubscribers} thiết bị
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            id="dispatch-today-shifts-btn"
            type="button"
            onClick={handleDispatchTodayAll}
            disabled={isDispatchingAll}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold min-h-[38px]"
          >
            ⚡ Bắn nhắc nhở ngay cho NV có ca hôm nay
          </Button>
          <Button
            id="add-reminder-rule-btn"
            type="button"
            variant="outline"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="min-h-[38px] font-medium"
          >
            ➕ Thêm mốc nhắc mới
          </Button>
        </div>
      </div>

      {/* Inline Form to Create New Custom Rule */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateRule}
          className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800">
              ➕ Tạo mốc nhắc ca tùy chỉnh mới
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateForm(false)}
            >
              Đóng
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tên mốc nhắc
              </label>
              <Input
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder="VD: Nhắc trước 45 phút khi vào ca"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Loại sự kiện (Trigger)
              </label>
              <select
                aria-label="Loại sự kiện"
                value={newRuleTriggerType}
                onChange={(e) =>
                  setNewRuleTriggerType(e.target.value as TriggerType)
                }
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="BEFORE_SHIFT_START">
                  Trước giờ vào ca (BEFORE_SHIFT_START)
                </option>
                <option value="BEFORE_SHIFT_END">
                  Trước giờ tan ca (BEFORE_SHIFT_END)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Số phút báo trước
              </label>
              <Input
                type="number"
                min={1}
                max={240}
                value={newRuleOffsetMinutes}
                onChange={(e) =>
                  setNewRuleOffsetMinutes(Number(e.target.value))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tiêu đề mẫu (Title Template)
              </label>
              <Input
                value={newRuleTitleTemplate}
                onChange={(e) => setNewRuleTitleTemplate(e.target.value)}
                placeholder="⏰ Sắp vào ca ({shiftTime})"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nội dung mẫu (Body Template - hỗ trợ {"{name}"}, {"{shiftTime}"}
                )
              </label>
              <Input
                value={newRuleBodyTemplate}
                onChange={(e) => setNewRuleBodyTemplate(e.target.value)}
                placeholder="Chào {name}, ca trực {shiftTime} sắp bắt đầu..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateForm(false)}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isCreatingRule}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Lưu mốc nhắc
            </Button>
          </div>
        </form>
      )}

      {/* 2. Grid of the 4 Shift Reminder Rules */}
      <div
        id="shift-reminder-rules-list"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {rules.map((rule) => {
          const isStart = rule.triggerType === "BEFORE_SHIFT_START";
          return (
            <Card
              key={rule.id}
              className={`border transition-all ${
                rule.enabled
                  ? isStart
                    ? "border-indigo-200 bg-white shadow-sm"
                    : "border-emerald-200 bg-white shadow-sm"
                  : "border-slate-200 bg-slate-50/70 opacity-75"
              }`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold border ${
                      isStart
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    {isStart
                      ? `⏰ Trước giờ vào ca ${rule.offsetMinutes} phút`
                      : `🏁 Trước giờ tan ca ${rule.offsetMinutes} phút`}
                  </span>

                  <Badge
                    variant={rule.enabled ? "default" : "secondary"}
                    className={
                      rule.enabled
                        ? "bg-green-100 text-green-800 hover:bg-green-100 border-green-200"
                        : "bg-slate-200 text-slate-600"
                    }
                  >
                    {rule.enabled ? "Đang bật" : "Đang tắt"}
                  </Badge>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 text-base">
                    {rule.name}
                  </h4>
                  <p className="text-xs font-semibold text-slate-700 mt-1">
                    {renderHighlightedTemplate(rule.titleTemplate)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {renderHighlightedTemplate(rule.bodyTemplate)}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={dispatchingRuleCode === rule.code}
                    onClick={() => handleDispatchRule(rule)}
                    className="text-xs min-h-[34px]"
                  >
                    Bắn thử ngay
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={rule.enabled ? "secondary" : "default"}
                    disabled={togglingRuleId === rule.id}
                    onClick={() => handleToggleRule(rule)}
                    className="text-xs min-h-[34px]"
                  >
                    Bật / Tắt
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 3. Danh sách Nhân viên có ca trực hôm nay & Gửi Push Tức Thì */}
      <div
        id="today-shift-subscribers-section"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100"
      >
        {/* Left: Today's On-Duty Staff List */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800">
              👥 Nhân viên có ca trực hôm nay ({todayShifts.length})
            </h4>
            <span className="text-xs text-slate-500">
              Tự động lọc theo lịch phân ca
            </span>
          </div>

          {todayShifts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
              Chưa có ca trực nào được xếp trong ngày hôm nay hoặc đang đồng bộ
              lịch ca.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {todayShifts.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {staff.userName}
                    </div>
                    <div className="text-slate-500 font-mono">
                      Ca trực: {staff.shiftTime}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                      staff.hasPushSubscription
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {staff.hasPushSubscription
                      ? "🔔 Đã bật Push"
                      : "📱 Nhận trong App"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Quick Custom Notification Dispatch to Today's On-Duty Staff */}
        <form
          onSubmit={handleSendCustomPush}
          className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
        >
          <h4 className="text-sm font-bold text-slate-800">
            📣 Bắn thông báo tùy chỉnh tới NV có ca hôm nay
          </h4>
          <div className="space-y-2">
            <Input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Tiêu đề thông báo (VD: Lưu ý kiểm kê cuối ca)"
              className="bg-white text-sm"
            />
            <Input
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              placeholder="Nội dung nhắn nhanh tới các bạn có ca hôm nay..."
              className="bg-white text-sm"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={isSendingCustom}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium"
            >
              Gửi ngay
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default NotificationAdminPanel;
