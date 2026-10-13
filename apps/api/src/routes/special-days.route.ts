import { Hono } from "hono";
import { getOrSetCache } from "../lib/cache";
import { getSpecialDays } from "../lib/special-days";
import { getVietnamMonthRange } from "../lib/date-utils";

export const specialDaysRoute = new Hono();

// GET /api/special-days
specialDaysRoute.get("/", async (c) => {
  try {
    const monthQuery = c.req.query("month");
    const yearQuery = c.req.query("year");
    const { month, year } = getVietnamMonthRange(
      monthQuery ? parseInt(monthQuery, 10) : undefined,
      yearQuery ? parseInt(yearQuery, 10) : undefined
    );

    const cacheKey = `meta:special-days:${year}-${month}`;
    const specialDays = await getOrSetCache(cacheKey, 3600, async () => {
      return await getSpecialDays(new Date(), month, year);
    });

    return c.json({
      success: true,
      data: specialDays,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch special days" },
      500
    );
  }
});
