import { Context, Next } from "hono";
import * as dbModule from "@checkin/db";
import {
  DEFAULT_TENANT_ID as BASE_DEFAULT_TENANT_ID,
  getCurrentTenantId as baseGetCurrentTenantId,
  runWithTenant as baseRunWithTenant,
} from "../../../../packages/db/src/tenant-context";

function getSafeDbExport<T>(key: string): T | undefined {
  try {
    return (dbModule as Record<string, any>)[key] as T;
  } catch {
    return undefined;
  }
}

export const DEFAULT_TENANT_ID: string =
  getSafeDbExport<string>("DEFAULT_TENANT_ID") || BASE_DEFAULT_TENANT_ID || "limart";

const TENANT_ID_REGEX = /^[a-z0-9_-]{2,40}$/;
const SUBDOMAIN_HOST_REGEX = /^([a-z0-9-]+)\.limart\.vn$/;

export function getCurrentTenantId(): string {
  const dbGet = getSafeDbExport<() => string>("getCurrentTenantId");
  if (typeof dbGet === "function" && dbGet !== baseGetCurrentTenantId) {
    try {
      const val = dbGet();
      if (val && val !== DEFAULT_TENANT_ID) {
        return val;
      }
    } catch {
      // Fallback to base tenant-context storage
    }
  }
  return baseGetCurrentTenantId();
}

export function runWithTenant<T>(
  tenantId: string,
  fn: () => T,
  options?: { enforceIsolation?: boolean }
): T {
  const normalized =
    tenantId && TENANT_ID_REGEX.test(tenantId.trim().toLowerCase())
      ? tenantId.trim().toLowerCase()
      : DEFAULT_TENANT_ID;

  const dbRun = getSafeDbExport<typeof baseRunWithTenant>("runWithTenant");
  if (typeof dbRun === "function" && dbRun !== baseRunWithTenant) {
    try {
      return dbRun(normalized, () => baseRunWithTenant(normalized, fn, options), options);
    } catch {
      // Fallback to base tenant-context storage
    }
  }
  return baseRunWithTenant(normalized, fn, options);
}

/**
 * Resolves the active tenant ID from the incoming request:
 * 1. Explicit `X-Tenant-Id` / `x-tenant-id` header (sanitized to `^[a-z0-9_-]{2,40}$`).
 * 2. Custom shop subdomain `<shop>.limart.vn` (excluding `www` and `api`).
 * 3. Default tenant `"limart"`.
 */
export function resolveRequestTenantId(c: Context): string {
  const rawHeader = c.req.header("x-tenant-id") || c.req.header("X-Tenant-Id");
  if (rawHeader) {
    const candidate = rawHeader.trim().toLowerCase();
    if (TENANT_ID_REGEX.test(candidate)) {
      return candidate;
    }
  }

  const rawHost = c.req.header("host") || c.req.header("Host");
  if (rawHost) {
    const hostname = rawHost.split(":")[0].trim().toLowerCase();
    const match = SUBDOMAIN_HOST_REGEX.exec(hostname);
    if (match) {
      const subdomain = match[1];
      if (subdomain !== "www" && subdomain !== "api" && TENANT_ID_REGEX.test(subdomain)) {
        return subdomain;
      }
    }
  }

  return DEFAULT_TENANT_ID;
}

export async function tenantMiddleware(c: Context, next: Next) {
  const tenantId = resolveRequestTenantId(c);
  c.header("X-Tenant-Id", tenantId);
  return runWithTenant(tenantId, () => next());
}
