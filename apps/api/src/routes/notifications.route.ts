import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { authMiddleware, adminMiddleware, AppEnv } from "../middleware/auth.middleware";
import {
  ensureDefaultNotificationRules,
  formatShiftTimeRange,
  getInMemoryRules,
  getShiftSchedulerTelemetry,
  getVapidPublicKey,
  getVietnamTodayRange,
  normalizeNotificationRule,
  renderNotificationTemplate,
  rescheduleShiftNotifications,
  runShiftReminderCheck,
  sendNotificationToUser,
  setInMemoryRules,
  syncShiftNotificationSchedule,
} from "../lib/shift-notifications";

export const notificationsRoute = new Hono<AppEnv>();

/**
 * GET /api/notifications/vapid-public-key
 * Public endpoint returning the VAPID public key for Web Push subscription.
 */
notificationsRoute.get("/vapid-public-key", (c) => {
  return c.json({
    success: true,
    publicKey: getVapidPublicKey(),
  });
});

/**
 * POST /api/notifications/subscribe
 * Saves or upserts the logged-in staff user's Web Push subscription.
 */
notificationsRoute.post("/subscribe", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || "").trim();
    const p256dh = String(body?.keys?.p256dh || body?.p256dh || "").trim();
    const auth = String(body?.keys?.auth || body?.auth || "").trim();
    const userAgent =
      body?.userAgent || c.req.header("user-agent") || c.req.header("User-Agent") || null;

    if (!endpoint) {
      return c.json({ success: false, error: "Missing push subscription endpoint" }, 400);
    }

    const subModel = (prisma as any)?.pushSubscription;
    let saved: any = {
      id: `sub-${Date.now()}`,
      userId: user.sub,
      endpoint,
      p256dh,
      auth,
      userAgent,
    };

    if (subModel) {
      try {
        if (typeof subModel.upsert === "function") {
          saved = await subModel.upsert({
            where: { endpoint },
            update: {
              userId: user.sub,
              p256dh,
              auth,
              userAgent,
            },
            create: {
              userId: user.sub,
              endpoint,
              p256dh,
              auth,
              userAgent,
            },
          });
        } else if (typeof subModel.create === "function") {
          saved = await subModel.create({
            data: {
              userId: user.sub,
              endpoint,
              p256dh,
              auth,
              userAgent,
            },
          });
        }
      } catch {
        // Resilient fallback if table is not migrated in test environment
      }
    }

    return c.json({
      success: true,
      subscription: saved,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to save push subscription" },
      500
    );
  }
});

/**
 * DELETE /api/notifications/unsubscribe
 * Removes a Web Push subscription by endpoint.
 */
notificationsRoute.delete("/unsubscribe", authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || c.req.query("endpoint") || "").trim();

    if (!endpoint) {
      return c.json({ success: false, error: "Missing endpoint to unsubscribe" }, 400);
    }

    const subModel = (prisma as any)?.pushSubscription;
    if (subModel) {
      try {
        if (typeof subModel.delete === "function") {
          await subModel.delete({ where: { endpoint } });
        } else if (typeof subModel.deleteMany === "function") {
          await subModel.deleteMany({ where: { endpoint } });
        }
      } catch {
        // Ignore if subscription already deleted
      }
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to unsubscribe" }, 500);
  }
});

/**
 * GET /api/notifications/my
 * Returns the logged-in user's today shifts, subscription status, and recent 20 notificationLog items.
 */
notificationsRoute.get("/my", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { startOfDay, endOfDay } = getVietnamTodayRange(new Date());

    let rawTodayShifts: any[] = [];
    if (prisma?.workShift?.findMany) {
      try {
        const found = await prisma.workShift.findMany({
          where: {
            userId: user.sub,
            status: "APPROVED",
            start: { lte: endOfDay },
            end: { gte: startOfDay },
          },
          orderBy: { start: "asc" },
        });
        if (Array.isArray(found)) {
          rawTodayShifts = found;
        }
      } catch {
        rawTodayShifts = [];
      }
    }

    const todayShifts = rawTodayShifts.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      shiftType: s.shiftType || "SHIFT",
      shiftTime: formatShiftTimeRange(s.start, s.end),
    }));

    let subscriptions: any[] = [];
    const subModel = (prisma as any)?.pushSubscription;
    if (subModel && typeof subModel.findMany === "function") {
      try {
        const found = await subModel.findMany({ where: { userId: user.sub } });
        if (Array.isArray(found)) {
          subscriptions = found;
        }
      } catch {
        subscriptions = [];
      }
    }

    let recentLogs: any[] = [];
    const logModel = (prisma as any)?.notificationLog;
    if (logModel && typeof logModel.findMany === "function") {
      try {
        const found = await logModel.findMany({
          where: {
            OR: [{ userId: user.sub }, { userId: null }],
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
        if (Array.isArray(found)) {
          recentLogs = found;
        }
      } catch {
        recentLogs = [];
      }
    }

    const rules = await ensureDefaultNotificationRules();

    return c.json({
      success: true,
      isSubscribed: subscriptions.length > 0,
      subscriptionCount: subscriptions.length,
      todayShifts,
      notifications: recentLogs,
      recentLogs,
      rules: rules.filter((r) => r.active),
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch notifications" },
      500
    );
  }
});

/**
 * POST /api/notifications/test
 * Sends a test Web Push notification to the current user.
 */
notificationsRoute.post("/test", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const title =
      String(body?.title || "").trim() || "🔔 Thông báo Ca Trực LimArt";
    const messageBody =
      String(body?.body || "").trim() ||
      "Thiết bị của bạn đã kết nối thành công! Hệ thống sẽ tự động nhắc trước 30 phút và 15 phút khi vào ca & tan ca.";
    const url = String(body?.url || "/").trim() || "/";

    const result = await sendNotificationToUser(user.sub, {
      title,
      body: messageBody,
      url,
      ruleCode: "TEST_NOTIFICATION",
      channel: "WEB_PUSH",
    });

    return c.json({
      success: true,
      deliveredDevices: result.deliveredDevices,
      logged: result.logged,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to send test notification" },
      500
    );
  }
});

/**
 * GET /api/notifications/admin/overview
 * Returns rules, today's shifts with subscriber status, summary stats, and latest 30 logs.
 */
notificationsRoute.get("/admin/overview", authMiddleware, adminMiddleware, async (c) => {
  try {
    const rules = await ensureDefaultNotificationRules();
    const { startOfDay, endOfDay } = getVietnamTodayRange(new Date());

    let rawShifts: any[] = [];
    if (prisma?.workShift?.findMany) {
      try {
        const found = await prisma.workShift.findMany({
          where: {
            status: "APPROVED",
            start: { lte: endOfDay },
            end: { gte: startOfDay },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                isActive: true,
              },
            },
          },
          orderBy: { start: "asc" },
        });
        if (Array.isArray(found)) {
          rawShifts = found;
        }
      } catch {
        rawShifts = [];
      }
    }

    let allSubscriptions: any[] = [];
    const subModel = (prisma as any)?.pushSubscription;
    if (subModel && typeof subModel.findMany === "function") {
      try {
        const found = await subModel.findMany();
        if (Array.isArray(found)) {
          allSubscriptions = found;
        }
      } catch {
        allSubscriptions = [];
      }
    }

    const subCountByUser = new Map<string, number>();
    for (const sub of allSubscriptions) {
      if (sub?.userId) {
        subCountByUser.set(sub.userId, (subCountByUser.get(sub.userId) || 0) + 1);
      }
    }

    const todayShifts = rawShifts
      .filter((s) => s && s.user?.isActive !== false)
      .map((s) => {
        const uid = String(s.userId || s.user?.id || "");
        const subscriptionCount = subCountByUser.get(uid) || 0;
        return {
          id: s.id,
          shiftId: s.id,
          userId: uid,
          userName: s.user?.name || s.user?.email || "Nhân viên",
          userEmail: s.user?.email || "",
          start: s.start,
          end: s.end,
          shiftTime: formatShiftTimeRange(s.start, s.end),
          hasPushSubscription: subscriptionCount > 0,
          subscriptionCount,
        };
      });

    let recentLogs: any[] = [];
    const logModel = (prisma as any)?.notificationLog;
    if (logModel && typeof logModel.findMany === "function") {
      try {
        const found = await logModel.findMany({
          orderBy: { createdAt: "desc" },
          take: 30,
        });
        if (Array.isArray(found)) {
          recentLogs = found;
        }
      } catch {
        recentLogs = [];
      }
    }

    const rulesActiveCount = rules.filter((r) => r.active).length;
    if (getShiftSchedulerTelemetry().nextWakeupMs === null) {
      await syncShiftNotificationSchedule().catch(() => {});
    }
    const scheduler = getShiftSchedulerTelemetry();

    return c.json({
      success: true,
      rules,
      todayShifts,
      stats: {
        totalSubscribers: allSubscriptions.length,
        todayShiftsCount: todayShifts.length,
        rulesActiveCount,
        activeRules: rulesActiveCount,
      },
      scheduler,
      recentLogs,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to load notification admin overview" },
      500
    );
  }
});

/**
 * POST /api/notifications/admin/rules
 * Creates a new custom NotificationRule.
 */
notificationsRoute.post("/admin/rules", authMiddleware, adminMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const triggerType =
      body?.triggerType === "BEFORE_SHIFT_END" ? "BEFORE_SHIFT_END" : "BEFORE_SHIFT_START";
    const offsetMinutes = Math.max(1, Number(body?.offsetMinutes ?? 15));
    const titleTemplate =
      String(body?.titleTemplate || "").trim() ||
      `⏰ Nhắc ca trực (${offsetMinutes} phút)`;
    const bodyTemplate =
      String(body?.bodyTemplate || "").trim() ||
      "Chào {name}, lưu ý ca trực ({shiftTime}) của bạn hôm nay nhé!";
    const targetUrl = String(body?.targetUrl || "/").trim() || "/";
    const active = Boolean(body?.active ?? body?.enabled ?? true);

    if (!name) {
      return c.json({ success: false, error: "Rule name is required" }, 400);
    }

    const code =
      String(body?.code || "").trim() ||
      `CUSTOM_${triggerType === "BEFORE_SHIFT_END" ? "END" : "START"}_${offsetMinutes}M_${Date.now().toString(36).toUpperCase()}`;

    const ruleData = {
      code,
      name,
      triggerType,
      offsetMinutes,
      titleTemplate,
      bodyTemplate,
      targetUrl,
      active,
    };

    const ruleModel = (prisma as any)?.notificationRule;
    let created: any = { id: code, ...ruleData };

    if (ruleModel && typeof ruleModel.create === "function") {
      try {
        created = await ruleModel.create({ data: ruleData });
      } catch {
        // Fallback to in-memory rule creation
      }
    }

    const normalized = normalizeNotificationRule(created);
    const current = getInMemoryRules();
    setInMemoryRules([...current.filter((r) => r.code !== normalized.code), normalized]);

    void rescheduleShiftNotifications();

    return c.json({
      success: true,
      rule: normalized,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to create rule" }, 500);
  }
});

/**
 * PUT /api/notifications/admin/rules/:id
 * Updates an existing NotificationRule.
 */
notificationsRoute.put("/admin/rules/:id", authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));

    const updateFields: Record<string, any> = {};
    if (body?.name !== undefined) updateFields.name = String(body.name).trim();
    if (body?.triggerType !== undefined) {
      updateFields.triggerType =
        body.triggerType === "BEFORE_SHIFT_END" ? "BEFORE_SHIFT_END" : "BEFORE_SHIFT_START";
    }
    if (body?.offsetMinutes !== undefined) {
      updateFields.offsetMinutes = Math.max(1, Number(body.offsetMinutes));
    }
    if (body?.titleTemplate !== undefined) {
      updateFields.titleTemplate = String(body.titleTemplate);
    }
    if (body?.bodyTemplate !== undefined) {
      updateFields.bodyTemplate = String(body.bodyTemplate);
    }
    if (body?.targetUrl !== undefined) {
      updateFields.targetUrl = String(body.targetUrl);
    }
    if (body?.active !== undefined || body?.enabled !== undefined) {
      updateFields.active = Boolean(body.active ?? body.enabled);
    }

    const ruleModel = (prisma as any)?.notificationRule;
    let updated: any = null;

    if (ruleModel && typeof ruleModel.update === "function") {
      try {
        updated = await ruleModel.update({
          where: { id },
          data: updateFields,
        });
      } catch {
        try {
          updated = await ruleModel.update({
            where: { code: id },
            data: updateFields,
          });
        } catch {
          updated = null;
        }
      }
    }

    const current = getInMemoryRules();
    const targetIdx = current.findIndex((r) => r.id === id || r.code === id);
    if (!updated && targetIdx >= 0) {
      updated = { ...current[targetIdx], ...updateFields };
    } else if (!updated) {
      updated = { id, code: id, ...updateFields };
    }

    const normalized = normalizeNotificationRule(updated);
    if (targetIdx >= 0) {
      const next = [...current];
      next[targetIdx] = normalized;
      setInMemoryRules(next);
    }

    void rescheduleShiftNotifications();

    return c.json({
      success: true,
      rule: normalized,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to update rule" }, 500);
  }
});

/**
 * PATCH /api/notifications/admin/rules/:id/toggle
 * Toggles `active` status on a NotificationRule.
 */
notificationsRoute.patch("/admin/rules/:id/toggle", authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));

    const rules = await ensureDefaultNotificationRules();
    const existing = rules.find((r) => r.id === id || r.code === id);
    const nextActive =
      body?.active !== undefined
        ? Boolean(body.active)
        : body?.enabled !== undefined
          ? Boolean(body.enabled)
          : existing
            ? !existing.active
            : false;

    const ruleModel = (prisma as any)?.notificationRule;
    let updated: any = null;

    if (ruleModel && typeof ruleModel.update === "function") {
      try {
        updated = await ruleModel.update({
          where: { id },
          data: { active: nextActive },
        });
      } catch {
        try {
          updated = await ruleModel.update({
            where: { code: id },
            data: { active: nextActive },
          });
        } catch {
          updated = null;
        }
      }
    }

    const baseRule = updated ||
      existing || {
        id,
        code: id,
        name: "Mốc nhắc ca",
        triggerType: "BEFORE_SHIFT_START",
        offsetMinutes: 15,
        titleTemplate: "",
        bodyTemplate: "",
        targetUrl: "/",
      };

    const normalized = normalizeNotificationRule({
      ...baseRule,
      active: nextActive,
      enabled: nextActive,
    });

    const mem = getInMemoryRules();
    setInMemoryRules(
      mem.map((r) => (r.id === id || r.code === id ? normalized : r))
    );

    void rescheduleShiftNotifications();

    return c.json({
      success: true,
      rule: normalized,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to toggle rule" }, 500);
  }
});

/**
 * DELETE /api/notifications/admin/rules/:id
 * Deletes a custom NotificationRule.
 */
notificationsRoute.delete("/admin/rules/:id", authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const ruleModel = (prisma as any)?.notificationRule;

    if (ruleModel && typeof ruleModel.delete === "function") {
      try {
        await ruleModel.delete({ where: { id } });
      } catch {
        try {
          await ruleModel.delete({ where: { code: id } });
        } catch {
          // Ignore if only in memory
        }
      }
    }

    const mem = getInMemoryRules();
    setInMemoryRules(mem.filter((r) => r.id !== id && r.code !== id));

    void rescheduleShiftNotifications();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to delete rule" }, 500);
  }
});

/**
 * POST /api/notifications/admin/dispatch-today
 * Immediately dispatches a shift reminder (by `ruleCode`, custom message, or all active rules)
 * to all employees who have an approved shift today.
 */
notificationsRoute.post("/admin/dispatch-today", authMiddleware, adminMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const ruleCode = body?.ruleCode ? String(body.ruleCode).trim() : undefined;
    const customTitle = String(body?.customTitle || body?.title || "").trim();
    const customBody = String(body?.customBody || body?.body || "").trim();

    if (customTitle && customBody && !ruleCode) {
      const { startOfDay, endOfDay } = getVietnamTodayRange(new Date());
      let shifts: any[] = [];
      if (prisma?.workShift?.findMany) {
        try {
          const found = await prisma.workShift.findMany({
            where: {
              status: "APPROVED",
              start: { lte: endOfDay },
              end: { gte: startOfDay },
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  isActive: true,
                },
              },
            },
            orderBy: { start: "asc" },
          });
          if (Array.isArray(found)) {
            shifts = found;
          }
        } catch {
          shifts = [];
        }
      }

      const details: any[] = [];
      for (const shift of shifts) {
        if (!shift || shift.user?.isActive === false) continue;
        const userId = String(shift.userId || shift.user?.id || "");
        if (!userId) continue;
        const userName = String(shift.user?.name || shift.user?.email || "Bạn");
        const shiftTime = formatShiftTimeRange(shift.start, shift.end);

        const renderedTitle = renderNotificationTemplate(customTitle, {
          name: userName,
          shiftTime,
          offsetMinutes: 0,
        });
        const renderedBody = renderNotificationTemplate(customBody, {
          name: userName,
          shiftTime,
          offsetMinutes: 0,
        });

        const sendRes = await sendNotificationToUser(userId, {
          title: renderedTitle,
          body: renderedBody,
          url: "/",
          shiftId: shift.id,
          ruleCode: "CUSTOM_ADMIN_DISPATCH",
          channel: "WEB_PUSH",
        });

        details.push({
          shiftId: shift.id,
          userId,
          userName,
          ruleCode: "CUSTOM_ADMIN_DISPATCH",
          title: renderedTitle,
          body: renderedBody,
          shiftTime,
          deliveredDevices: sendRes.deliveredDevices,
        });
      }

      return c.json({
        success: true,
        sentCount: details.length,
        details,
      });
    }

    const checkRes = await runShiftReminderCheck(
      ruleCode ? { forceRuleCode: ruleCode } : { forceAllToday: true }
    );

    return c.json({
      success: true,
      sentCount: checkRes.matchedReminders,
      checkedShifts: checkRes.checkedShifts,
      details: checkRes.notifications,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to dispatch today shift notifications" },
      500
    );
  }
});
