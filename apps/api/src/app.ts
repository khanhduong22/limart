import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { healthRoute } from "./routes/health.route";
import { authRoute } from "./routes/auth.route";
import { ipStatusRoute } from "./routes/ip-status.route";
import { staffRoute } from "./routes/staff.route";
import { checkinsRoute } from "./routes/checkins.route";
import { gachaRoute } from "./routes/gacha.route";
import { luckyWheelRoute } from "./routes/lucky-wheel.route";
import { scheduleRoute } from "./routes/schedule.route";
import { shiftsRoute } from "./routes/shifts.route";
import { payrollRoute } from "./routes/payroll.route";
import { requestsRoute } from "./routes/requests.route";
import { adminRoute } from "./routes/admin.route";
import { documentsRoute } from "./routes/documents.route";
import { staffTasksRoute } from "./routes/staff-tasks.route";
import { managerTasksRoute } from "./routes/manager-tasks.route";
import { tasksRoute } from "./routes/tasks.route";
import { specialDaysRoute } from "./routes/special-days.route";
import { cronRoute } from "./routes/cron.route";
import { authMiddleware, AppEnv } from "./middleware/auth.middleware";
import { serverTiming } from "./middleware/server-timing.middleware";
import { prisma } from "@checkin/db";
import { getOrSetCache } from "./lib/cache";

export function createApp() {
  const app = new Hono<AppEnv>();

  // 1. HTTP Security Headers Hardening
  app.use(
    "*",
    secureHeaders({
      xFrameOptions: "SAMEORIGIN",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
      xXssProtection: "1; mode=block",
    })
  );

  // 2. Request Correlation ID
  app.use(
    "*",
    requestId({
      headerName: "X-Request-Id",
    })
  );

  // 3. Request Logger with Correlation ID
  app.use("*", async (c, next) => {
    const reqId = c.var.requestId || c.get("requestId");
    const start = Date.now();
    console.log(`<-- ${c.req.method} ${c.req.path} [${reqId}]`);
    await next();
    const elapsed = Date.now() - start;
    console.log(`--> ${c.req.method} ${c.req.path} ${c.res.status} ${elapsed}ms [${reqId}]`);
  });

  // 4. CORS
  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie", "X-Request-Id", "If-None-Match"],
      exposeHeaders: ["ETag", "Server-Timing"],
    })
  );

  // 5. Server-Timing APM & Network Waterfall Visibility
  app.use("*", serverTiming());

  // 6. Response Compression (Gzip / Deflate for Accept-Encoding)
  app.use("*", compress());

  // 7. ETag & HTTP Response Optimization (RFC 7232 304 Not Modified)
  app.use("*", etag());

  // Global Error Handler
  app.onError((err, c) => {
    const reqId = c.var.requestId || c.get("requestId");
    console.error(`[API Error][${reqId}]`, err);
    return c.json(
      {
        success: false,
        error: err.message || "Internal Server Error",
        requestId: reqId,
      },
      500
    );
  });

  // Mount Health & Core Routes
  app.route("/health", healthRoute);
  app.route("/api/auth", authRoute);

  // Route alias: GET /api/me directly
  app.get("/api/me", authMiddleware, async (c) => {
    const tokenPayload = c.get("user");
    const user = await getOrSetCache(`user:me:${tokenPayload.sub}`, 120, async () => {
      return prisma.user.findUnique({
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

  // Task submit alias: POST /api/packing/submit
  app.post("/api/packing/submit", authMiddleware, async (c) => {
    try {
      const tokenPayload = c.get("user");
      const userId = tokenPayload.sub;
      const body = await c.req.json().catch(() => ({}));
      const { taskDefId, quantity, note, evidenceLink } = body;

      if (!taskDefId) {
        return c.json({ success: false, error: "Thiếu Task ID" }, 400);
      }

      const taskDef = await prisma.taskDefinition.findUnique({
        where: { id: taskDefId },
      });

      if (!taskDef || !taskDef.active) {
        return c.json({ success: false, error: "Task definition not found or inactive" }, 404);
      }

      const userTask = await prisma.userTask.create({
        data: {
          userId,
          taskDefId,
          unitPrice: taskDef.baseReward,
          status: "SUBMITTED",
          submittedAt: new Date(),
          quantity: quantity || 1,
          note: note || "",
          evidenceLink: evidenceLink || "",
        },
      });

      return c.json({ success: true, data: { id: userTask.id } });
    } catch (error: any) {
      return c.json({ success: false, error: error?.message || "Failed to submit task" }, 500);
    }
  });

  // Staff & Functional Routes
  app.route("/api/ip-status", ipStatusRoute);
  app.route("/api/staff", staffRoute);
  app.route("/api/checkins", checkinsRoute);
  app.route("/api/gacha", gachaRoute);
  app.route("/api/lucky-wheel", luckyWheelRoute);
  app.route("/api/schedule", scheduleRoute);
  app.route("/api/shift-duties", shiftsRoute);
  app.route("/api/payroll", payrollRoute);
  app.route("/api/requests", requestsRoute);
  app.route("/api/special-days", specialDaysRoute);

  // Admin Routes
  app.route("/api/admin", adminRoute);
  app.route("/api/tasks", tasksRoute);
  app.route("/api/staff-tasks", staffTasksRoute);
  app.route("/api/manager-tasks", managerTasksRoute);

  // Documents & Knowledge Base Routes
  app.route("/api/documents", documentsRoute);
  app.route("/documents", documentsRoute);
  app.route("/api/chat", documentsRoute);

  // Scheduled Background & Cron Routes
  app.route("/api/cron", cronRoute);

  // Text-To-Speech endpoint for Capy AI
  app.post("/api/tts", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const text = body?.text;
      if (!text?.trim()) {
        return c.json({ error: "No text provided" }, 400);
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return c.json({ error: "GEMINI_API_KEY not set" }, 500);
      }
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Kore" },
                },
              },
            },
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return c.json({ error: (err as any)?.error?.message || "TTS failed" }, response.status as any);
      }
      const data = (await response.json()) as any;
      const audioBase64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || "audio/wav";
      if (!audioBase64) {
        return c.json({ error: "No audio in response" }, 500);
      }
      const audioBuffer = Buffer.from(audioBase64, "base64");
      return c.body(audioBuffer, 200, {
        "Content-Type": mimeType,
        "Content-Length": audioBuffer.length.toString(),
      });
    } catch (err: any) {
      return c.json({ error: err?.message || "TTS failed" }, 500);
    }
  });

  // Fallback 404
  app.notFound((c) => {
    return c.json({ success: false, error: "Route not found" }, 404);
  });

  return app;
}

export const app = createApp();
