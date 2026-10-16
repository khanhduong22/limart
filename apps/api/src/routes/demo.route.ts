import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { prisma } from "@checkin/db";
import { signAccessToken, TOKEN_EXPIRY_SECONDS } from "../lib/auth";
import { AppEnv } from "../middleware/auth.middleware";
import { getRedisClient, invalidateCachePattern } from "../lib/cache";
import { getClientIP } from "../lib/ip-utils";
import { recordSecureAuditLog } from "../lib/audit";
import {
  DEMO_MODULE_METADATA,
  getDemoModulesConfig,
  getDemoPersonas,
  isDemoSandboxEnabled,
  seedAndSanitizeDemoDatabase,
  updateDemoModulesConfig,
} from "../lib/demo-sandbox";

export const demoRoute = new Hono<AppEnv>();

// GET /api/demo/status
demoRoute.get("/status", async (c) => {
  if (!isDemoSandboxEnabled()) {
    return c.json({
      success: true,
      enabled: false,
    });
  }

  const [modules, personas] = await Promise.all([
    getDemoModulesConfig(),
    getDemoPersonas(),
  ]);

  return c.json({
    success: true,
    enabled: true,
    tenantName: "DemoMart — Super App Bán Lẻ",
    modules,
    moduleMetadata: DEMO_MODULE_METADATA,
    personas,
  });
});

// POST /api/demo/switch-role
demoRoute.post("/switch-role", async (c) => {
  if (!isDemoSandboxEnabled()) {
    return c.json(
      {
        success: false,
        error: "Demo mode is disabled on Production",
      },
      403
    );
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const requestedRole: "ADMIN" | "PARTNER" | "USER" =
      body?.role === "ADMIN" || body?.role === "PARTNER" || body?.role === "USER"
        ? body.role
        : "USER";
    const requestedUserId: string | undefined =
      typeof body?.userId === "string" && body.userId.trim() ? body.userId.trim() : undefined;

    const totalUsers = await prisma.user.count();
    if (totalUsers === 0) {
      await seedAndSanitizeDemoDatabase({ force: true });
    }

    let user: any = null;

    if (requestedUserId) {
      user = await prisma.user.findUnique({
        where: { id: requestedUserId },
      });
    }

    if (!user) {
      const preferredEmail =
        requestedRole === "ADMIN"
          ? "owner@demomart.vn"
          : requestedRole === "PARTNER"
            ? "manager@demomart.vn"
            : "nv01@demomart.vn";

      user = await prisma.user.findUnique({
        where: { email: preferredEmail },
      });
    }

    if (!user) {
      user = await prisma.user.findFirst({
        where: { role: requestedRole, isActive: true },
        orderBy: { email: "asc" },
      });
    }

    if (!user) {
      user = await prisma.user.findFirst({
        where: { isActive: true },
      });
    }

    if (!user) {
      return c.json(
        {
          success: false,
          error: "Không tìm thấy tài khoản mẫu trong Demo Sandbox",
        },
        404
      );
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email || "",
      name: user.name || "",
      role: user.role,
    });

    setCookie(c, "access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: TOKEN_EXPIRY_SECONDS,
      path: "/",
    });

    const clientIp = getClientIP(c) || "103.199.18.88";
    const userAgent =
      c.req.header("user-agent") ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0";
    await recordSecureAuditLog({
      userId: user.id,
      action: "LOGIN",
      status: "SUCCESS",
      ipAddress: clientIp,
      userAgent,
      device: /Mobile|Android|iPhone|iPad/i.test(userAgent) ? "Mobile" : "Desktop",
      city: "TP. Hồ Chí Minh",
      details: {
        note: `Chuyển đổi vai trò nhanh trong Demo Sandbox sang ${user.role} (${user.email})`,
        switchedRole: user.role,
      },
      requestId: c.var.requestId || c.get("requestId"),
    }).catch(() => null);
    await invalidateCachePattern("auth:audit-logs:*").catch(() => null);

    const redirectTo =
      user.role === "ADMIN" ? "/admin" : user.role === "PARTNER" ? "/staff-tasks" : "/";

    return c.json({
      success: true,
      token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        employmentType: user.employmentType,
        hourlyRate: user.hourlyRate,
        monthlySalary: user.monthlySalary,
        isActive: user.isActive,
        luckyWheelAllowed: user.luckyWheelAllowed,
        staffTasksAllowed: user.staffTasksAllowed,
      },
      redirectTo,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err?.message || "Failed to switch demo role",
      },
      500
    );
  }
});

// POST /api/demo/modules
demoRoute.post("/modules", async (c) => {
  if (!isDemoSandboxEnabled()) {
    return c.json(
      {
        success: false,
        error: "Demo mode is disabled",
      },
      403
    );
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const payload = body?.modules && typeof body.modules === "object" ? body.modules : body;
    const modules = await updateDemoModulesConfig(payload);

    return c.json({
      success: true,
      modules,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err?.message || "Failed to update demo modules",
      },
      500
    );
  }
});

// POST /api/demo/reset
demoRoute.post("/reset", async (c) => {
  if (!isDemoSandboxEnabled()) {
    return c.json(
      {
        success: false,
        error: "Demo mode is disabled",
      },
      403
    );
  }

  try {
    const result = await seedAndSanitizeDemoDatabase({ force: true });

    try {
      await invalidateCachePattern("*");
      const redis = getRedisClient();
      if (redis && typeof (redis as any).flushdb === "function") {
        await (redis as any).flushdb();
      }
    } catch {
      // Ignore cache flush errors
    }

    return c.json({
      success: true,
      message: "Đã random lại tên, mức lương và khôi phục dữ liệu mẫu thành công!",
      stats: result,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err?.message || "Failed to reset demo database",
      },
      500
    );
  }
});
