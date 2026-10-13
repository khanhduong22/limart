import { prisma } from "@checkin/db";
import { getVietnamMonthRange, getVietnamDayRange } from "./date-utils";
import { getOrSetCache } from "./cache";

export interface SpecialEvent {
  id: string;
  userId?: string;
  type: "BIRTHDAY" | "ANNIVERSARY" | "HOLIDAY";
  date: number;
  month: number;
  name: string;
  title: string;
  image?: string | null;
  details?: string;
  isToday: boolean;
}

export async function getSpecialDays(
  targetDate: Date = new Date(),
  monthInput?: number,
  yearInput?: number
): Promise<SpecialEvent[]> {
  const { startDate, endDate, month: currentMonthNum, year: currentYear } = getVietnamMonthRange(
    monthInput,
    yearInput
  );
  const currentMonthIdx = currentMonthNum - 1;
  const { dateStr } = getVietnamDayRange(targetDate);
  const currentDay = parseInt(dateStr.split("-")[2], 10);

  const cacheKey = `meta:special-days:${currentYear}:${currentMonthNum}:${currentDay}`;

  return await getOrSetCache(cacheKey, 1800, async () => {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ birthday: { not: null } }, { startDate: { not: null } }],
      },
      select: {
        id: true,
        name: true,
        image: true,
        birthday: true,
        startDate: true,
      },
    });

    const holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const specialEvents: SpecialEvent[] = [];

    for (const user of users) {
      if (user.birthday) {
        const b = new Date(user.birthday);
        if (b.getMonth() === currentMonthIdx) {
          specialEvents.push({
            id: `${user.id}-birthday`,
            userId: user.id,
            type: "BIRTHDAY",
            date: b.getDate(),
            month: currentMonthNum,
            name: user.name || "Unknown",
            title: "Sinh nhật",
            image: user.image,
            isToday: b.getDate() === currentDay,
          });
        }
      }

      if (user.startDate) {
        const s = new Date(user.startDate);
        if (s.getMonth() === currentMonthIdx && currentYear > s.getFullYear()) {
          const yearsWorked = currentYear - s.getFullYear();
          specialEvents.push({
            id: `${user.id}-anniversary`,
            userId: user.id,
            type: "ANNIVERSARY",
            date: s.getDate(),
            month: currentMonthNum,
            name: user.name || "Unknown",
            title: "Kỷ niệm công việc",
            image: user.image,
            details: `${yearsWorked} năm`,
            isToday: s.getDate() === currentDay,
          });
        }
      }
    }

    for (const h of holidays) {
      const hDate = new Date(h.date);
      specialEvents.push({
        id: `holiday-${h.id}`,
        type: "HOLIDAY",
        date: hDate.getDate(),
        month: currentMonthNum,
        name: h.name,
        title: h.name,
        image: null,
        isToday: hDate.getDate() === currentDay,
      });
    }

    return specialEvents.sort((a, b) => a.date - b.date);
  });
}
