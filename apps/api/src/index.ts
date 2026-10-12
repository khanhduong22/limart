import { app } from "./app";
import { prisma } from "@checkin/db";
import { getRedisClient } from "./lib/cache";
import { setupGracefulShutdown } from "@checkin/zero-downtime-deploy";
import type { ServerType } from "@hono/node-server";
export { documentsRoute } from "./routes/documents.route";
export { staffTasksRoute } from "./routes/staff-tasks.route";
export { managerTasksRoute } from "./routes/manager-tasks.route";
export { tasksRoute } from "./routes/tasks.route";
export { cronRoute } from "./routes/cron.route";

const port = Number(process.env.PORT) || 4000;
let server: ServerType | null = null;

if (typeof (globalThis as any).Bun === "undefined") {
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

// Bootstrap hook: ensure phuckhanh22 has PARTNER role and staffTasksAllowed enabled
if (process.env.NODE_ENV !== "test" && prisma?.user?.updateMany) {
  prisma.user
    .updateMany({
      where: {
        OR: [
          { email: { contains: "phuckhanh22", mode: "insensitive" } },
          { name: { contains: "phuckhanh22", mode: "insensitive" } },
        ],
      },
      data: { role: "PARTNER", staffTasksAllowed: true },
    })
    .then((res) => {
      if (res && res.count > 0) {
        console.log(`[Checkin API] Synced PARTNER role for phuckhanh22 (${res.count} account(s) updated)`);
      }
    })
    .catch((err) => {
      console.error("[Checkin API] Error syncing phuckhanh22 partner role:", err);
    });
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
