import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getVietnamMonthRange } from "../lib/date-utils";
import { isShiftLocked } from "../lib/schedule-lock";
import { assertPeriodOpen } from "../lib/payroll-period";

export const scheduleRoute = new Hono<AppEnv>();

// GET /api/schedule
scheduleRoute.get("/", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const currentUserId = tokenPayload.sub;
    const isAdmin = tokenPayload.role === "ADMIN";

    const startQuery = c.req.query("start");
    const endQuery = c.req.query("end");
    const monthQuery = c.req.query("month");
    const yearQuery = c.req.query("year");
    const requestedUserId = c.req.query("userId");

    let startDate: Date;
    let endDate: Date;

    if (startQuery && endQuery) {
      startDate = new Date(startQuery);
      endDate = new Date(endQuery);
    } else if (monthQuery || yearQuery) {
      const month = monthQuery ? parseInt(monthQuery, 10) : undefined;
      const year = yearQuery ? parseInt(yearQuery, 10) : undefined;
      const range = getVietnamMonthRange(month, year);
      startDate = range.startDate;
      endDate = range.endDate;
    } else {
      const range = getVietnamMonthRange();
      startDate = range.startDate;
      endDate = range.endDate;
    }

    const targetUserId = isAdmin ? (requestedUserId || undefined) : currentUserId;
    const where: any = {
      start: { gte: startDate, lte: endDate },
    };
    if (targetUserId) {
      where.userId = targetUserId;
    }

    const shifts = await prisma.workShift.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            employmentType: true,
          },
        },
        duties: {
          select: {
            id: true,
            title: true,
            description: true,
            isCompleted: true,
            date: true,
          },
        },
      },
      orderBy: { start: "asc" },
    });

    return c.json({
      success: true,
      data: shifts,
      range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch schedule" },
      500
    );
  }
});

// GET /api/schedule/my-shifts
scheduleRoute.get("/my-shifts", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const startQuery = c.req.query("start");
    const endQuery = c.req.query("end");
    const monthQuery = c.req.query("month");
    const yearQuery = c.req.query("year");

    let startDate: Date;
    let endDate: Date;

    if (startQuery && endQuery) {
      startDate = new Date(startQuery);
      endDate = new Date(endQuery);
    } else if (monthQuery || yearQuery) {
      const month = monthQuery ? parseInt(monthQuery, 10) : undefined;
      const year = yearQuery ? parseInt(yearQuery, 10) : undefined;
      const range = getVietnamMonthRange(month, year);
      startDate = range.startDate;
      endDate = range.endDate;
    } else {
      const range = getVietnamMonthRange();
      startDate = range.startDate;
      endDate = range.endDate;
    }

    const shifts = await prisma.workShift.findMany({
      where: {
        userId,
        start: { gte: startDate, lte: endDate },
      },
      include: {
        duties: {
          select: {
            id: true,
            title: true,
            description: true,
            isCompleted: true,
            date: true,
          },
        },
      },
      orderBy: { start: "asc" },
    });

    return c.json({
      success: true,
      data: shifts,
      range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch user shifts" },
      500
    );
  }
});

// POST /api/schedule/:id/swap
scheduleRoute.post("/:id/swap", authMiddleware, async (c) => {
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

// POST /api/schedule/:id/take
scheduleRoute.post("/:id/take", authMiddleware, async (c) => {
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

    const updated = await prisma.workShift.update({
      where: { id: shiftId },
      data: {
        userId,
        isOpenForSwap: false,
      },
      include: {
        user: { select: { id: true, name: true, image: true, email: true } },
      },
    });

    return c.json({
      success: true,
      message: "Nhận ca thành công!",
      data: updated,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Lỗi khi nhận ca làm" }, 500);
  }
});

// GET /api/schedule/:id/duties
scheduleRoute.get("/:id/duties", authMiddleware, async (c) => {
  try {
    const shiftId = parseInt(c.req.param("id") || "", 10);
    if (isNaN(shiftId)) return c.json({ success: false, error: "Invalid shift id" }, 400);
    const duties = await prisma.shiftDuty.findMany({
      where: { shiftId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    });
    return c.json({ success: true, data: duties });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to fetch duties" }, 500);
  }
});
