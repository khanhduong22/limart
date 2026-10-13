import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getVietnamDayRange } from "../lib/date-utils";
import { getOrSetCache, invalidateCachePattern } from "../lib/cache";

export const gachaRoute = new Hono<AppEnv>();

// GET /api/gacha
gachaRoute.get("/", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const { startOfDay } = getVietnamDayRange();

    const cacheKey = "gacha:status:" + userId + ":" + startOfDay.toISOString().slice(0, 10);
    const statusData = await getOrSetCache(cacheKey, 30, async () => {
      const [user, checkinToday, existingRoll, history, activePrizesCount] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true },
        }),
        prisma.checkIn.findFirst({
          where: {
            userId,
            timestamp: { gte: startOfDay },
            type: "checkin",
          },
        }),
        prisma.payrollAdjustment.findFirst({
          where: {
            userId,
            date: { gte: startOfDay },
            reason: { contains: "[Gacha]" },
          },
        }),
        prisma.luckyWheelHistory.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        getOrSetCache("meta:lucky-wheel:active-count", 120, () =>
          prisma.luckyWheelPrize.count({
            where: { active: true, remaining: { gt: 0 } },
          })
        ),
      ]);

      const hasCheckedIn = Boolean(checkinToday);
      const hasRolled = Boolean(existingRoll);
      const canRoll = user?.role === "ADMIN" || (hasCheckedIn && !hasRolled && activePrizesCount > 0);

      return {
        hasCheckedIn,
        hasRolled,
        canRoll,
        remainingPrizes: activePrizesCount,
        history,
      };
    });

    return c.json({
      success: true,
      ...statusData,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch gacha status" },
      500
    );
  }
});

// POST /api/gacha/spin & POST /api/gacha/roll
const handleGachaRoll = async (c: any) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const { startOfDay } = getVietnamDayRange();

    const runInTransaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      if (typeof (prisma as any).$transaction === "function") {
        return await (prisma as any).$transaction(fn);
      }
      return await fn(prisma);
    };

    const result = await runInTransaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      if (user.role !== "ADMIN") {
        // 1. Attendance check
        const checkin = await tx.checkIn.findFirst({
          where: {
            userId,
            timestamp: { gte: startOfDay },
            type: "checkin",
          },
        });

        if (!checkin) {
          throw new Error("NOT_CHECKED_IN");
        }

        // 2. Daily limit check
        const existingRoll = await tx.payrollAdjustment.findFirst({
          where: {
            userId,
            date: { gte: startOfDay },
            reason: { contains: "[Gacha]" },
          },
        });

        if (existingRoll) {
          throw new Error("ALREADY_ROLLED");
        }
      }

      // 3. Roll Logic (Database Driven)
      const prizes = await tx.luckyWheelPrize.findMany({
        where: { active: true, remaining: { gt: 0 } },
      });

      if (prizes.length === 0) {
        throw new Error("OUT_OF_PRIZES");
      }

      // Weighted Random Algorithm
      const totalProbability = prizes.reduce((sum: number, p: any) => sum + p.probability, 0);
      const random = Math.random() * totalProbability;

      let selectedPrize = null;
      let accumulatedProb = 0;

      for (const prize of prizes) {
        accumulatedProb += prize.probability;
        if (random <= accumulatedProb) {
          selectedPrize = prize;
          break;
        }
      }

      if (!selectedPrize) {
        selectedPrize = prizes[0];
      }

      // Decrement Remaining
      await tx.luckyWheelPrize.update({
        where: { id: selectedPrize.id },
        data: { remaining: { decrement: 1 } },
      });

      // Record History
      await tx.luckyWheelHistory.create({
        data: {
          userId,
          prizeId: selectedPrize.id,
          prizeName: selectedPrize.name,
        },
      });

      let logMessage = selectedPrize.name;

      // Handle Title
      if (selectedPrize.type === "TITLE") {
        const existingAch = await tx.userAchievement.findUnique({
          where: { userId_code: { userId, code: selectedPrize.name } },
        });

        if (!existingAch) {
          await tx.userAchievement.create({
            data: {
              userId,
              code: selectedPrize.name,
              title: selectedPrize.name,
              description: selectedPrize.description || "Nhận được từ Gacha",
              icon: "🎰",
            },
          });
          logMessage = `[Title] ${selectedPrize.name}`;
        } else {
          logMessage = `[Duplicate Title] ${selectedPrize.name}`;
        }
      }

      const moneyValue =
        selectedPrize.type === "MONEY" && selectedPrize.value ? Math.round(selectedPrize.value) : 0;

      // Record transaction and lock day for Gacha
      await tx.payrollAdjustment.create({
        data: {
          userId,
          amount: moneyValue,
          reason: `[Gacha] ${logMessage}`,
        },
      });

      return {
        type: selectedPrize.type,
        value: moneyValue,
        message: selectedPrize.name,
      };
    });

    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("gacha:status:" + userId + ":*");
    await invalidateCachePattern("meta:lucky-wheel:*");

    return c.json({
      success: true,
      reward: result,
    });
  } catch (err: any) {
    if (err?.message === "USER_NOT_FOUND") {
      return c.json({ success: false, error: "User not found" }, 404);
    }
    if (err?.message === "NOT_CHECKED_IN") {
      return c.json({ success: false, error: "Chấm công trước đã bạn êii!" }, 400);
    }
    if (err?.message === "ALREADY_ROLLED") {
      return c.json({ success: false, error: "Mỗi ngày 1 lượt thôi tham thế! 🌚" }, 400);
    }
    if (err?.message === "OUT_OF_PRIZES") {
      return c.json({ success: false, error: "Kho quà tạm thời hết sạch rồi! Quay lại sau nhé." }, 400);
    }
    return c.json(
      { success: false, error: err?.message || "Internal error rolling gacha" },
      500
    );
  }
};

gachaRoute.post("/spin", authMiddleware, handleGachaRoll);
gachaRoute.post("/roll", authMiddleware, handleGachaRoll);
