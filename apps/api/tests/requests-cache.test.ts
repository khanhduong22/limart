import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockRequestFindMany,
  mockRequestCreate,
  mockRequestUpdate,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockRequestCreate: vi.fn(),
  mockRequestUpdate: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(5),
    },
    request: {
      findMany: mockRequestFindMany,
      create: mockRequestCreate,
      update: mockRequestUpdate,
      count: vi.fn().mockResolvedValue(1),
    },
    workShift: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    shiftDuty: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    payrollAdjustment: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    allowedIP: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    checkIn: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userTask: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Requests Cache & Invalidation Suite", () => {
  let userToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockStaffUser = {
    id: "user-1",
    name: "Staff Member",
    email: "staff@example.com",
    role: "USER",
    image: null,
  };

  const mockAdminUser = {
    id: "admin-1",
    name: "Admin User",
    email: "admin@example.com",
    role: "ADMIN",
    image: null,
  };

  const sampleRequest = {
    id: 101,
    userId: "user-1",
    type: "LEAVE",
    date: new Date("2026-10-15T00:00:00.000Z"),
    reason: "Family event",
    status: "PENDING",
    createdAt: new Date("2026-10-14T08:00:00.000Z"),
    updatedAt: new Date("2026-10-14T08:00:00.000Z"),
    user: mockStaffUser,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    memoryStore = new Map<string, string>();

    mockRedis = {
      status: "ready",
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

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "admin-1") return mockAdminUser;
      if (where.id === "user-1") return mockStaffUser;
      return null;
    });

    userToken = await signAccessToken({
      sub: "user-1",
      email: "staff@example.com",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  describe("1. GET /api/requests/me Caching", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await app.request("/api/requests/me");
      expect(res.status).toBe(401);
    });

    it("caches requests on first call and serves cache hit on subsequent call", async () => {
      mockRequestFindMany.mockResolvedValueOnce([sampleRequest]);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(json1.data[0].id).toBe(101);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);

      // Verify stored under user:requests:user-1 with TTL
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "user:requests:user-1",
        expect.any(Number),
        expect.any(String)
      );
      expect(memoryStore.has("user:requests:user-1")).toBe(true);

      // Request 2: Cache Hit
      const res2 = await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      expect(json2.data[0].id).toBe(101);

      // Prisma should NOT be queried again
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("2. POST /api/requests Invalidation (Staff Request Submission)", () => {
    it("invalidates user:requests, admin:requests, admin:dashboard, and staff:home when a request is created", async () => {
      // Pre-warm cache entries
      memoryStore.set("user:requests:user-1", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:requests:all", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:requests:pending", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:dashboard:2026-10-14", JSON.stringify({ stats: true }));
      memoryStore.set("staff:home:user-1:2026-10-14", JSON.stringify({ home: true }));
      memoryStore.set("staff:home:user-2:2026-10-14", JSON.stringify({ home: true }));

      expect(memoryStore.has("user:requests:user-1")).toBe(true);
      expect(memoryStore.has("admin:requests:all")).toBe(true);
      expect(memoryStore.has("admin:dashboard:2026-10-14")).toBe(true);
      expect(memoryStore.has("staff:home:user-1:2026-10-14")).toBe(true);
      expect(memoryStore.has("staff:home:user-2:2026-10-14")).toBe(true);

      mockRequestCreate.mockResolvedValueOnce({
        id: 102,
        userId: "user-1",
        type: "WFH",
        date: new Date("2026-10-16T00:00:00.000Z"),
        reason: "Working remotely",
        status: "PENDING",
      });

      const res = await app.request("/api/requests", {
        method: "POST",
        headers: {
          Cookie: `access_token=${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "WFH",
          date: "2026-10-16",
          reason: "Working remotely",
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(102);

      // Verify all invalidations occurred
      expect(memoryStore.has("user:requests:user-1")).toBe(false);
      expect(memoryStore.has("admin:requests:all")).toBe(false);
      expect(memoryStore.has("admin:requests:pending")).toBe(false);
      expect(memoryStore.has("admin:dashboard:2026-10-14")).toBe(false);
      expect(memoryStore.has("staff:home:user-1:2026-10-14")).toBe(false);
      expect(memoryStore.has("staff:home:user-2:2026-10-14")).toBe(false);

      // Subsequent GET /api/requests/me results in a cache miss and DB query
      mockRequestFindMany.mockResolvedValueOnce([
        sampleRequest,
        {
          id: 102,
          userId: "user-1",
          type: "WFH",
          date: new Date("2026-10-16T00:00:00.000Z"),
          reason: "Working remotely",
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date(),
          user: mockStaffUser,
        },
      ]);

      const resAfter = await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(resAfter.status).toBe(200);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. POST /api/admin/requests/:id/action Invalidation", () => {
    it("invalidates user:requests, admin:requests, admin:dashboard, and staff:home when admin approves action", async () => {
      memoryStore.set("user:requests:user-1", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:requests:all", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:dashboard:2026-10-14", JSON.stringify({ stats: true }));
      memoryStore.set("staff:home:user-1:2026-10-14", JSON.stringify({ home: true }));

      mockRequestUpdate.mockResolvedValueOnce({
        ...sampleRequest,
        status: "APPROVED",
      });

      const res = await app.request("/api/admin/requests/101/action", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "APPROVED" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("Đã duyệt đơn");

      // Verify all invalidations
      expect(memoryStore.has("user:requests:user-1")).toBe(false);
      expect(memoryStore.has("admin:requests:all")).toBe(false);
      expect(memoryStore.has("admin:dashboard:2026-10-14")).toBe(false);
      expect(memoryStore.has("staff:home:user-1:2026-10-14")).toBe(false);
    });

    it("invalidates user:requests, admin:requests, admin:dashboard, and staff:home when admin rejects action", async () => {
      memoryStore.set("user:requests:user-1", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:requests:all", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:dashboard:2026-10-14", JSON.stringify({ stats: true }));
      memoryStore.set("staff:home:user-1:2026-10-14", JSON.stringify({ home: true }));

      mockRequestUpdate.mockResolvedValueOnce({
        ...sampleRequest,
        status: "REJECTED",
      });

      const res = await app.request("/api/admin/requests/101/action", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "REJECTED" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("Đã từ chối đơn");

      // Verify all invalidations
      expect(memoryStore.has("user:requests:user-1")).toBe(false);
      expect(memoryStore.has("admin:requests:all")).toBe(false);
      expect(memoryStore.has("admin:dashboard:2026-10-14")).toBe(false);
      expect(memoryStore.has("staff:home:user-1:2026-10-14")).toBe(false);
    });
  });

  describe("4. POST /api/admin/requests/:id/approve Invalidation", () => {
    it("invalidates staff:home and other request caches when admin approves request directly", async () => {
      memoryStore.set("user:requests:user-1", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:requests:all", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:dashboard:2026-10-14", JSON.stringify({ stats: true }));
      memoryStore.set("staff:home:user-1:2026-10-14", JSON.stringify({ home: true }));

      mockRequestUpdate.mockResolvedValueOnce({
        ...sampleRequest,
        status: "APPROVED",
      });

      const res = await app.request("/api/admin/requests/101/approve", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe("Đã duyệt đơn");

      // Verify invalidations
      expect(memoryStore.has("user:requests:user-1")).toBe(false);
      expect(memoryStore.has("admin:requests:all")).toBe(false);
      expect(memoryStore.has("admin:dashboard:2026-10-14")).toBe(false);
      expect(memoryStore.has("staff:home:user-1:2026-10-14")).toBe(false);
    });
  });

  describe("5. POST /api/admin/requests/:id/reject Invalidation", () => {
    it("invalidates staff:home and other request caches when admin rejects request directly", async () => {
      memoryStore.set("user:requests:user-1", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:requests:all", JSON.stringify([sampleRequest]));
      memoryStore.set("admin:dashboard:2026-10-14", JSON.stringify({ stats: true }));
      memoryStore.set("staff:home:user-1:2026-10-14", JSON.stringify({ home: true }));

      mockRequestUpdate.mockResolvedValueOnce({
        ...sampleRequest,
        status: "REJECTED",
      });

      const res = await app.request("/api/admin/requests/101/reject", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe("Đã từ chối đơn");

      // Verify invalidations
      expect(memoryStore.has("user:requests:user-1")).toBe(false);
      expect(memoryStore.has("admin:requests:all")).toBe(false);
      expect(memoryStore.has("admin:dashboard:2026-10-14")).toBe(false);
      expect(memoryStore.has("staff:home:user-1:2026-10-14")).toBe(false);
    });
  });
});
