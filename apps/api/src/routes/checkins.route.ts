import { Hono } from "hono";
import { prisma } from "@checkin/db";
import {
  CheckinRequestSchema,
  isIPMatch,
  isInsideGeofence,
} from "@checkin/shared";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getClientIP, getAllowedIPs } from "../lib/ip-utils";
import { getVietnamDayRange } from "../lib/date-utils";
import { getOrSetCache, invalidateCachePattern } from "../lib/cache";
import { acquireLock } from "../lib/lock";
import { checkinRateLimiter } from "../middleware/rate-limiter";
import { recordSecureAuditLog } from "../lib/audit";

export const checkinsRoute = new Hono<AppEnv>();

// Enforce Rate Limiting: max 20 requests per minute per user/IP across /api/checkins/*
checkinsRoute.use("*", checkinRateLimiter);

// GET /api/checkins/today
checkinsRoute.get("/today", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { startOfDay, endOfDay, dateStr } = getVietnamDayRange();
    const isAdmin = user.role === "ADMIN";
    const isAll = isAdmin && c.req.query("all") !== "false";

    const whereClause: any = {
      timestamp: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };
    if (!isAll) {
      whereClause.userId = user.sub;
    }

    const cacheKey = isAll
      ? `checkin:today:all:${dateStr}`
      : `checkin:today:${user.sub}:${dateStr}`;

    const checkins = await getOrSetCache(cacheKey, 30, async () => {
      return await prisma.checkIn.findMany({
        where: whereClause,
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true, role: true },
          },
        },
        orderBy: { timestamp: "desc" },
      });
    });

    return c.json({
      success: true,
      data: checkins,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch checkins" },
      500
    );
  }
});

// GET /api/checkins/status
checkinsRoute.get("/status", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { startOfDay, endOfDay, dateStr } = getVietnamDayRange();

    const cacheKey = `checkin:status:${user.sub}:${dateStr}`;
    const statusData = await getOrSetCache(cacheKey, 15, async () => {
      const checkins = await prisma.checkIn.findMany({
        where: {
          userId: user.sub,
          timestamp: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: { timestamp: "desc" },
      });

      const lastCheckin = checkins[0] || null;
      const isWorking = lastCheckin?.type === "checkin";

      return {
        isWorking,
        isCheckedIn: isWorking,
        lastCheckin,
        todayCheckins: checkins,
      };
    });

    return c.json({
      success: true,
      data: statusData,
      isWorking: statusData.isWorking,
      isCheckedIn: statusData.isCheckedIn,
      lastCheckin: statusData.lastCheckin,
      todayCheckins: statusData.todayCheckins,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch checkin status" },
      500
    );
  }
});

async function handleCheckinPost(c: any, forcedType?: "checkin" | "checkout") {
  const user = c.get("user");
  const lock = await acquireLock(`lock:checkin:${user.sub}`, 5000);
  if (!lock.acquired) {
    return c.json(
      {
        success: false,
        error: "Yêu cầu chấm công đang được xử lý, vui lòng chờ giây lát.",
        code: "CHECKIN_IN_PROGRESS",
      },
      400
    );
  }

  try {
    const rawBody = await c.req.json().catch(() => ({}));
    const body = forcedType && !rawBody.type ? { ...rawBody, type: forcedType } : (forcedType ? { ...rawBody, type: forcedType } : rawBody);
    const parseResult = CheckinRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return c.json(
        {
          success: false,
          error: "Invalid request payload",
          details: parseResult.error.flatten(),
        },
        400
      );
    }

    const { type, note, latitude, longitude } = parseResult.data;
    const clientIP = getClientIP(c);

    // 1. IP Whitelist Validation
    const allowedIps = await getAllowedIPs();
    const prefixes = allowedIps.map((r: { prefix: string }) => r.prefix);

    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    const isAllowedIP =
      isDev && prefixes.length === 0 ? true : isIPMatch(clientIP, prefixes);

    // Optional GPS Geofence Check (if coordinates provided & enabled)
    let isAllowedLocation = isAllowedIP;
    let distanceInfo = null;

    if (latitude !== undefined && longitude !== undefined) {
      // Default Saigon office reference coordinate
      const officeCoords = { lat: 10.7769, lon: 106.7009 };
      const geoResult = isInsideGeofence(
        { lat: latitude, lon: longitude },
        officeCoords,
        150 // 150m radius
      );
      distanceInfo = geoResult;
      // Allow check-in if either IP is valid OR Geofence is valid
      if (geoResult.isInside) {
        isAllowedLocation = true;
      }
    }

    if (!isAllowedLocation) {
      return c.json(
        {
          success: false,
          error: `IP không hợp lệ: ${clientIP}. Vui lòng kết nối Wi-Fi văn phòng hoặc mở GPS tại cửa hàng.`,
        },
        403
      );
    }

    // 2. Validate Sequence (Checkin -> Checkout -> Checkin)
    const lastCheckin = await prisma.checkIn.findFirst({
      where: { userId: user.sub },
      orderBy: { timestamp: "desc" },
    });

    if (type === "checkin") {
      if (lastCheckin && lastCheckin.type === "checkin") {
        return c.json(
          {
            success: false,
            error: "Bạn chưa Check-out lượt trước đó! Vui lòng Check-out trước.",
          },
          400
        );
      }
    } else {
      // type === "checkout"
      if (!lastCheckin || lastCheckin.type === "checkout") {
        return c.json(
          {
            success: false,
            error: "Bạn chưa Check-in, không thể Check-out!",
          },
          400
        );
      }
    }

    // 3. Double Checkin Threshold: reject rapid consecutive check-ins from the same user within 30 seconds
    if (lastCheckin) {
      const lastCheckinTime = new Date(lastCheckin.timestamp).getTime();
      const now = Date.now();
      const elapsedMs = Math.abs(now - lastCheckinTime);
      if (elapsedMs < 30 * 1000) {
        const remainingSeconds = Math.max(1, Math.ceil((30 * 1000 - elapsedMs) / 1000));
        return c.json(
          {
            success: false,
            error: `Thao tác quá nhanh! Vui lòng chờ ${remainingSeconds} giây trước khi thực hiện lượt chấm công tiếp theo.`,
            code: "CHECKIN_TOO_FAST",
            retryAfter: remainingSeconds,
          },
          400
        );
      }
    }

    // 4. Create checkin record (respect client timestamp if within valid bounds)
    let checkinTime = new Date();
    const rawClientTime = (parseResult.data as any).timestamp ?? parseResult.data.clientTimestamp;
    if (rawClientTime !== undefined) {
      const parsed = new Date(rawClientTime);
      if (!isNaN(parsed.getTime())) {
        const now = Date.now();
        const diffMs = parsed.getTime() - now;
        // Accept if not more than 5 minutes in future and not older than 24 hours
        if (diffMs <= 5 * 60 * 1000 && (now - parsed.getTime()) <= 24 * 60 * 60 * 1000) {
          checkinTime = parsed;
        }
      }
    }

    const newCheckin = await prisma.checkIn.create({
      data: {
        userId: user.sub,
        type,
        timestamp: checkinTime,
        ipAddress: clientIP,
        note: note || undefined,
      },
    });

    // Record Session Audit Log for Checkin / Checkout
    const userAgent = c.req.header("user-agent") || "unknown";
    await recordSecureAuditLog({
      userId: user.sub,
      action: type === "checkin" ? "CHECKIN" : "CHECKOUT",
      status: "SUCCESS",
      ipAddress: clientIP,
      userAgent: userAgent,
      device: /Mobile|Android|iPhone/i.test(userAgent) ? "Mobile" : "Desktop",
      details: {
        checkinId: newCheckin.id,
        isAllowedIP,
        distanceInfo: distanceInfo as any,
      },
      requestId: c.var.requestId || c.get("requestId"),
    });

    // Invalidate payroll, stats, home-data, today checkin and dashboard cache immediately
    await Promise.all([
      invalidateCachePattern("payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("stats:monthly:*"),
      invalidateCachePattern("admin:dashboard*"),
      invalidateCachePattern("admin:reports:*"),
      invalidateCachePattern(`staff:home:${user.sub}:*`),
      invalidateCachePattern(`checkin:today:${user.sub}:*`),
      invalidateCachePattern("checkin:today:all:*"),
      invalidateCachePattern(`checkin:status:${user.sub}:*`),
      invalidateCachePattern("staff:history:*"),
      invalidateCachePattern("staff:payroll:*"),
    ]).catch((e: any) => console.warn("[Cache Invalidation Warning]", e));

    return c.json(
      {
        success: true,
        message:
          type === "checkin"
            ? "Chấm công vào ca thành công! Chúc bạn làm việc hiệu quả."
            : "Chấm công tan ca thành công! Cảm ơn bạn.",
        data: newCheckin,
        clientIP,
        distanceInfo,
      },
      201
    );
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Checkin failed" },
      500
    );
  } finally {
    await lock.release();
  }
}

// POST /api/checkins
checkinsRoute.post("/", authMiddleware, async (c) => handleCheckinPost(c));

// POST /api/checkins/in
checkinsRoute.post("/in", authMiddleware, async (c) => handleCheckinPost(c, "checkin"));

// POST /api/checkins/out
checkinsRoute.post("/out", authMiddleware, async (c) => handleCheckinPost(c, "checkout"));



// POST /api/checkins/sync-offline
checkinsRoute.post("/sync-offline", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const userId = user.sub;
    const body = await c.req.json().catch(() => ({}));
    const items: Array<{
      id: string;
      type: "checkin" | "checkout";
      timestamp: number | string;
      note?: string;
      ipAddress?: string;
    }> = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return c.json({ success: true, synced: 0, results: [] });
    }

    // Sort items chronologically
    const sortedItems = [...items].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeA - timeB;
    });

    const results: Array<{
      id: string;
      success: boolean;
      checkinId?: any;
      error?: string;
      duplicated?: boolean;
    }> = [];
    let syncedCount = 0;
    const now = Date.now();
    const maxFutureMs = 5 * 60 * 1000;
    const maxPastMs = 24 * 60 * 60 * 1000;
    const clientIP = getClientIP(c);
    const userAgent = c.req.header("user-agent") || "unknown";

    for (const item of sortedItems) {
      if (!item.type || !["checkin", "checkout"].includes(item.type)) {
        results.push({
          id: item.id,
          success: false,
          error: "Loại chấm công không hợp lệ",
        });
        continue;
      }

      const itemDate = new Date(item.timestamp);
      if (isNaN(itemDate.getTime())) {
        results.push({
          id: item.id,
          success: false,
          error: "Thời gian không hợp lệ",
        });
        continue;
      }

      const diffMs = itemDate.getTime() - now;
      if (diffMs > maxFutureMs || (now - itemDate.getTime()) > maxPastMs) {
        results.push({
          id: item.id,
          success: false,
          error: "Thời gian lệch quá 24h so với máy chủ",
        });
        continue;
      }

      // Check for exact duplicate within 2 seconds
      const duplicate = await prisma.checkIn.findFirst({
        where: {
          userId,
          type: item.type,
          timestamp: {
            gte: new Date(itemDate.getTime() - 2000),
            lte: new Date(itemDate.getTime() + 2000),
          },
        },
      });

      if (duplicate) {
        results.push({
          id: item.id,
          success: true,
          duplicated: true,
          checkinId: duplicate.id,
        });
        syncedCount++;
        continue;
      }

      // Check sequence: Checkin -> Checkout -> Checkin
      const lastCheckin = await prisma.checkIn.findFirst({
        where: {
          userId,
          timestamp: { lte: itemDate },
        },
        orderBy: { timestamp: "desc" },
      });

      if (item.type === "checkin") {
        if (lastCheckin && lastCheckin.type === "checkin") {
          results.push({
            id: item.id,
            success: false,
            error: "Bạn chưa Check-out lượt trước đó!",
          });
          continue;
        }
      } else {
        if (!lastCheckin || lastCheckin.type === "checkout") {
          results.push({
            id: item.id,
            success: false,
            error: "Bạn chưa Check-in, không thể Check-out!",
          });
          continue;
        }
      }

      const recordIP = item.ipAddress || clientIP;
      const newCheckin = await prisma.checkIn.create({
        data: {
          userId,
          type: item.type,
          timestamp: itemDate,
          ipAddress: recordIP,
          note: item.note ? `${item.note} (Đồng bộ offline)` : `(Đồng bộ offline)`,
        },
      });

      await recordSecureAuditLog({
        userId,
        action: item.type === "checkin" ? "CHECKIN" : "CHECKOUT",
        status: "SUCCESS",
        ipAddress: recordIP,
        userAgent,
        device: /Mobile|Android|iPhone/i.test(userAgent) ? "Mobile" : "Desktop",
        details: {
          checkinId: newCheckin.id,
          offlineSync: true,
          originalClientTime: item.timestamp,
        },
        requestId: c.var.requestId || c.get("requestId"),
      });

      results.push({
        id: item.id,
        success: true,
        checkinId: newCheckin.id,
      });
      syncedCount++;
    }

    if (syncedCount > 0) {
      await Promise.all([
        invalidateCachePattern("payroll:*"),
        invalidateCachePattern("stats:*"),
        invalidateCachePattern("stats:monthly:*"),
        invalidateCachePattern("admin:dashboard*"),
        invalidateCachePattern("admin:reports:*"),
        invalidateCachePattern(`staff:home:${userId}:*`),
        invalidateCachePattern(`checkin:today:${userId}:*`),
        invalidateCachePattern("checkin:today:all:*"),
        invalidateCachePattern(`checkin:status:${userId}:*`),
        invalidateCachePattern("staff:history:*"),
        invalidateCachePattern("staff:payroll:*"),
      ]).catch((e: any) => console.warn("[Cache Invalidation Warning]", e));
    }

    return c.json({
      success: true,
      synced: syncedCount,
      results,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Sync offline failed" },
      500
    );
  }
});

