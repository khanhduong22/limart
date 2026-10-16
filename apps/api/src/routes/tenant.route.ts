import { Hono } from "hono";
import { prisma } from "@checkin/db";
import { authMiddleware, adminMiddleware, AppEnv } from "../middleware/auth.middleware";
import { DEFAULT_TENANT_ID, getCurrentTenantId } from "../middleware/tenant.middleware";
import {
  exportTenantSnapshot,
  restoreTenantSnapshot,
  TenantBackupScope,
  VALID_BACKUP_SCOPES,
} from "../lib/tenant-backup";

export const tenantRoute = new Hono<AppEnv>();

tenantRoute.use("*", authMiddleware, adminMiddleware);

// GET /api/admin/tenants - List all registered tenants (auto-including "limart" and "demo") with user/shift counts
tenantRoute.get("/", async (c) => {
  try {
    const db = prisma as Record<string, any>;
    let dbTenants: Record<string, any>[] = [];

    if (db.tenant && typeof db.tenant.findMany === "function") {
      try {
        const found = await db.tenant.findMany({
          orderBy: { createdAt: "asc" },
        });
        if (Array.isArray(found)) {
          dbTenants = found;
        }
      } catch {
        dbTenants = [];
      }
    }

    const tenantMap = new Map<string, Record<string, any>>();
    tenantMap.set("limart", {
      id: "limart",
      slug: "limart",
      name: "LimArt Flagship Store",
      domain: "limart.khanhdp.com",
      isActive: true,
    });
    tenantMap.set("demo", {
      id: "demo",
      slug: "demo",
      name: "LimArt Demo Sandbox",
      domain: "limart2.khanhdp.com",
      isActive: true,
    });

    for (const t of dbTenants) {
      if (t && t.id) {
        tenantMap.set(t.id, {
          ...tenantMap.get(t.id),
          ...t,
        });
      }
    }

    const tenants = await Promise.all(
      Array.from(tenantMap.values()).map(async (t) => {
        let userCount = 0;
        let shiftCount = 0;
        if (db.user && typeof db.user.count === "function") {
          try {
            userCount = await db.user.count({ where: { tenantId: t.id } });
          } catch {
            userCount = 0;
          }
        }
        if (db.workShift && typeof db.workShift.count === "function") {
          try {
            shiftCount = await db.workShift.count({ where: { tenantId: t.id } });
          } catch {
            shiftCount = 0;
          }
        }
        return {
          ...t,
          userCount: userCount || 0,
          shiftCount: shiftCount || 0,
        };
      })
    );

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
    const tenantId = (
      c.req.query("tenantId") ||
      getCurrentTenantId() ||
      DEFAULT_TENANT_ID
    )
      .trim()
      .toLowerCase();
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

    const snapshot = await exportTenantSnapshot(tenantId, rawScope);
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
    const targetTenantId = body.targetTenantId || undefined;
    const scopes = Array.isArray(body.scopes) ? body.scopes : undefined;

    if (!snapshot) {
      return c.json({ success: false, error: "Thiếu dữ liệu snapshot cần khôi phục" }, 400);
    }

    const result = await restoreTenantSnapshot(snapshot, { targetTenantId, scopes });
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
