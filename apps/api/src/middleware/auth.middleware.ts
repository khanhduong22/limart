import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyAccessToken, TokenPayload } from "../lib/auth";

export interface AuthContextVariables {
  user: TokenPayload;
  requestId: string;
}

export type AppEnv = {
  Variables: AuthContextVariables;
};

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  let token = getCookie(c, "access_token");
  if (!token) {
    const authHeader = c.req.header("authorization") || c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }
  if (!token) {
    return c.json({ success: false, error: "Unauthorized: Missing authentication credentials" }, 401);
  }
  const payload = await verifyAccessToken(token);
  if (!payload) {
    return c.json({ success: false, error: "Unauthorized: Session expired or invalid" }, 401);
  }
  c.set("user", payload);
  await next();
}

export async function adminMiddleware(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");
  if (!user || user.role !== "ADMIN") {
    return c.json(
      { success: false, error: "Forbidden: Admin access required" },
      403
    );
  }
  await next();
}
