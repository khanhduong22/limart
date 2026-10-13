import { Hono } from "hono";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { prisma } from "@checkin/db";
import { getOrSetCache, invalidateCachePattern } from "../lib/cache";
import {
  toVNDateString,
  getVietnamMonthRange,
  getWeekBounds,
  getWeekBoundsFromWeekAndYear,
} from "../lib/date-utils";
import { calculateUserMonthlyStats } from "../lib/payroll-calculator";

export const managerTasksRoute = new Hono<AppEnv>();

export const DEFAULT_MANAGER_CHECKLIST_TASKS = [
  { title: "🧹 Kiểm tra vệ sinh phía trước và trong shop", description: "Quét dọn trước sân và lau dọn quầy kệ, không gian bên trong shop" },
  { title: "📧 Kiểm tra đơn hàng vào mỗi 9h30 và 12h30", description: "Rà soát các đơn hàng mới phát sinh vào các khung giờ cố định" },
  { title: "⚠️ Kiểm tra sản phẩm vi phạm và hiệu suất cửa hàng", description: "Xem xét các sản phẩm bị cảnh báo hoặc đánh giá xấu trên sàn" },
  { title: "📦 Kiểm tra đơn hàng hoàn hủy", description: "Xử lý và phân loại các đơn hàng khách hoàn hoặc yêu cầu hủy" },
  { title: "📝 Chỉnh sửa hóa đơn", description: "Kiểm tra và sửa đổi các thông tin hóa đơn sai lệch (nếu có)" },
  { title: "💻 Kiểm tra phần chờ đóng gói trên sapo", description: "Rà soát các đơn hàng đang ở trạng thái chờ đóng gói trên hệ thống Sapo" },
  { title: "🔗 Kiểm tra phần liên kết các đơn hàng trên sàn", description: "Đảm bảo đồng bộ và liên kết chính xác giữa sàn thương mại và Sapo" },
  { title: "📊 Đối soát đơn hàng", description: "Đối chiếu mã vận đơn và tiền hàng định kỳ" },
  { title: "🎯 Duyệt KPI và WFH", description: "Phê duyệt các yêu cầu KPI/WFH của nhân sự cấp dưới" },
  { title: "💵 Đếm tiền chốt sổ", description: "Kiểm đếm tiền mặt, đối chiếu doanh thu thực tế và chốt sổ bàn giao ca" },
  { title: "🔒 Khoá cửa và Tắt thiết bị", description: "Kiểm tra tắt hết điều hòa, máy tính, đèn điện và khóa cửa an toàn trước khi về" },
];

export async function ensureChecklistTemplatesSeeded(userId: string) {
  const count = await prisma.managerChecklistTask.count({
    where: { assigneeId: userId },
  });

  if (count === 0) {
    await prisma.$transaction(
      DEFAULT_MANAGER_CHECKLIST_TASKS.map((t, index) =>
        prisma.managerChecklistTask.create({
          data: {
            title: t.title,
            description: t.description,
            assigneeId: userId,
            active: true,
            order: index,
          },
        })
      )
    );
  }
}

/**
 * GET /api/manager-tasks/users
 * Returns list of active users suitable for manager checklist assignment
 */
managerTasksRoute.get("/users", authMiddleware, async (c) => {
  try {
    const users = await getOrSetCache("admin:manager-tasks:users", 300, async () => {
      return prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
        },
        orderBy: { name: "asc" },
      });
    });

    return c.json({ success: true, data: users });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch users" },
      500
    );
  }
});

/**
 * GET /api/manager-tasks/checklist
 * Query params: userId, date (YYYY-MM-DD)
 */
managerTasksRoute.get("/checklist", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const callerId = tokenPayload.sub;
    const role = tokenPayload.role;

    const requestedUserId = c.req.query("userId");
    const targetUserId = requestedUserId || callerId;

    // Check permission: Admin can view anyone, non-admin only their own
    if (role !== "ADMIN" && targetUserId !== callerId) {
      return c.json({ success: false, error: "Unauthorized access" }, 403);
    }

    const dateStr = c.req.query("date") || toVNDateString(new Date());

    await ensureChecklistTemplatesSeeded(targetUserId);

    // 1. Get checklist templates active/scheduled for this specific date
    const templates = await prisma.managerChecklistTask.findMany({
      where: {
        assigneeId: targetUserId,
        OR: [
          { targetDate: null },
          { targetDate: "" },
          { targetDate: dateStr },
        ],
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    // 2. Fetch completions for the selected date
    const completions = await prisma.managerChecklistCompletion.findMany({
      where: {
        date: dateStr,
        task: { assigneeId: targetUserId },
      },
    });

    // 3. Map template tasks with completion status
    const checklist = templates.map((task) => {
      const comp = completions.find((c) => c.taskId === task.id);
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        active: task.active,
        targetDate: task.targetDate,
        order: task.order,
        createdAt: task.createdAt,
        completed: comp ? comp.completed : false,
        completedAt: comp ? comp.completedAt : null,
      };
    });

    return c.json({ success: true, data: checklist });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch daily checklist" },
      500
    );
  }
});

/**
 * POST /api/manager-tasks/checklist/toggle
 * Body: { taskId, date, completed }
 */
managerTasksRoute.post("/checklist/toggle", authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { taskId, date, completed } = body;

    if (!taskId) {
      return c.json({ success: false, error: "Thiếu taskId" }, 400);
    }

    const dateStr = date || toVNDateString(new Date());
    const isCompleted = Boolean(completed);

    const task = await prisma.managerChecklistTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return c.json({ success: false, error: "Nhiệm vụ không tồn tại" }, 404);
    }

    const completion = await prisma.managerChecklistCompletion.upsert({
      where: {
        taskId_date: { taskId, date: dateStr },
      },
      create: {
        taskId,
        date: dateStr,
        completed: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
      update: {
        completed: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("payroll:*");

    return c.json({ success: true, data: completion });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to toggle checklist item" },
      500
    );
  }
});

/**
 * POST /api/manager-tasks/checklist
 * Body: { title, description, assigneeId, targetDate }
 */
managerTasksRoute.post("/checklist", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const role = tokenPayload.role;

    if (role !== "ADMIN") {
      return c.json({ success: false, error: "Admin role required" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const { title, description, assigneeId, targetDate } = body;

    if (!title || !title.trim()) {
      return c.json({ success: false, error: "Tiêu đề nhiệm vụ không được để trống" }, 400);
    }
    if (!assigneeId) {
      return c.json({ success: false, error: "Thiếu người thực hiện (assigneeId)" }, 400);
    }

    const task = await prisma.managerChecklistTask.create({
      data: {
        title: title.trim(),
        description: description ? description.trim() : null,
        assigneeId,
        targetDate: targetDate ? targetDate.trim() : null,
        active: true,
      },
    });

    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("payroll:*");

    return c.json({ success: true, data: task });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to create checklist task" },
      500
    );
  }
});

/**
 * PATCH /api/manager-tasks/checklist/:id
 * Body: { title, description, active, targetDate }
 */
managerTasksRoute.patch("/checklist/:id", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const role = tokenPayload.role;

    if (role !== "ADMIN") {
      return c.json({ success: false, error: "Admin role required" }, 403);
    }

    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { title, description, active, targetDate } = body;

    const existing = await prisma.managerChecklistTask.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Nhiệm vụ không tồn tại" }, 404);
    }

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description ? description.trim() : null;
    if (active !== undefined) data.active = Boolean(active);
    if (targetDate !== undefined) data.targetDate = targetDate ? targetDate.trim() : null;

    const task = await prisma.managerChecklistTask.update({
      where: { id },
      data,
    });

    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("payroll:*");

    return c.json({ success: true, data: task });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update checklist task" },
      500
    );
  }
});

/**
 * DELETE /api/manager-tasks/checklist/:id
 */
managerTasksRoute.delete("/checklist/:id", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const role = tokenPayload.role;

    if (role !== "ADMIN") {
      return c.json({ success: false, error: "Admin role required" }, 403);
    }

    const id = c.req.param("id");

    const existing = await prisma.managerChecklistTask.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Nhiệm vụ không tồn tại" }, 404);
    }

    await prisma.managerChecklistTask.delete({
      where: { id },
    });

    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("payroll:*");

    return c.json({ success: true });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete checklist task" },
      500
    );
  }
});

/**
 * POST /api/manager-tasks/checklist/reorder
 * Body: { userId, taskIds }
 */
managerTasksRoute.post("/checklist/reorder", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const role = tokenPayload.role;

    if (role !== "ADMIN") {
      return c.json({ success: false, error: "Admin role required" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const { taskIds } = body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return c.json({ success: false, error: "Danh sách taskIds không hợp lệ" }, 400);
    }

    await prisma.$transaction(
      taskIds.map((id: string, index: number) =>
        prisma.managerChecklistTask.update({
          where: { id },
          data: { order: index },
        })
      )
    );

    return c.json({ success: true });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to reorder checklist tasks" },
      500
    );
  }
});

/**
 * GET /api/manager-tasks/templates
 * Query param: userId
 */
managerTasksRoute.get("/templates", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const callerId = tokenPayload.sub;
    const role = tokenPayload.role;

    const requestedUserId = c.req.query("userId");
    const targetUserId = requestedUserId || callerId;

    if (role !== "ADMIN" && targetUserId !== callerId) {
      return c.json({ success: false, error: "Unauthorized access" }, 403);
    }

    await ensureChecklistTemplatesSeeded(targetUserId);

    const templates = await prisma.managerChecklistTask.findMany({
      where: { assigneeId: targetUserId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return c.json({ success: true, data: templates });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch checklist templates" },
      500
    );
  }
});

/**
 * GET /api/manager-tasks/stats-history
 * Query param: userId, date (optional, YYYY-MM-DD)
 */
managerTasksRoute.get("/stats-history", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const callerId = tokenPayload.sub;
    const role = tokenPayload.role;

    const requestedUserId = c.req.query("userId");
    const targetUserId = requestedUserId || callerId;

    if (role !== "ADMIN" && targetUserId !== callerId) {
      return c.json({ success: false, error: "Unauthorized access" }, 403);
    }

    const dateParam = c.req.query("date");
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    const stats = await calculateUserMonthlyStats(targetUserId, targetDate);
    if (!stats) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    const { startDate, endDate } = getVietnamMonthRange(
      targetDate.getMonth() + 1,
      targetDate.getFullYear()
    );
    const startDateStr = toVNDateString(startDate);
    const endDateStr = toVNDateString(endDate);

    const [checklistTasks, checklistCompletions] = await Promise.all([
      prisma.managerChecklistTask.findMany({
        where: { assigneeId: targetUserId },
      }),
      prisma.managerChecklistCompletion.findMany({
        where: {
          task: { assigneeId: targetUserId },
          date: { gte: startDateStr, lte: endDateStr },
        },
      }),
    ]);

    const details = (stats.dailyDetails || []).map((day: any) => {
      const isWorkingDay = day.hours > 0 || (day.error && day.error.includes("WFH"));
      let isChecklistIncomplete = false;
      let updatedError = day.error;

      if (isWorkingDay && checklistTasks.length > 0) {
        const activeTasks = checklistTasks.filter((task) => {
          const taskCreatedKey = toVNDateString(task.createdAt);
          const matchesDate = !task.targetDate || task.targetDate === day.date;
          return taskCreatedKey <= day.date && task.active && matchesDate;
        });

        if (activeTasks.length > 0) {
          const completedTaskIds = checklistCompletions
            .filter((comp) => comp.date === day.date && comp.completed)
            .map((comp) => comp.taskId);

          const hasUncompleted = activeTasks.some(
            (task) => !completedTaskIds.includes(task.id)
          );

          if (hasUncompleted) {
            isChecklistIncomplete = true;
            updatedError = updatedError
              ? `${updatedError}, Thiếu checklist`
              : "Thiếu checklist";
          }
        }
      }

      return {
        ...day,
        isChecklistIncomplete,
        error: updatedError,
      };
    });

    const totalDeficiencies = details.filter((d: any) => d.isChecklistIncomplete).length;

    return c.json({
      success: true,
      data: {
        ...stats,
        dailyDetails: details,
        totalDeficiencies,
      },
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to calculate stats history" },
      500
    );
  }
});

/**
 * GET /api/manager-tasks/weekly
 * Query param: userId (optional), date (optional)
 */
managerTasksRoute.get("/weekly", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const callerId = tokenPayload.sub;
    const role = tokenPayload.role;

    const requestedUserId = c.req.query("userId");
    const targetUserId = requestedUserId || callerId;

    if (role !== "ADMIN" && targetUserId !== callerId) {
      return c.json({ success: false, error: "Unauthorized access" }, 403);
    }

    const dateStr = c.req.query("date") || toVNDateString(new Date());
    const currentDate = new Date(dateStr + "T00:00:00+07:00");
    const { weekStart } = getWeekBounds(currentDate);

    const whereClause: any = {
      weekStart,
    };
    if (targetUserId) {
      whereClause.assigneeId = targetUserId;
    }

    const tasks = await prisma.managerWeeklyTask.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
    });

    return c.json({ success: true, data: tasks });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch weekly tasks" },
      500
    );
  }
});

/**
 * POST /api/manager-tasks/weekly
 * Body: { title, description, assigneeId, targetWeek, targetYear, dateStr, date }
 */
managerTasksRoute.post("/weekly", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const role = tokenPayload.role;

    if (role !== "ADMIN") {
      return c.json({ success: false, error: "Admin role required" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const { title, description, assigneeId, targetWeek, targetYear, dateStr, date } = body;

    if (!title || !title.trim()) {
      return c.json({ success: false, error: "Tiêu đề nhiệm vụ tuần không được để trống" }, 400);
    }
    if (!assigneeId) {
      return c.json({ success: false, error: "Thiếu người thực hiện (assigneeId)" }, 400);
    }

    let bounds: { weekStart: Date; weekEnd: Date };
    if (targetWeek && targetYear) {
      bounds = getWeekBoundsFromWeekAndYear(Number(targetWeek), Number(targetYear));
    } else {
      const dStr = dateStr || date || toVNDateString(new Date());
      bounds = getWeekBounds(new Date(dStr + "T00:00:00+07:00"));
    }

    const task = await prisma.managerWeeklyTask.create({
      data: {
        title: title.trim(),
        description: description ? description.trim() : null,
        assigneeId,
        weekStart: bounds.weekStart,
        weekEnd: bounds.weekEnd,
        completed: false,
      },
    });

    return c.json({ success: true, data: task });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to create weekly task" },
      500
    );
  }
});

/**
 * PATCH /api/manager-tasks/weekly/:id
 * Body: { title, description, completed, explanation }
 */
managerTasksRoute.patch("/weekly/:id", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const role = tokenPayload.role;

    if (role !== "ADMIN") {
      return c.json({ success: false, error: "Admin role required" }, 403);
    }

    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { title, description, completed, explanation } = body;

    const existing = await prisma.managerWeeklyTask.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Nhiệm vụ tuần không tồn tại" }, 404);
    }

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description ? description.trim() : null;
    if (completed !== undefined) {
      data.completed = Boolean(completed);
      data.completedAt = completed ? new Date() : null;
    }
    if (explanation !== undefined) data.explanation = explanation ? explanation.trim() : null;

    const task = await prisma.managerWeeklyTask.update({
      where: { id },
      data,
    });

    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("payroll:*");

    return c.json({ success: true, data: task });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update weekly task" },
      500
    );
  }
});

/**
 * DELETE /api/manager-tasks/weekly/:id
 */
managerTasksRoute.delete("/weekly/:id", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const role = tokenPayload.role;

    if (role !== "ADMIN") {
      return c.json({ success: false, error: "Admin role required" }, 403);
    }

    const id = c.req.param("id");

    const existing = await prisma.managerWeeklyTask.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Nhiệm vụ tuần không tồn tại" }, 404);
    }

    await prisma.managerWeeklyTask.delete({
      where: { id },
    });

    return c.json({ success: true });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete weekly task" },
      500
    );
  }
});

/**
 * POST /api/manager-tasks/weekly/:id/toggle
 * Body: { completed }
 */
managerTasksRoute.post("/weekly/:id/toggle", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { completed } = body;

    const existing = await prisma.managerWeeklyTask.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Nhiệm vụ tuần không tồn tại" }, 404);
    }

    const isCompleted = Boolean(completed);

    const task = await prisma.managerWeeklyTask.update({
      where: { id },
      data: {
        completed: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("payroll:*");

    return c.json({ success: true, data: task });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to toggle weekly task" },
      500
    );
  }
});

/**
 * POST /api/manager-tasks/weekly/:id/carry-over
 * Body: { explanation }
 */
managerTasksRoute.post("/weekly/:id/carry-over", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { explanation } = body;

    if (!explanation || !explanation.trim()) {
      return c.json({ success: false, error: "Vui lòng nhập lý do giải trình" }, 400);
    }

    const task = await prisma.managerWeeklyTask.findUnique({
      where: { id },
    });

    if (!task) {
      return c.json({ success: false, error: "Nhiệm vụ tuần không tồn tại" }, 404);
    }

    // 1. Update current task with explanation
    const updatedTask = await prisma.managerWeeklyTask.update({
      where: { id },
      data: { explanation: explanation.trim() },
    });

    // 2. Create copy for next week
    const nextWeekStart = new Date(task.weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextWeekEnd = new Date(task.weekEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    const carriedOverTask = await prisma.managerWeeklyTask.create({
      data: {
        title: task.title,
        description: task.description
          ? `${task.description} (Chuyển tiếp)`
          : "(Chuyển tiếp từ tuần trước)",
        assigneeId: task.assigneeId,
        weekStart: nextWeekStart,
        weekEnd: nextWeekEnd,
        completed: false,
        isCarriedOver: true,
      },
    });

    // 3. Create Request of type WEEKLY_TASK
    await prisma.request.create({
      data: {
        userId: task.assigneeId,
        date: new Date(),
        type: "WEEKLY_TASK",
        reason: `[Giải trình việc tuần: ${task.title}] Lý do: ${explanation.trim()}. Đã chuyển tiếp sang tuần sau.`,
        status: "PENDING",
      },
    });

    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("payroll:*");

    return c.json({
      success: true,
      data: { updatedTask, carriedOverTask },
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to carry over weekly task" },
      500
    );
  }
});
