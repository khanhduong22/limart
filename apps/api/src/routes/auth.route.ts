import { Hono } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import { prisma } from "@checkin/db";
import { signAccessToken, verifyAccessToken, TOKEN_EXPIRY_SECONDS } from "../lib/auth";
import { authMiddleware, adminMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getClientIP } from "../lib/ip-utils";
import { authRateLimiter } from "../middleware/rate-limiter";
import { recordSecureAuditLog } from "../lib/audit";

export const authRoute = new Hono<AppEnv>();

// Enforce Rate Limiting: max 15 requests per minute per IP across /api/auth/*
authRoute.use("*", authRateLimiter);

export const getGoogleCredentials = () => {
  const rawId = process.env.GOOGLE_CLIENT_ID || "";
  const rawSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const clientId = rawId.trim().replace(/^["']|["']$/g, "").trim();
  const clientSecret = rawSecret.trim().replace(/^["']|["']$/g, "").trim();
  return { clientId, clientSecret };
};

// GET /api/auth/google
authRoute.get("/google", async (c) => {
  const { clientId } = getGoogleCredentials();
  if (!clientId) {
    return c.json({ success: false, error: "GOOGLE_CLIENT_ID not configured" }, 500);
  }
  const proto = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = (c.req.header("x-forwarded-host") || c.req.header("host") || "limart.khanhdp.com").split(",")[0].trim();
  const redirectUri = `${proto}://${host}/api/auth/callback/google`;
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=openid%20email%20profile&prompt=select_account`;

  return c.redirect(googleAuthUrl);
});

// GET /api/auth/callback/google
authRoute.get("/callback/google", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error || !code) {
    return c.redirect("/login?error=cancelled");
  }

  const { clientId, clientSecret } = getGoogleCredentials();

  const proto = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = (c.req.header("x-forwarded-host") || c.req.header("host") || "limart.khanhdp.com").split(",")[0].trim();
  const redirectUri = `${proto}://${host}/api/auth/callback/google`;

  let tokenData: any;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      return c.redirect("/login?error=exchange_failed");
    }

    tokenData = await tokenRes.json().catch(() => ({}));
  } catch {
    return c.redirect("/login?error=exchange_failed");
  }

  if (!tokenData || !tokenData.id_token) {
    return c.redirect("/login?error=exchange_failed");
  }

  let email: string | null = null;
  try {
    const parts = tokenData.id_token.split(".");
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], "base64").toString("utf-8");
      const payload = JSON.parse(payloadJson);
      if (payload.email) {
        email = payload.email.toLowerCase().trim();
      }
    }
  } catch {
    return c.redirect("/login?error=exchange_failed");
  }

  if (!email) {
    return c.redirect("/login?error=exchange_failed");
  }

  const clientIp = getClientIP(c);
  const userAgent = c.req.header("user-agent") || "unknown";

  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    await recordSecureAuditLog({
      action: "LOGIN",
      status: "FAILED",
      ipAddress: clientIp,
      userAgent,
      device: "Google OAuth",
      details: {
        reason: "User not registered",
        attemptedEmail: email,
      },
      requestId: c.var.requestId || c.get("requestId"),
    });

    return c.redirect(`/login?error=not_registered&email=${encodeURIComponent(email)}`);
  }

  if (!user.isActive) {
    await recordSecureAuditLog({
      userId: user.id,
      action: "LOGIN",
      status: "FAILED",
      ipAddress: clientIp,
      userAgent,
      device: "Google OAuth",
      details: {
        reason: "Account inactive",
      },
      requestId: c.var.requestId || c.get("requestId"),
    });

    return c.redirect("/login?error=inactive");
  }

  // Auto-promote system admin if matches khanhdev4@gmail.com
  if (user.email === "khanhdev4@gmail.com" && user.role !== "ADMIN") {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
  }

  // Auto-assign PARTNER role if matches cuccung123456789@gmail.com or phuckhanh22
  if (
    (user.email?.toLowerCase().includes("phuckhanh22") ||
      user.email?.toLowerCase() === "cuccung123456789@gmail.com") &&
    (user.role !== "PARTNER" || !user.staffTasksAllowed)
  ) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "PARTNER", staffTasksAllowed: true },
    });
  }

  const tokenPayload = {
    sub: user.id,
    email: user.email || "",
    name: user.name || "",
    role: user.role,
  };

  const accessToken = await signAccessToken(tokenPayload);

  // Set HttpOnly cookie for Web/PWA clients (30 days)
  setCookie(c, "access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: TOKEN_EXPIRY_SECONDS,
    path: "/",
  });

  // Record successful login audit log
  await recordSecureAuditLog({
    userId: user.id,
    action: "LOGIN",
    status: "SUCCESS",
    ipAddress: clientIp,
    userAgent,
    device: "Google OAuth",
    requestId: c.var.requestId || c.get("requestId"),
  });

  const targetBase =
    user.role === "ADMIN" ? "/admin" : user.role === "PARTNER" ? "/staff-tasks" : "/";
  const redirectUrl = `${targetBase}?token=${encodeURIComponent(accessToken)}`;
  return c.redirect(redirectUrl);
});

// POST & GET /api/auth/logout
authRoute.all("/logout", async (c) => {
  let userId: string | null = null;
  const token = getCookie(c, "access_token");

  if (token) {
    const payload = await verifyAccessToken(token);
    if (payload) userId = payload.sub;
  }

  const clientIp = getClientIP(c);
  const userAgent = c.req.header("user-agent") || "unknown";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

  await recordSecureAuditLog({
    userId,
    action: "LOGOUT",
    status: "SUCCESS",
    ipAddress: clientIp,
    userAgent,
    device: isMobile ? "Mobile" : "Desktop",
    requestId: c.var.requestId || c.get("requestId"),
  });

  // Clear access_token cookie
  setCookie(c, "access_token", "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });

  if (c.req.query("redirect") || c.req.method === "GET") {
    return c.redirect("/login");
  }

  return c.json({
    success: true,
    message: "Đăng xuất thành công",
  });
});

// GET /api/auth/audit-logs (Admin Only, supports pagination and filters)
authRoute.get("/audit-logs", authMiddleware, adminMiddleware, async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(Math.max(1, parseInt(c.req.query("limit") || "50", 10)), 200);
  const action = c.req.query("action");
  const status = c.req.query("status");
  const userId = c.req.query("userId");

  const where: any = {};
  if (action) where.action = action;
  if (status) where.status = status;
  if (userId) where.userId = userId;

  const [total, logs] = await Promise.all([
    prisma.sessionAuditLog.count({ where }),
    prisma.sessionAuditLog.findMany({
      where,
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
      },
    }),
  ]);

  return c.json({
    success: true,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    logs,
  });
});

// GET /api/auth/me (also mounted at /api/me)
authRoute.get("/me", authMiddleware, async (c) => {
  const tokenPayload = c.get("user");
  const user = await prisma.user.findUnique({
    where: { id: tokenPayload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      isActive: true,
      employmentType: true,
      hourlyRate: true,
      monthlySalary: true,
      birthday: true,
      startDate: true,
      luckyWheelAllowed: true,
      achievements: true,
    },
  });

  if (!user || !user.isActive) {
    return c.json({ success: false, error: "User not found or inactive" }, 404);
  }

  const authHeader = c.req.header("authorization") || c.req.header("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  const token = getCookie(c, "access_token") || bearerToken;

  return c.json({
    success: true,
    user,
    token: token || undefined,
  });
});
