import { Hono } from "hono";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { prisma } from "@checkin/db";
import { getOrSetCache, invalidateCachePattern } from "../lib/cache";
import { VN_OFFSET_MS } from "../lib/date-utils";

export const staffTasksRoute = new Hono<AppEnv>();

function getWeekThursday(date: Date): Date {
  const local = new Date(date.getTime() + VN_OFFSET_MS);
  const day = local.getUTCDay();
  const diffToThursday = day === 0 ? -3 : 4 - day;
  const thursLocal = new Date(local);
  thursLocal.setUTCDate(local.getUTCDate() + diffToThursday);
  thursLocal.setUTCHours(12, 0, 0, 0);
  return new Date(thursLocal.getTime() - VN_OFFSET_MS);
}

function computeStaffTaskStats(tasks: any[], now: Date = new Date()) {
  const total = tasks.length;
  const doing = tasks.filter((t) => t.status === "DOING").length;
  const pendingReview = tasks.filter((t) => t.status === "DONE").length;
  const todo = tasks.filter((t) => t.status === "TODO").length;
  const rejected = tasks.filter((t) => t.status === "REJECTED").length;

  const kpiAchieved = tasks.filter(
    (t) =>
      t.status === "APPROVED" ||
      t.status === "DONE" ||
      (t.status === "REJECTED" &&
        now.getTime() - new Date(t.updatedAt).getTime() <= 24 * 60 * 60 * 1000)
  ).length;

  const overdue = tasks.filter((t) => {
    if (t.status === "APPROVED" || t.status === "DONE") return false;
    if (t.status === "REJECTED") {
      const diffHours =
        (now.getTime() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60);
      if (diffHours <= 24) return false;
    }
    return t.deadline && new Date(t.deadline).getTime() < now.getTime();
  }).length;

  const completionRate = total === 0 ? 1.0 : kpiAchieved / total;

  return {
    total,
    approved: kpiAchieved,
    doing,
    pendingReview,
    todo,
    rejected,
    overdue,
    completionRate,
  };
}

/**
 * GET /api/staff-tasks
 * Query params: userId (optional)
 * Returns { tasks, users } where users are active users with staffTasksAllowed: true
 */
staffTasksRoute.get("/", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const role = tokenPayload.role;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, staffTasksAllowed: true },
    });

    if (!user) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    const isAdmin = role === "ADMIN" || user.role === "ADMIN";
    if (!isAdmin && !user.staffTasksAllowed) {
      return c.json(
        {
          success: false,
          error: "Bạn không có quyền truy cập Công việc và KPI",
          allowed: false,
        },
        403
      );
    }

    const requestedUserId = c.req.query("userId");
    const targetUserId = isAdmin ? requestedUserId : userId;

    const cacheKey = `tasks:staff-tasks:${targetUserId || "all"}`;
    const payload = await getOrSetCache(cacheKey, 60, async () => {
      const whereClause: any = {};
      if (targetUserId) {
        whereClause.assigneeId = targetUserId;
      }

      const tasks = await prisma.staffTask.findMany({
        where: whereClause,
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              staffTasksAllowed: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      let users: any[] = [];
      if (isAdmin) {
        users = await prisma.user.findMany({
          where: {
            isActive: true,
            staffTasksAllowed: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            staffTasksAllowed: true,
          },
          orderBy: { name: "asc" },
        });
      }

      return { tasks, users };
    });

    return c.json({
      success: true,
      allowed: true,
      data: payload,
      tasks: payload.tasks,
      users: payload.users,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch staff tasks" },
      500
    );
  }
});

/**
 * GET /api/staff-tasks/stats
 * Query params: userId, userIds (comma-separated)
 */
staffTasksRoute.get("/stats", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const role = tokenPayload.role;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, staffTasksAllowed: true },
    });

    if (!user) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    const isAdmin = role === "ADMIN" || user.role === "ADMIN";
    if (!isAdmin && !user.staffTasksAllowed) {
      return c.json(
        { success: false, error: "Bạn không có quyền truy cập Công việc và KPI" },
        403
      );
    }

    let targetUserIds: string[] = [];
    const queryUserId = c.req.query("userId");
    const queryUserIds = c.req.query("userIds");

    if (!isAdmin) {
      targetUserIds = [userId];
    } else if (queryUserId) {
      targetUserIds = [queryUserId];
    } else if (queryUserIds) {
      targetUserIds = queryUserIds.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      const allowedUsers = await prisma.user.findMany({
        where: { isActive: true, staffTasksAllowed: true },
        select: { id: true },
      });
      targetUserIds = allowedUsers.map((u) => u.id);
    }

    if (targetUserIds.length === 0) {
      return c.json({ success: true, data: {}, stats: {} });
    }

    const cacheKey = `staff-tasks:stats:${isAdmin ? "admin" : "staff"}:${[...targetUserIds].sort().join(",")}`;

    const statsMap = await getOrSetCache<Record<string, { monthly: any; weekly: any }>>(
      cacheKey,
      60,
      async () => {
        const now = new Date();
        const vnNow = new Date(now.getTime() + VN_OFFSET_MS);

        // Monthly boundaries
        const vnYear = vnNow.getUTCFullYear();
        const vnMonth = vnNow.getUTCMonth();
        const monthStart = new Date(Date.UTC(vnYear, vnMonth, 1) - VN_OFFSET_MS);
        const monthEnd = new Date(Date.UTC(vnYear, vnMonth + 1, 0, 23, 59, 59, 999) - VN_OFFSET_MS);

        // Weekly boundaries (Mon-Sun VN time)
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

        const extendedStartDate = new Date(monthStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        const extendedEndDate = new Date(monthEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

        const tasksRaw = await prisma.staffTask.findMany({
          where: {
            assigneeId: { in: targetUserIds },
            OR: [
              { startDate: { gte: extendedStartDate, lte: extendedEndDate } },
              {
                AND: [
                  { startDate: null },
                  { createdAt: { gte: extendedStartDate, lte: extendedEndDate } },
                ],
              },
            ],
          },
        });

        const calculatedStatsMap: Record<string, { monthly: any; weekly: any }> = {};

        for (const uid of targetUserIds) {
          const userTasks = tasksRaw.filter((t) => t.assigneeId === uid);

          const monthlyTasks = userTasks.filter((t) => {
            const dateToUse =
              t.startDate ||
              t.createdAt ||
              new Date(monthStart.getTime() + 15 * 24 * 60 * 60 * 1000);
            const inMonth = dateToUse >= monthStart && dateToUse <= monthEnd;
            const thursday = getWeekThursday(dateToUse);
            const thursdayInMonth = thursday >= monthStart && thursday <= monthEnd;
            return inMonth || thursdayInMonth;
          });

          const weeklyTasks = userTasks.filter((t) => {
            const dateToUse = t.startDate || t.createdAt;
            return dateToUse >= weekStart && dateToUse <= weekEnd;
          });

          calculatedStatsMap[uid] = {
            monthly: computeStaffTaskStats(monthlyTasks, now),
            weekly: computeStaffTaskStats(weeklyTasks, now),
          };
        }

        return calculatedStatsMap;
      }
    );

    if (queryUserId && statsMap[queryUserId]) {
      return c.json({
        success: true,
        data: statsMap[queryUserId],
        stats: statsMap,
        monthly: statsMap[queryUserId].monthly,
        weekly: statsMap[queryUserId].weekly,
      });
    }

    return c.json({
      success: true,
      data: statsMap,
      stats: statsMap,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch staff task stats" },
      500
    );
  }
});

/**
 * POST /api/staff-tasks
 * Admin creates a new staff task
 */
staffTasksRoute.post("/", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const role = tokenPayload.role;
    if (role !== "ADMIN") {
      return c.json({ success: false, error: "Unauthorized: Admin role required" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    if (!body.title || !body.title.trim()) {
      return c.json({ success: false, error: "Tiêu đề không được để trống" }, 400);
    }
    if (!body.assigneeId) {
      return c.json({ success: false, error: "Vui lòng chọn nhân viên" }, 400);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: body.assigneeId },
      select: { id: true, name: true, email: true, staffTasksAllowed: true },
    });

    if (!targetUser?.staffTasksAllowed) {
      return c.json(
        {
          success: false,
          error: `Nhân viên ${targetUser?.name || targetUser?.email || ""} chưa được bật cấp quyền KPI!`,
        },
        400
      );
    }

    const task = await prisma.staffTask.create({
      data: {
        title: body.title.trim(),
        description: body.description?.trim() || null,
        status: body.status || "TODO",
        assigneeId: body.assigneeId,
        createdById: tokenPayload.sub,
        startDate: body.startDate ? new Date(body.startDate) : null,
        deadline: body.deadline ? new Date(body.deadline) : null,
        adminNote: body.adminNote?.trim() || null,
        evidenceLink: body.evidenceLink?.trim() || null,
        evidenceNote: body.evidenceNote?.trim() || null,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            staffTasksAllowed: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("staff-tasks:stats:*");
    await invalidateCachePattern("tasks:staff-tasks:*");

    return c.json({ success: true, data: task, task }, 201);
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to create staff task" },
      500
    );
  }
});

async function handleUpdateTask(c: any) {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const role = tokenPayload.role;
    const taskId = c.req.param("id");

    if (!taskId) {
      return c.json({ success: false, error: "Thiếu mã công việc" }, 400);
    }

    const task = await prisma.staffTask.findUnique({
      where: { id: taskId },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            staffTasksAllowed: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!task) {
      return c.json({ success: false, error: "Không tìm thấy công việc" }, 404);
    }

    const isAdmin = role === "ADMIN";
    const body = await c.req.json().catch(() => ({}));

    if (!isAdmin) {
      if (task.assigneeId !== userId) {
        return c.json(
          { success: false, error: "Bạn không có quyền chỉnh sửa công việc này" },
          403
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { staffTasksAllowed: true },
      });
      if (!user?.staffTasksAllowed) {
        return c.json(
          { success: false, error: "Bạn không có quyền truy cập Công việc và KPI" },
          403
        );
      }

      const newStatus = body.status;
      if (newStatus && !["TODO", "DOING", "DONE"].includes(newStatus)) {
        return c.json(
          { success: false, error: "Trạng thái không hợp lệ cho nhân viên" },
          400
        );
      }

      const updateData: any = {};
      if (newStatus) updateData.status = newStatus;
      if (body.evidenceLink !== undefined) {
        updateData.evidenceLink = body.evidenceLink ? String(body.evidenceLink).trim() : null;
      }
      if (body.evidenceNote !== undefined) {
        updateData.evidenceNote = body.evidenceNote ? String(body.evidenceNote).trim() : null;
      }
      if (newStatus === "DONE") {
        updateData.submittedAt = new Date();
      }

      const updated = await prisma.staffTask.update({
        where: { id: taskId },
        data: updateData,
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              staffTasksAllowed: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await invalidateCachePattern("payroll:*");
      await invalidateCachePattern("stats:*");
      await invalidateCachePattern("staff-tasks:stats:*");
      await invalidateCachePattern("tasks:staff-tasks:*");

      return c.json({ success: true, data: updated, task: updated });
    }

    // Admin updates
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = String(body.title).trim();
    if (body.description !== undefined) {
      updateData.description = body.description ? String(body.description).trim() : null;
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.assigneeId !== undefined) {
      const targetUser = await prisma.user.findUnique({
        where: { id: body.assigneeId },
        select: { staffTasksAllowed: true },
      });
      if (!targetUser?.staffTasksAllowed) {
        return c.json(
          { success: false, error: "Nhân viên chưa được cấp quyền KPI" },
          400
        );
      }
      updateData.assigneeId = body.assigneeId;
    }
    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if (body.deadline !== undefined) {
      updateData.deadline = body.deadline ? new Date(body.deadline) : null;
    }
    if (body.adminNote !== undefined) {
      updateData.adminNote = body.adminNote ? String(body.adminNote).trim() : null;
    }
    if (body.evidenceLink !== undefined) {
      updateData.evidenceLink = body.evidenceLink ? String(body.evidenceLink).trim() : null;
    }
    if (body.evidenceNote !== undefined) {
      updateData.evidenceNote = body.evidenceNote ? String(body.evidenceNote).trim() : null;
    }
    if (body.status === "APPROVED") {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.staffTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            staffTasksAllowed: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("staff-tasks:stats:*");
    await invalidateCachePattern("tasks:staff-tasks:*");

    return c.json({ success: true, data: updated, task: updated });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update staff task" },
      500
    );
  }
}

/**
 * PATCH /api/staff-tasks/:id
 * PUT /api/staff-tasks/:id
 * Admin or Assignee updates task
 */
staffTasksRoute.patch("/:id", authMiddleware, handleUpdateTask);
staffTasksRoute.put("/:id", authMiddleware, handleUpdateTask);

/**
 * PATCH /api/staff-tasks/:id/status
 * Dedicated status update endpoint (Staff or Admin)
 */
staffTasksRoute.patch("/:id/status", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;
    const role = tokenPayload.role;
    const taskId = c.req.param("id");

    if (!taskId) {
      return c.json({ success: false, error: "Thiếu mã công việc" }, 400);
    }

    const task = await prisma.staffTask.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, staffTasksAllowed: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return c.json({ success: false, error: "Không tìm thấy công việc" }, 404);
    }

    const isAdmin = role === "ADMIN";
    const body = await c.req.json().catch(() => ({}));
    const newStatus = body.status;

    if (!newStatus) {
      return c.json({ success: false, error: "Thiếu trạng thái cập nhật" }, 400);
    }

    if (!isAdmin) {
      if (task.assigneeId !== userId) {
        return c.json({ success: false, error: "Bạn không có quyền chỉnh sửa công việc này" }, 403);
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { staffTasksAllowed: true },
      });
      if (!user?.staffTasksAllowed) {
        return c.json({ success: false, error: "Bạn không có quyền truy cập Công việc và KPI" }, 403);
      }
      if (!["TODO", "DOING", "DONE"].includes(newStatus)) {
        return c.json({ success: false, error: "Trạng thái không hợp lệ cho nhân viên" }, 400);
      }
    }

    const updateData: any = { status: newStatus };
    if (body.evidenceLink !== undefined) {
      updateData.evidenceLink = body.evidenceLink ? String(body.evidenceLink).trim() : null;
    }
    if (body.evidenceNote !== undefined) {
      updateData.evidenceNote = body.evidenceNote ? String(body.evidenceNote).trim() : null;
    }
    if (newStatus === "DONE") {
      updateData.submittedAt = new Date();
    } else if (newStatus === "APPROVED") {
      updateData.completedAt = new Date();
    }
    if (isAdmin && body.adminNote !== undefined) {
      updateData.adminNote = body.adminNote ? String(body.adminNote).trim() : null;
    }

    const updated = await prisma.staffTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, staffTasksAllowed: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("staff-tasks:stats:*");
    await invalidateCachePattern("tasks:staff-tasks:*");

    return c.json({ success: true, data: updated, task: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to update task status" }, 500);
  }
});

/**
 * POST /api/staff-tasks/bulk-status
 * Bulk update task statuses (Admin only)
 */
staffTasksRoute.post("/bulk-status", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    if (tokenPayload.role !== "ADMIN") {
      return c.json({ success: false, error: "Unauthorized: Admin role required" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const { ids, status, adminNote } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ success: false, error: "Danh sách mã công việc không hợp lệ" }, 400);
    }
    if (!status || typeof status !== "string") {
      return c.json({ success: false, error: "Trạng thái không hợp lệ" }, 400);
    }

    const updateData: any = { status };
    if (status === "APPROVED") {
      updateData.completedAt = new Date();
    } else if (status === "DONE") {
      updateData.submittedAt = new Date();
    }
    if (adminNote !== undefined) {
      updateData.adminNote = adminNote ? String(adminNote).trim() : null;
    }

    const result = await prisma.staffTask.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("staff-tasks:stats:*");
    await invalidateCachePattern("tasks:staff-tasks:*");

    return c.json({
      success: true,
      message: `Đã cập nhật ${result.count} công việc`,
      count: result.count,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to bulk update task status" }, 500);
  }
});

/**
 * POST /api/staff-tasks/:id/approve
 * Admin approves staff task
 */
staffTasksRoute.post("/:id/approve", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    if (tokenPayload.role !== "ADMIN") {
      return c.json({ success: false, error: "Unauthorized: Admin role required" }, 403);
    }

    const taskId = c.req.param("id");
    if (!taskId) {
      return c.json({ success: false, error: "Thiếu mã công việc" }, 400);
    }

    const task = await prisma.staffTask.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, staffTasksAllowed: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return c.json({ success: false, error: "Không tìm thấy công việc" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const updateData: any = {
      status: "APPROVED",
      completedAt: new Date(),
    };
    if (body.adminNote !== undefined) {
      updateData.adminNote = body.adminNote ? String(body.adminNote).trim() : null;
    }

    const updated = await prisma.staffTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, staffTasksAllowed: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("staff-tasks:stats:*");
    await invalidateCachePattern("tasks:staff-tasks:*");

    return c.json({ success: true, message: "Đã duyệt nhiệm vụ thành công", data: updated, task: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to approve staff task" }, 500);
  }
});

/**
 * POST /api/staff-tasks/:id/reject
 * Admin rejects staff task
 */
staffTasksRoute.post("/:id/reject", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    if (tokenPayload.role !== "ADMIN") {
      return c.json({ success: false, error: "Unauthorized: Admin role required" }, 403);
    }

    const taskId = c.req.param("id");
    if (!taskId) {
      return c.json({ success: false, error: "Thiếu mã công việc" }, 400);
    }

    const task = await prisma.staffTask.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, staffTasksAllowed: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return c.json({ success: false, error: "Không tìm thấy công việc" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const note = body.adminNote || body.reason || null;
    const updateData: any = {
      status: "REJECTED",
    };
    if (note !== null) {
      updateData.adminNote = String(note).trim();
    }

    const updated = await prisma.staffTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, staffTasksAllowed: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("staff-tasks:stats:*");
    await invalidateCachePattern("tasks:staff-tasks:*");

    return c.json({ success: true, message: "Đã từ chối nhiệm vụ", data: updated, task: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || "Failed to reject staff task" }, 500);
  }
});

/**
 * DELETE /api/staff-tasks/:id
 * Admin deletes a task
 */
staffTasksRoute.delete("/:id", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    if (tokenPayload.role !== "ADMIN") {
      return c.json({ success: false, error: "Unauthorized: Admin role required" }, 403);
    }

    const taskId = c.req.param("id");
    if (!taskId) {
      return c.json({ success: false, error: "Thiếu mã công việc" }, 400);
    }

    const task = await prisma.staffTask.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      return c.json({ success: false, error: "Không tìm thấy công việc" }, 404);
    }

    await prisma.staffTask.delete({
      where: { id: taskId },
    });

    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("staff-tasks:stats:*");
    await invalidateCachePattern("tasks:staff-tasks:*");

    return c.json({ success: true, message: "Đã xóa nhiệm vụ thành công!" });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete staff task" },
      500
    );
  }
});
