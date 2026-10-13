import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { z } from "zod";
import { authMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getOrSetCache, invalidateCachePattern } from "../lib/cache";

export const requestsRoute = new Hono<AppEnv>();

const CreateRequestSchema = z.object({
  type: z.enum(["LEAVE", "WFH", "EXPLANATION", "SHIFT_SWAP", "EARLY_LEAVE"]),
  date: z.string().min(1, "Date is required"),
  reason: z.string().min(1, "Reason is required"),
});

// GET /api/requests/me
requestsRoute.get("/me", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const requests = await getOrSetCache("user:requests:" + userId, 60, async () => {
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
      { success: false, error: err?.message || "Failed to fetch user requests" },
      500
    );
  }
});

// POST /api/requests
requestsRoute.post("/", authMiddleware, async (c) => {
  try {
    const tokenPayload = c.get("user");
    const userId = tokenPayload.sub;

    const body = await c.req.json().catch(() => ({}));
    const parseResult = CreateRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return c.json(
        {
          success: false,
          error: "Invalid request payload",
          details: parseResult.error.flatten(),
        },
        400
      );
    }

    const { type, date, reason } = parseResult.data;

    const newRequest = await prisma.request.create({
      data: {
        userId,
        type,
        date: new Date(date),
        reason,
        status: "PENDING",
      },
    });

    await invalidateCachePattern("user:requests:" + userId);

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
      { success: false, error: err?.message || "Failed to create request" },
      500
    );
  }
});
