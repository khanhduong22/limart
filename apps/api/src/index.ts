import { app } from "./app";
import { prisma } from "@checkin/db";
import { getRedisClient } from "./lib/cache";
import { setupGracefulShutdown } from "@checkin/zero-downtime-deploy";
import type { ServerType } from "@hono/node-server";
export { documentsRoute } from "./routes/documents.route";
export { staffTasksRoute } from "./routes/staff-tasks.route";
export { managerTasksRoute } from "./routes/manager-tasks.route";
export { tasksRoute } from "./routes/tasks.route";
export { specialDaysRoute } from "./routes/special-days.route";
export { cronRoute } from "./routes/cron.route";
export { demoRoute } from "./routes/demo.route";
import { isDemoSandboxEnabled, seedAndSanitizeDemoDatabase } from "./lib/demo-sandbox";

const port = Number(process.env.PORT) || 4000;
let server: ServerType | null = null;

if (typeof (globalThis as any).Bun === "undefined" && process.env.NODE_ENV !== "test") {
  import("@hono/node-server").then(({ serve }) => {
    server = serve({
      fetch: app.fetch,
      port,
    });
    console.log(`[Checkin API] Running on Node.js at port ${port}`);
  });
} else {
  console.log(`[Checkin API] Running on Bun at port ${port}`);
}

// Bootstrap hook:
// - When DEMO_SANDBOX_MODE === "true", seed & sanitize the isolated demo database on startup
// - When DEMO_SANDBOX_MODE !== "true", ensure phuckhanh22 has PARTNER role, staffTasksAllowed enabled, and clear old work shifts
if (process.env.NODE_ENV !== "test") {
  if (isDemoSandboxEnabled()) {
    seedAndSanitizeDemoDatabase({ force: false })
      .then((res) => {
        console.log(
          `[Demo Sandbox] Startup check completed (skipped=${res.skipped}, users=${res.usersSeeded})`
        );
      })
      .catch((err) => {
        console.error("[Demo Sandbox] Error initializing demo database:", err);
      });
  } else if (prisma?.user?.findMany) {
    prisma.user
      .findMany({
        where: {
          OR: [
            { email: { contains: "phuckhanh22", mode: "insensitive" } },
            { name: { contains: "phuckhanh22", mode: "insensitive" } },
            { name: { contains: "Phúc Khánh", mode: "insensitive" } },
            { name: { contains: "Phuc Khanh", mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, email: true },
      })
      .then(async (users) => {
        if (!users || users.length === 0) return;

        const userIds = users.map((u) => u.id);
        const updateRes = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { role: "PARTNER", staffTasksAllowed: true },
        });
        if (updateRes && updateRes.count > 0) {
          console.log(
            `[Checkin API] Synced PARTNER role for phuckhanh22 (${updateRes.count} account(s) updated)`
          );
        }

        for (const u of users) {
          if (prisma.shiftDuty?.deleteMany) {
            await prisma.shiftDuty.deleteMany({ where: { userId: u.id } }).catch(() => {});
          }
          if (prisma.workShift?.deleteMany) {
            const res = await prisma.workShift.deleteMany({ where: { userId: u.id } });
            if (res && res.count > 0) {
              console.log(
                `[Checkin API] Cleared all work shifts for Phuc Khanh (${res.count} shifts removed)`
              );
            }
          }
        }
      })
      .catch((err) => {
        console.error("[Checkin API] Error syncing phuckhanh22 partner role / clearing shifts:", err);
      });
  }
}

export const shutdownController = setupGracefulShutdown({
  server: () => server,
  timeoutMs: 10000,
  onShutdown: async () => {
    // 1. Disconnect Prisma
    try {
      await prisma.$disconnect();
      console.log("[Checkin API] Prisma disconnected.");
    } catch (dbErr) {
      console.error("[Checkin API] Error disconnecting Prisma:", dbErr);
    }

    // 2. Disconnect Redis
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.quit();
        console.log("[Checkin API] Redis disconnected.");
      }
    } catch (redisErr) {
      console.error("[Checkin API] Error disconnecting Redis:", redisErr);
    }
  },
  autoRegister: true,
});

export async function gracefulShutdown(
  signal: string,
  exitFn: (code: number) => void = process.exit
) {
  return shutdownController.triggerShutdown(signal, exitFn);
}

export function getServer(): ServerType | null {
  return server;
}

export function setServer(s: ServerType | null) {
  server = s;
}

export default {
  port,
  fetch: app.fetch,
};
