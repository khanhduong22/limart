import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { z } from "zod";
import { authMiddleware, adminMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getOrSetCache, invalidateCachePattern } from "../lib/cache";

export const createTaskDefSchema = z.object({
  name: z.string().trim().min(1, "Tên định mức không được để trống"),
  description: z.string().trim().optional().nullable(),
  baseReward: z.coerce.number().min(0, "Đơn giá phải lớn hơn hoặc bằng 0"),
  unit: z.string().trim().min(1, "Đơn vị tính không được để trống"),
  active: z.boolean().optional(),
});

export const updateTaskDefSchema = z.object({
  name: z.string().trim().min(1, "Tên định mức không được để trống").optional(),
  description: z.string().trim().optional().nullable(),
  baseReward: z.coerce.number().min(0, "Đơn giá phải lớn hơn hoặc bằng 0").optional(),
  unit: z.string().trim().min(1, "Đơn vị tính không được để trống").optional(),
  active: z.boolean().optional(),
});

export const createTaskItemSchema = z.object({
  taskDefId: z.string().trim().min(1, "Vui lòng chọn loại công việc"),
  title: z.string().trim().min(1, "Tiêu đề không được để trống"),
  description: z.string().trim().optional().nullable(),
  deadline: z.string().trim().optional().nullable(),
});

export const updateTaskItemSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề không được để trống").optional(),
  description: z.string().trim().optional().nullable(),
  deadline: z.string().trim().optional().nullable(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CLOSED"]).optional(),
  assigneeId: z.string().trim().optional().nullable(),
});

export const updateTaskItemStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CLOSED"]).optional(),
  assigneeId: z.string().trim().optional().nullable(),
});

export const tasksRoute = new Hono<AppEnv>();
tasksRoute.use("*", authMiddleware, adminMiddleware);

export async function getDefinitionsHandler(c: any) {
  try {
    const definitions = await getOrSetCache("meta:task-definitions:all", 600, async () => {
      return prisma.taskDefinition.findMany({
        orderBy: { name: "asc" },
      });
    });
    return c.json({ success: true, data: definitions });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch task definitions" },
      500
    );
  }
}

export async function createDefinitionHandler(c: any) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = createTaskDefSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
        400
      );
    }

    const { name, description, baseReward, unit, active } = parsed.data;
    const definition = await prisma.taskDefinition.create({
      data: {
        name,
        description: description || null,
        baseReward,
        unit,
        active: active !== undefined ? active : true,
      },
    });

    await Promise.all([
      invalidateCachePattern("meta:task-definitions:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json(
      { success: true, message: "Tạo định mức công việc thành công", data: definition },
      201
    );
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to create task definition" },
      500
    );
  }
}

export async function updateDefinitionHandler(c: any) {
  try {
    const id = c.req.param("id");
    const existing = await prisma.taskDefinition.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Task definition not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = updateTaskDefSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
        400
      );
    }

    const dataToUpdate: any = {};
    if (parsed.data.name !== undefined) dataToUpdate.name = parsed.data.name;
    if (parsed.data.description !== undefined) dataToUpdate.description = parsed.data.description;
    if (parsed.data.baseReward !== undefined) dataToUpdate.baseReward = parsed.data.baseReward;
    if (parsed.data.unit !== undefined) dataToUpdate.unit = parsed.data.unit;
    if (parsed.data.active !== undefined) dataToUpdate.active = parsed.data.active;

    const updated = await prisma.taskDefinition.update({
      where: { id },
      data: dataToUpdate,
    });

    await Promise.all([
      invalidateCachePattern("meta:task-definitions:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Cập nhật định mức công việc thành công",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update task definition" },
      500
    );
  }
}

export async function deleteDefinitionHandler(c: any) {
  try {
    const id = c.req.param("id");
    const existing = await prisma.taskDefinition.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tasks: true, taskItems: true },
        },
      },
    });

    if (!existing) {
      return c.json({ success: false, error: "Task definition not found" }, 404);
    }

    if (existing._count?.tasks > 0 || existing._count?.taskItems > 0) {
      return c.json(
        {
          success: false,
          error:
            "Không thể xóa định mức này vì đã có dữ liệu nhiệm vụ liên quan. Hãy tắt kích hoạt thay vì xóa.",
        },
        400
      );
    }

    await prisma.taskDefinition.delete({
      where: { id },
    });

    await Promise.all([
      invalidateCachePattern("meta:task-definitions:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json({ success: true, message: "Đã xóa định mức công việc" });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete task definition" },
      500
    );
  }
}

// ============================================================================
// TASK ITEMS (MARKETPLACE) HANDLERS
// ============================================================================

export async function getTaskItemsHandler(c: any) {
  try {
    const items = await getOrSetCache("tasks:items:all", 60, async () => {
      return await prisma.taskItem.findMany({
        include: {
          taskDefinition: true,
          assignee: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    });
    return c.json({ success: true, data: items });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to fetch task items" },
      500
    );
  }
}

export async function createTaskItemHandler(c: any) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = createTaskItemSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
        400
      );
    }

    const { taskDefId, title, description, deadline } = parsed.data;

    let deadlineDate: Date | null = null;
    if (deadline) {
      const d = new Date(deadline);
      if (!isNaN(d.getTime())) {
        deadlineDate = d;
      }
    }

    const item = await prisma.taskItem.create({
      data: {
        taskDefId,
        title,
        description: description || null,
        deadline: deadlineDate,
        status: "OPEN",
      },
      include: {
        taskDefinition: true,
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    await Promise.all([
      invalidateCachePattern("tasks:items:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("staff:home:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json(
      { success: true, message: "Tạo nhiệm vụ kho việc thành công", data: item },
      201
    );
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to create task item" },
      500
    );
  }
}

export async function updateTaskItemHandler(c: any) {
  try {
    const id = c.req.param("id");
    const existing = await prisma.taskItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Task item not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = updateTaskItemSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
        400
      );
    }

    const dataToUpdate: any = {};
    if (parsed.data.title !== undefined) dataToUpdate.title = parsed.data.title;
    if (parsed.data.description !== undefined) dataToUpdate.description = parsed.data.description;
    if (parsed.data.deadline !== undefined) {
      if (parsed.data.deadline) {
        const d = new Date(parsed.data.deadline);
        dataToUpdate.deadline = !isNaN(d.getTime()) ? d : null;
      } else {
        dataToUpdate.deadline = null;
      }
    }
    if (parsed.data.status !== undefined) dataToUpdate.status = parsed.data.status;
    if (parsed.data.assigneeId !== undefined) dataToUpdate.assigneeId = parsed.data.assigneeId;

    const updated = await prisma.taskItem.update({
      where: { id },
      data: dataToUpdate,
      include: {
        taskDefinition: true,
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    await Promise.all([
      invalidateCachePattern("tasks:items:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("staff:home:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Cập nhật nhiệm vụ thành công",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update task item" },
      500
    );
  }
}

export async function updateTaskItemStatusHandler(c: any) {
  try {
    const id = c.req.param("id");
    const existing = await prisma.taskItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Task item not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = updateTaskItemStatusSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
        400
      );
    }

    const dataToUpdate: any = {};
    if (parsed.data.status !== undefined) dataToUpdate.status = parsed.data.status;
    if (parsed.data.assigneeId !== undefined) dataToUpdate.assigneeId = parsed.data.assigneeId;

    const updated = await prisma.taskItem.update({
      where: { id },
      data: dataToUpdate,
      include: {
        taskDefinition: true,
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    await Promise.all([
      invalidateCachePattern("tasks:items:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("staff:home:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Cập nhật trạng thái thành công",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to update task item status" },
      500
    );
  }
}

export async function resetTaskItemHandler(c: any) {
  try {
    const id = c.req.param("id");
    const existing = await prisma.taskItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Task item not found" }, 404);
    }

    const updated = await prisma.taskItem.update({
      where: { id },
      data: {
        status: "OPEN",
        assigneeId: null,
      },
      include: {
        taskDefinition: true,
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    await Promise.all([
      invalidateCachePattern("tasks:items:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("staff:home:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đã reset nhiệm vụ về trạng thái OPEN",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to reset task item" },
      500
    );
  }
}

export async function closeTaskItemHandler(c: any) {
  try {
    const id = c.req.param("id");
    const existing = await prisma.taskItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Task item not found" }, 404);
    }

    const updated = await prisma.taskItem.update({
      where: { id },
      data: {
        status: "CLOSED",
      },
      include: {
        taskDefinition: true,
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    await Promise.all([
      invalidateCachePattern("tasks:items:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("staff:home:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json({
      success: true,
      message: "Đã đóng nhiệm vụ",
      data: updated,
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to close task item" },
      500
    );
  }
}

export async function deleteTaskItemHandler(c: any) {
  try {
    const id = c.req.param("id");
    const existing = await prisma.taskItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ success: false, error: "Task item not found" }, 404);
    }

    await prisma.taskItem.delete({
      where: { id },
    });

    await Promise.all([
      invalidateCachePattern("tasks:items:*"),
      invalidateCachePattern("staff:tasks:*"),
      invalidateCachePattern("admin:tasks:*"),
      invalidateCachePattern("user:tasks:my:*"),
      invalidateCachePattern("staff:home:*"),
      invalidateCachePattern("task*"),
    ]).catch(() => {});

    return c.json({ success: true, message: "Đã xóa nhiệm vụ kho việc" });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "Failed to delete task item" },
      500
    );
  }
}

// Task Definitions
tasksRoute.get("/definitions", getDefinitionsHandler);
tasksRoute.post("/definitions", createDefinitionHandler);
tasksRoute.patch("/definitions/:id", updateDefinitionHandler);
tasksRoute.delete("/definitions/:id", deleteDefinitionHandler);

// Task Items (Marketplace)
tasksRoute.get("/items", getTaskItemsHandler);
tasksRoute.post("/items", createTaskItemHandler);
tasksRoute.patch("/items/:id", updateTaskItemHandler);
tasksRoute.patch("/items/:id/status", updateTaskItemStatusHandler);
tasksRoute.post("/items/:id/reset", resetTaskItemHandler);
tasksRoute.post("/items/:id/close", closeTaskItemHandler);
tasksRoute.delete("/items/:id", deleteTaskItemHandler);
