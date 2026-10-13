import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { runBirthdayBonus, runCarryingBonus, runPackingBonus } from "@checkin/shared";
import { autoScheduleAdminNa } from "../lib/auto-schedule";
import { closePayrollMonth } from "../lib/payroll-close";
import { invalidatePayrollCache, invalidateCachePattern } from "../lib/cache";

export const cronRoute = new Hono();

// Auth middleware for cron: checks CRON_SECRET header or query
cronRoute.use("*", async (c, next) => {
  const cronSecret = process.env.CRON_SECRET;
  const isTestOrDev = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";

  if (!cronSecret && isTestOrDev) {
    return await next();
  }

  const authHeader = c.req.header("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const querySecret = c.req.query("secret");

  if (
    (bearerToken && bearerToken === cronSecret) ||
    (querySecret && querySecret === cronSecret)
  ) {
    return await next();
  }

  return c.json({ success: false, error: "Unauthorized: Invalid or missing CRON_SECRET" }, 401);
});

/**
 * GET /api/cron/auto-schedule
 * Tự động xếp lịch cho Admin Na 12 tuần tới (Thứ 2 - Thứ 7, 09:30 - 17:30)
 */
cronRoute.get("/auto-schedule", async (c) => {
  try {
    const result = await autoScheduleAdminNa(12);
    await Promise.all([
      invalidateCachePattern("shifts:*"),
      invalidateCachePattern("admin:schedule:*"),
    ]).catch(() => {});
    return c.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed auto schedule" }, 500);
  }
});

/**
 * GET /api/cron/birthday-bonus
 * Thưởng sinh nhật +100k cho nhân sự có ngày sinh nhật hôm nay
 */
cronRoute.get("/birthday-bonus", async (c) => {
  try {
    await runBirthdayBonus(prisma);
    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("admin:dashboard*"),
    ]).catch(() => {});
    return c.json({
      success: true,
      message: "Birthday bonus check executed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed birthday bonus" }, 500);
  }
});

/**
 * GET /api/cron/carrying-bonus
 * Thưởng Chiến Thần Bưng Hàng (Top 1) vào cuối tháng sau 18:00
 */
cronRoute.get("/carrying-bonus", async (c) => {
  try {
    await runCarryingBonus(prisma);
    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("admin:dashboard*"),
    ]).catch(() => {});
    return c.json({
      success: true,
      message: "Carrying bonus check executed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed carrying bonus" }, 500);
  }
});

/**
 * GET /api/cron/packing-bonus
 * Thưởng Vua Đóng Hàng (Top 1) vào cuối tháng sau 18:00
 */
cronRoute.get("/packing-bonus", async (c) => {
  try {
    await runPackingBonus(prisma);
    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("admin:dashboard*"),
    ]).catch(() => {});
    return c.json({
      success: true,
      message: "Packing bonus check executed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed packing bonus" }, 500);
  }
});

/**
 * GET /api/cron/payroll-close
 * POST /api/cron/payroll-close
 * Tự động chốt bảng lương vào ngày cuối tháng lúc 17:00 UTC (00:00 ICT ngày 1 tháng sau)
 */
const handlePayrollClose = async (c: any) => {
  try {
    const isForce = c.req.query("force") === "true";
    const now = new Date();
    const currentMonthUTC = now.getMonth();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const isLastDayUTC = tomorrow.getMonth() !== currentMonthUTC;

    if (!isLastDayUTC && !isForce) {
      return c.json({
        success: true,
        message: "Not the last day of the month. Skipped auto closure.",
        timestamp: new Date().toISOString(),
      });
    }

    const targetMonth = now.getUTCMonth() + 1;
    const targetYear = now.getUTCFullYear();

    const existingPeriod = await prisma.payrollPeriod.findUnique({
      where: { month_year: { month: targetMonth, year: targetYear } },
    });

    if (existingPeriod?.status === "CLOSED" && !isForce) {
      return c.json({
        success: true,
        message: `Payroll for ${targetMonth}/${targetYear} is already closed.`,
        timestamp: new Date().toISOString(),
      });
    }

    const bonusPercent = existingPeriod?.bonusPercent || 0;
    const targets = existingPeriod?.bonusTargets || ["PART_TIME"];
    const excludedBonusUsers = existingPeriod?.excludedBonusUsers || [];

    const result = await closePayrollMonth(
      targetMonth,
      targetYear,
      bonusPercent,
      targets as any,
      excludedBonusUsers
    );

    await Promise.all([
      invalidatePayrollCache(),
      invalidateCachePattern("staff:payroll:*"),
      invalidateCachePattern("stats:*"),
      invalidateCachePattern("admin:dashboard*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed payroll close" }, 500);
  }
};

cronRoute.get("/payroll-close", handlePayrollClose);
cronRoute.post("/payroll-close", handlePayrollClose);

/**
 * GET /api/cron/all
 * Chạy đồng loạt tất cả các job cron và trả về kết quả tổng hợp
 */
cronRoute.get("/all", async (c) => {
  const results: Record<string, any> = {};

  try {
    results.autoSchedule = await autoScheduleAdminNa(12);
  } catch (e: any) {
    results.autoSchedule = { error: e.message };
  }

  try {
    await runBirthdayBonus(prisma);
    results.birthdayBonus = { ok: true };
  } catch (e: any) {
    results.birthdayBonus = { error: e.message };
  }

  try {
    await runCarryingBonus(prisma);
    results.carryingBonus = { ok: true };
  } catch (e: any) {
    results.carryingBonus = { error: e.message };
  }

  try {
    await runPackingBonus(prisma);
    results.packingBonus = { ok: true };
  } catch (e: any) {
    results.packingBonus = { error: e.message };
  }

  await Promise.all([
    invalidatePayrollCache(),
    invalidateCachePattern("staff:payroll:*"),
    invalidateCachePattern("stats:*"),
    invalidateCachePattern("shifts:*"),
    invalidateCachePattern("admin:schedule:*"),
    invalidateCachePattern("admin:dashboard*"),
  ]).catch(() => {});

  return c.json({
    success: true,
    results,
    timestamp: new Date().toISOString(),
  });
});
