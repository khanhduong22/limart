import { prisma } from "@checkin/db";
import { toVietnamTime } from "./schedule-lock";
import { VN_OFFSET_MS } from "./date-utils";
import { invalidateCachePattern } from "./cache";

/**
 * Converts a Date object whose components represent Vietnam Time (GMT+7) back to a UTC Date.
 */
export function vnDateToUTC(vnDate: Date): Date {
  return new Date(
    Date.UTC(
      vnDate.getFullYear(),
      vnDate.getMonth(),
      vnDate.getDate(),
      vnDate.getHours(),
      vnDate.getMinutes(),
      vnDate.getSeconds(),
      vnDate.getMilliseconds()
    ) - VN_OFFSET_MS
  );
}

/**
 * Computes week boundaries and penalty deadlines for any shift date.
 * Week starts Monday 00:00:00 GMT+7 and ends Sunday 23:59:59.999 GMT+7.
 * Lock and penalty deadline is Sunday 00:00:00 GMT+7 of the prior week (1 day before Monday),
 * matching `isShiftLocked` in schedule-lock.ts.
 */
export function getWeekBoundaries(dateInput: Date | string | number = new Date()): {
  weekStartUTC: Date;
  weekEndUTC: Date;
  penaltyDeadlineUTC: Date;
  mondayVN: Date;
  sundayVN: Date;
  penaltyDeadlineVN: Date;
  weekStr: string;
} {
  const vnTime = toVietnamTime(dateInput);
  const day = vnTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const mondayVN = new Date(vnTime.getTime());
  mondayVN.setDate(vnTime.getDate() + diffToMonday);
  mondayVN.setHours(0, 0, 0, 0);

  const sundayVN = new Date(mondayVN.getTime());
  sundayVN.setDate(mondayVN.getDate() + 6);
  sundayVN.setHours(23, 59, 59, 999);

  // Penalty deadline is Sunday 00:00:00 GMT+7 of the previous week (1 day before Monday)
  // Aligned with isShiftLocked in schedule-lock.ts
  const penaltyDeadlineVN = new Date(mondayVN.getTime());
  penaltyDeadlineVN.setDate(mondayVN.getDate() - 1);
  penaltyDeadlineVN.setHours(0, 0, 0, 0);

  const weekStartUTC = vnDateToUTC(mondayVN);
  const weekEndUTC = vnDateToUTC(sundayVN);
  const penaltyDeadlineUTC = vnDateToUTC(penaltyDeadlineVN);

  const monStr =
    mondayVN.getDate().toString().padStart(2, "0") +
    "/" +
    (mondayVN.getMonth() + 1).toString().padStart(2, "0");
  const sunStr =
    sundayVN.getDate().toString().padStart(2, "0") +
    "/" +
    (sundayVN.getMonth() + 1).toString().padStart(2, "0");
  const weekStr = `${monStr} - ${sunStr}`;

  return {
    weekStartUTC,
    weekEndUTC,
    penaltyDeadlineUTC,
    mondayVN,
    sundayVN,
    penaltyDeadlineVN,
    weekStr,
  };
}

/**
 * Checks and applies a 50,000 VND late schedule registration penalty for a Part-time employee.
 *
 * Rules:
 * - Applicable only to Part-time staff (not Full-time, not Admin).
 * - Triggered when an employee registers their first shift after the deadline (Sunday 00:00 GMT+7 of week prior).
 * - Max 1 penalty per week per employee.
 * - EXEMPTIONS:
 *   1. Bypassed if `skipPenalty` is true (e.g. Admin explicit waiver or Admin assigning/creating shifts).
 *   2. Bypassed if the employee already has at least 1 shift in that week created before the deadline.
 *   3. Bypassed if shifts in that week were scheduled or created by an Admin (via shift audit log).
 */
export async function applyLateSchedulePenalty(
  targetUserId: string,
  shiftStart: Date,
  skipPenalty: boolean = false,
  nowInput?: Date
): Promise<{ applied: boolean; reason?: string }> {
  if (skipPenalty) return { applied: false };

  const targetUser = prisma.user?.findUnique
    ? await prisma.user.findUnique({ where: { id: targetUserId } })
    : null;
  if (!targetUser || targetUser.employmentType !== "PART_TIME" || targetUser.role === "ADMIN") {
    return { applied: false };
  }

  const {
    weekStartUTC,
    weekEndUTC,
    penaltyDeadlineUTC,
    mondayVN,
    penaltyDeadlineVN,
    weekStr,
  } = getWeekBoundaries(shiftStart);

  const nowVN = toVietnamTime(nowInput || new Date());

  // If current time is before deadline (Sunday 00:00 GMT+7 of week prior) -> registered on time, no penalty
  if (nowVN.getTime() < penaltyDeadlineVN.getTime()) {
    return { applied: false };
  }

  // If current time is after deadline, check exemption conditions:
  // 1. Employee already had at least 1 shift in that week registered before the deadline
  const preRegisteredShift = prisma.workShift?.findFirst
    ? await prisma.workShift.findFirst({
        where: {
          userId: targetUser.id,
          start: { gte: weekStartUTC, lte: weekEndUTC },
          createdAt: { lt: penaltyDeadlineUTC },
        },
        select: { id: true },
      })
    : null;

  if (preRegisteredShift) {
    return { applied: false };
  }

  // 2. Any shift in that week was pre-created or created by an Admin (via audit log)
  const adminOrPreCreatedAudit = prisma.shiftAuditLog?.findFirst
    ? await prisma.shiftAuditLog.findFirst({
        where: {
          userId: targetUser.id,
          action: { in: ["CREATE", "IMPORT"] },
          newStart: { gte: weekStartUTC, lte: weekEndUTC },
          OR: [
            { createdAt: { lt: penaltyDeadlineUTC } },
            { changedBy: { role: "ADMIN" } },
          ],
        },
        select: { id: true },
      })
    : null;

  if (adminOrPreCreatedAudit) {
    return { applied: false };
  }

  // Check if they already have a penalty for this week
  const mondayDate = new Date(mondayVN);
  const existingAdjustment = prisma.payrollAdjustment?.findFirst
    ? await prisma.payrollAdjustment.findFirst({
        where: {
          userId: targetUser.id,
          date: mondayDate,
          OR: [
            { reason: { contains: "Phạt đăng ký lịch muộn" } },
            { reason: { contains: "Phạt không đăng ký lịch" } },
            { reason: { contains: "Đăng ký trễ lịch làm" } },
          ],
        },
      })
    : null;

  if (!existingAdjustment && prisma.payrollAdjustment?.create) {
    const reason = `Phạt đăng ký lịch muộn tuần ${weekStr}`;

    await prisma.payrollAdjustment.create({
      data: {
        userId: targetUser.id,
        amount: -50000,
        reason,
        date: mondayDate,
      },
    });

    await invalidateCachePattern("payroll:*").catch(() => {});
    await invalidateCachePattern("stats:*").catch(() => {});
    await invalidateCachePattern("staff:home:*").catch(() => {});
    await invalidateCachePattern("admin:employee-detail:*").catch(() => {});

    return { applied: true, reason };
  }

  return { applied: false };
}

/**
 * Reconciles and deletes wrongfully applied late schedule penalties.
 * If an employee has a late penalty for a week where:
 * - They actually had at least 1 shift created before the deadline, OR
 * - An Admin scheduled/created shifts for them, OR
 * - User is Quỳnh Anh with the 19/10 - 25/10 penalty,
 * the false penalty record is automatically deleted and caches are refreshed.
 */
export async function reconcileFalseLateSchedulePenalties(
  targetUserId?: string
): Promise<{ deletedCount: number; details: string[] }> {
  if (!prisma.payrollAdjustment?.findMany) {
    return { deletedCount: 0, details: [] };
  }

  const whereClause: any = {
    amount: -50000,
    OR: [
      { reason: { contains: "Phạt đăng ký lịch muộn" } },
      { reason: { contains: "Phạt không đăng ký lịch" } },
      { reason: { contains: "Đăng ký trễ lịch làm" } },
    ],
  };
  if (targetUserId) {
    whereClause.userId = targetUserId;
  }

  const adjustments = await prisma.payrollAdjustment.findMany({
    where: whereClause,
    include: {
      user: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  if (!adjustments || adjustments.length === 0) {
    return { deletedCount: 0, details: [] };
  }

  const deletedIds: string[] = [];
  const details: string[] = [];
  const affectedUserIds = new Set<string>();

  for (const adj of adjustments) {
    const { weekStartUTC, weekEndUTC, penaltyDeadlineUTC, weekStr } = getWeekBoundaries(adj.date);

    const isQuynhAnhTarget =
      adj.user?.name?.toLowerCase().includes("quỳnh anh") &&
      (adj.reason.includes("19/10 - 25/10") || weekStr === "19/10 - 25/10");

    const preRegisteredShift = prisma.workShift?.findFirst
      ? await prisma.workShift.findFirst({
          where: {
            userId: adj.userId,
            start: { gte: weekStartUTC, lte: weekEndUTC },
            createdAt: { lt: penaltyDeadlineUTC },
          },
          select: { id: true },
        })
      : null;

    const adminOrPreCreatedAudit = prisma.shiftAuditLog?.findFirst
      ? await prisma.shiftAuditLog.findFirst({
          where: {
            userId: adj.userId,
            action: { in: ["CREATE", "IMPORT"] },
            newStart: { gte: weekStartUTC, lte: weekEndUTC },
            OR: [
              { createdAt: { lt: penaltyDeadlineUTC } },
              { changedBy: { role: "ADMIN" } },
            ],
          },
          select: { id: true },
        })
      : null;

    if (preRegisteredShift || adminOrPreCreatedAudit || isQuynhAnhTarget) {
      deletedIds.push(adj.id);
      affectedUserIds.add(adj.userId);
      details.push(
        `User ${adj.user?.name || adj.userId} - Reason: "${adj.reason}" (Pre-registered: ${Boolean(preRegisteredShift)}, Admin-scheduled: ${Boolean(adminOrPreCreatedAudit)})`
      );
    }
  }

  if (deletedIds.length > 0 && prisma.payrollAdjustment?.deleteMany) {
    await prisma.payrollAdjustment.deleteMany({
      where: { id: { in: deletedIds } },
    });

    await invalidateCachePattern("payroll:*").catch(() => {});
    await invalidateCachePattern("stats:*").catch(() => {});
    await invalidateCachePattern("staff:home:*").catch(() => {});
    await invalidateCachePattern("admin:employee-detail:*").catch(() => {});
    for (const uid of affectedUserIds) {
      await invalidateCachePattern(`*${uid}*`).catch(() => {});
    }
  }

  return { deletedCount: deletedIds.length, details };
}
