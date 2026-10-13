import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockHolidayFindMany,
  mockHolidayUpsert,
  mockHolidayDelete,
  mockAllowedIPFindMany,
  mockAllowedIPCreate,
  mockAllowedIPDelete,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockHolidayFindMany: vi.fn(),
  mockHolidayUpsert: vi.fn(),
  mockHolidayDelete: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
  mockAllowedIPCreate: vi.fn(),
  mockAllowedIPDelete: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    holiday: {
      findMany: mockHolidayFindMany,
      upsert: mockHolidayUpsert,
      delete: mockHolidayDelete,
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
      create: mockAllowedIPCreate,
      delete: mockAllowedIPDelete,
      count: vi.fn().mockResolvedValue(1),
    },
    checkIn: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    workShift: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    request: {
      count: vi.fn().mockResolvedValue(0),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: mockQueryRaw,
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, inFlightPromises } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Admin Holidays & IP Settings Valkey Caching Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockAdminUser = {
    id: "admin-user-1",
    email: "admin@limart.vn",
    role: "ADMIN",
    isActive: true,
  };

  const sampleHolidays = [
    {
      id: "h-1",
      date: new Date("2026-01-01T00:00:00.000Z"),
      name: "Tết Dương Lịch 2026",
      multiplier: 3.0,
    },
    {
      id: "h-2",
      date: new Date("2026-04-30T00:00:00.000Z"),
      name: "Giải Phóng Miền Nam",
      multiplier: 3.0,
    },
  ];

  const sampleAllowedIPs = [
    {
      id: 1,
      prefix: "192.168.1.",
      label: "Văn phòng chính Limart",
      createdAt: new Date("2026-01-01T08:00:00.000Z"),
    },
    {
      id: 2,
      prefix: "10.0.0.",
      label: "Chi nhánh Quận 1",
      createdAt: new Date("2026-01-02T08:00:00.000Z"),
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    inFlightPromises.clear();
    _resetLocks();
    _resetRateLimits();

    mockHolidayFindMany.mockResolvedValue(sampleHolidays);
    mockAllowedIPFindMany.mockResolvedValue(sampleAllowedIPs);

    memoryStore = new Map<string, string>();
    mockRedis = {
      status: "ready",
      ping: vi.fn().mockResolvedValue("PONG"),
      get: vi.fn(async (key: string) => memoryStore.get(key) || null),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => {
        memoryStore.set(key, value);
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        let deleted = 0;
        for (const k of keys) {
          if (memoryStore.delete(k)) deleted++;
        }
        return deleted;
      }),
      keys: vi.fn(async (pattern: string) => {
        const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
        const matched: string[] = [];
        for (const k of memoryStore.keys()) {
          if (regex.test(k)) matched.push(k);
        }
        return matched;
      }),
    };

    setRedisClient(mockRedis);

    adminToken = await signAccessToken({
      sub: mockAdminUser.id,
      email: mockAdminUser.email,
      role: mockAdminUser.role,
    });

    staffToken = await signAccessToken({
      sub: "staff-1",
      email: "staff@limart.vn",
      role: "USER",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === mockAdminUser.id || where.email === mockAdminUser.email) {
        return mockAdminUser;
      }
      return null;
    });

    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
  });

  afterEach(() => {
    setRedisClient(null);
    inFlightPromises.clear();
  });

  // ==========================================================================
  // 1. HOLIDAYS VALKEY CACHING & INVALIDATION
  // ==========================================================================
  describe("1. Holidays Valkey Caching & Invalidation", () => {
    it("caches meta:holidays:all for 1800s with jitter on GET /api/admin/holidays", async () => {
      // 1st request: Cache miss -> queries Prisma DB
      const res1 = await app.request("/api/admin/holidays", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1).toHaveLength(2);
      expect(data1[0].name).toBe("Tết Dương Lịch 2026");
      expect(data1[0].date).toBe("2026-01-01");
      expect(mockHolidayFindMany).toHaveBeenCalledTimes(1);

      // Verify setex call with TTL ~1800s (±15% jitter => 1530s - 2070s)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "meta:holidays:all",
        expect.any(Number),
        expect.any(String)
      );
      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(1800 * 0.85);
      expect(ttl).toBeLessThanOrEqual(1800 * 1.15 + 1);

      // 2nd request: Cache hit -> returns cached data, Prisma NOT called again
      const res2 = await app.request("/api/admin/holidays", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2).toEqual(data1);
      expect(mockHolidayFindMany).toHaveBeenCalledTimes(1); // Still 1!
    });

    it("serves cache on alias GET /api/admin/settings/holidays", async () => {
      // Seed cache directly
      memoryStore.set(
        "meta:holidays:all",
        JSON.stringify([
          {
            id: "cached-h-1",
            date: "2026-09-02",
            name: "Quốc Khánh Cached",
            multiplier: 3.0,
          },
        ])
      );

      const res = await app.request("/api/admin/settings/holidays", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe("cached-h-1");
      expect(data[0].name).toBe("Quốc Khánh Cached");
      // Prisma should not be called at all
      expect(mockHolidayFindMany).not.toHaveBeenCalled();
    });

    it("invalidates meta:holidays:* when admin saves a holiday via POST /api/admin/holidays", async () => {
      // Seed holiday cache and special days cache
      memoryStore.set("meta:holidays:all", JSON.stringify([{ id: "old-1" }]));
      memoryStore.set("meta:special-days:2026:10:15", JSON.stringify([{ id: "special-1" }]));

      mockHolidayUpsert.mockResolvedValueOnce({
        id: "h-new-1",
        date: new Date("2026-10-20T00:00:00.000Z"),
        name: "Ngày Phụ Nữ Việt Nam",
        multiplier: 3.0,
      });

      const res = await app.request("/api/admin/holidays", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          date: "2026-10-20",
          name: "Ngày Phụ Nữ Việt Nam",
          multiplier: 3.0,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Ngày Phụ Nữ Việt Nam");
      expect(body.date).toBe("2026-10-20");

      // Verify meta:holidays:* cache was evicted
      expect(memoryStore.has("meta:holidays:all")).toBe(false);
      // Verify special days cache was also invalidated
      expect(memoryStore.has("meta:special-days:2026:10:15")).toBe(false);
    });

    it("invalidates meta:holidays:* when admin deletes a holiday via DELETE /api/admin/holidays/:id", async () => {
      // Seed cache
      memoryStore.set("meta:holidays:all", JSON.stringify([{ id: "h-del-1" }]));

      mockHolidayDelete.mockResolvedValueOnce({
        id: "h-del-1",
      });

      const res = await app.request("/api/admin/holidays/h-del-1", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Cache key must be evicted
      expect(memoryStore.has("meta:holidays:all")).toBe(false);
    });

    it("invalidates meta:holidays:* via alias routes /settings/holidays", async () => {
      // Seed cache
      memoryStore.set("meta:holidays:all", JSON.stringify([{ id: "h-alias-1" }]));

      mockHolidayUpsert.mockResolvedValueOnce({
        id: "h-alias-1",
        date: new Date("2026-11-20T00:00:00.000Z"),
        name: "Ngày Nhà Giáo VN",
        multiplier: 3.0,
      });

      const postRes = await app.request("/api/admin/settings/holidays", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          date: "2026-11-20",
          name: "Ngày Nhà Giáo VN",
          multiplier: 3.0,
        }),
      });

      expect(postRes.status).toBe(201);
      expect(memoryStore.has("meta:holidays:all")).toBe(false);

      // Re-seed and test delete alias
      memoryStore.set("meta:holidays:all", JSON.stringify([{ id: "h-alias-1" }]));
      mockHolidayDelete.mockResolvedValueOnce({ id: "h-alias-1" });

      const delRes = await app.request("/api/admin/settings/holidays/h-alias-1", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(delRes.status).toBe(200);
      expect(memoryStore.has("meta:holidays:all")).toBe(false);
    });
  });

  // ==========================================================================
  // 2. ALLOWED IP SETTINGS VALKEY CACHING & INVALIDATION
  // ==========================================================================
  describe("2. Allowed IP Settings Valkey Caching & Invalidation", () => {
    it("caches config:allowed-ips:list for 600s with jitter on GET /api/admin/ip-settings", async () => {
      // 1st request: Cache miss -> queries Prisma
      const res1 = await app.request("/api/admin/ip-settings", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(2);
      expect(mockAllowedIPFindMany).toHaveBeenCalledTimes(1);

      // Verify setex call with TTL ~600s (±15% jitter => 510s - 690s)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "config:allowed-ips:list",
        expect.any(Number),
        expect.any(String)
      );
      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(600 * 0.85);
      expect(ttl).toBeLessThanOrEqual(600 * 1.15 + 1);

      // 2nd request: Cache hit -> returns cached data, Prisma NOT called again
      const res2 = await app.request("/api/admin/ip-settings", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2).toEqual(json1);
      expect(mockAllowedIPFindMany).toHaveBeenCalledTimes(1); // Still 1!
    });

    it("serves cache on alias GET /api/admin/settings/ips", async () => {
      // Seed cache directly with config:allowed-ips:list
      memoryStore.set(
        "config:allowed-ips:list",
        JSON.stringify([
          {
            id: 99,
            prefix: "172.16.0.",
            label: "Internal VPC",
          },
        ])
      );

      const res = await app.request("/api/admin/settings/ips", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].prefix).toBe("172.16.0.");
      expect(mockAllowedIPFindMany).not.toHaveBeenCalled();
    });

    it("invalidates config:allowed-ips* on POST /api/admin/ip-settings (clearing both list and lookup keys)", async () => {
      // Seed both list cache and single lookup cache
      memoryStore.set("config:allowed-ips:list", JSON.stringify([{ id: 1 }]));
      memoryStore.set("config:allowed-ips", JSON.stringify([{ id: 1, prefix: "192.168.1." }]));

      mockAllowedIPCreate.mockResolvedValueOnce({
        id: 3,
        prefix: "192.168.2.",
        label: "Kho Thủ Đức",
      });

      const res = await app.request("/api/admin/ip-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          prefix: "192.168.2.",
          label: "Kho Thủ Đức",
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Both cache keys matching config:allowed-ips* must be invalidated
      expect(memoryStore.has("config:allowed-ips:list")).toBe(false);
      expect(memoryStore.has("config:allowed-ips")).toBe(false);
    });

    it("invalidates config:allowed-ips* on DELETE /api/admin/ip-settings/:id", async () => {
      // Seed cache
      memoryStore.set("config:allowed-ips:list", JSON.stringify([{ id: 1 }]));
      memoryStore.set("config:allowed-ips", JSON.stringify([{ id: 1 }]));

      mockAllowedIPDelete.mockResolvedValueOnce({ id: 1 });

      const res = await app.request("/api/admin/ip-settings/1", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Both cache keys must be evicted
      expect(memoryStore.has("config:allowed-ips:list")).toBe(false);
      expect(memoryStore.has("config:allowed-ips")).toBe(false);
    });

    it("invalidates config:allowed-ips* via alias routes /settings/ips", async () => {
      // Seed cache
      memoryStore.set("config:allowed-ips:list", JSON.stringify([{ id: 5 }]));

      mockAllowedIPCreate.mockResolvedValueOnce({
        id: 5,
        prefix: "10.10.10.",
        label: "Store Alias",
      });

      const postRes = await app.request("/api/admin/settings/ips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          prefix: "10.10.10.",
          label: "Store Alias",
        }),
      });

      expect(postRes.status).toBe(201);
      expect(memoryStore.has("config:allowed-ips:list")).toBe(false);

      // Re-seed and test delete alias
      memoryStore.set("config:allowed-ips:list", JSON.stringify([{ id: 5 }]));
      mockAllowedIPDelete.mockResolvedValueOnce({ id: 5 });

      const delRes = await app.request("/api/admin/settings/ips/5", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(delRes.status).toBe(200);
      expect(memoryStore.has("config:allowed-ips:list")).toBe(false);
    });
  });

  // ==========================================================================
  // 3. ROLE ACCESS GUARD
  // ==========================================================================
  describe("3. Admin Authentication & Role Guards", () => {
    it("rejects non-admin users with 403 Forbidden", async () => {
      const resHolidays = await app.request("/api/admin/holidays", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(resHolidays.status).toBe(403);

      const resIPs = await app.request("/api/admin/ip-settings", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(resIPs.status).toBe(403);
    });

    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const resHolidays = await app.request("/api/admin/holidays");
      expect(resHolidays.status).toBe(401);

      const resIPs = await app.request("/api/admin/ip-settings");
      expect(resIPs.status).toBe(401);
    });
  });
});
