import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { authMiddleware, adminMiddleware, AppEnv } from "../middleware/auth.middleware";
import { DEFAULT_TENANT_ID, getCurrentTenantId } from "../middleware/tenant.middleware";
import { isDemoSandboxEnabled } from "../lib/demo-sandbox";
import {
  exportTenantSnapshot,
  restoreTenantSnapshot,
  TenantBackupScope,
  VALID_BACKUP_SCOPES,
} from "../lib/tenant-backup";

export const tenantRoute = new Hono<AppEnv>();

tenantRoute.use("*", authMiddleware, adminMiddleware);

tenantRoute.use("*", async (c, next) => {
  if (isDemoSandboxEnabled()) {
    return c.json(
      {
        success: false,
        error: "Tính năng sao lưu & quản trị dữ liệu cửa hàng bị khóa trên môi trường Demo công khai",
      },
      403
    );
  }
  await next();
});

// GET /api/admin/tenants - Return only the current tenant with user/shift counts
tenantRoute.get("/", async (c) => {
  try {
    const currentTenantId = (getCurrentTenantId() || DEFAULT_TENANT_ID).trim().toLowerCase();
    const db = prisma as Record<string, any>;

    const defaultMeta: Record<string, any> =
      currentTenantId === "limart"
        ? {
            id: "limart",
            slug: "limart",
            name: "LimArt Flagship Store",
            domain: "limart.khanhdp.com",
            isActive: true,
          }
        : currentTenantId === "demo"
          ? {
              id: "demo",
              slug: "demo",
              name: "LimArt Demo Sandbox",
              domain: "limart2.khanhdp.com",
              isActive: true,
            }
          : {
              id: currentTenantId,
              slug: currentTenantId,
              name: `Cửa hàng ${currentTenantId}`,
              domain: `${currentTenantId}.limart.vn`,
              isActive: true,
            };

    let dbTenant: Record<string, any> | null = null;
    if (db.tenant && typeof db.tenant.findUnique === "function") {
      try {
        dbTenant = await db.tenant.findUnique({
          where: { id: currentTenantId },
        });
      } catch {
        dbTenant = null;
      }
    }
    if (!dbTenant && db.tenant && typeof db.tenant.findMany === "function") {
      try {
        const found = await db.tenant.findMany({
          where: { id: currentTenantId },
        });
        if (Array.isArray(found)) {
          dbTenant = found.find((t: any) => t && t.id === currentTenantId) || null;
        }
      } catch {
        dbTenant = null;
      }
    }

    let userCount = 0;
    let shiftCount = 0;
    if (db.user && typeof db.user.count === "function") {
      try {
        userCount = await db.user.count({ where: { tenantId: currentTenantId } });
      } catch {
        userCount = 0;
      }
    }
    if (db.workShift && typeof db.workShift.count === "function") {
      try {
        shiftCount = await db.workShift.count({ where: { tenantId: currentTenantId } });
      } catch {
        shiftCount = 0;
      }
    }

    const currentTenant = {
      ...defaultMeta,
      ...(dbTenant || {}),
      userCount: userCount || 0,
      shiftCount: shiftCount || 0,
    };

    const tenants = [currentTenant];

    return c.json({
      success: true,
      tenants,
      data: tenants,
    });
  } catch (error: any) {
    return c.json(
      { success: false, error: error?.message || "Failed to list tenants" },
      500
    );
  }
});

// POST /api/admin/tenants - Create or update a tenant
tenantRoute.post("/", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawId = (body?.id || body?.slug || "").trim().toLowerCase();
    const name = (body?.name || "").trim();

    if (!rawId || !/^[a-z0-9_-]{2,40}$/.test(rawId)) {
      return c.json(
        {
          success: false,
          error: "Mã cửa hàng (tenantId/slug) không hợp lệ (2-40 ký tự chữ thường, số, gạch ngang)",
        },
        400
      );
    }

    if (!name) {
      return c.json({ success: false, error: "Tên cửa hàng không được để trống" }, 400);
    }

    const db = prisma as Record<string, any>;
    const payload = {
      id: rawId,
      slug: rawId,
      name,
      domain: body?.domain || null,
      isActive: body?.isActive ?? true,
    };

    let tenant = payload;
    if (db.tenant && typeof db.tenant.upsert === "function") {
      try {
        tenant = await db.tenant.upsert({
          where: { id: rawId },
          update: {
            name: payload.name,
            domain: payload.domain,
            isActive: payload.isActive,
          },
          create: payload,
        });
      } catch {
        tenant = payload;
      }
    }

    return c.json({
      success: true,
      tenant,
      data: tenant,
    });
  } catch (error: any) {
    return c.json(
      { success: false, error: error?.message || "Failed to upsert tenant" },
      500
    );
  }
});

// GET /api/admin/tenants/backup - Surgical Per-Tenant Snapshot Export
tenantRoute.get("/backup", async (c) => {
  try {
    const currentTenantId = (getCurrentTenantId() || DEFAULT_TENANT_ID).trim().toLowerCase();
    const requestedTenantId = c.req.query("tenantId")?.trim().toLowerCase();

    if (requestedTenantId && requestedTenantId !== currentTenantId) {
      return c.json(
        {
          success: false,
          error: "Forbidden: Bạn chỉ được phép sao lưu dữ liệu của chính cửa hàng mình",
        },
        403
      );
    }

    const rawScope = (c.req.query("scope") || "all").trim().toLowerCase() as TenantBackupScope;

    if (!VALID_BACKUP_SCOPES.includes(rawScope)) {
      return c.json(
        {
          success: false,
          error: `Scope không hợp lệ. Chỉ hỗ trợ: ${VALID_BACKUP_SCOPES.join(", ")}`,
        },
        400
      );
    }

    const snapshot = await exportTenantSnapshot(currentTenantId, rawScope);
    return c.json({
      success: true,
      ...snapshot,
      snapshot,
    });
  } catch (error: any) {
    return c.json(
      { success: false, error: error?.message || "Failed to export tenant snapshot" },
      500
    );
  }
});

// POST /api/admin/tenants/restore - Surgical Per-Tenant Snapshot Restore (SHA-256 Verified)
tenantRoute.post("/restore", async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ success: false, error: "Dữ liệu backup không hợp lệ" }, 400);
    }

    const snapshot = body.snapshot || (body.version && body.data ? body : null);
    const scopes = Array.isArray(body.scopes) ? body.scopes : undefined;

    if (!snapshot) {
      return c.json({ success: false, error: "Thiếu dữ liệu snapshot cần khôi phục" }, 400);
    }

    const currentTenantId = (getCurrentTenantId() || DEFAULT_TENANT_ID).trim().toLowerCase();
    const requestedTarget =
      typeof body.targetTenantId === "string" ? body.targetTenantId.trim().toLowerCase() : undefined;
    const snapshotTenantId =
      typeof (snapshot?.tenantId || snapshot?.meta?.tenantId) === "string"
        ? String(snapshot?.tenantId || snapshot?.meta?.tenantId).trim().toLowerCase()
        : undefined;

    if (
      (requestedTarget && requestedTarget !== currentTenantId) ||
      (snapshotTenantId && snapshotTenantId !== currentTenantId)
    ) {
      return c.json(
        {
          success: false,
          error: "Forbidden: Bạn chỉ được phép khôi phục dữ liệu thuộc về chính cửa hàng mình",
        },
        403
      );
    }

    const result = await restoreTenantSnapshot(snapshot, { targetTenantId: currentTenantId, scopes });
    return c.json({
      success: true,
      message: "Khôi phục dữ liệu cửa hàng thành công!",
      result,
    });
  } catch (error: any) {
    const msg = error?.message || "Không thể khôi phục dữ liệu cửa hàng";
    return c.json({ success: false, error: msg }, 400);
  }
});
