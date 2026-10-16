import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createECDH } from "node:crypto";

const {
  mockWorkShiftFindMany,
  mockNotificationRuleFindMany,
  mockNotificationRuleUpsert,
  mockNotificationRuleCreate,
  mockNotificationRuleUpdate,
  mockNotificationRuleDelete,
  mockNotificationLogFindFirst,
  mockNotificationLogFindMany,
  mockNotificationLogCreate,
  mockPushSubscriptionFindMany,
  mockPushSubscriptionUpsert,
  mockPushSubscriptionDelete,
} = vi.hoisted(() => ({
  mockWorkShiftFindMany: vi.fn(),
  mockNotificationRuleFindMany: vi.fn(),
  mockNotificationRuleUpsert: vi.fn(),
  mockNotificationRuleCreate: vi.fn(),
  mockNotificationRuleUpdate: vi.fn(),
  mockNotificationRuleDelete: vi.fn(),
  mockNotificationLogFindFirst: vi.fn(),
  mockNotificationLogFindMany: vi.fn(),
  mockNotificationLogCreate: vi.fn(),
  mockPushSubscriptionFindMany: vi.fn(),
  mockPushSubscriptionUpsert: vi.fn(),
  mockPushSubscriptionDelete: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    workShift: {
      findMany: mockWorkShiftFindMany,
    },
    notificationRule: {
      findMany: mockNotificationRuleFindMany,
      upsert: mockNotificationRuleUpsert,
      create: mockNotificationRuleCreate,
      update: mockNotificationRuleUpdate,
      delete: mockNotificationRuleDelete,
    },
    notificationLog: {
      findFirst: mockNotificationLogFindFirst,
      findMany: mockNotificationLogFindMany,
      create: mockNotificationLogCreate,
    },
    pushSubscription: {
      findMany: mockPushSubscriptionFindMany,
      upsert: mockPushSubscriptionUpsert,
      delete: mockPushSubscriptionDelete,
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import {
  DEFAULT_SHIFT_NOTIFICATION_RULES,
  ensureDefaultNotificationRules,
  formatShiftTimeRange,
  getVapidPublicKey,
  renderNotificationTemplate,
  resetShiftNotificationMemoryState,
  runShiftReminderCheck,
  sendNotificationToUser,
} from "../src/lib/shift-notifications";

function generateValidSubscriberKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const p256dh = ecdh
    .getPublicKey()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const auth = Buffer.from("0123456789abcdef", "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { p256dh, auth };
}

describe("Shift Notification Engine & /api/notifications Endpoints", () => {
  const subscriberKeys = generateValidSubscriberKeys();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resetShiftNotificationMemoryState();

    mockNotificationRuleFindMany.mockResolvedValue([]);
    mockNotificationRuleUpsert.mockImplementation(async ({ create }: any) => ({
      id: create.code,
      ...create,
    }));
    mockNotificationLogFindFirst.mockResolvedValue(null);
    mockNotificationLogFindMany.mockResolvedValue([]);
    mockNotificationLogCreate.mockImplementation(async ({ data }: any) => ({
      id: "log-1",
      ...data,
    }));
    mockPushSubscriptionFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
        p256dh: subscriberKeys.p256dh,
        auth: subscriberKeys.auth,
      },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("", { status: 201 })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("1. Default Rules & Formatting Helpers", () => {
    it("ensureDefaultNotificationRules seeds and returns all 4 default shift rules (-30m & -15m start/end)", async () => {
      const rules = await ensureDefaultNotificationRules();

      expect(rules).toHaveLength(4);
      const codes = rules.map((r) => r.code);
      expect(codes).toEqual([
        "SHIFT_START_30M",
        "SHIFT_START_15M",
        "SHIFT_END_30M",
        "SHIFT_END_15M",
      ]);

      const start30 = rules.find((r) => r.code === "SHIFT_START_30M")!;
      expect(start30.triggerType).toBe("BEFORE_SHIFT_START");
      expect(start30.offsetMinutes).toBe(30);
      expect(start30.active).toBe(true);

      const start15 = rules.find((r) => r.code === "SHIFT_START_15M")!;
      expect(start15.triggerType).toBe("BEFORE_SHIFT_START");
      expect(start15.offsetMinutes).toBe(15);

      const end30 = rules.find((r) => r.code === "SHIFT_END_30M")!;
      expect(end30.triggerType).toBe("BEFORE_SHIFT_END");
      expect(end30.offsetMinutes).toBe(30);

      const end15 = rules.find((r) => r.code === "SHIFT_END_15M")!;
      expect(end15.triggerType).toBe("BEFORE_SHIFT_END");
      expect(end15.offsetMinutes).toBe(15);
    });

    it("formats Vietnam shift time range (UTC+7) and renders notification templates", () => {
      // 08:00 - 12:00 ICT = 01:00 - 05:00 UTC
      const start = new Date("2026-10-16T01:00:00.000Z");
      const end = new Date("2026-10-16T05:00:00.000Z");

      const shiftTime = formatShiftTimeRange(start, end);
      expect(shiftTime).toBe("08:00 - 12:00");

      const rendered = renderNotificationTemplate(
        DEFAULT_SHIFT_NOTIFICATION_RULES[0].bodyTemplate,
        {
          name: "Minh Anh",
          shiftTime,
          offsetMinutes: 30,
        }
      );

      expect(rendered).toContain("Minh Anh");
      expect(rendered).toContain("08:00 - 12:00");
      expect(rendered).toContain("30 phút");
    });
  });

  describe("2. runShiftReminderCheck (30m & 15m Before Shift Start and End + Idempotency)", () => {
    // Shift: 2026-10-16 08:00 - 12:00 ICT (01:00 - 05:00 UTC)
    const shiftStart = new Date("2026-10-16T01:00:00.000Z");
    const shiftEnd = new Date("2026-10-16T05:00:00.000Z");

    const sampleShift = {
      id: 101,
      userId: "user-1",
      start: shiftStart,
      end: shiftEnd,
      status: "APPROVED",
      user: {
        id: "user-1",
        name: "Nguyễn Văn A",
        email: "nva@limart.vn",
        isActive: true,
      },
    };

    beforeEach(() => {
      mockWorkShiftFindMany.mockResolvedValue([sampleShift]);
    });

    it("triggers SHIFT_START_30M when shift starts in 30 minutes and prevents duplicate send", async () => {
      // 07:30 ICT = 00:30 UTC (30 minutes before shiftStart)
      const now30mBeforeStart = new Date("2026-10-16T00:30:00.000Z");

      const res1 = await runShiftReminderCheck({ now: now30mBeforeStart });
      expect(res1.checkedShifts).toBe(1);
      expect(res1.matchedReminders).toBe(1);
      expect(res1.notifications[0].ruleCode).toBe("SHIFT_START_30M");
      expect(res1.notifications[0].userName).toBe("Nguyễn Văn A");
      expect(res1.notifications[0].shiftTime).toBe("08:00 - 12:00");
      expect(res1.notifications[0].deliveredDevices).toBe(1);

      // Second call at the same minute must be skipped by idempotency guard
      const res2 = await runShiftReminderCheck({ now: now30mBeforeStart });
      expect(res2.matchedReminders).toBe(0);
    });

    it("triggers SHIFT_START_15M when shift starts in 15 minutes", async () => {
      // 07:45 ICT = 00:45 UTC (15 minutes before shiftStart)
      const now15mBeforeStart = new Date("2026-10-16T00:45:00.000Z");

      const res = await runShiftReminderCheck({ now: now15mBeforeStart });
      expect(res.matchedReminders).toBe(1);
      expect(res.notifications[0].ruleCode).toBe("SHIFT_START_15M");
      expect(res.notifications[0].title).toContain("15 phút");
    });

    it("triggers SHIFT_END_30M when shift ends in 30 minutes", async () => {
      // 11:30 ICT = 04:30 UTC (30 minutes before shiftEnd)
      const now30mBeforeEnd = new Date("2026-10-16T04:30:00.000Z");

      const res = await runShiftReminderCheck({ now: now30mBeforeEnd });
      expect(res.matchedReminders).toBe(1);
      expect(res.notifications[0].ruleCode).toBe("SHIFT_END_30M");
      expect(res.notifications[0].title).toContain("30 phút");
    });

    it("triggers SHIFT_END_15M when shift ends in 15 minutes", async () => {
      // 11:45 ICT = 04:45 UTC (15 minutes before shiftEnd)
      const now15mBeforeEnd = new Date("2026-10-16T04:45:00.000Z");

      const res = await runShiftReminderCheck({ now: now15mBeforeEnd });
      expect(res.matchedReminders).toBe(1);
      expect(res.notifications[0].ruleCode).toBe("SHIFT_END_15M");
      expect(res.notifications[0].title).toContain("15 phút");
    });

    it("deletes expired push subscription when push service returns 410 Gone", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Gone", { status: 410 })
      ) as unknown as typeof fetch;

      const sendRes = await sendNotificationToUser("user-1", {
        title: "Test Expired",
        body: "Cleanup check",
      });

      expect(sendRes.deliveredDevices).toBe(0);
      expect(mockPushSubscriptionDelete).toHaveBeenCalledWith({
        where: { endpoint: "https://fcm.googleapis.com/fcm/send/device-1" },
      });
    });
  });

  describe("3. /api/notifications/* & /api/cron/shift-reminders HTTP Endpoints", () => {
    it("GET /api/notifications/vapid-public-key returns a valid P-256 publicKey", async () => {
      const res = await app.request("/api/notifications/vapid-public-key");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(typeof data.publicKey).toBe("string");
      expect(data.publicKey.length).toBeGreaterThan(80);
      expect(data.publicKey).toBe(getVapidPublicKey());
    });

    it("POST /api/notifications/subscribe saves Web Push subscription for authenticated staff", async () => {
      const staffToken = await signAccessToken({
        sub: "user-1",
        email: "staff@limart.vn",
        role: "USER",
        name: "Staff One",
      });

      mockPushSubscriptionUpsert.mockResolvedValue({
        id: "sub-new",
        userId: "user-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/new-device",
        p256dh: subscriberKeys.p256dh,
        auth: subscriberKeys.auth,
      });

      const res = await app.request("/api/notifications/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/fcm/send/new-device",
          keys: {
            p256dh: subscriberKeys.p256dh,
            auth: subscriberKeys.auth,
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockPushSubscriptionUpsert).toHaveBeenCalled();
    });

    it("POST /api/notifications/test dispatches a test Web Push notification to the current user", async () => {
      const staffToken = await signAccessToken({
        sub: "user-1",
        email: "staff@limart.vn",
        role: "USER",
        name: "Staff One",
      });

      const res = await app.request("/api/notifications/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deliveredDevices).toBe(1);
      expect(data.logged).toBe(true);
      expect(mockNotificationLogCreate).toHaveBeenCalled();
    });

    it("GET /api/notifications/admin/overview returns the 4 default rules, today's shifts, and subscriber stats", async () => {
      const adminToken = await signAccessToken({
        sub: "admin-1",
        email: "admin@limart.vn",
        role: "ADMIN",
        name: "Admin LimArt",
      });

      mockWorkShiftFindMany.mockResolvedValue([
        {
          id: 202,
          userId: "user-1",
          start: new Date("2026-10-16T01:00:00.000Z"),
          end: new Date("2026-10-16T05:00:00.000Z"),
          status: "APPROVED",
          user: {
            id: "user-1",
            name: "Trần Thị B",
            email: "ttb@limart.vn",
            isActive: true,
          },
        },
      ]);

      const res = await app.request("/api/notifications/admin/overview", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.rules).toHaveLength(4);
      expect(data.todayShifts).toHaveLength(1);
      expect(data.todayShifts[0].userName).toBe("Trần Thị B");
      expect(data.todayShifts[0].hasPushSubscription).toBe(true);
      expect(data.stats.totalSubscribers).toBe(1);
      expect(data.stats.todayShiftsCount).toBe(1);
      expect(data.stats.rulesActiveCount).toBe(4);
    });

    it("GET /api/notifications/my, DELETE /api/notifications/unsubscribe, and Admin Rule CRUD + dispatch-today + /api/cron/shift-reminders work end-to-end", async () => {
      const staffToken = await signAccessToken({
        sub: "user-1",
        email: "staff@limart.vn",
        role: "USER",
        name: "Staff One",
      });
      const adminToken = await signAccessToken({
        sub: "admin-1",
        email: "admin@limart.vn",
        role: "ADMIN",
        name: "Admin LimArt",
      });

      mockWorkShiftFindMany.mockResolvedValue([
        {
          id: 303,
          userId: "user-1",
          start: new Date("2026-10-16T01:00:00.000Z"),
          end: new Date("2026-10-16T05:00:00.000Z"),
          status: "APPROVED",
          user: {
            id: "user-1",
            name: "Staff One",
            email: "staff@limart.vn",
            isActive: true,
          },
        },
      ]);

      // GET /my
      const myRes = await app.request("/api/notifications/my", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(myRes.status).toBe(200);
      const myData = await myRes.json();
      expect(myData.success).toBe(true);
      expect(myData.isSubscribed).toBe(true);
      expect(myData.todayShifts).toHaveLength(1);

      // POST /admin/rules
      mockNotificationRuleCreate.mockImplementation(async ({ data }: any) => ({
        id: "rule-custom-45",
        ...data,
      }));
      const createRuleRes = await app.request("/api/notifications/admin/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Nhắc trước 45 phút vào ca",
          triggerType: "BEFORE_SHIFT_START",
          offsetMinutes: 45,
          titleTemplate: "⏰ Còn 45 phút vào ca",
          bodyTemplate: "Chào {name}, chuẩn bị ca {shiftTime}",
        }),
      });
      expect(createRuleRes.status).toBe(200);
      const createRuleData = await createRuleRes.json();
      expect(createRuleData.success).toBe(true);
      expect(createRuleData.rule.offsetMinutes).toBe(45);

      // PATCH /admin/rules/:id/toggle
      mockNotificationRuleUpdate.mockImplementation(async ({ where, data }: any) => ({
        id: where.id || where.code || "SHIFT_START_30M",
        code: "SHIFT_START_30M",
        name: "Nhắc trước 30 phút khi vào ca",
        triggerType: "BEFORE_SHIFT_START",
        offsetMinutes: 30,
        titleTemplate: "⏰ Sắp vào ca",
        bodyTemplate: "Chào {name}",
        active: data.active,
      }));
      const toggleRes = await app.request(
        "/api/notifications/admin/rules/SHIFT_START_30M/toggle",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ active: false }),
        }
      );
      expect(toggleRes.status).toBe(200);
      const toggleData = await toggleRes.json();
      expect(toggleData.rule.active).toBe(false);

      // POST /admin/dispatch-today (by ruleCode)
      const dispatchRuleRes = await app.request(
        "/api/notifications/admin/dispatch-today",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ ruleCode: "SHIFT_START_15M" }),
        }
      );
      expect(dispatchRuleRes.status).toBe(200);
      const dispatchRuleData = await dispatchRuleRes.json();
      expect(dispatchRuleData.success).toBe(true);
      expect(dispatchRuleData.sentCount).toBe(1);
      expect(dispatchRuleData.details[0].ruleCode).toBe("SHIFT_START_15M");

      // POST /admin/dispatch-today (custom message)
      const dispatchCustomRes = await app.request(
        "/api/notifications/admin/dispatch-today",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            customTitle: "📣 Họp nhanh đầu ca",
            customBody: "Chào {name}, nhớ họp đầu ca {shiftTime} nhé!",
          }),
        }
      );
      expect(dispatchCustomRes.status).toBe(200);
      const dispatchCustomData = await dispatchCustomRes.json();
      expect(dispatchCustomData.success).toBe(true);
      expect(dispatchCustomData.sentCount).toBe(1);
      expect(dispatchCustomData.details[0].body).toContain("Staff One");

      // GET /api/cron/shift-reminders
      const cronRes = await app.request("/api/cron/shift-reminders?force=true");
      expect(cronRes.status).toBe(200);
      const cronData = await cronRes.json();
      expect(cronData.success).toBe(true);
      expect(cronData.result.checkedShifts).toBe(1);

      // DELETE /api/notifications/unsubscribe
      const unsubRes = await app.request("/api/notifications/unsubscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
        }),
      });
      expect(unsubRes.status).toBe(200);
      expect(mockPushSubscriptionDelete).toHaveBeenCalled();
    });
  });
});
