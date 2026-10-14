import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getVietnamDayRange } from "../lib/date-utils";
import { getOrSetCache, invalidateCachePattern, invalidatePayrollCache } from "../lib/cache";
import { acquireLock } from "../lib/lock";
import { luckyWheelRateLimiter } from "../middleware/rate-limiter";

export const luckyWheelRoute = new Hono<AppEnv>();

// GET /api/lucky-wheel
luckyWheelRoute.get("/", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const { startOfDay, endOfDay } = getVietnamDayRange();

    const cacheKey = `lucky-wheel:status:${userId}:${startOfDay.toISOString().slice(0, 10)}`;
    const statusData = await getOrSetCache(cacheKey, 60, async () => {
      const [user, prizes, checkinToday, spunToday, recentWinners] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, luckyWheelAllowed: true },
        }),
        getOrSetCache("meta:lucky-wheel:prizes", 300, () =>
          prisma.luckyWheelPrize.findMany({
            where: { active: true },
            orderBy: { createdAt: "asc" },
          })
        ),
        prisma.checkIn.findFirst({
          where: {
            userId,
            timestamp: { gte: startOfDay, lte: endOfDay },
          },
        }),
        prisma.luckyWheelHistory.findFirst({
          where: {
            userId,
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
        }),
        getOrSetCache("meta:lucky-wheel:recent-winners", 60, () =>
          prisma.luckyWheelHistory.findMany({
            take: 20,
            orderBy: { createdAt: "desc" },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          })
        ),
      ]);

      const isAllowed = user?.role === "ADMIN" || Boolean(user?.luckyWheelAllowed);
      const hasCheckedInToday = Boolean(checkinToday);
      const hasSpunToday = Boolean(spunToday);
      const canSpin = user?.role === "ADMIN" || (isAllowed && hasCheckedInToday && !hasSpunToday);

      return {
        allowed: isAllowed,
        hasCheckedInToday,
        hasSpunToday,
        canSpin,
        prizes,
        recentWinners,
      };
    });

    return c.json({
      success: true,
      ...statusData,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch lucky wheel status" },
      500
    );
  }
});

// POST /api/lucky-wheel/spin
luckyWheelRoute.post("/spin", authMiddleware, luckyWheelRateLimiter, async (c) => {
  const tokenPayload = c.get("user");
  const userId = tokenPayload.sub;
  const { startOfDay, endOfDay } = getVietnamDayRange();

  // 1. Acquire Distributed Atomic Lock (Valkey with memory fallback)
  const lock = await acquireLock(`lock:lucky-wheel:${userId}`, 5000);
  if (!lock.acquired) {
    return c.json(
      {
        success: false,
        error: "SPIN_IN_PROGRESS",
        message: "Vòng quay đang được xử lý, vui lòng chờ trong giây lát.",
      },
      400
    );
  }

  try {
    // 2. Pre-check: Reject immediately if user already spun today
    const userPre = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (userPre?.role !== "ADMIN") {
      const alreadySpun = await prisma.luckyWheelHistory.findFirst({
        where: {
          userId,
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
      });

      if (alreadySpun) {
        return c.json(
          {
            success: false,
            error: "ALREADY_SPUN",
            message: "⏳ Mỗi ngày chỉ được quay 1 lần. Hẹn bạn ngày mai nhé!",
          },
          400
        );
      }
    }

    const runInTransaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      if (typeof (prisma as any).$transaction === "function") {
        return await (prisma as any).$transaction(fn);
      }
      return await fn(prisma);
    };

    const selectedPrize = await runInTransaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { achievements: true },
      });

      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      // Permission and daily limits check
      if (user.role !== "ADMIN") {
        if (!user.luckyWheelAllowed) {
          throw new Error("NOT_ALLOWED");
        }

        const hasCheckIn = await tx.checkIn.findFirst({
          where: {
            userId: user.id,
            timestamp: { gte: startOfDay, lte: endOfDay },
          },
        });

        if (!hasCheckIn) {
          throw new Error("NOT_CHECKED_IN");
        }

        const hasSpun = await tx.luckyWheelHistory.findFirst({
          where: {
            userId: user.id,
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
        });

        if (hasSpun) {
          throw new Error("ALREADY_SPUN");
        }
      }

      // Get active prizes with remaining > 0
      const prizes = await tx.luckyWheelPrize.findMany({
        where: { active: true, remaining: { gt: 0 } },
      });

      if (prizes.length === 0) {
        throw new Error("OUT_OF_PRIZES");
      }

      const totalRemaining = prizes.reduce((sum: number, p: any) => sum + p.remaining, 0);
      const isDrawMode = totalRemaining > 0 && totalRemaining <= 24;

      let prize = null;

      if (isDrawMode) {
        const randomHit = Math.floor(Math.random() * totalRemaining);
        let accumulatedRemain = 0;

        for (const p of prizes) {
          accumulatedRemain += p.remaining;
          if (randomHit < accumulatedRemain) {
            prize = p;
            break;
          }
        }
      } else {
        const totalProbability = prizes.reduce((sum: number, p: any) => sum + p.probability, 0);
        const random = Math.random() * totalProbability;

        let accumulatedProb = 0;
        for (const p of prizes) {
          accumulatedProb += p.probability;
          if (random <= accumulatedProb) {
            prize = p;
            break;
          }
        }

        if (!prize) {
          prize = prizes.find((p: any) => p.type === "BETTER_LUCK_NEXT_TIME") || prizes[0];
        }
      }

      if (!prize) {
        throw new Error("NO_PRIZE_HIT");
      }

      // DB-level safety lock/check: Atomic decrement with condition remaining > 0
      const prizeUpdateResult = await tx.luckyWheelPrize.updateMany({
        where: { id: prize.id, remaining: { gt: 0 } },
        data: { remaining: { decrement: 1 } },
      });

      if (prizeUpdateResult.count === 0) {
        throw new Error("OUT_OF_PRIZES");
      }

      await tx.luckyWheelHistory.create({
        data: {
          userId: user.id,
          prizeId: prize.id,
          prizeName: prize.name,
        },
      });

      if (prize.type === "TITLE") {
        const existingAch = user.achievements?.find((a: any) => a.code === prize!.name);
        if (!existingAch) {
          await tx.userAchievement.create({
            data: {
              userId: user.id,
              code: prize.name,
              title: prize.name,
              description: prize.description || "Nhận được từ Vòng Quay May Mắn",
              icon: "🎰",
            },
          });
        }
      }

      if (prize.type === "MONEY" && prize.value > 0) {
        await tx.payrollAdjustment.create({
          data: {
            userId: user.id,
            amount: Math.round(prize.value),
            reason: `Vòng Quay: ${prize.name}`,
            date: new Date(),
          },
        });
      }

      return prize;
    });

    await Promise.all([
      invalidateCachePattern(`lucky-wheel:status:${userId}:*`),
      invalidateCachePattern("meta:lucky-wheel:recent-winners"),
      invalidateCachePattern("meta:lucky-wheel:*"),
      invalidateCachePattern("admin:lucky-wheel:*"),
    ]).catch(() => {});

    if (selectedPrize.type === "MONEY" && selectedPrize.value > 0) {
      await invalidatePayrollCache();
      await invalidateCachePattern("staff:home:*");
      await invalidateCachePattern("payroll:*");
      await invalidateCachePattern("stats:*");
    }

    return c.json({
      success: true,
      prize: selectedPrize,
    });
  } catch (err: any) {
    if (err?.message === "USER_NOT_FOUND") {
      return c.json({ success: false, error: "User not found" }, 404);
    }
    if (err?.message === "NOT_ALLOWED") {
      return c.json(
        {
          success: false,
          error: "Rất tiếc! Sự kiện rút thăm hôm nay không dành cho tài khoản của bạn.",
        },
        403
      );
    }
    if (err?.message === "NOT_CHECKED_IN") {
      return c.json(
        {
          success: false,
          error: "⛔️ Bạn chưa điểm danh hôm nay! Hãy Check-in trước khi quay nhé.",
        },
        400
      );
    }
    if (err?.message === "ALREADY_SPUN") {
      return c.json(
        {
          success: false,
          error: "ALREADY_SPUN",
          message: "⏳ Mỗi ngày chỉ được quay 1 lần. Hẹn bạn ngày mai nhé!",
        },
        400
      );
    }
    if (err?.message === "SPIN_IN_PROGRESS") {
      return c.json(
        {
          success: false,
          error: "SPIN_IN_PROGRESS",
          message: "Vòng quay đang được xử lý, vui lòng chờ trong giây lát.",
        },
        400
      );
    }
    if (err?.message === "OUT_OF_PRIZES") {
      return c.json({ success: false, error: "Kho quà đã hết sạch rồi!" }, 400);
    }
    if (err?.message === "NO_PRIZE_HIT") {
      return c.json({ success: false, error: "Rất tiếc, bạn không quay trúng gì cả." }, 400);
    }
    return c.json(
      { success: false, error: err?.message || "Internal error spinning wheel" },
      500
    );
  } finally {
    await lock.release();
  }
});

