import { prisma } from "@checkin/db";
import { applyHardworkingBonus } from "@checkin/shared";
import { getVietnamMonthRange } from "./date-utils";
import { calculateUserMonthlyStats } from "./payroll-calculator";
import { invalidateCachePattern } from "./cache";

export interface ClosePayrollResult {
  success: boolean;
  month: number;
  year: number;
  period: any;
  payslipCount: number;
  message?: string;
  error?: string;
}

/**
 * Closes the payroll for a given month and year, saving immutable Payslip snapshots.
 */
export async function closePayrollMonth(
  month: number,
  year: number,
  bonusPercent: number = 0,
  targets: string[] = ["PART_TIME"],
  excludedBonusUsers: string[] = []
): Promise<ClosePayrollResult> {
  const numBonusPercent = Number(bonusPercent) || 0;
  const bonusTargets = targets || ["PART_TIME"];
  const excludedUsers = excludedBonusUsers || [];

  // 1. Fetch users (including deactivated with work history in the month)
  const { startDate, endDate } = getVietnamMonthRange(month, year);
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { isActive: true },
        { shifts: { some: { start: { gte: startDate, lte: endDate } } } },
        { checkins: { some: { timestamp: { gte: startDate, lte: endDate } } } },
        { adjustments: { some: { date: { gte: startDate, lte: endDate } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      employmentType: true,
    },
  });

  // 2. Build snapshots by calculating monthly stats for each user
  const targetDate = new Date(year, month - 1, 15);
  const rawPayrollItems: any[] = [];

  for (const u of users) {
    const stats = await calculateUserMonthlyStats(u.id, targetDate).catch(() => null);
    if (!stats) continue;

    const isThuKpiSalary =
      (u.email === "cuccung123456789@gmail.com" || u.name === "Thư") &&
      (year > 2026 || (year === 2026 && month >= 6));
    const shouldApplyBonus =
      (bonusTargets.includes(stats.employmentType) || (isThuKpiSalary && bonusTargets.includes("PART_TIME"))) &&
      !excludedUsers.includes(u.id);
    const bonusAmount = shouldApplyBonus ? Math.round(stats.baseSalary * (numBonusPercent / 100)) : 0;
    const finalNet = Math.round(stats.totalSalary + bonusAmount);

    rawPayrollItems.push({
      id: u.id,
      name: u.name,
      role: u.role,
      employmentType: stats.employmentType,
      stats: {
        ...stats,
        bonusPercent: shouldApplyBonus ? numBonusPercent : 0,
        bonusAmount,
        finalNet,
      },
    });
  }

  // Apply Top 1 Hardworking Bonus before saving snapshot
  const withHardworkingBonus = applyHardworkingBonus(rawPayrollItems, month, year, true);

  const snapshots = withHardworkingBonus.map((item) => ({
    userId: item.id,
    content: item.stats,
    netSalary: item.stats.finalNet || item.stats.totalSalary,
  }));

  // 3. Save to DB in transaction
  const updated = await prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.upsert({
      where: { month_year: { month, year } },
      create: {
        month,
        year,
        status: "CLOSED",
        bonusPercent: numBonusPercent,
        bonusTargets: bonusTargets as any,
        excludedBonusUsers: excludedUsers,
      },
      update: {
        status: "CLOSED",
        bonusPercent: numBonusPercent,
        bonusTargets: bonusTargets as any,
        excludedBonusUsers: excludedUsers,
      },
    });

    for (const s of snapshots) {
      await tx.payslip.upsert({
        where: { userId_month_year: { userId: s.userId, month, year } },
        create: {
          userId: s.userId,
          month,
          year,
          content: s.content as any,
          netSalary: s.netSalary,
          status: "PENDING",
        },
        update: {
          content: s.content as any,
          netSalary: s.netSalary,
        },
      });
    }

    return period;
  });

  await Promise.all([
    invalidateCachePattern("payroll:*"),
    invalidateCachePattern("stats:*"),
    invalidateCachePattern("stats:monthly:*"),
    invalidateCachePattern("admin:dashboard:*"),
  ]).catch(() => {});

  return {
    success: true,
    month,
    year,
    period: updated,
    payslipCount: snapshots.length,
    message: `Đã chốt bảng lương tháng ${month}/${year} thành công (${snapshots.length} phiếu lương)`,
  };
}
