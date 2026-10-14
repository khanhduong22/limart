import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { calculateStreak, isLate } from "@checkin/shared";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getIPStatus } from "../lib/ip-utils";
import { getSpecialDays } from "../lib/special-days";
import {
  getVietnamDayRange,
  getVietnamMonthRange,
  toVNDateString,
  VN_OFFSET_MS,
} from "../lib/date-utils";
import {
  calculateMonthlyPayrollSummary,
  calculateUserMonthlyStats,
} from "../lib/payroll-calculator";
import {
  getOrSetCache,
  invalidateShiftDutyCache,
  invalidatePayrollCache,
  invalidateCachePattern,
  invalidateTaskSummaryCache,
} from "../lib/cache";
import { assertPeriodOpen } from "../lib/payroll-period";
import { isShiftLocked } from "../lib/schedule-lock";
import { applyLateSchedulePenalty } from "../lib/schedule-penalty";
import { ensureAdminNaSchedule } from "../lib/auto-schedule";

export const staffRoute = new Hono<AppEnv>();

/**
 * No-op: AnnouncementRead is a first-class Prisma model defined in schema.prisma and managed via Prisma migrations.
 */
export async function ensureAnnouncementReadTable(): Promise<void> {
  return;
}

// GET /api/staff/home-data
staffRoute.get("/home-data", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const callerUserId = tokenPayload.sub;
    const viewAsUserId = c.req.query("viewAsUserId");
    const isViewAsMode = Boolean(tokenPayload.role === "ADMIN" && viewAsUserId);
    const userId = isViewAsMode ? viewAsUserId! : callerUserId;

    const { startOfDay, endOfDay, dateStr } = getVietnamDayRange();
    const cacheKey = `staff:home:${userId}:${dateStr}`;

    const cachedData = await getOrSetCache(cacheKey, 60, async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          isActive: true,
          employmentType: true,
          hourlyRate: true,
          monthlySalary: true,
          birthday: true,
          startDate: true,
          luckyWheelAllowed: true,
          staffTasksAllowed: true,
          achievements: true,
        },
      });

      if (!user || !user.isActive) {
        return null;
      }

      const targetDate = new Date();
      const [
        todayShifts,
        todayCheckins,
        announcements,
        specialDays,
        recentCheckins,
        recentLeaves,
        ipStatus,
        stats,
        allTodayDuties,
        swapCount,
        rejectedStaffTasks,
        rejectedUserTasks,
      ] = await Promise.all([
        prisma.workShift.findMany({
          where: {
            userId,
            start: { gte: startOfDay, lte: endOfDay },
          },
          orderBy: { start: "asc" },
        }),
        prisma.checkIn.findMany({
          where: {
            userId,
            timestamp: { gte: startOfDay, lte: endOfDay },
          },
          orderBy: { timestamp: "desc" },
        }),
        prisma.announcement.findMany({
          where: { active: true },
          orderBy: { createdAt: "desc" },
        }),
        getSpecialDays(),
        prisma.checkIn.findMany({
          where: { userId, type: "checkin" },
          orderBy: { timestamp: "desc" },
          take: 60,
        }),
        prisma.request.findMany({
          where: { userId, type: "LEAVE", status: "APPROVED" },
          orderBy: { date: "desc" },
          take: 40,
        }),
        getIPStatus(c),
        calculateUserMonthlyStats(userId, targetDate),
        prisma.shiftDuty.findMany({
          where: {
            OR: [
              { date: { gte: startOfDay, lte: endOfDay } },
              { shift: { start: { gte: startOfDay, lte: endOfDay } } },
            ],
          },
          include: {
            shift: true,
            createdBy: { select: { id: true, name: true } },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                isActive: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.workShift.count({
          where: {
            isOpenForSwap: true,
            userId: { not: userId },
            start: { gte: new Date() },
          },
        }),
        prisma.staffTask.findMany({
          where: { assigneeId: userId, status: "REJECTED" },
          select: {
            id: true,
            title: true,
            adminNote: true,
            submittedAt: true,
            createdAt: true,
          },
        }),
        prisma.userTask.findMany({
          where: { userId, status: "REJECTED" },
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            note: true,
            evidenceLink: true,
            adminNote: true,
            submittedAt: true,
            createdAt: true,
            taskDefinition: {
              select: { id: true, name: true, unit: true, baseReward: true },
            },
            taskItem: {
              select: { id: true, title: true },
            },
          },
        }),
      ]);

      const streak = calculateStreak(recentCheckins, recentLeaves);
      const hasCheckedInToday = todayCheckins.some((ch) => ch.type === "checkin");
      const todayShift = todayShifts[0] || null;

      const todayDuties = allTodayDuties.filter((d) => d.userId === userId);

      const userDutiesMap = new Map<
        string,
        {
          id: string;
          name: string | null;
          email: string | null;
          image: string | null;
          role: string;
          duties: Array<{
            id: string;
            shiftId: number | null;
            userId: string;
            createdById: string;
            date: Date;
            title: string;
            description: string | null;
            isCompleted: boolean;
            completedAt: Date | null;
            createdAt: Date;
            shift?: any;
            createdBy?: { id: string; name: string | null } | null;
          }>;
        }
      >();

      for (const duty of allTodayDuties) {
        if (!duty.user || (duty.user as any).isActive === false) continue;
        const u = duty.user;
        if (!userDutiesMap.has(u.id)) {
          userDutiesMap.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            image: u.image,
            role: u.role,
            duties: [],
          });
        }
        userDutiesMap.get(u.id)!.duties.push({
          id: duty.id,
          shiftId: duty.shiftId,
          userId: duty.userId,
          createdById: duty.createdById,
          date: duty.date,
          title: duty.title,
          description: duty.description,
          isCompleted: duty.isCompleted,
          completedAt: duty.completedAt,
          createdAt: duty.createdAt,
          shift: duty.shift,
          createdBy: duty.createdBy,
        });
      }

      const activeUsers = Array.from(userDutiesMap.values()).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );

      const rejectedTasks = [
        ...rejectedStaffTasks.map((t) => ({
          id: t.id,
          type: "STAFF_TASK" as const,
          title: t.title,
          reason: (t as any).rejectReason || t.adminNote || "Admin yêu cầu cập nhật lại kết quả",
          date: t.submittedAt || t.createdAt,
          link: "/staff-tasks",
        })),
        ...rejectedUserTasks.map((t) => {
          const unit = t.taskDefinition?.unit;
          let link = "/tasks?tab=history";
          if (unit === "điểm") link = "/packing?tab=history";
          else if (unit === "điểm-bưng") link = "/carrying?tab=history";
          const title = t.taskItem?.title || t.taskDefinition?.name || t.note || "Nhiệm vụ";
          return {
            id: t.id,
            type: unit === "điểm" ? ("PACKING" as const) : unit === "điểm-bưng" ? ("CARRYING" as const) : ("WFH" as const),
            title,
            reason: (t as any).rejectReason || t.adminNote || "Admin yêu cầu cập nhật lại kết quả",
            date: t.submittedAt || t.createdAt,
            link,
          };
        }),
      ];
      const rejectedTasksCount = rejectedTasks.length;

      let readAnnouncementIds = new Set<string>();
      try {
        await ensureAnnouncementReadTable();
        if ((prisma as any).announcementRead?.findMany) {
          const userReads = await (prisma as any).announcementRead.findMany({
            where: { userId },
            select: { announcementId: true },
          });
          readAnnouncementIds = new Set(userReads.map((r: any) => r.announcementId));
        } else if ((prisma as any).$queryRaw) {
          const rawReads = await (prisma as any).$queryRaw`
            SELECT "announcementId" FROM "AnnouncementRead" WHERE "userId" = ${userId}
          `;
          if (Array.isArray(rawReads)) {
            readAnnouncementIds = new Set(rawReads.map((r: any) => r.announcementId));
          }
        }
      } catch (readErr) {
        console.warn("[staff.route] Could not query announcement reads:", readErr);
      }

      const announcementsWithReadStatus = (announcements || []).map((a) => ({
        ...a,
        isRead: readAnnouncementIds.has(a.id),
      }));

      return {
        user,
        isViewAsMode,
        todayShifts,
        todayShift,
        todayCheckins,
        todayDuties,
        activeUsers,
        teammatesWithDuties: activeUsers,
        announcements: announcementsWithReadStatus,
        specialDays,
        specialUsers: specialDays,
        streak,
        swapCount,
        rejectedTasksCount,
        rejectedTasks,
        hasCheckedInToday,
        stats: stats || {
          totalHours: 0,
          totalSalary: 0,
          daysWorked: 0,
          baseSalary: user.monthlySalary || 0,
          totalAdjustments: 0,
          lateCount: 0,
          latePenaltyHours: 0,
          latePenaltyAmount: 0,
          dailyDetails: [],
        },
        ipStatus,
      };
    });

    if (!cachedData) {
      return c.json({ success: false, error: "User not found or inactive" }, 404);
    }

    return c.json({
      success: true,
      data: cachedData,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch staff home data" },
      500
    );
  }
});

// POST /api/staff/announcements/read
staffRoute.post("/announcements/read", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const body = await c.req.json().catch(() => ({}));

    const rawIds = body.ids || body.announcementIds || (body.id ? [body.id] : []);
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return c.json({ success: false, error: "Missing announcement IDs" }, 400);
    }

    const ids: string[] = rawIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0
    );

    if (ids.length === 0) {
      return c.json({ success: false, error: "Invalid announcement IDs" }, 400);
    }

    await ensureAnnouncementReadTable();

    for (const annId of ids) {
      try {
        if ((prisma as any).announcementRead?.upsert) {
          await (prisma as any).announcementRead.upsert({
            where: {
              announcementId_userId: {
                announcementId: annId,
                userId,
              },
            },
            create: {
              id: `ar_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              announcementId: annId,
              userId,
            },
            update: {
              readAt: new Date(),
            },
          });
        } else if ((prisma as any).$executeRawUnsafe) {
          await (prisma as any).$executeRawUnsafe(
            `INSERT INTO "AnnouncementRead" ("id", "announcementId", "userId", "readAt")
             VALUES (concat('ar_', md5(random()::text || clock_timestamp()::text)), $1, $2, NOW())
             ON CONFLICT ("announcementId", "userId") DO NOTHING`,
            annId,
            userId
          );
        }
      } catch (insertErr) {
        console.warn(`[staff.route] Error recording read announcement ${annId}:`, insertErr);
      }
    }

    await invalidateCachePattern(`staff:home:${userId}:*`).catch(() => {});

    return c.json({ success: true, count: ids.length });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to mark announcements as read" },
      500
    );
  }
});

// GET /api/staff/schedule
staffRoute.get("/schedule", authMiddleware, async (c) => {
  try {
    await ensureAdminNaSchedule(8);

    const tokenPayload = c.get("user");
    const currentUserId = tokenPayload.sub;

    const monthQuery = c.req.query("month");
    const yearQuery = c.req.query("year");

    const { startDate, endDate } = getVietnamMonthRange(
      monthQuery ? parseInt(monthQuery, 10) : undefined,
      yearQuery ? parseInt(yearQuery, 10) : undefined
    );

    // Zero-Trust Staff Privacy: Staff can only view their own shifts
    const isStaffAdmin = tokenPayload.role === "ADMIN";
    const cacheKey = `staff:schedule:${currentUserId}:${monthQuery || "curr"}:${yearQuery || "curr"}`;
    const shifts = await getOrSetCache(cacheKey, 120, async () => {
      return prisma.workShift.findMany({
        where: {
          ...(isStaffAdmin ? {} : { userId: currentUserId }),
          start: { gte: startDate, lte: endDate },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
        orderBy: { start: "asc" },
      });
    });

    return c.json({
      success: true,
      data: shifts,
      currentUserId,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch staff schedule" },
      500
    );
  }
});

// POST /api/staff/schedule/register
staffRoute.post("/schedule/register", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const body = await c.req.json().catch(() => ({}));
    const { dateStr, shift, startTime, endTime } = body;

    if (!dateStr) {
      return c.json({ success: false, error: "Vui lòng chọn ngày đăng ký ca làm" }, 400);
    }

    let startHour = 8;
    let startMinute = 30;
    let endHour = 17;
    let endMinute = 30;
    let resolvedShiftType = shift || "CUSTOM";

    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;

    if (startTime && endTime) {
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return c.json({ success: false, error: "Định dạng giờ không hợp lệ (HH:mm)" }, 400);
      }
      const [sH, sM] = startTime.split(":").map(Number);
      const [eH, eM] = endTime.split(":").map(Number);

      if (sH < 8 || sH > 17) {
        return c.json({ success: false, error: "Giờ bắt đầu chỉ được từ 8h đến 17h!" }, 400);
      }
      if (eH < 11 || eH > 21) {
        return c.json({ success: false, error: "Giờ kết thúc chỉ được từ 11h đến 21h!" }, 400);
      }
      const VALID_MINUTES = [0, 15, 30, 45];
      if (!VALID_MINUTES.includes(sM) || !VALID_MINUTES.includes(eM)) {
        return c.json({ success: false, error: "Số phút chỉ được chọn: 0, 15, 30 hoặc 45!" }, 400);
      }
      if (eH * 60 + eM <= sH * 60 + sM) {
        return c.json({ success: false, error: "Giờ kết thúc phải sau giờ bắt đầu!" }, 400);
      }
      startHour = sH;
      startMinute = sM;
      endHour = eH;
      endMinute = eM;

      if (shift && ["MORNING", "AFTERNOON", "FULL"].includes(shift)) {
        resolvedShiftType = shift;
      } else if (startHour === 8 && startMinute === 30 && endHour === 12 && endMinute === 0) {
        resolvedShiftType = "MORNING";
      } else if (startHour === 13 && startMinute === 30 && endHour === 17 && endMinute === 30) {
        resolvedShiftType = "AFTERNOON";
      } else if (startHour === 8 && startMinute === 30 && endHour === 17 && endMinute === 30) {
        resolvedShiftType = "FULL";
      } else {
        resolvedShiftType = "CUSTOM";
      }
    } else if (shift && ["MORNING", "AFTERNOON", "FULL"].includes(shift)) {
      resolvedShiftType = shift;
      if (shift === "MORNING") {
        startHour = 8;
        startMinute = 30;
        endHour = 12;
        endMinute = 0;
      } else if (shift === "AFTERNOON") {
        startHour = 13;
        startMinute = 30;
        endHour = 17;
        endMinute = 30;
      } else if (shift === "FULL") {
        startHour = 8;
        startMinute = 30;
        endHour = 17;
        endMinute = 30;
      }
    } else {
      return c.json({ success: false, error: "Vui lòng chọn hoặc nhập khung giờ làm việc" }, 400);
    }

    const vnTime = new Date(new Date(dateStr).getTime() + VN_OFFSET_MS);
    const y = vnTime.getUTCFullYear();
    const m = vnTime.getUTCMonth();
    const d = vnTime.getUTCDate();

    const shiftStart = new Date(Date.UTC(y, m, d, startHour, startMinute, 0, 0) - VN_OFFSET_MS);
    const shiftEnd = new Date(Date.UTC(y, m, d, endHour, endMinute, 0, 0) - VN_OFFSET_MS);

    // Check overlap with existing shifts for this user
    const overlap = await prisma.workShift.findFirst({
      where: {
        userId,
        start: { lt: shiftEnd },
        end: { gt: shiftStart },
      },
    });
    if (overlap) {
      return c.json({ success: false, error: "Bạn đã có ca làm việc trùng khung giờ này!" }, 400);
    }

    await assertPeriodOpen(shiftStart);

    await applyLateSchedulePenalty(userId, shiftStart);

    const newShift = await prisma.workShift.create({
      data: {
        userId,
        start: shiftStart,
        end: shiftEnd,
        shiftType: resolvedShiftType,
        status: "APPROVED",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
      },
    });

    await Promise.all([
      invalidateShiftDutyCache(),
      invalidateCachePattern(`shifts:my-shifts:${userId}:*`),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("shifts:*"),
      invalidateCachePattern("staff:schedule:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đăng ký ca làm việc thành công!",
      data: newShift,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to register shift" },
      500
    );
  }
});

// POST /api/staff/schedule/cancel
staffRoute.post("/schedule/cancel", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const userRole = tokenPayload.role;

    const body = await c.req.json().catch(() => ({}));
    const shiftId = Number(body.shiftId);

    if (!shiftId || isNaN(shiftId)) {
      return c.json({ success: false, error: "Mã ca làm không hợp lệ" }, 400);
    }

    const shift = await prisma.workShift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      return c.json({ success: false, error: "Ca làm việc không tồn tại" }, 404);
    }

    if (shift.userId !== userId && userRole !== "ADMIN") {
      return c.json({ success: false, error: "Bạn không có quyền hủy ca làm này" }, 403);
    }

    if (userRole !== "ADMIN" && isShiftLocked(shift.start)) {
      return c.json(
        {
          success: false,
          error: "Lịch tuần này đã khóa (Khóa vào Chủ Nhật tuần trước), không thể thay đổi ca.",
        },
        403
      );
    }

    await assertPeriodOpen(shift.start);

    await prisma.workShift.delete({
      where: { id: shiftId },
    });

    await Promise.all([
      invalidateShiftDutyCache(),
      invalidateCachePattern(`shifts:my-shifts:${userId}:*`),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("shifts:*"),
      invalidateCachePattern("staff:schedule:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đã hủy ca làm việc thành công!",
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to cancel shift" },
      500
    );
  }
});

// POST /api/staff/schedule/:id/swap
staffRoute.post("/schedule/:id/swap", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const userRole = tokenPayload.role;
    const paramId = c.req.param("id");
    const shiftId = parseInt(paramId || "", 10);

    if (isNaN(shiftId)) {
      return c.json({ success: false, error: "Mã ca làm việc không hợp lệ" }, 400);
    }

    const shift = await prisma.workShift.findUnique({
      where: { id: shiftId },
      include: {
        user: { select: { id: true, name: true, image: true, email: true } },
      },
    });

    if (!shift) {
      return c.json({ success: false, error: "Ca làm việc không tồn tại" }, 404);
    }

    if (shift.userId !== userId && userRole !== "ADMIN") {
      return c.json({ success: false, error: "Bạn không có quyền đổi trạng thái ca này" }, 403);
    }

    if (userRole !== "ADMIN" && isShiftLocked(shift.start)) {
      return c.json(
        {
          success: false,
          error: "Lịch tuần này đã khóa (Khóa vào Chủ Nhật tuần trước), không thể thay đổi ca.",
        },
        403
      );
    }

    await assertPeriodOpen(shift.start);

    const body = await c.req.json().catch(() => ({}));
    const newSwapStatus = typeof body?.isOpen === "boolean" ? body.isOpen : !shift.isOpenForSwap;

    const updated = await prisma.workShift.update({
      where: { id: shiftId },
      data: { isOpenForSwap: newSwapStatus },
      include: {
        user: { select: { id: true, name: true, image: true, email: true } },
      },
    });

    await Promise.all([
      invalidateShiftDutyCache(),
      invalidateCachePattern(`shifts:my-shifts:${userId}:*`),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("shifts:*"),
      invalidateCachePattern("staff:schedule:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: newSwapStatus
        ? "Đã đăng lên chợ đổi ca (Pass ca)!"
        : "Đã gỡ ca khỏi chợ đổi ca.",
      data: updated,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi cập nhật pass ca" }, 500);
  }
});

// POST /api/staff/schedule/:id/take
staffRoute.post("/schedule/:id/take", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const userRole = tokenPayload.role;
    const paramId = c.req.param("id");
    const shiftId = parseInt(paramId || "", 10);

    if (isNaN(shiftId)) {
      return c.json({ success: false, error: "Mã ca làm việc không hợp lệ" }, 400);
    }

    const existing = await prisma.workShift.findUnique({
      where: { id: shiftId },
      include: {
        user: { select: { id: true, name: true, image: true, email: true } },
      },
    });

    if (!existing) {
      return c.json({ success: false, error: "Ca làm việc không tồn tại" }, 404);
    }

    await assertPeriodOpen(existing.start);

    if (existing.userId === userId) {
      return c.json({ success: false, error: "Đây đã là ca của bạn rồi!" }, 400);
    }

    if (!existing.isOpenForSwap && userRole !== "ADMIN") {
      return c.json({ success: false, error: "Ca làm này hiện không mở để nhận!" }, 400);
    }

    // Check overlap with user's existing shifts
    const overlap = await prisma.workShift.count({
      where: {
        userId,
        id: { not: shiftId },
        OR: [
          { start: { lte: existing.start }, end: { gt: existing.start } },
          { start: { lt: existing.end }, end: { gte: existing.end } },
          { start: { gte: existing.start }, end: { lte: existing.end } },
        ],
      },
    });

    if (overlap > 0) {
      return c.json({ success: false, error: "Bạn đã có lịch làm trùng với khung giờ ca này!" }, 400);
    }

    const updatedResult = await prisma.workShift.updateMany({
      where: {
        id: shiftId,
        ...(userRole === "ADMIN" ? {} : { isOpenForSwap: true }),
      },
      data: {
        userId,
        isOpenForSwap: false,
      },
    });

    if (updatedResult.count === 0) {
      return c.json({ success: false, error: "Ca làm việc đã có người khác nhận hoặc không còn mở pass ca!" }, 409);
    }

    const updated = await prisma.workShift.findUnique({
      where: { id: shiftId },
      include: {
        user: { select: { id: true, name: true, image: true, email: true } },
      },
    });

    try {
      await prisma.shiftAuditLog.create({
        data: {
          shiftId: existing.id,
          userId,
          action: "TAKE_SWAP",
          changedById: userId,
          oldStart: existing.start,
          oldEnd: existing.end,
          newStart: existing.start,
          newEnd: existing.end,
        },
      });
    } catch {}

    await Promise.all([
      invalidatePayrollCache(),
      invalidateShiftDutyCache(userId, shiftId),
      invalidateShiftDutyCache(existing.userId, shiftId),
      invalidateCachePattern(`shifts:my-shifts:${userId}:*`),
      invalidateCachePattern(`shifts:my-shifts:${existing.userId}:*`),
      invalidateCachePattern("admin:schedule:*"),
      invalidateCachePattern("admin:schedule:history:*"),
      invalidateCachePattern("shifts:*"),
      invalidateCachePattern("staff:schedule:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đã nhận ca thành công! Đừng quên đi làm đúng giờ nhé.",
      data: updated,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi nhận ca" }, 500);
  }
});

// GET /api/staff/payroll
staffRoute.get("/payroll", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const monthQuery = c.req.query("month");
    const yearQuery = c.req.query("year");

    const now = new Date();
    const month = monthQuery ? parseInt(monthQuery, 10) : now.getMonth() + 1;
    const year = yearQuery ? parseInt(yearQuery, 10) : now.getFullYear();

    const cacheKey = "staff:payroll:" + userId + ":" + month + ":" + year;
    const payload = await getOrSetCache(
      cacheKey,
      (data) => (data?.isClosed ? 300 : 120),
      async () => {
        const period = await prisma.payrollPeriod.findUnique({
          where: { month_year: { month, year } },
        });

        const isClosed = period?.status === "CLOSED" || period?.status === "LOCKED";
        let stats: any = null;

        if (period?.status === "CLOSED") {
          const payslip = await prisma.payslip.findUnique({
            where: { userId_month_year: { userId, month, year } },
          });
          if (payslip?.content) {
            stats = payslip.content;
          }
        }

        if (!stats) {
          const targetDate = new Date(year, month - 1, 15);
          stats = await calculateUserMonthlyStats(userId, targetDate);
        }

        return {
          stats: stats || {
            totalHours: 0,
            totalSalary: 0,
            daysWorked: 0,
            baseSalary: 0,
            totalAdjustments: 0,
            lateCount: 0,
            latePenaltyHours: 0,
            latePenaltyAmount: 0,
            dailyDetails: [],
          },
          isClosed,
          month,
          year,
        };
      }
    );

    return c.json({
      success: true,
      data: payload,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch staff payroll" },
      500
    );
  }
});

// GET /api/staff/history
staffRoute.get("/history", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const cacheKey = "staff:history:" + userId;
    const history = await getOrSetCache(cacheKey, 60, async () => {
      return prisma.checkIn.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        take: 100,
      });
    });

    return c.json({
      success: true,
      data: history,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch staff history" },
      500
    );
  }
});

// GET /api/staff/requests
staffRoute.get("/requests", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const cacheKey = "user:requests:" + userId;
    const requests = await getOrSetCache(cacheKey, 60, async () => {
      return prisma.request.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
    });

    return c.json({
      success: true,
      data: requests,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch staff requests" },
      500
    );
  }
});

// POST /api/staff/requests
staffRoute.post("/requests", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const body = await c.req.json().catch(() => ({}));
    const { type, date, reason } = body;

    if (!type || !date || !reason) {
      return c.json({ success: false, error: "Thiếu thông tin đơn từ" }, 400);
    }

    const validTypes = ["LEAVE", "WFH", "EXPLANATION", "SHIFT_SWAP", "EARLY_LEAVE"];
    if (!validTypes.includes(type)) {
      return c.json({ success: false, error: "Loại đơn không hợp lệ" }, 400);
    }

    const newRequest = await prisma.request.create({
      data: {
        userId,
        type,
        date: new Date(date),
        reason: String(reason).trim(),
        status: "PENDING",
      },
    });

    await Promise.all([
      invalidateCachePattern("user:requests:" + userId),
      invalidateCachePattern("admin:requests:*"),
      invalidateCachePattern("admin:dashboard*"),
    ]).catch(() => {});

    return c.json(
      {
        success: true,
        message: "Đã gửi yêu cầu thành công!",
        data: newRequest,
      },
      201
    );
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to create staff request" },
      500
    );
  }
});

// GET /api/staff/lucky-wheel
staffRoute.get("/lucky-wheel", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const { startOfDay, endOfDay } = getVietnamDayRange();

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

    return c.json({
      success: true,
      allowed: isAllowed,
      hasCheckedInToday,
      hasSpunToday,
      canSpin,
      prizes,
      recentWinners,
      data: {
        allowed: isAllowed,
        hasCheckedInToday,
        hasSpunToday,
        canSpin,
        prizes,
        recentWinners,
      },
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch lucky wheel status" },
      500
    );
  }
});

// POST /api/staff/gacha & POST /api/staff/lucky-wheel/spin
const handleStaffGachaSpin = async (c: any) => {
  try {
    const tokenPayload = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const userId = tokenPayload?.sub || body?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { achievements: true },
    });
    if (!user) return c.json({ success: false, error: "User not found" }, 404);

    const { startOfDay, endOfDay } = getVietnamDayRange();

    if (user.role !== "ADMIN") {
      const hasCheckIn = await prisma.checkIn.findFirst({
        where: {
          userId: user.id,
          timestamp: { gte: startOfDay, lte: endOfDay },
        },
      });

      if (!hasCheckIn) {
        return c.json(
          {
            success: false,
            error: "⛔️ Bạn chưa điểm danh hôm nay! Hãy Check-in trước khi quay nhé.",
          },
          400
        );
      }

      const hasSpun = await prisma.luckyWheelHistory.findFirst({
        where: {
          userId: user.id,
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
      });

      if (hasSpun) {
        return c.json(
          {
            success: false,
            error: "⏳ Mỗi ngày chỉ được quay 1 lần. Hẹn bạn ngày mai nhé!",
          },
          400
        );
      }
    }

    const prizes = await prisma.luckyWheelPrize.findMany({
      where: { active: true, remaining: { gt: 0 } },
    });

    if (prizes.length === 0) {
      return c.json(
        { success: false, error: "Kho quà đã hết sạch rồi!" },
        400
      );
    }

    // Weighted Random Algorithm
    const totalProbability = prizes.reduce((sum, p) => sum + p.probability, 0);
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

    // Decrement remaining
    await prisma.luckyWheelPrize.update({
      where: { id: selectedPrize.id },
      data: { remaining: { decrement: 1 } },
    });

    // Create history
    await prisma.luckyWheelHistory.create({
      data: {
        userId: user.id,
        prizeId: selectedPrize.id,
        prizeName: selectedPrize.name,
      },
    });

    if (selectedPrize.type === "TITLE") {
      const existingAch = user.achievements?.find((a: any) => a.code === selectedPrize!.name);
      if (!existingAch) {
        await prisma.userAchievement.create({
          data: {
            userId: user.id,
            code: selectedPrize.name,
            title: selectedPrize.name,
            description: selectedPrize.description || "Nhận được từ Vòng Quay May Mắn",
            icon: "🎰",
          },
        });
      }
    }

    const moneyValue =
      selectedPrize.type === "MONEY" && selectedPrize.value > 0
        ? Math.round(selectedPrize.value)
        : 0;

    if (moneyValue > 0) {
      await prisma.payrollAdjustment.create({
        data: {
          userId: user.id,
          amount: moneyValue,
          reason: `[Gacha] ${selectedPrize.name}`,
          date: new Date(),
        },
      });
    }

    await invalidateCachePattern("payroll:*").catch(() => {});
    await invalidateCachePattern("stats:*").catch(() => {});
    await invalidateCachePattern("gacha:status:" + user.id + ":*").catch(() => {});
    await invalidateCachePattern("meta:lucky-wheel:recent-winners").catch(() => {});
    await invalidateCachePattern("meta:lucky-wheel:*").catch(() => {});
    await invalidateCachePattern("admin:lucky-wheel:*").catch(() => {});

    return c.json({
      success: true,
      prize: selectedPrize,
      reward: {
        type: selectedPrize.type,
        value: moneyValue,
        message: selectedPrize.name,
      },
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Internal error spinning wheel" },
      500
    );
  }
};

staffRoute.post("/gacha", authMiddleware, handleStaffGachaSpin);
staffRoute.post("/lucky-wheel/spin", authMiddleware, handleStaffGachaSpin);

// POST /api/staff/duties/:id/toggle
staffRoute.post("/duties/:id/toggle", authMiddleware, async (c) => {
  try {
    const dutyId = c.req.param("id");
    const duty = await prisma.shiftDuty.findUnique({ where: { id: dutyId } });
    if (!duty) {
      return c.json({ success: false, error: "Nhiệm vụ không tồn tại" }, 404);
    }

    const tokenPayload = c.get("user");
    if (duty.userId !== tokenPayload?.sub && tokenPayload?.role !== "ADMIN") {
      return c.json({ success: false, error: "Bạn không có quyền cập nhật nhiệm vụ này" }, 403);
    }

    const updated = await prisma.shiftDuty.update({
      where: { id: dutyId },
      data: {
        isCompleted: !duty.isCompleted,
        completedAt: !duty.isCompleted ? new Date() : null,
      },
    });

    await invalidateShiftDutyCache();

    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Lỗi khi cập nhật nhiệm vụ" },
      500
    );
  }
});

// GET /api/staff/tasks/market
staffRoute.get("/tasks/market", authMiddleware, async (c) => {
  try {
    const items = await getOrSetCache("tasks:market:open", 60, async () => {
      return prisma.taskItem.findMany({
        where: { status: "OPEN" },
        include: { taskDefinition: true },
        orderBy: { createdAt: "desc" },
      });
    });
    return c.json({ success: true, data: items });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch task market" }, 500);
  }
});

// GET /api/staff/tasks/available
staffRoute.get("/tasks/available", authMiddleware, async (c) => {
  try {
    const tasks = await getOrSetCache("meta:task-definitions:available", 600, async () => {
      return prisma.taskDefinition.findMany({
        where: {
          active: true,
          unit: { notIn: ["điểm", "điểm-bưng"] },
        },
        orderBy: { name: "asc" },
      });
    });
    return c.json({ success: true, data: tasks });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch available tasks" }, 500);
  }
});

// GET /api/staff/tasks/my
staffRoute.get("/tasks/my", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const cacheKey = "user:tasks:my:" + userId;
    const tasks = await getOrSetCache(cacheKey, 60, async () => {
      return prisma.userTask.findMany({
        where: { userId },
        include: { taskDefinition: true, taskItem: true },
        orderBy: { updatedAt: "desc" },
      });
    });
    return c.json({ success: true, data: tasks });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch my tasks" }, 500);
  }
});

// POST /api/staff/tasks/claim
staffRoute.post("/tasks/claim", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const body = await c.req.json().catch(() => ({}));
    const { taskItemId } = body;

    if (!taskItemId) {
      return c.json({ success: false, error: "Thiếu taskItemId" }, 400);
    }

    const updated = await prisma.taskItem.updateMany({
      where: { id: taskItemId, status: "OPEN" },
      data: { status: "IN_PROGRESS", assigneeId: userId },
    });

    if (updated.count === 0) {
      return c.json({ success: false, error: "Nhiệm vụ này đã được nhân viên khác nhận trước!" }, 409);
    }

    const item = await prisma.taskItem.findUnique({
      where: { id: taskItemId },
      include: { taskDefinition: true },
    });

    const userTask = await prisma.userTask.create({
      data: {
        userId,
        taskDefId: item!.taskDefId,
        taskItemId: item!.id,
        unitPrice: item!.taskDefinition?.baseReward || 0,
        status: "PENDING",
        note: item!.description || item!.title,
      },
      include: { taskDefinition: true, taskItem: true },
    });

    await Promise.all([
      invalidateCachePattern("tasks:market:*"),
      invalidateCachePattern("tasks:items:*"),
      invalidateCachePattern("user:tasks:my:" + userId + "*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
    ]).catch(() => {});

    return c.json({ success: true, message: "Nhận việc thành công!", data: userTask });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi khi nhận việc" }, 400);
  }
});

// POST /api/staff/tasks/start
staffRoute.post("/tasks/start", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const body = await c.req.json().catch(() => ({}));
    const { taskDefId } = body;

    if (!taskDefId) {
      return c.json({ success: false, error: "Thiếu taskDefId" }, 400);
    }

    const taskDef = await prisma.taskDefinition.findUnique({
      where: { id: taskDefId },
    });

    if (!taskDef || !taskDef.active) {
      return c.json({ success: false, error: "Nhiệm vụ không tồn tại hoặc đã ngừng hoạt động" }, 404);
    }

    if (taskDef.unit !== "điểm" && taskDef.unit !== "điểm-bưng") {
      const lastCheckIn = await prisma.checkIn.findFirst({
        where: { userId },
        orderBy: { timestamp: "desc" },
      });

      if (lastCheckIn && lastCheckIn.type === "checkin") {
        return c.json(
          { success: false, error: "Bạn phải Checkout khỏi văn phòng trước khi nhận Job WFH!" },
          400
        );
      }
    }

    const userTask = await prisma.userTask.create({
      data: {
        userId,
        taskDefId,
        unitPrice: taskDef.baseReward,
        status: "PENDING",
      },
      include: { taskDefinition: true },
    });

    await Promise.all([
      invalidateCachePattern("tasks:market:*"),
      invalidateCachePattern("user:tasks:my:" + userId + "*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
    ]).catch(() => {});

    return c.json({ success: true, message: "Bắt đầu nhiệm vụ thành công!", data: userTask });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi khi bắt đầu nhiệm vụ" }, 500);
  }
});

// POST /api/staff/tasks/submit
staffRoute.post("/tasks/submit", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const body = await c.req.json().catch(() => ({}));
    const { userTaskId, taskDefId, quantity, note, evidenceLink } = body;

    if (userTaskId) {
      const userTask = await prisma.userTask.findUnique({
        where: { id: userTaskId },
      });
      if (!userTask) return c.json({ success: false, error: "Nhiệm vụ không tồn tại" }, 404);
      if (userTask.userId !== userId && tokenPayload.role !== "ADMIN") {
        return c.json({ success: false, error: "Bạn không có quyền nộp nhiệm vụ này" }, 403);
      }
      if (userTask.status !== "PENDING" && userTask.status !== "REJECTED") {
        return c.json({ success: false, error: "Nhiệm vụ không ở trạng thái chờ nộp" }, 400);
      }

      const q = Math.max(1, parseInt(quantity, 10) || userTask.quantity || 1);
      const updated = await prisma.userTask.update({
        where: { id: userTaskId },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          quantity: q,
          evidenceLink: evidenceLink ? String(evidenceLink).trim() : userTask.evidenceLink,
          note: note ? String(note).trim() : userTask.note,
        },
        include: { taskDefinition: true, taskItem: true },
      });

      await Promise.all([
        invalidateCachePattern("tasks:market:*"),
        invalidateCachePattern("user:tasks:my:" + userId + "*"),
        invalidateCachePattern("admin:tasks:*"),
        invalidateCachePattern("staff:tasks:*"),
        invalidateCachePattern("staff:rewards:leaderboard:*"),
      ]).catch(() => {});

      return c.json({ success: true, message: "Nộp kết quả thành công!", data: updated });
    }

    if (!taskDefId) {
      return c.json({ success: false, error: "Thiếu Task ID" }, 400);
    }

    const taskDef = await prisma.taskDefinition.findUnique({
      where: { id: taskDefId },
    });

    if (!taskDef || !taskDef.active) {
      return c.json({ success: false, error: "Task definition not found or inactive" }, 404);
    }

    const q = Math.max(1, parseInt(quantity, 10) || 1);
    const userTask = await prisma.userTask.create({
      data: {
        userId,
        taskDefId,
        unitPrice: taskDef.baseReward,
        status: "SUBMITTED",
        submittedAt: new Date(),
        quantity: q,
        note: note ? String(note).trim() : "",
        evidenceLink: evidenceLink ? String(evidenceLink).trim() : "",
      },
      include: { taskDefinition: true },
    });

    await Promise.all([
      invalidateCachePattern("tasks:market:*"),
      invalidateCachePattern("user:tasks:my:" + userId + "*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
      invalidateTaskSummaryCache(userId),
    ]).catch(() => {});

    return c.json({ success: true, message: "Nộp kết quả thành công!", data: userTask });
  } catch (error: any) {
    return c.json({ success: false, error: error?.message || "Failed to submit task" }, 500);
  }
});

// GET /api/staff/tasks/packing-summary
staffRoute.get("/tasks/packing-summary", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const { startDate, endDate } = getVietnamMonthRange();

    const cacheKey = `staff:tasks:packing-summary:${userId}`;
    const data = await getOrSetCache(cacheKey, 120, async () => {
      const [priceList, userTasks] = await Promise.all([
        getOrSetCache("meta:task-definitions:packing", 600, () =>
          prisma.taskDefinition.findMany({
            where: { unit: "điểm", active: true },
            orderBy: { baseReward: "asc" },
          })
        ),
        prisma.userTask.findMany({
          where: {
            userId,
            taskDefinition: { unit: "điểm" },
          },
          include: { taskDefinition: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ]);

      let totalPoints = 0;
      let approvedCount = 0;
      let pendingCount = 0;

      for (const t of userTasks) {
        const taskDate = new Date(t.submittedAt || t.createdAt);
        if (taskDate >= startDate && taskDate <= endDate) {
          if (t.status === "APPROVED") {
            totalPoints += t.finalAmount || t.quantity || 0;
            approvedCount++;
          } else if (t.status === "PENDING" || t.status === "SUBMITTED") {
            pendingCount++;
          }
        }
      }

      return {
        totalPoints,
        approvedCount,
        pendingCount,
        priceList,
        history: userTasks,
      };
    });

    return c.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch packing summary" }, 500);
  }
});

// GET /api/staff/tasks/carrying-summary
staffRoute.get("/tasks/carrying-summary", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const { startDate, endDate } = getVietnamMonthRange();

    const cacheKey = `staff:tasks:carrying-summary:${userId}`;
    const data = await getOrSetCache(cacheKey, 120, async () => {
      const [conversionList, userTasks] = await Promise.all([
        getOrSetCache("meta:task-definitions:carrying", 600, () =>
          prisma.taskDefinition.findMany({
            where: { unit: "điểm-bưng", active: true },
            orderBy: { baseReward: "asc" },
          })
        ),
        prisma.userTask.findMany({
          where: {
            userId,
            taskDefinition: { unit: "điểm-bưng" },
          },
          include: { taskDefinition: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ]);

      let totalPoints = 0;
      let approvedCount = 0;
      let pendingCount = 0;

      for (const t of userTasks) {
        const taskDate = new Date(t.submittedAt || t.createdAt);
        if (taskDate >= startDate && taskDate <= endDate) {
          if (t.status === "APPROVED") {
            totalPoints += t.finalAmount || t.quantity || 0;
            approvedCount++;
          } else if (t.status === "PENDING" || t.status === "SUBMITTED") {
            pendingCount++;
          }
        }
      }

      const totalTrips = totalPoints;
      return {
        totalPoints,
        totalTrips,
        approvedCount,
        pendingCount,
        conversionList,
        history: userTasks,
      };
    });

    return c.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch carrying summary" }, 500);
  }
});

// POST /api/staff/tasks/submit-packing
staffRoute.post("/tasks/submit-packing", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const body = await c.req.json().catch(() => ({}));
    const { taskDefId, quantity, note, evidenceLink } = body;

    if (!taskDefId) {
      return c.json({ success: false, error: "Thiếu Task ID" }, 400);
    }

    const taskDef = await prisma.taskDefinition.findUnique({
      where: { id: taskDefId },
    });

    if (!taskDef || !taskDef.active) {
      return c.json({ success: false, error: "Loại đóng gói không tồn tại hoặc đã ngừng" }, 404);
    }

    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) {
      return c.json({ success: false, error: "Số lượng phải lớn hơn 0" }, 400);
    }

    const userTask = await prisma.userTask.create({
      data: {
        userId,
        taskDefId,
        unitPrice: taskDef.baseReward,
        quantity: q,
        status: "SUBMITTED",
        submittedAt: new Date(),
        note: note ? String(note).trim() : null,
        evidenceLink: evidenceLink ? String(evidenceLink).trim() : null,
      },
      include: { taskDefinition: true },
    });

    await Promise.all([
      invalidateCachePattern("tasks:market:*"),
      invalidateCachePattern("user:tasks:my:" + userId + "*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
      invalidateTaskSummaryCache(userId),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Khai báo đóng gói thành công!",
      data: userTask,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi khi nộp đơn đóng gói" }, 500);
  }
});

// POST /api/staff/tasks/submit-carrying
staffRoute.post("/tasks/submit-carrying", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const body = await c.req.json().catch(() => ({}));
    const { taskDefId, quantity, note, evidenceLink } = body;

    if (!taskDefId) {
      return c.json({ success: false, error: "Thiếu Task ID" }, 400);
    }

    const taskDef = await prisma.taskDefinition.findUnique({
      where: { id: taskDefId },
    });

    if (!taskDef || !taskDef.active) {
      return c.json({ success: false, error: "Loại bưng lầu không tồn tại hoặc đã ngừng" }, 404);
    }

    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) {
      return c.json({ success: false, error: "Số lượng phải lớn hơn 0" }, 400);
    }

    const userTask = await prisma.userTask.create({
      data: {
        userId,
        taskDefId,
        unitPrice: taskDef.baseReward,
        quantity: q,
        status: "SUBMITTED",
        submittedAt: new Date(),
        note: note ? String(note).trim() : null,
        evidenceLink: evidenceLink ? String(evidenceLink).trim() : null,
      },
      include: { taskDefinition: true },
    });

    await Promise.all([
      invalidateCachePattern("tasks:market:*"),
      invalidateCachePattern("user:tasks:my:" + userId + "*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("staff:rewards:leaderboard:*"),
      invalidateTaskSummaryCache(userId),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Khai báo bưng hàng lên lầu thành công!",
      data: userTask,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi khi nộp bưng lầu" }, 500);
  }
});

// GET /api/staff/rewards/leaderboard
staffRoute.get("/rewards/leaderboard", authMiddleware, async (c) => {
  try {
    const now = new Date();
    const monthQuery = c.req.query("month");
    const yearQuery = c.req.query("year");
    const month = monthQuery ? parseInt(monthQuery, 10) : now.getMonth() + 1;
    const year = yearQuery ? parseInt(yearQuery, 10) : now.getFullYear();

    const cacheKey = `staff:rewards:leaderboard:${month}:${year}`;

    const data = await getOrSetCache(cacheKey, 180, async () => {
      const { startDate, endDate } = getVietnamMonthRange(month, year);

      const useNewOTRule = year > 2026 || (year === 2026 && month >= 8);
      const excludedNames = useNewOTRule ? ["Nía", "Na"] : ["Nía"];

      // 1. Get all active non-admin users
      const allUsers = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { not: "ADMIN" },
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          employmentType: true,
          hourlyRate: true,
          monthlySalary: true,
        },
      });

      const activeUsers = allUsers.filter(
        (u) => !excludedNames.includes(u.name || "")
      );

      // 2. Fetch Checkins and Shifts for discipline ranking
      const [checkins, shifts, pointTasks, carryingTasks] = await Promise.all([
        prisma.checkIn.findMany({
          where: {
            timestamp: { gte: startDate, lte: endDate },
            user: { role: { not: "ADMIN" } },
          },
          include: { user: true },
        }),
        prisma.workShift.findMany({
          where: {
            start: { gte: startDate, lte: endDate },
          },
        }),
        prisma.userTask.findMany({
          where: {
            status: "APPROVED",
            submittedAt: { gte: startDate, lte: endDate },
            taskDefinition: { unit: "điểm" },
            user: { role: { not: "ADMIN" } },
          },
          include: { user: true },
        }),
        prisma.userTask.findMany({
          where: {
            status: "APPROVED",
            submittedAt: { gte: startDate, lte: endDate },
            taskDefinition: { unit: "điểm-bưng" },
            user: { role: { not: "ADMIN" } },
          },
          include: { user: true },
        }),
      ]);

      // Build shift map
      const shiftMap: Record<string, any> = {};
      for (const s of shifts) {
        const d = s.start.toISOString().split("T")[0];
        shiftMap[`${s.userId}-${d}`] = s;
      }

      // Top 3 Discipline (Chuyên cần)
      const userDisciplineStats: Record<string, any> = {};
      for (const ch of checkins) {
        if (!userDisciplineStats[ch.userId]) {
          userDisciplineStats[ch.userId] = {
            user: ch.user,
            totalLateMinutes: 0,
            lateCount: 0,
            strictLateCount: 0,
            checkinCount: 0,
            totalEarlyMinutes: 0,
            totalScheduledCheckins: 0,
            onTimeCount: 0,
          };
        }

        const stats = userDisciplineStats[ch.userId];
        const date = new Date(ch.timestamp);
        const dateKey = date.toISOString().split("T")[0];
        const hour = date.getHours();
        const min = date.getMinutes();
        const timeVal = hour + min / 60;

        const shift = shiftMap[`${ch.userId}-${dateKey}`];

        if (ch.type === "checkin") {
          stats.checkinCount++;
          let expectedStart = 8.5;
          let shouldCheck = false;

          if (shift) {
            const s = new Date(shift.start);
            expectedStart = s.getHours() + s.getMinutes() / 60;
            shouldCheck = true;
          } else if (ch.user.employmentType === "FULL_TIME") {
            shouldCheck = true;
          }

          if (shouldCheck) {
            stats.totalScheduledCheckins++;
            if (isLate(timeVal, expectedStart)) {
              stats.lateCount++;
              stats.totalLateMinutes += Math.floor((timeVal - expectedStart) * 60);
            } else {
              stats.onTimeCount++;
            }

            if (timeVal > expectedStart) {
              stats.strictLateCount++;
            }

            if (timeVal < expectedStart) {
              stats.totalEarlyMinutes += Math.round((expectedStart - timeVal) * 60);
            }
          }
        }
      }

      const topDiscipline = Object.values(userDisciplineStats)
        .filter((u: any) => !excludedNames.includes(u.user?.name || "") && u.totalScheduledCheckins > 0 && u.strictLateCount === 0)
        .map((u: any) => ({
          id: u.user.id,
          name: u.user.name || "Nhân viên",
          image: u.user.image,
          totalScheduledCheckins: u.totalScheduledCheckins,
          punctualityRate: (u.onTimeCount / u.totalScheduledCheckins) * 100,
          totalEarlyMinutes: u.totalEarlyMinutes,
        }))
        .sort((a, b) => {
          if (b.punctualityRate === a.punctualityRate) {
            if (b.totalEarlyMinutes === a.totalEarlyMinutes) {
              return b.totalScheduledCheckins - a.totalScheduledCheckins;
            }
            return b.totalEarlyMinutes - a.totalEarlyMinutes;
          }
          return b.punctualityRate - a.punctualityRate;
        })
        .slice(0, 3);

      // Calculate user monthly stats for Hardworking and Overtime
      const targetDate = new Date(year, month - 1, 15);
      const userMonthlySummaries = await Promise.all(
        activeUsers.map(async (u) => {
          const s = await calculateUserMonthlyStats(u.id, targetDate);
          return {
            user: u,
            stats: s,
          };
        })
      );

      // Top 3 Hardworking (Chăm chỉ - Part-time only)
      const topHardworking = userMonthlySummaries
        .filter((item) => item.user.employmentType !== "FULL_TIME" && (item.stats?.totalHours || 0) > 0)
        .map((item) => ({
          id: item.user.id,
          name: item.user.name || "Nhân viên",
          image: item.user.image,
          totalHours: item.stats?.totalHours || 0,
          daysWorked: item.stats?.daysWorked || 0,
        }))
        .sort((a, b) => b.totalHours - a.totalHours)
        .slice(0, 3);

      // Top 3 Overtime (Tăng ca)
      const isCurrentMonth = now.getMonth() + 1 === month && now.getFullYear() === year;
      const referenceDay = isCurrentMonth ? now.getDate() : 31;
      let minDays = 1;
      if (referenceDay >= 22) minDays = 16;
      else if (referenceDay >= 8) minDays = 8;

      const topOvertime = userMonthlySummaries
        .filter((item) => {
          const otHours = useNewOTRule
            ? (item.stats?.leaderboardOvertimeHours || 0)
            : (item.stats?.totalOvertimeHours || 0);
          const daysWorked = item.stats?.daysWorked || 0;
          return otHours > 0 && daysWorked >= minDays && !excludedNames.includes(item.user.name || "");
        })
        .map((item) => {
          const otHours = useNewOTRule
            ? (item.stats?.leaderboardOvertimeHours || 0)
            : (item.stats?.totalOvertimeHours || 0);
          const daysWorked = item.stats?.daysWorked || 1;
          return {
            id: item.user.id,
            name: item.user.name || "Nhân viên",
            image: item.user.image,
            displayOvertimeHours: Math.round(otHours * 10) / 10,
            avgOvertime: Math.round((otHours / daysWorked) * 10) / 10,
            daysWorked,
          };
        })
        .sort((a, b) => b.avgOvertime - a.avgOvertime)
        .slice(0, 3);

      // Top 3 Vua Đóng Hàng
      const userPointsMap: Record<string, { id: string; name: string; image: string | null; points: number }> = {};
      for (const pt of pointTasks) {
        if (!userPointsMap[pt.userId]) {
          userPointsMap[pt.userId] = {
            id: pt.user.id,
            name: pt.user.name || "Nhân viên",
            image: pt.user.image,
            points: 0,
          };
        }
        userPointsMap[pt.userId].points += pt.finalAmount || pt.quantity || 0;
      }

      const topPacking = Object.values(userPointsMap)
        .filter((u) => !excludedNames.includes(u.name))
        .sort((a, b) => b.points - a.points)
        .slice(0, 3);

      // Top 3 Chiến Thần Bưng Hàng
      const userCarryingMap: Record<string, { id: string; name: string; image: string | null; points: number }> = {};
      for (const ct of carryingTasks) {
        if (!userCarryingMap[ct.userId]) {
          userCarryingMap[ct.userId] = {
            id: ct.user.id,
            name: ct.user.name || "Nhân viên",
            image: ct.user.image,
            points: 0,
          };
        }
        userCarryingMap[ct.userId].points += ct.finalAmount || ct.quantity || 0;
      }

      const topCarrying = Object.values(userCarryingMap)
        .filter((u) => !excludedNames.includes(u.name) && u.points >= 10)
        .sort((a, b) => b.points - a.points)
        .slice(0, 3);

      return {
        month,
        year,
        topDiscipline,
        topHardworking,
        topOvertime,
        topPacking,
        topCarrying,
      };
    });

    return c.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch leaderboard" },
      500
    );
  }
});

// GET /api/staff/staff-tasks
staffRoute.get("/staff-tasks", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const role = tokenPayload.role;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, staffTasksAllowed: true },
    });

    if (!user) return c.json({ success: false, error: "User not found" }, 404);

    const isAdmin = role === "ADMIN" || user.role === "ADMIN";
    const isPartner = role === "PARTNER" || user.role === "PARTNER";
    const isAllowed = isAdmin || isPartner || user.staffTasksAllowed;
    if (!isAllowed) {
      return c.json(
        {
          success: false,
          error: "Bạn không có quyền truy cập Công việc và KPI",
          allowed: false,
        },
        403
      );
    }

    const targetUserId = isAdmin && c.req.query("userId") ? c.req.query("userId") : (!isAdmin ? userId : undefined);
    const cacheKey = `staff:staff-tasks:${targetUserId || "all"}`;
    const data = await getOrSetCache(cacheKey, 60, async () => {
      const whereClause: any = {};
      if (targetUserId) {
        whereClause.assigneeId = targetUserId;
      }

      const tasks = await prisma.staffTask.findMany({
        where: whereClause,
        include: {
          assignee: { select: { id: true, name: true, email: true, image: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const effectiveStatsUserId = targetUserId || userId;
      const { startDate: monthStart, endDate: monthEnd } = getVietnamMonthRange();

      const now = new Date();
      const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
      const currentDay = vnNow.getUTCDay();
      const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const weekStartLocal = new Date(vnNow);
      weekStartLocal.setUTCDate(vnNow.getUTCDate() + diffToMonday);
      weekStartLocal.setUTCHours(0, 0, 0, 0);
      const weekStart = new Date(weekStartLocal.getTime() - VN_OFFSET_MS);
      const weekEndLocal = new Date(weekStartLocal);
      weekEndLocal.setUTCDate(weekStartLocal.getUTCDate() + 6);
      weekEndLocal.setUTCHours(23, 59, 59, 999);
      const weekEnd = new Date(weekEndLocal.getTime() - VN_OFFSET_MS);

      const userTasksForStats = tasks.filter((t) => t.assigneeId === effectiveStatsUserId);

      const calcStats = (taskList: typeof tasks) => {
        const total = taskList.length;
        const approved = taskList.filter((t) => t.status === "APPROVED").length;
        const doing = taskList.filter((t) => t.status === "DOING").length;
        const pendingReview = taskList.filter((t) => t.status === "DONE").length;
        const overdue = taskList.filter(
          (t) => t.deadline && new Date(t.deadline) < now && t.status !== "APPROVED"
        ).length;
        const completionRate = total > 0 ? approved / total : 0;
        return { total, approved, doing, pendingReview, overdue, completionRate };
      };

      const monthlyTasks = userTasksForStats.filter((t) => {
        const d = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);
        return d >= monthStart && d <= monthEnd;
      });

      const weeklyTasks = userTasksForStats.filter((t) => {
        const d = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);
        return d >= weekStart && d <= weekEnd;
      });

      return {
        tasks,
        stats: {
          monthly: calcStats(monthlyTasks),
          weekly: calcStats(weeklyTasks),
        },
      };
    });

    return c.json({
      success: true,
      allowed: true,
      data,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch staff tasks" },
      500
    );
  }
});

// POST /api/staff/staff-tasks/:id/toggle
staffRoute.post("/staff-tasks/:id/toggle", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const role = tokenPayload.role;
    const taskId = c.req.param("id");
    if (!taskId) {
      return c.json({ success: false, error: "Thiếu mã công việc" }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, staffTasksAllowed: true },
    });
    if (!user) return c.json({ success: false, error: "User not found" }, 404);

    const isAdmin = role === "ADMIN" || user.role === "ADMIN";
    const isPartner = role === "PARTNER" || user.role === "PARTNER";
    const isAllowed = isAdmin || isPartner || user.staffTasksAllowed;
    if (!isAllowed) {
      return c.json({ success: false, error: "Bạn không có quyền truy cập Công việc và KPI" }, 403);
    }

    const task = await prisma.staffTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return c.json({ success: false, error: "Không tìm thấy công việc" }, 404);
    }

    if (!isAdmin && task.assigneeId !== userId) {
      return c.json({ success: false, error: "Bạn không có quyền chỉnh sửa công việc này" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    let nextStatus = body.status;

    if (!nextStatus) {
      if (task.status === "TODO") nextStatus = "DOING";
      else if (task.status === "DOING") nextStatus = "DONE";
      else if (task.status === "DONE") nextStatus = "DOING";
      else nextStatus = task.status;
    }

    if (!isAdmin && !["TODO", "DOING", "DONE"].includes(nextStatus)) {
      return c.json({ success: false, error: "Trạng thái không hợp lệ cho nhân viên" }, 400);
    }

    const updateData: any = {
      status: nextStatus,
    };

    if (nextStatus === "DONE") {
      updateData.submittedAt = new Date();
      if (body.evidenceLink !== undefined) updateData.evidenceLink = body.evidenceLink;
      const noteVal = body.evidenceNote !== undefined ? body.evidenceNote : body.note;
      if (noteVal !== undefined) updateData.evidenceNote = noteVal;
    } else if (nextStatus === "APPROVED") {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.staffTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await Promise.all([
      invalidateCachePattern("staff:staff-tasks:*"),
      invalidateCachePattern("tasks:staff-tasks:*"),
      invalidateCachePattern("staff-tasks:stats:*"),
      invalidateCachePattern("payroll:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Cập nhật tiến độ thành công!",
      data: updated,
      task: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Lỗi cập nhật công việc" },
      500
    );
  }
});

// POST /api/staff/staff-tasks/:id/status
staffRoute.post("/staff-tasks/:id/status", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const role = tokenPayload.role;
    const taskId = c.req.param("id");
    if (!taskId) {
      return c.json({ success: false, error: "Thiếu mã công việc" }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, staffTasksAllowed: true },
    });
    if (!user) return c.json({ success: false, error: "User not found" }, 404);

    const isAdmin = role === "ADMIN" || user.role === "ADMIN";
    const isPartner = role === "PARTNER" || user.role === "PARTNER";
    const isAllowed = isAdmin || isPartner || user.staffTasksAllowed;
    if (!isAllowed) {
      return c.json({ success: false, error: "Bạn không có quyền truy cập Công việc và KPI" }, 403);
    }

    const task = await prisma.staffTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return c.json({ success: false, error: "Không tìm thấy công việc" }, 404);
    }

    if (!isAdmin && task.assigneeId !== userId) {
      return c.json({ success: false, error: "Bạn không có quyền chỉnh sửa công việc này" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const nextStatus = body.status;

    if (!nextStatus) {
      return c.json({ success: false, error: "Thiếu trạng thái cập nhật" }, 400);
    }

    if (!isAdmin && !["TODO", "DOING", "DONE"].includes(nextStatus)) {
      return c.json({ success: false, error: "Trạng thái không hợp lệ cho nhân viên" }, 400);
    }

    const updateData: any = {
      status: nextStatus,
    };

    if (nextStatus === "DONE") {
      updateData.submittedAt = new Date();
      if (body.evidenceLink !== undefined) updateData.evidenceLink = body.evidenceLink;
      const noteVal = body.evidenceNote !== undefined ? body.evidenceNote : body.note;
      if (noteVal !== undefined) updateData.evidenceNote = noteVal;
    } else if (nextStatus === "APPROVED") {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.staffTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await Promise.all([
      invalidateCachePattern("staff:staff-tasks:*"),
      invalidateCachePattern("tasks:staff-tasks:*"),
      invalidateCachePattern("staff-tasks:stats:*"),
      invalidateCachePattern("payroll:*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Cập nhật tiến độ thành công!",
      data: updated,
      task: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Lỗi cập nhật công việc" },
      500
    );
  }
});

// GET /api/staff/reports
staffRoute.get("/reports", authMiddleware, async (c) => {
  try {
    const now = new Date();
    const month = parseInt(c.req.query("month") || "", 10) || now.getMonth() + 1;
    const year = parseInt(c.req.query("year") || "", 10) || now.getFullYear();
    const cacheKey = `staff:reports:${month}:${year}`;

    const reportData = await getOrSetCache(cacheKey, 180, async () => {
      const { startDate, endDate } = getVietnamMonthRange(month, year);

      const [users, checkins, pointTasks, carryingTasks, shifts] = await Promise.all([
        prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, role: true, image: true, employmentType: true },
        }),
        prisma.checkIn.findMany({
          where: { timestamp: { gte: startDate, lte: endDate } },
          include: {
            user: { select: { id: true, name: true, role: true, image: true, employmentType: true } },
          },
        }),
        prisma.userTask.findMany({
          where: {
            status: "APPROVED",
            submittedAt: { gte: startDate, lte: endDate },
            taskDefinition: { unit: "điểm" },
          },
          include: {
            user: { select: { id: true, name: true, role: true, image: true } },
          },
        }),
        prisma.userTask.findMany({
          where: {
            status: "APPROVED",
            submittedAt: { gte: startDate, lte: endDate },
            taskDefinition: { unit: "điểm-bưng" },
          },
          include: {
            user: { select: { id: true, name: true, role: true, image: true } },
          },
        }),
        prisma.workShift.findMany({
          where: { start: { gte: startDate, lte: endDate } },
        }),
      ]);

      const useNewOTRule = year > 2026 || (year === 2026 && month >= 8);
      const excludedNames = useNewOTRule ? ["Nía", "Na"] : ["Nía"];

      // Build shift map
      const shiftMap: Record<string, any> = {};
      for (const s of shifts) {
        const d = toVNDateString(s.start);
        shiftMap[`${s.userId}-${d}`] = s;
      }

      const userDisciplineStats: Record<
        string,
        {
          user: any;
          lateCount: number;
          strictLateCount: number;
          totalLateMinutes: number;
          totalScheduledCheckins: number;
          onTimeCount: number;
          totalEarlyMinutes: number;
        }
      > = {};

      for (const ch of checkins) {
        if (!userDisciplineStats[ch.userId]) {
          userDisciplineStats[ch.userId] = {
            user: ch.user,
            lateCount: 0,
            strictLateCount: 0,
            totalLateMinutes: 0,
            totalScheduledCheckins: 0,
            onTimeCount: 0,
            totalEarlyMinutes: 0,
          };
        }
        const stats = userDisciplineStats[ch.userId];
        const vnTime = new Date(new Date(ch.timestamp).getTime() + VN_OFFSET_MS);
        const dateKey = toVNDateString(ch.timestamp);
        const hour = vnTime.getUTCHours();
        const min = vnTime.getUTCMinutes();
        const timeVal = hour + min / 60;

        const shift = shiftMap[`${ch.userId}-${dateKey}`];

        if (ch.type === "checkin") {
          let expectedStart = 8.5;
          let shouldCheck = false;

          if (shift) {
            const sVn = new Date(new Date(shift.start).getTime() + VN_OFFSET_MS);
            expectedStart = sVn.getUTCHours() + sVn.getUTCMinutes() / 60;
            shouldCheck = true;
          } else if (ch.user?.employmentType === "FULL_TIME") {
            shouldCheck = true;
          }

          if (shouldCheck) {
            stats.totalScheduledCheckins++;
            if (isLate(timeVal, expectedStart)) {
              stats.lateCount++;
              stats.totalLateMinutes += Math.floor((timeVal - expectedStart) * 60);
            } else {
              stats.onTimeCount++;
            }

            if (timeVal > expectedStart) {
              stats.strictLateCount++;
            }

            if (timeVal < expectedStart) {
              stats.totalEarlyMinutes += Math.round((expectedStart - timeVal) * 60);
            }
          }
        }
      }

      const topLate = Object.values(userDisciplineStats)
        .filter((u) => !excludedNames.includes(u.user?.name || "") && u.lateCount > 0)
        .sort((a, b) => b.totalLateMinutes - a.totalLateMinutes)
        .map((u) => ({
          user: { id: u.user.id, name: u.user.name || "Nhân viên" },
          lateCount: u.lateCount,
          totalLateMinutes: u.totalLateMinutes,
        }));

      const topDiscipline = Object.values(userDisciplineStats)
        .filter(
          (u) =>
            !excludedNames.includes(u.user?.name || "") &&
            u.totalScheduledCheckins > 0 &&
            u.strictLateCount === 0
        )
        .map((u) => ({
          id: u.user.id,
          name: u.user.name || "Nhân viên",
          image: u.user.image,
          user: { id: u.user.id, name: u.user.name || "Nhân viên", image: u.user.image },
          totalScheduledCheckins: u.totalScheduledCheckins,
          punctualityRate:
            Math.round(((u.onTimeCount / u.totalScheduledCheckins) * 100) * 10) / 10,
          totalEarlyMinutes: u.totalEarlyMinutes,
        }))
        .sort((a, b) => {
          if (b.punctualityRate === a.punctualityRate) {
            if (b.totalEarlyMinutes === a.totalEarlyMinutes) {
              return b.totalScheduledCheckins - a.totalScheduledCheckins;
            }
            return b.totalEarlyMinutes - a.totalEarlyMinutes;
          }
          return b.punctualityRate - a.punctualityRate;
        })
        .slice(0, 5);

      const payrollSummary = await calculateMonthlyPayrollSummary(
        new Date(year, month - 1, 15)
      ).catch(() => ({
        totalPayroll: 0,
        totalProjected: 0,
        details: [],
      }));

      const totalPayrollCost = payrollSummary?.totalPayroll || 0;
      const totalHoursAll = Array.isArray(payrollSummary?.details)
        ? payrollSummary.details.reduce(
            (acc: number, d: any) => acc + (d.actualHours || 0),
            0
          )
        : 0;

      const activeDetails = Array.isArray(payrollSummary?.details)
        ? payrollSummary.details.filter(
            (d: any) => !excludedNames.includes(d.userName) && d.role !== "ADMIN"
          )
        : [];

      const topHardworking = activeDetails
        .filter((d: any) => d.employmentType !== "FULL_TIME" && (d.actualHours || 0) > 0)
        .slice()
        .sort((a: any, b: any) => (b.actualHours || 0) - (a.actualHours || 0))
        .slice(0, 5)
        .map((d: any) => ({
          id: d.userId,
          name: d.userName,
          totalHours: d.actualHours || 0,
          daysWorked: d.daysWorked || 0,
        }));

      const isCurrentMonth =
        now.getMonth() + 1 === month && now.getFullYear() === year;
      const referenceDay = isCurrentMonth ? now.getDate() : 31;
      let minDays = 1;
      if (referenceDay >= 22) {
        minDays = 16;
      } else if (referenceDay >= 8) {
        minDays = 8;
      }

      const topOvertime = activeDetails
        .filter((d: any) => {
          const otHours = useNewOTRule
            ? (d.leaderboardOvertimeHours ?? d.overtimeHours ?? 0)
            : (d.totalOvertimeHours ?? d.overtimeHours ?? 0);
          return otHours > 0 && (d.daysWorked || 0) >= minDays;
        })
        .map((d: any) => {
          const otHours = useNewOTRule
            ? (d.leaderboardOvertimeHours ?? d.overtimeHours ?? 0)
            : (d.totalOvertimeHours ?? d.overtimeHours ?? 0);
          const days = d.daysWorked || 1;
          return {
            id: d.userId,
            name: d.userName,
            avgOvertime: Math.round((otHours / days) * 10) / 10,
            displayOvertimeHours: Math.round(otHours * 10) / 10,
            daysWorked: days,
          };
        })
        .sort((a, b) => b.avgOvertime - a.avgOvertime)
        .slice(0, 5);

      // Top Packing
      const userPointsMap: Record<
        string,
        { id: string; name: string; image: string | null; points: number }
      > = {};
      for (const pt of pointTasks) {
        if (pt.user?.role === "ADMIN") continue;
        if (!userPointsMap[pt.userId]) {
          userPointsMap[pt.userId] = {
            id: pt.user.id,
            name: pt.user.name || "Nhân viên",
            image: pt.user.image,
            points: 0,
          };
        }
        userPointsMap[pt.userId].points += pt.finalAmount || pt.quantity || 0;
      }
      const topPacking = Object.values(userPointsMap)
        .filter((u) => !excludedNames.includes(u.name))
        .sort((a, b) => b.points - a.points)
        .slice(0, 5);

      // Top Carrying
      const userCarryingMap: Record<
        string,
        { id: string; name: string; image: string | null; points: number }
      > = {};
      for (const ct of carryingTasks) {
        if (ct.user?.role === "ADMIN") continue;
        if (!userCarryingMap[ct.userId]) {
          userCarryingMap[ct.userId] = {
            id: ct.user.id,
            name: ct.user.name || "Nhân viên",
            image: ct.user.image,
            points: 0,
          };
        }
        userCarryingMap[ct.userId].points += ct.finalAmount || ct.quantity || 0;
      }
      const topCarrying = Object.values(userCarryingMap)
        .filter((u) => !excludedNames.includes(u.name) && u.points >= 10)
        .sort((a, b) => b.points - a.points)
        .slice(0, 5);

      return {
        totalPayrollCost,
        totalHoursAll,
        totalEmployeeCount: users.length,
        topHardworking,
        topDiscipline,
        topOvertime,
        topPacking,
        topCarrying,
        topLate,
      };
    });

    return c.json({
      success: true,
      data: reportData,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to load reports" }, 500);
  }
});
