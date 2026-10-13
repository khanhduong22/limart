import { prisma } from "@checkin/db";
import { invalidateCachePattern } from "./cache";

export interface AutoScheduleResult {
  success: boolean;
  userFound: boolean;
  userName?: string;
  createdCount: number;
  skippedCount: number;
  details: string[];
}

/**
 * Tự động xếp lịch làm việc cho Admin Na mỗi tuần từ Thứ 2 đến Thứ 7, khung giờ 09:30 - 17:30 (GMT+7).
 *
 * @param weeksAhead Số tuần trong tương lai cần đảm bảo có lịch (mặc định 12 tuần ~ 3 tháng)
 */
export async function autoScheduleAdminNa(weeksAhead: number = 12): Promise<AutoScheduleResult> {
  // 1. Tìm thông tin Admin Na trong hệ thống
  const na = await prisma.user.findFirst({
    where: {
      OR: [
        { id: "cml1w1a1i0008r078wksmtrks" },
        { email: "maithina4040@gmail.com" },
        { name: "Na", role: "ADMIN" },
      ],
    },
  });

  if (!na) {
    return {
      success: false,
      userFound: false,
      createdCount: 0,
      skippedCount: 0,
      details: ["Không tìm thấy tài khoản Admin Na trong hệ thống."],
    };
  }

  // 2. Xác định ngày đầu tuần hiện tại theo giờ Việt Nam (GMT+7)
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const curYear = vnTime.getUTCFullYear();
  const curMonth = vnTime.getUTCMonth();
  const curDate = vnTime.getUTCDate();
  const curDayOfWeek = vnTime.getUTCDay(); // 0: CN, 1: T2, ..., 6: T7

  // Tìm Thứ 2 của tuần hiện tại
  const diffToMonday = curDayOfWeek === 0 ? -6 : 1 - curDayOfWeek;
  const mondayDate = new Date(Date.UTC(curYear, curMonth, curDate + diffToMonday));

  let createdCount = 0;
  let skippedCount = 0;
  const details: string[] = [];

  // Tổng số ngày kiểm tra (bao gồm tuần hiện tại và các tuần tiếp theo)
  const totalDays = (weeksAhead + 1) * 7;
  const rangeStart = new Date(mondayDate.getTime());
  const rangeEnd = new Date(mondayDate.getTime() + totalDays * 24 * 60 * 60 * 1000);

  // Lấy các ca làm hiện có của Na trong khoảng thời gian này để tránh trùng lặp
  const existingShifts = await prisma.workShift.findMany({
    where: {
      userId: na.id,
      start: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
    select: {
      id: true,
      start: true,
    },
  });

  // Lưu các ngày đã có ca làm theo định dạng YYYY-MM-DD (GMT+7)
  const existingDayStrings = new Set<string>();
  for (const s of existingShifts) {
    const sVN = new Date(s.start.getTime() + 7 * 60 * 60 * 1000);
    const dayStr = sVN.toISOString().slice(0, 10);
    existingDayStrings.add(dayStr);
  }

  const shiftsToCreate: { userId: string; start: Date; end: Date; status: string; shiftType: string }[] = [];

  for (let i = 0; i < totalDays; i++) {
    const checkDay = new Date(mondayDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dayOfWeek = checkDay.getUTCDay(); // 0: CN, 1: T2, ..., 6: T7

    // Chỉ xếp lịch từ Thứ 2 (1) đến Thứ 7 (6)
    if (dayOfWeek >= 1 && dayOfWeek <= 6) {
      const dayStr = checkDay.toISOString().slice(0, 10); // YYYY-MM-DD

      if (existingDayStrings.has(dayStr)) {
        skippedCount++;
      } else {
        // Giờ làm: 09:30 - 17:30 (GMT+7) => 02:30 - 10:30 (UTC)
        const start = new Date(`${dayStr}T02:30:00.000Z`);
        const end = new Date(`${dayStr}T10:30:00.000Z`);

        shiftsToCreate.push({
          userId: na.id,
          start,
          end,
          status: "APPROVED",
          shiftType: "FULL",
        });
        existingDayStrings.add(dayStr);
        createdCount++;
        details.push(`${dayStr} (T${dayOfWeek + 1}): 09:30 - 17:30`);
      }
    }
  }

  if (shiftsToCreate.length > 0) {
    await prisma.workShift.createMany({
      data: shiftsToCreate,
    });
    try {
      await invalidateCachePattern("stats:*");
      await invalidateCachePattern("payroll:*");
      await invalidateCachePattern("shift*");
      await invalidateCachePattern("admin:schedule:*");
    } catch (e) {
      console.error("Failed to invalidate cache after auto schedule:", e);
    }
  }

  return {
    success: true,
    userFound: true,
    userName: na.name || "Na",
    createdCount,
    skippedCount,
    details,
  };
}

let lastAutoScheduleRun = 0;

/**
 * Kiểm tra và tự động xếp lịch với cơ chế cache 10 phút,
 * đảm bảo không làm chậm tốc độ load trang lịch.
 */
export async function ensureAdminNaSchedule(weeksAhead: number = 8): Promise<void> {
  const now = Date.now();
  if (now - lastAutoScheduleRun < 10 * 60 * 1000) {
    return;
  }
  lastAutoScheduleRun = now;
  try {
    await autoScheduleAdminNa(weeksAhead);
  } catch (error) {
    console.error("[AutoSchedule] Lỗi khi tự động xếp lịch cho Admin Na:", error);
  }
}
