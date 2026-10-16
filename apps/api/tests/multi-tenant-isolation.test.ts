import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockTenantFindMany,
  mockTenantFindUnique,
  mockTenantUpsert,
  mockUserCount,
  mockUserFindMany,
  mockWorkShiftCount,
  mockWorkShiftFindMany,
  mockWorkShiftUpsert,
  mockWorkShiftCreate,
  mockShiftDutyFindMany,
  mockShiftDutyUpsert,
  mockDocumentFindMany,
  mockDocumentUpsert,
  mockAnnouncementFindMany,
  mockAnnouncementUpsert,
  mockTaskDefFindMany,
  mockTaskDefUpsert,
  mockTaskItemFindMany,
  mockTaskItemUpsert,
  mockChecklistFindMany,
  mockChecklistUpsert,
  mockWeeklyFindMany,
  mockWeeklyUpsert,
  mockHolidayFindMany,
  mockHolidayUpsert,
  mockAllowedIPFindMany,
  mockAllowedIPUpsert,
  mockAllowedIPCreate,
  mockPrismaObj,
} = vi.hoisted(() => {
  const mocks = {
    mockTenantFindMany: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockTenantUpsert: vi.fn(),
    mockUserCount: vi.fn(),
    mockUserFindMany: vi.fn(),
    mockWorkShiftCount: vi.fn(),
    mockWorkShiftFindMany: vi.fn(),
    mockWorkShiftUpsert: vi.fn(),
    mockWorkShiftCreate: vi.fn(),
    mockShiftDutyFindMany: vi.fn(),
    mockShiftDutyUpsert: vi.fn(),
    mockDocumentFindMany: vi.fn(),
    mockDocumentUpsert: vi.fn(),
    mockAnnouncementFindMany: vi.fn(),
    mockAnnouncementUpsert: vi.fn(),
    mockTaskDefFindMany: vi.fn(),
    mockTaskDefUpsert: vi.fn(),
    mockTaskItemFindMany: vi.fn(),
    mockTaskItemUpsert: vi.fn(),
    mockChecklistFindMany: vi.fn(),
    mockChecklistUpsert: vi.fn(),
    mockWeeklyFindMany: vi.fn(),
    mockWeeklyUpsert: vi.fn(),
    mockHolidayFindMany: vi.fn(),
    mockHolidayUpsert: vi.fn(),
    mockAllowedIPFindMany: vi.fn(),
    mockAllowedIPUpsert: vi.fn(),
    mockAllowedIPCreate: vi.fn(),
  };

  const prismaObj: Record<string, any> = {
    tenant: {
      findMany: mocks.mockTenantFindMany,
      findUnique: mocks.mockTenantFindUnique,
      upsert: mocks.mockTenantUpsert,
    },
    user: {
      count: mocks.mockUserCount,
      findMany: mocks.mockUserFindMany,
    },
    workShift: {
      count: mocks.mockWorkShiftCount,
      findMany: mocks.mockWorkShiftFindMany,
      upsert: mocks.mockWorkShiftUpsert,
      create: mocks.mockWorkShiftCreate,
    },
    shiftDuty: {
      findMany: mocks.mockShiftDutyFindMany,
      upsert: mocks.mockShiftDutyUpsert,
    },
    document: {
      findMany: mocks.mockDocumentFindMany,
      upsert: mocks.mockDocumentUpsert,
    },
    announcement: {
      findMany: mocks.mockAnnouncementFindMany,
      upsert: mocks.mockAnnouncementUpsert,
    },
    taskDefinition: {
      findMany: mocks.mockTaskDefFindMany,
      upsert: mocks.mockTaskDefUpsert,
    },
    taskItem: {
      findMany: mocks.mockTaskItemFindMany,
      upsert: mocks.mockTaskItemUpsert,
    },
    managerChecklistTask: {
      findMany: mocks.mockChecklistFindMany,
      upsert: mocks.mockChecklistUpsert,
    },
    managerWeeklyTask: {
      findMany: mocks.mockWeeklyFindMany,
      upsert: mocks.mockWeeklyUpsert,
    },
    holiday: {
      findMany: mocks.mockHolidayFindMany,
      upsert: mocks.mockHolidayUpsert,
    },
    allowedIP: {
      findMany: mocks.mockAllowedIPFindMany,
      upsert: mocks.mockAllowedIPUpsert,
      create: mocks.mockAllowedIPCreate,
    },
    $transaction: vi.fn(async (cb: any) => cb(prismaObj)),
  };

  return { ...mocks, mockPrismaObj: prismaObj };
});

vi.mock("@checkin/db", () => ({
  prisma: mockPrismaObj,
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import {
  resolveTenantCacheKey,
  getOrSetCache,
  invalidateCache,
  invalidateCachePattern,
  setRedisClient,
} from "../src/lib/cache";
import {
  runWithTenant,
  getCurrentTenantId,
  DEFAULT_TENANT_ID,
} from "../src/middleware/tenant.middleware";

describe("Multi-Tenant Isolation, Cache Scoping & Surgical Snapshot Backup/Restore", () => {
  let adminToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await signAccessToken({
      sub: "admin-1",
      email: "admin@limart.vn",
      role: "ADMIN",
      name: "Admin LimArt",
    });

    mockTenantFindMany.mockResolvedValue([
      {
        id: "shop-b",
        slug: "shop-b",
        name: "LimArt Chi Nhánh Quận 7",
        domain: "shop-b.limart.vn",
        isActive: true,
      },
    ]);
    mockTenantFindUnique.mockImplementation(async ({ where }: any) => {
      if (where?.id === "shop-b") {
        return {
          id: "shop-b",
          slug: "shop-b",
          name: "LimArt Chi Nhánh Quận 7",
          isActive: true,
        };
      }
      return null;
    });
    mockTenantUpsert.mockImplementation(async ({ create }: any) => create);
    mockUserCount.mockResolvedValue(5);
    mockWorkShiftCount.mockResolvedValue(12);
    mockUserFindMany.mockResolvedValue([
      {
        id: "user-b1",
        name: "Nhân viên Q7",
        email: "nvb1@limart.vn",
        role: "USER",
        employmentType: "PART_TIME",
        hourlyRate: 25000,
        monthlySalary: 0,
        isActive: true,
        tenantId: "shop-b",
      },
    ]);
    mockWorkShiftFindMany.mockResolvedValue([
      {
        id: 101,
        userId: "user-b1",
        start: "2026-10-16T01:00:00.000Z",
        end: "2026-10-16T05:00:00.000Z",
        shiftType: "MORNING",
        status: "APPROVED",
        tenantId: "shop-b",
      },
    ]);
    mockShiftDutyFindMany.mockResolvedValue([
      {
        id: "duty-b1",
        shiftId: 101,
        userId: "user-b1",
        createdById: "admin-1",
        date: "2026-10-16T00:00:00.000Z",
        title: "Kiểm kê quầy kệ Q7",
        isCompleted: false,
        tenantId: "shop-b",
      },
    ]);
    mockDocumentFindMany.mockResolvedValue([
      {
        id: "doc-b1",
        path: "/sop-q7",
        title: "SOP Chi Nhánh Quận 7",
        content: "Quy trình đóng gói tại Quận 7",
        tenantId: "shop-b",
      },
    ]);
    mockAnnouncementFindMany.mockResolvedValue([]);
    mockTaskDefFindMany.mockResolvedValue([]);
    mockTaskItemFindMany.mockResolvedValue([]);
    mockChecklistFindMany.mockResolvedValue([]);
    mockWeeklyFindMany.mockResolvedValue([]);
    mockHolidayFindMany.mockResolvedValue([
      {
        id: "hol-b1",
        date: "2026-09-02T00:00:00.000Z",
        name: "Quốc Khánh 2/9",
        multiplier: 2.0,
        tenantId: "shop-b",
      },
    ]);
    mockAllowedIPFindMany.mockResolvedValue([
      {
        id: 11,
        prefix: "118.69.10.",
        label: "WiFi Chi Nhánh Q7",
        tenantId: "shop-b",
      },
    ]);

    mockWorkShiftUpsert.mockResolvedValue({});
    mockWorkShiftCreate.mockResolvedValue({});
    mockShiftDutyUpsert.mockResolvedValue({});
    mockDocumentUpsert.mockResolvedValue({});
    mockHolidayUpsert.mockResolvedValue({});
    mockAllowedIPUpsert.mockResolvedValue({});
    mockAllowedIPCreate.mockResolvedValue({});
  });

  it("1. resolveTenantCacheKey keeps 'limart' unprefixed and prefixes non-default tenants with 'tenant:<id>:'", async () => {
    expect(getCurrentTenantId()).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantCacheKey("admin:dashboard:2026-10-16")).toBe(
      "admin:dashboard:2026-10-16"
    );

    await runWithTenant("limart", async () => {
      expect(resolveTenantCacheKey("shifts:my-shifts:u1")).toBe("shifts:my-shifts:u1");
    });

    await runWithTenant("shop-b", async () => {
      expect(getCurrentTenantId()).toBe("shop-b");
      expect(resolveTenantCacheKey("admin:dashboard:2026-10-16")).toBe(
        "tenant:shop-b:admin:dashboard:2026-10-16"
      );
      // Idempotent if already prefixed
      expect(resolveTenantCacheKey("tenant:shop-b:admin:dashboard:2026-10-16")).toBe(
        "tenant:shop-b:admin:dashboard:2026-10-16"
      );
    });
  });

  it("2. Valkey getOrSetCache, invalidateCache & invalidateCachePattern isolate keys per tenant", async () => {
    const store = new Map<string, string>();
    const mockRedis: any = {
      status: "ready",
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      setex: vi.fn(async (k: string, _ttl: number, val: string) => {
        store.set(k, val);
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        for (const k of keys) store.delete(k);
        return keys.length;
      }),
      keys: vi.fn(async (pattern: string) => {
        const prefix = pattern.replace(/\*$/, "");
        return Array.from(store.keys()).filter((k) => k.startsWith(prefix));
      }),
    };
    setRedisClient(mockRedis);

    try {
      const limartVal = await runWithTenant("limart", () =>
        getOrSetCache("stats:overview", 60, async () => ({ shop: "limart", revenue: 100 }))
      );
      const shopBVal = await runWithTenant("shop-b", () =>
        getOrSetCache("stats:overview", 60, async () => ({ shop: "shop-b", revenue: 250 }))
      );

      expect(limartVal).toEqual({ shop: "limart", revenue: 100 });
      expect(shopBVal).toEqual({ shop: "shop-b", revenue: 250 });
      expect(store.has("stats:overview")).toBe(true);
      expect(store.has("tenant:shop-b:stats:overview")).toBe(true);

      // Invalidating shop-b pattern must NOT clear limart's default cache key
      await runWithTenant("shop-b", () => invalidateCachePattern("stats:*"));
      expect(store.has("tenant:shop-b:stats:overview")).toBe(false);
      expect(store.has("stats:overview")).toBe(true);

      await runWithTenant("limart", () => invalidateCache("stats:overview"));
      expect(store.has("stats:overview")).toBe(false);
    } finally {
      setRedisClient(null);
    }
  });

  it("3. X-Tenant-Id header and <shop>.limart.vn subdomain propagate tenant context, echo X-Tenant-Id response header, and only return the current tenant", async () => {
    const resDefault = await app.request("/api/admin/tenants", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    expect(resDefault.status).toBe(200);
    expect(resDefault.headers.get("X-Tenant-Id")).toBe("limart");
    const defaultBody = await resDefault.json();
    expect(defaultBody.success).toBe(true);
    expect(defaultBody.tenants).toHaveLength(1);
    expect(defaultBody.tenants[0].id).toBe("limart");

    const resHeader = await app.request("/api/admin/tenants", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "X-Tenant-Id": "shop-b",
      },
    });
    expect(resHeader.status).toBe(200);
    expect(resHeader.headers.get("X-Tenant-Id")).toBe("shop-b");
    const body = await resHeader.json();
    expect(body.success).toBe(true);
    expect(body.tenants).toHaveLength(1);
    expect(body.tenants[0].id).toBe("shop-b");
    expect(body.tenants.some((t: any) => t.id === "limart")).toBe(false);
    expect(body.tenants.some((t: any) => t.id === "demo")).toBe(false);

    const resSubdomain = await app.request("http://shop-q3.limart.vn/api/admin/tenants", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Host: "shop-q3.limart.vn",
      },
    });
    expect(resSubdomain.status).toBe(200);
    expect(resSubdomain.headers.get("X-Tenant-Id")).toBe("shop-q3");
    const subBody = await resSubdomain.json();
    expect(subBody.tenants).toHaveLength(1);
    expect(subBody.tenants[0].id).toBe("shop-q3");
  });

  it("4. GET /api/admin/tenants/backup exports a valid SHA-256 signed snapshot for the current tenant", async () => {
    const res = await app.request("/api/admin/tenants/backup?tenantId=shop-b&scope=all", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "X-Tenant-Id": "shop-b",
      },
    });

    expect(res.status).toBe(200);
    const snapshot = await res.json();
    expect(snapshot.version).toBe("1.0");
    expect(snapshot.tenantId).toBe("shop-b");
    expect(snapshot.scope).toBe("all");
    expect(typeof snapshot.checksum).toBe("string");
    expect(snapshot.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.counts.users).toBe(1);
    expect(snapshot.counts.workShifts).toBe(1);
    expect(snapshot.counts.shiftDuties).toBe(1);
    expect(snapshot.counts.documents).toBe(1);
    expect(snapshot.counts.holidays).toBe(1);
    expect(snapshot.counts.allowedIps).toBe(1);
  });

  it("5. POST /api/admin/tenants/restore rejects tampered SHA-256 snapshots with 400 and restores valid snapshots cleanly", async () => {
    const backupRes = await app.request("/api/admin/tenants/backup?tenantId=shop-b&scope=all", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "X-Tenant-Id": "shop-b",
      },
    });
    const backupPayload = await backupRes.json();

    // Tamper with snapshot data without updating SHA-256 checksum
    const tamperedSnapshot = structuredClone(backupPayload.snapshot);
    tamperedSnapshot.data.documents[0].title = "HACKED SOP";

    const tamperedRes = await app.request("/api/admin/tenants/restore", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
        "X-Tenant-Id": "shop-b",
      },
      body: JSON.stringify({
        snapshot: tamperedSnapshot,
        targetTenantId: "shop-b",
      }),
    });

    expect(tamperedRes.status).toBe(400);
    const tamperedJson = await tamperedRes.json();
    expect(tamperedJson.success).toBe(false);
    expect(tamperedJson.error).toContain("SHA-256");

    // Restore valid untampered snapshot to same tenant
    const validRes = await app.request("/api/admin/tenants/restore", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
        "X-Tenant-Id": "shop-b",
      },
      body: JSON.stringify({
        snapshot: backupPayload.snapshot,
        targetTenantId: "shop-b",
      }),
    });

    expect(validRes.status).toBe(200);
    const validJson = await validRes.json();
    expect(validJson.success).toBe(true);
    expect(validJson.message).toBe("Khôi phục dữ liệu cửa hàng thành công!");
    expect(validJson.result.restoredTenantId).toBe("shop-b");
    expect(validJson.result.restoredCounts.workShifts).toBe(1);
    expect(validJson.result.restoredCounts.documents).toBe(1);
    expect(validJson.result.restoredCounts.holidays).toBe(1);
    expect(mockDocumentUpsert).toHaveBeenCalledTimes(1);
    expect(mockWorkShiftUpsert).toHaveBeenCalledTimes(1);
  });

  it("6. GET /api/admin/tenants/backup?tenantId=other-shop when current tenant is 'limart' returns 403 Forbidden", async () => {
    const res = await app.request("/api/admin/tenants/backup?tenantId=other-shop", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Forbidden");
  });

  it("7. POST /api/admin/tenants/restore with a snapshot from 'other-shop' when current tenant is 'limart' returns 403 Forbidden", async () => {
    const backupRes = await app.request("/api/admin/tenants/backup?tenantId=shop-b&scope=all", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "X-Tenant-Id": "shop-b",
      },
    });
    const backupPayload = await backupRes.json();
    const otherShopSnapshot = {
      ...structuredClone(backupPayload.snapshot),
      tenantId: "other-shop",
    };

    const resCrossSnapshot = await app.request("/api/admin/tenants/restore", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snapshot: otherShopSnapshot,
      }),
    });

    expect(resCrossSnapshot.status).toBe(403);
    const jsonCrossSnapshot = await resCrossSnapshot.json();
    expect(jsonCrossSnapshot.success).toBe(false);
    expect(jsonCrossSnapshot.error).toContain("Forbidden");

    // Also reject when targetTenantId is a different tenant
    const resCrossTarget = await app.request("/api/admin/tenants/restore", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snapshot: { ...structuredClone(backupPayload.snapshot), tenantId: "limart" },
        targetTenantId: "other-shop",
      }),
    });

    expect(resCrossTarget.status).toBe(403);
    const jsonCrossTarget = await resCrossTarget.json();
    expect(jsonCrossTarget.success).toBe(false);
    expect(jsonCrossTarget.error).toContain("Forbidden");
  });

  it("8. When DEMO_SANDBOX_MODE === 'true', GET /api/admin/tenants/backup and GET /api/admin/export return 403 Forbidden", async () => {
    const prevDemoMode = process.env.DEMO_SANDBOX_MODE;
    process.env.DEMO_SANDBOX_MODE = "true";

    try {
      const backupRes = await app.request("/api/admin/tenants/backup", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      expect(backupRes.status).toBe(403);
      const backupJson = await backupRes.json();
      expect(backupJson.success).toBe(false);

      const exportRes = await app.request("/api/admin/export", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      expect(exportRes.status).toBe(403);
      const exportJson = await exportRes.json();
      expect(exportJson.success).toBe(false);
    } finally {
      if (prevDemoMode === undefined) {
        delete process.env.DEMO_SANDBOX_MODE;
      } else {
        process.env.DEMO_SANDBOX_MODE = prevDemoMode;
      }
    }
  });
});
