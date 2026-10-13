import type { MiddlewareHandler } from "hono";

export const serverTiming = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = performance.now();
    await next();
    const duration = performance.now() - start;
    // Set Server-Timing header
    if (c.res && c.res.headers) {
      const existing = c.res.headers.get("Server-Timing");
      const entry = `total;dur=${duration.toFixed(2)};desc="Total Hono Request"`;
      c.res.headers.set("Server-Timing", existing ? `${existing}, ${entry}` : entry);
    }
  };
};
