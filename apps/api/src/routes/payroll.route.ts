import { Hono } from "hono";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { calculateUserMonthlyStats } from "../lib/payroll-calculator";
import { getOrSetCache } from "../lib/cache";

export const payrollRoute = new Hono<AppEnv>();

// GET /api/payroll/my-summary
payrollRoute.get("/my-summary", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const monthQuery = c.req.query("month");
    const yearQuery = c.req.query("year");

    const now = new Date();
    const month = monthQuery ? parseInt(monthQuery, 10) : now.getMonth() + 1;
    const year = yearQuery ? parseInt(yearQuery, 10) : now.getFullYear();

    const cacheKey = `payroll:my-summary:${userId}:${month}:${year}`;
    const summary = await getOrSetCache(cacheKey, 120, async () => {
      const targetDate = new Date(year, month - 1, 15);
      return await calculateUserMonthlyStats(userId, targetDate);
    });

    if (!summary) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    return c.json({
      success: true,
      month,
      year,
      data: summary,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to calculate payroll summary" },
      500
    );
  }
});
