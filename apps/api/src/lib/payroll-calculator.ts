import { prisma } from "@checkin/db";
import { calculateLatePenalty, isLate as checkIsLate, applyHardworkingBonus } from "@checkin/shared";
import { getVietnamMonthRange, toVNDateString, VN_OFFSET_MS } from "./date-utils";
import { getOrSetCache } from "./cache";

export interface DailyDetail {
  date: string;
  checkIn: Date | null;
  checkOut: Date | null;
  hours: number;
  salary: number;
  isLate: boolean;
  multiplier: number;
  isValid: boolean;
  shift: string;
  error?: string;
  isSenior?: boolean;
  seniorBonus?: number;
}

export interface UserPayrollSummary {
  userId: string;
  totalHours: number;
  totalOvertimeHours?: number;
  leaderboardOvertimeHours?: number;
  daysWorked: number;
  checkinCount?: number;
  baseSalary: number;
  totalAdjustments: number;
  lateCount: number;
  latePenaltyHours: number;
  latePenaltyAmount: number;
  totalSalary: number;
  projectedSalary: number;
  hourlyRate: number;
  dynamicHourlyRate: number;
  monthlySalary: number | null;
  employmentType: string;
  standardDays: number;
  dailySalary: number;
  leaveCount: number;
  deduction: number;
  totalSeniorBonus?: number;
  isThuKpiSalary?: boolean;
  kpiCompletionRate?: number;
  kpiTasksTotal?: number;
  kpiTasksApproved?: number;
  fixedBaseSalary?: number;
  kpiSalary?: number;
  adjustments?: any[];
  dailyDetails: DailyDetail[];
}

export function calculateFullTimeMetrics(
  user: {
    employmentType: string;
    hourlyRate: number;
    monthlySalary?: number | null;
    email?: string | null;
    name?: string | null;
  },
  year: number,
  month: number, // 1-indexed (1-12)
  leaveCount: number
) {
  if (user.employmentType !== "FULL_TIME") {
    return {
      standardDays: 0,
      dailySalary: 0,
      dynamicHourlyRate: user.hourlyRate,
      deduction: 0,
    };
  }

  // daysInMonth in VN calendar for the target month
  const daysInMonth = new Date(year, month, 0).getDate();
  let sundays = 0;
  let saturdays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const cur = new Date(year, month - 1, d);
    if (cur.getDay() === 0) sundays++;
    if (cur.getDay() === 6) saturdays++;
  }

  let standardDays = daysInMonth - sundays;

  // From August 2026 onwards, Na (admin) has 1.5 days off per week
  const isNa15DaysOff =
    (user.email === "maithina4040@gmail.com" || user.name === "Na") &&
    (year > 2026 || (year === 2026 && month >= 8));

  if (isNa15DaysOff) {
    standardDays = daysInMonth - sundays - saturdays * 0.5;
  }

  const dailySalary = (user.monthlySalary || 0) / (standardDays || 1);
  const dynamicHourlyRate = dailySalary / 8;
  const deduction = leaveCount * dailySalary;

  return { standardDays, dailySalary, dynamicHourlyRate, deduction };
}

export function findBestMatchingShift(
  cin: Date,
  cout: Date,
  shifts: any[]
): any | undefined {
  if (!shifts || shifts.length === 0) return undefined;
  if (shifts.length === 1) return shifts[0];

  const cinMs = cin.getTime();
  const coutMs = cout.getTime();
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  // 1. Shift whose [start - 2h, end + 2h] window encompasses [cin, cout]
  const encompassing = shifts.filter(
    (s: any) =>
      cinMs >= new Date(s.start).getTime() - TWO_HOURS_MS &&
      coutMs <= new Date(s.end).getTime() + TWO_HOURS_MS
  );

  if (encompassing.length === 1) {
    return encompassing[0];
  }

  // 2. Pick candidate with maximum overlap
  const candidates = encompassing.length > 0 ? encompassing : shifts;
  let bestShift = candidates[0];
  let maxOverlap = -1;
  let minMidpointDist = Infinity;
  const checkinMid = (cinMs + coutMs) / 2;

  for (const s of candidates) {
    const sStart = new Date(s.start).getTime();
    const sEnd = new Date(s.end).getTime();
    const overlap = Math.max(0, Math.min(coutMs, sEnd) - Math.max(cinMs, sStart));
    const shiftMid = (sStart + sEnd) / 2;
    const midpointDist = Math.abs(checkinMid - shiftMid);

    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      minMidpointDist = midpointDist;
      bestShift = s;
    } else if (overlap === maxOverlap && midpointDist < minMidpointDist) {
      minMidpointDist = midpointDist;
      bestShift = s;
    }
  }

  return bestShift;
}

export async function calculateUserMonthlyStats(
  userId: string,
  targetDate: Date = new Date(),
  prefetchedHolidays?: any[]
): Promise<UserPayrollSummary | null> {
  const vnDate = new Date(targetDate.getTime() + VN_OFFSET_MS);
  const targetYear = vnDate.getUTCFullYear();
  const targetMonth = vnDate.getUTCMonth() + 1;

  const { startDate, endDate, month, year } = getVietnamMonthRange(
    targetMonth,
    targetYear
  );

  const cacheKey = `stats:monthly:${userId}:${month}:${year}`;

  return getOrSetCache(cacheKey, 300, async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        adjustments: {
          where: { date: { gte: startDate, lte: endDate } },
          orderBy: { date: "desc" },
        },
        payslips: {
          where: { month, year },
        },
      },
    });

    if (!user) return null;

    // 1. If Payslip is already saved and CLOSED/PAID, return stored summary
    const existingPayslip = user.payslips?.[0];
    if (existingPayslip && (existingPayslip.status === "PAID" || existingPayslip.status === "CLOSED") && existingPayslip.content) {
      const content = existingPayslip.content as any;
      return {
        userId: user.id,
        totalHours: content.totalHours || 0,
        totalOvertimeHours: content.totalOvertimeHours || 0,
        leaderboardOvertimeHours: content.leaderboardOvertimeHours || 0,
        daysWorked: content.daysWorked || 0,
        checkinCount: content.checkinCount || 0,
        baseSalary: content.baseSalary || 0,
        totalAdjustments: content.totalAdjustments || 0,
        lateCount: content.lateCount || 0,
        latePenaltyHours: content.latePenaltyHours || 0,
        latePenaltyAmount: content.latePenaltyAmount || 0,
        totalSalary: content.totalSalary ?? existingPayslip.netSalary ?? 0,
        projectedSalary: content.projectedSalary || content.totalSalary || existingPayslip.netSalary || 0,
        hourlyRate: content.hourlyRate || user.hourlyRate,
        dynamicHourlyRate: content.dynamicHourlyRate || content.hourlyRate || user.hourlyRate,
        monthlySalary: content.monthlySalary || user.monthlySalary,
        employmentType: content.employmentType || user.employmentType,
        standardDays: content.standardDays || 26,
        dailySalary: content.dailySalary || 0,
        leaveCount: content.leaveCount || 0,
        deduction: content.deduction || 0,
        totalSeniorBonus: content.totalSeniorBonus || 0,
        isThuKpiSalary: content.isThuKpiSalary,
        kpiCompletionRate: content.kpiCompletionRate,
        kpiTasksTotal: content.kpiTasksTotal,
        kpiTasksApproved: content.kpiTasksApproved,
        fixedBaseSalary: content.fixedBaseSalary,
        kpiSalary: content.kpiSalary,
        adjustments: content.adjustments || user.adjustments || [],
        dailyDetails: content.dailyDetails || [],
      };
    }

    // 2. Live calculation
    const queryStartDate = new Date(startDate.getTime() - 16 * 60 * 60 * 1000);
    const queryEndDate = new Date(endDate.getTime() + 16 * 60 * 60 * 1000);

    const isThuKpiSalary =
      (user.email === "cuccung123456789@gmail.com" || user.name === "Thư") &&
      (year > 2026 || (year === 2026 && month >= 6));

    const [checkins, shifts, requests, holidays, staffTasks] = await Promise.all([
      prisma.checkIn.findMany({
        where: {
          userId,
          timestamp: { gte: queryStartDate, lte: queryEndDate },
        },
        orderBy: { timestamp: "asc" },
      }),
      prisma.workShift.findMany({
        where: {
          userId,
          start: { gte: startDate, lte: endDate },
        },
        orderBy: { start: "asc" },
      }),
      prisma.request.findMany({
        where: {
          userId,
          type: { in: ["LEAVE", "WFH", "EARLY_LEAVE"] },
          date: { gte: startDate, lte: endDate },
        },
      }),
      prefetchedHolidays !== undefined
        ? Promise.resolve(prefetchedHolidays || [])
        : prisma.holiday
            .findMany({
              where: { date: { gte: startDate, lte: endDate } },
            })
            .then((h) => h || [])
            .catch(() => []),
    isThuKpiSalary
      ? prisma.staffTask.findMany({
          where: {
            assigneeId: userId,
            OR: [
              {
                startDate: {
                  gte: new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000),
                  lte: new Date(endDate.getTime() + 7 * 24 * 60 * 60 * 1000),
                },
              },
              {
                AND: [
                  { startDate: null },
                  {
                    createdAt: {
                      gte: new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000),
                      lte: new Date(endDate.getTime() + 7 * 24 * 60 * 60 * 1000),
                    },
                  },
                ],
              },
            ],
          },
        })
      : Promise.resolve([]),
  ]);

  let completionRate = 1.0;
  let totalTasksCount = 0;
  let approvedTasksCount = 0;

  if (isThuKpiSalary) {
    const getWeekThursday = (date: Date): Date => {
      const VN_OFFSET = 7 * 60 * 60 * 1000;
      const local = new Date(date.getTime() + VN_OFFSET);
      const day = local.getUTCDay();
      const diffToThursday = day === 0 ? -3 : 4 - day;
      const thursLocal = new Date(local);
      thursLocal.setUTCDate(local.getUTCDate() + diffToThursday);
      thursLocal.setUTCHours(12, 0, 0, 0);
      return new Date(thursLocal.getTime() - VN_OFFSET);
    };

    const monthlyTasks = staffTasks.filter((t: any) => {
      const dateToUse =
        t.startDate ||
        t.createdAt ||
        new Date(startDate.getTime() + 15 * 24 * 60 * 60 * 1000);
      const thursday = getWeekThursday(dateToUse);
      return thursday >= startDate && thursday <= endDate;
    });

    totalTasksCount = monthlyTasks.length;
    const now = new Date();
    approvedTasksCount = monthlyTasks.filter((t: any) => {
      if (t.status === "APPROVED" || t.status === "DONE") return true;
      if (t.status === "REJECTED") {
        const diffHours =
          (now.getTime() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60);
        return diffHours <= 24;
      }
      return false;
    }).length;
    completionRate =
      totalTasksCount === 0 ? 1.0 : approvedTasksCount / totalTasksCount;
  }

  const holidayMap = new Map<string, number>();
  const holidayList = Array.isArray(holidays) ? holidays : [];
  holidayList.forEach((h: { date: Date; multiplier: number }) => {
    holidayMap.set(toVNDateString(h.date), h.multiplier);
  });

  const shiftsByDay: Record<string, any[]> = {};
  shifts.forEach((s: any) => {
    const key = toVNDateString(s.start);
    if (!shiftsByDay[key]) {
      shiftsByDay[key] = [];
    }
    shiftsByDay[key].push(s);
  });
  Object.values(shiftsByDay).forEach((dayShifts) => {
    dayShifts.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  });

  // Pairing algorithm for overnight shifts and timeline pairing (BUG-PAY-01)
  const sortedCheckins = [...checkins].sort(
    (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const dedupedCheckins: any[] = [];
  for (const ev of sortedCheckins) {
    const prev = dedupedCheckins[dedupedCheckins.length - 1];
    if (
      prev &&
      prev.type === ev.type &&
      Math.abs(new Date(ev.timestamp).getTime() - new Date(prev.timestamp).getTime()) < 15 * 60 * 1000
    ) {
      continue;
    }
    dedupedCheckins.push(ev);
  }

  interface CheckInPair {
    checkIn?: any;
    checkOut?: any;
    dateKey: string;
    hours: number;
    isValid: boolean;
    error?: string;
  }

  const pairs: CheckInPair[] = [];
  const consumedCheckoutIndices = new Set<number>();

  for (let i = 0; i < dedupedCheckins.length; i++) {
    const event = dedupedCheckins[i];
    if (event.type === "checkin") {
      let matchedCheckoutIndex = -1;
      for (let j = i + 1; j < dedupedCheckins.length; j++) {
        const nextEvent = dedupedCheckins[j];
        if (nextEvent.type === "checkin") {
          break;
        }
        if (nextEvent.type === "checkout" && !consumedCheckoutIndices.has(j)) {
          const diffMs = new Date(nextEvent.timestamp).getTime() - new Date(event.timestamp).getTime();
          if (diffMs > 0 && diffMs <= 16 * 60 * 60 * 1000) {
            matchedCheckoutIndex = j;
          }
          break;
        }
      }

      const dateKey = toVNDateString(event.timestamp);
      if (matchedCheckoutIndex !== -1) {
        consumedCheckoutIndices.add(matchedCheckoutIndex);
        const checkoutEvent = dedupedCheckins[matchedCheckoutIndex];
        pairs.push({
          checkIn: event,
          checkOut: checkoutEvent,
          dateKey,
          hours: (new Date(checkoutEvent.timestamp).getTime() - new Date(event.timestamp).getTime()) / (1000 * 60 * 60),
          isValid: true,
        });
      } else {
        pairs.push({
          checkIn: event,
          dateKey,
          hours: 0,
          isValid: false,
          error: "Quên Check-out",
        });
      }
    } else if (event.type === "checkout") {
      if (!consumedCheckoutIndices.has(i)) {
        const dateKey = toVNDateString(event.timestamp);
        pairs.push({
          checkOut: event,
          dateKey,
          hours: 0,
          isValid: false,
          error: "Thiếu Check-in",
        });
      }
    }
  }

  const pairsByDay: Record<string, CheckInPair[]> = {};
  pairs.forEach((p) => {
    // Only anchor pairs within target month
    const pDate = new Date(p.dateKey + "T00:00:00+07:00");
    if (pDate >= startDate && pDate <= endDate) {
      if (!pairsByDay[p.dateKey]) pairsByDay[p.dateKey] = [];
      pairsByDay[p.dateKey].push(p);
    }
  });

  const wfhDates = new Set(
    requests
      .filter((r: any) => r.type === "WFH" && r.status === "APPROVED")
      .map((r: any) => toVNDateString(r.date))
  );

  const earlyLeaveApprovedMap = new Set(
    requests
      .filter((r: any) => r.type === "EARLY_LEAVE" && r.status === "APPROVED")
      .map((r: any) => toVNDateString(r.date))
  );

  const leavesCount = requests.filter(
    (r: any) => r.type === "LEAVE" && r.status === "APPROVED"
  ).length;

  // Rate calculation with Na 1.5 days off rule
  const { standardDays, dailySalary, dynamicHourlyRate, deduction } =
    calculateFullTimeMetrics(user, year, month, leavesCount);

  const allDates = new Set([...Object.keys(pairsByDay), ...Array.from(wfhDates)]);
  const dailyDetails: DailyDetail[] = [];
  let totalHours = 0;
  let totalOvertimeHours = 0;
  let leaderboardOvertimeHours = 0;

  for (const date of allDates) {
    const dailyPairs = pairsByDay[date] || [];
    const dayShifts = shiftsByDay[date] || [];
    const multiplier = holidayMap.get(date) || 1;

    let dayHours = 0;
    let firstCheckIn: Date | null = null;
    let lastCheckOut: Date | null = null;
    let isLate = false;
    let isValid = dailyPairs.length > 0;
    let errorMsg = "";

    for (const p of dailyPairs) {
      if (p.checkIn && !firstCheckIn) {
        firstCheckIn = new Date(p.checkIn.timestamp);
      }
      if (p.checkOut) {
        lastCheckOut = new Date(p.checkOut.timestamp);
      }

      if (!p.isValid) {
        isValid = false;
        errorMsg = p.error || "Lỗi chấm công";
      } else if (p.checkIn && p.checkOut) {
        let startMs = new Date(p.checkIn.timestamp).getTime();
        let endMs = new Date(p.checkOut.timestamp).getTime();

        const matchedShift = findBestMatchingShift(
          new Date(p.checkIn.timestamp),
          new Date(p.checkOut.timestamp),
          dayShifts
        );

        if (matchedShift) {
          const shiftStartMs = new Date(matchedShift.start).getTime();
          const shiftEndMs = new Date(matchedShift.end).getTime();
          if (startMs < shiftStartMs) startMs = shiftStartMs;
          if (endMs < shiftEndMs && earlyLeaveApprovedMap.has(date)) {
            endMs = shiftEndMs;
          }
        }

        const diffMs = Math.max(0, endMs - startMs);
        dayHours += diffMs / (1000 * 60 * 60);
      }
    }

    if (wfhDates.has(date)) {
      if (dayHours === 0) {
        dayHours = 8;
        isValid = true;
        errorMsg = "Làm việc từ xa (WFH)";
      }
    }

    if (dayShifts.length > 0 && firstCheckIn) {
      const firstShift =
        findBestMatchingShift(firstCheckIn, lastCheckOut || firstCheckIn, dayShifts) ||
        dayShifts[0];
      if (checkIsLate(firstCheckIn, firstShift.start)) {
        isLate = true;
      }
    }

    let scheduledHours = user.employmentType === "FULL_TIME" ? 8 : 0;
    let canEarnOT = user.employmentType === "FULL_TIME" || dayShifts.length > 0;
    if (dayShifts.length > 0) {
      scheduledHours = dayShifts.reduce(
        (acc: number, s: any) =>
          acc + (new Date(s.end).getTime() - new Date(s.start).getTime()) / (1000 * 60 * 60),
        0
      );
    }

    if (dayHours > 0) {
      totalHours += dayHours;
      if (canEarnOT && dayHours > scheduledHours) {
        totalOvertimeHours += dayHours - scheduledHours;
      }

      if (year > 2026 || (year === 2026 && month >= 8)) {
        if (user.employmentType === "PART_TIME") {
          if (dayHours > 5) leaderboardOvertimeHours += dayHours - 5;
        } else {
          if (dayHours > 8) leaderboardOvertimeHours += dayHours - 8;
        }
      } else {
        if (canEarnOT && dayHours > scheduledHours) {
          leaderboardOvertimeHours += dayHours - scheduledHours;
        }
      }
    }

    const isSenior = dayShifts.some((s: any) => s.isSenior);
    const seniorRateBonus = isSenior ? 3000 : 0;
    const effectiveRate = dynamicHourlyRate + seniorRateBonus;
    const effectiveHours =
      user.employmentType === "FULL_TIME" ? Math.min(dayHours, 8) : dayHours;
    const dailySalaryCalc = effectiveHours * effectiveRate * multiplier;
    const seniorBonusCalc = effectiveHours * seniorRateBonus * multiplier;

    const shiftDisplay =
      dayShifts.length > 0
        ? dayShifts
            .map((s: any) => {
              const startStr = new Date(s.start).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Ho_Chi_Minh",
              });
              const endStr = new Date(s.end).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Ho_Chi_Minh",
              });
              return `${startStr} - ${endStr}`;
            })
            .join(", ")
        : "Ngoài lịch";

    dailyDetails.push({
      date,
      checkIn: firstCheckIn,
      checkOut: lastCheckOut,
      hours: dayHours,
      salary: dailySalaryCalc,
      isLate,
      multiplier,
      isValid: isValid && dayHours > 0,
      shift: shiftDisplay,
      error: errorMsg || undefined,
      isSenior,
      seniorBonus: seniorBonusCalc,
    });
  }

  dailyDetails.sort((a, b) => b.date.localeCompare(a.date));

  let baseSalary = dailyDetails.reduce((sum, d) => sum + d.salary, 0);
  const totalSeniorBonus = dailyDetails.reduce((sum, d) => sum + (d.seniorBonus || 0), 0);
  const totalAdjustments = user.adjustments.reduce((sum: number, a: any) => sum + a.amount, 0);

  const lateCount = dailyDetails.filter((d) => d.isLate).length;
  let latePenaltyHours = calculateLatePenalty(lateCount);
  let latePenaltyAmount = latePenaltyHours * dynamicHourlyRate;

  let totalSalary = Math.max(0, baseSalary + totalAdjustments - latePenaltyAmount);

  // Projected salary based on remaining days of month (BUG-PAY-05)
  const todayVN = new Date(Date.now() + VN_OFFSET_MS);
  const currentYear = todayVN.getUTCFullYear();
  const currentMonth = todayVN.getUTCMonth() + 1;
  const currentDay = todayVN.getUTCDate();

  let projectedSalary = totalSalary;
  if (user.employmentType === "FULL_TIME") {
    projectedSalary =
      (user.monthlySalary || 0) +
      totalSeniorBonus +
      totalAdjustments -
      latePenaltyAmount;
  } else if (year < currentYear || (year === currentYear && month < currentMonth)) {
    projectedSalary = totalSalary;
  } else {
    const daysInMonth = new Date(year, month, 0).getDate();
    const progress = Math.max(1, currentDay) / daysInMonth;
    projectedSalary = progress > 0 ? Math.round(totalSalary / progress) : totalSalary;
  }

  let finalBaseSalary = baseSalary;
  let finalDeduction = deduction;
  let finalTotalSalary = totalSalary;
  let finalProjectedSalary = projectedSalary;
  let finalEmploymentType = user.employmentType;
  let finalMonthlySalary = user.monthlySalary;

  if (isThuKpiSalary) {
    finalBaseSalary = 3000000 + completionRate * 3000000 + totalSeniorBonus;
    finalDeduction = 3000000 - completionRate * 3000000;
    finalTotalSalary = finalBaseSalary + totalAdjustments;
    finalProjectedSalary = finalTotalSalary;
    finalEmploymentType = "FULL_TIME";
    finalMonthlySalary = 6000000;
    latePenaltyHours = 0;
    latePenaltyAmount = 0;
  }

  return {
    userId: user.id,
    totalHours: Math.round(totalHours * 10) / 10,
    totalOvertimeHours: Math.round(totalOvertimeHours * 10) / 10,
    leaderboardOvertimeHours: Math.round(leaderboardOvertimeHours * 10) / 10,
    daysWorked: dailyDetails.filter((d) => d.hours > 0).length,
    checkinCount: checkins.length,
    baseSalary: Math.round(finalBaseSalary),
    totalAdjustments,
    lateCount,
    latePenaltyHours,
    latePenaltyAmount: Math.round(latePenaltyAmount),
    totalSalary: Math.round(finalTotalSalary),
    projectedSalary: Math.round(finalProjectedSalary),
    hourlyRate: user.hourlyRate,
    dynamicHourlyRate,
    monthlySalary: finalMonthlySalary,
    employmentType: finalEmploymentType,
    standardDays,
    dailySalary: Math.round(dailySalary),
    leaveCount: leavesCount,
    deduction: Math.round(finalDeduction),
    totalSeniorBonus: Math.round(totalSeniorBonus),
    isThuKpiSalary: isThuKpiSalary || undefined,
    kpiCompletionRate: isThuKpiSalary ? completionRate : undefined,
    kpiTasksTotal: isThuKpiSalary ? totalTasksCount : undefined,
    kpiTasksApproved: isThuKpiSalary ? approvedTasksCount : undefined,
    fixedBaseSalary: isThuKpiSalary ? 3000000 : undefined,
    kpiSalary: isThuKpiSalary ? Math.round(3000000 * completionRate) : undefined,
    adjustments: user.adjustments,
    dailyDetails,
  };
  });
}

export async function calculateMonthlyPayrollSummary(
  targetDate: Date = new Date()
): Promise<{
  totalPayroll: number;
  totalProjected: number;
  details: Array<{
    userId: string;
    userName: string;
    role?: string;
    employmentType?: string;
    actualHours: number;
    totalSalary: number;
    overtimeHours: number;
    leaderboardOvertimeHours?: number;
    totalOvertimeHours?: number;
    daysWorked?: number;
  }>;
}> {
  const vnDate = new Date(targetDate.getTime() + VN_OFFSET_MS);
  const targetYear = vnDate.getUTCFullYear();
  const targetMonth = vnDate.getUTCMonth() + 1;

  const { startDate, endDate, month, year } = getVietnamMonthRange(
    targetMonth,
    targetYear
  );

  const [users, holidays] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { isActive: true },
          { shifts: { some: { start: { gte: startDate, lte: endDate } } } },
          { checkins: { some: { timestamp: { gte: startDate, lte: endDate } } } },
          { adjustments: { some: { date: { gte: startDate, lte: endDate } } } },
        ],
      },
      select: { id: true, name: true, role: true, employmentType: true },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
    }),
  ]);

  const useNewOTRule = year > 2026 || (year === 2026 && month >= 8);

  const BATCH_SIZE = 5;
  const userSummaries: Array<{
    id: string;
    name: string;
    role: string;
    employmentType: string;
    totalHours: number;
    totalSalary: number;
    projectedSalary: number;
    actualHours: number;
    overtimeHours: number;
    leaderboardOvertimeHours: number;
    totalOvertimeHours: number;
    daysWorked: number;
  }> = [];

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const chunk = users.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (user) => {
        const stats = await calculateUserMonthlyStats(user.id, targetDate, holidays);
        if (!stats) return null;

        const actualHours = stats.totalHours || 0;
        const otHours = useNewOTRule
          ? (stats.leaderboardOvertimeHours || 0)
          : (stats.totalOvertimeHours || 0);

        return {
          id: user.id,
          name: user.name || "Nhân viên",
          role: user.role,
          employmentType: stats.employmentType || user.employmentType,
          totalHours: actualHours,
          totalSalary: stats.totalSalary,
          projectedSalary: stats.projectedSalary,
          actualHours,
          overtimeHours: otHours,
          leaderboardOvertimeHours: stats.leaderboardOvertimeHours || 0,
          totalOvertimeHours: stats.totalOvertimeHours || 0,
          daysWorked: stats.daysWorked || 0,
        };
      })
    );

    for (const res of chunkResults) {
      if (res) userSummaries.push(res);
    }
  }

  // Apply Top 1 Hardworking Bonus (+200k) from @checkin/shared (BUG-PAY-04)
  const withBonus = applyHardworkingBonus(userSummaries, month, year, false);

  let totalPayroll = 0;
  let totalProjected = 0;
  const details = [];

  for (const item of withBonus) {
    totalPayroll += item.totalSalary || 0;
    totalProjected += item.projectedSalary || 0;
    details.push({
      userId: item.id,
      userName: item.name,
      role: item.role,
      employmentType: item.employmentType,
      actualHours: item.actualHours,
      totalSalary: item.totalSalary || 0,
      overtimeHours: item.overtimeHours,
      leaderboardOvertimeHours: item.leaderboardOvertimeHours || 0,
      totalOvertimeHours: item.totalOvertimeHours || 0,
      daysWorked: item.daysWorked || 0,
    });
  }

  return {
    totalPayroll,
    totalProjected,
    details,
  };
}
