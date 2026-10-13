import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindMany,
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdate,
  mockUserDelete,
  mockCheckInFindMany,
  mockUserTaskFindMany,
  mockWorkShiftFindMany,
  mockSessionDeleteMany,
  mockExecuteRawUnsafe,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserDelete: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockSessionDeleteMany: vi.fn(),
  mockExecuteRawUnsafe: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
      delete: mockUserDelete,
      count: vi.fn().mockResolvedValue(10),
    },
    checkIn: {
      findMany: mockCheckInFindMany,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      count: vi.fn().mockResolvedValue(0),
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      deleteMany: mockSessionDeleteMany,
    },
    allowedIP: {
      count: vi.fn().mockResolvedValue(1),
    },
    request: {
      count: vi.fn().mockResolvedValue(0),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcement: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcementRead: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { ensureAnnouncementReadTable } from "../src/routes/staff.route";

describe("Admin Endpoints Valkey Caching & Compound Index Verification Suite", () => {
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

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

    adminToken = await signAccessToken({
      sub: "admin-cache-test",
      email: "admin.cache.test@example.com",
      role: "ADMIN",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  describe("1. GET /api/admin/employees Caching & Invalidation", () => {
    const mockEmployees = [
      {
        id: "emp-1",
        name: "Alice Nguyen",
        email: "alice@example.com",
        role: "USER",
        image: null,
        isActive: true,
        luckyWheelAllowed: true,
        employmentType: "PART_TIME",
        hourlyRate: 30000,
        monthlySalary: 0,
        birthday: null,
        startDate: null,
        staffTasksAllowed: false,
      },
    ];

    it("caches employee list under admin:employees:all for 300s", async () => {
      mockUserFindMany.mockResolvedValueOnce(mockEmployees);

      // Request 1: Cache miss
      const res1 = await app.request("/api/admin/employees", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex called with key "admin:employees:all" and ~300s TTL
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "admin:employees:all",
        expect.any(Number),
        expect.any(String)
      );
      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(300 * 0.85);
      expect(ttl).toBeLessThanOrEqual(300 * 1.15 + 1);

      // Request 2: Cache hit
      const res2 = await app.request("/api/admin/employees", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1); // not called again!
    });

    it("invalidates admin:employees:* when a new employee is created (POST /api/admin/employees)", async () => {
      memoryStore.set("admin:employees:all", JSON.stringify(mockEmployees));

      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: "emp-2",
        name: "Bob Tran",
        email: "bob@example.com",
        role: "USER",
      });

      const res = await app.request("/api/admin/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Bob Tran",
          email: "bob@example.com",
          role: "USER",
          hourlyRate: 35000,
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("admin:employees:all")).toBe(false);
    });

    it("invalidates admin:employees:* when employee is updated (PUT /api/admin/employees/:id)", async () => {
      memoryStore.set("admin:employees:all", JSON.stringify(mockEmployees));

      mockUserUpdate.mockResolvedValue({
        id: "emp-1",
        name: "Alice Nguyen Updated",
      });

      const res = await app.request("/api/admin/employees/emp-1", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Alice Nguyen Updated",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:employees:all")).toBe(false);
    });

    it("invalidates admin:employees:* when employee status is toggled (PATCH /api/admin/employees/:id/status)", async () => {
      memoryStore.set("admin:employees:all", JSON.stringify(mockEmployees));

      mockUserUpdate.mockResolvedValue({
        id: "emp-1",
        isActive: false,
      });

      const res = await app.request("/api/admin/employees/emp-1/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          isActive: false,
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:employees:all")).toBe(false);
    });

    it("invalidates admin:employees:* when employee is deleted (DELETE /api/admin/employees/:id)", async () => {
      memoryStore.set("admin:employees:all", JSON.stringify(mockEmployees));

      mockUserDelete.mockResolvedValue({ id: "emp-1" });

      const res = await app.request("/api/admin/employees/emp-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:employees:all")).toBe(false);
    });
  });

  describe("2. GET /api/admin/reports Caching", () => {
    it("caches report calculation under admin:reports:${month}:${year} for 120s", async () => {
      mockUserFindMany.mockResolvedValue([
        {
          id: "u-1",
          name: "Alice",
          role: "USER",
          image: null,
          employmentType: "PART_TIME",
        },
      ]);
      mockCheckInFindMany.mockResolvedValue([]);
      mockUserTaskFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);

      // Request 1: Cache miss
      const res1 = await app.request("/api/admin/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveProperty("totalPayrollCost");

      // Verify Redis setex called with key "admin:reports:10:2026" and ~120s TTL
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "admin:reports:10:2026",
        expect.any(Number),
        expect.any(String)
      );
      const reportTtl = (mockRedis.setex as any).mock.calls[0][1];
      expect(reportTtl).toBeGreaterThanOrEqual(120 * 0.85);
      expect(reportTtl).toBeLessThanOrEqual(120 * 1.15 + 1);

      // Clear findMany to prove subsequent request serves directly from Valkey cache
      mockUserFindMany.mockClear();

      // Request 2: Cache hit
      const res2 = await app.request("/api/admin/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(mockUserFindMany).not.toHaveBeenCalled();
    });
  });

  describe("3. Redundant DDL Removal in staff.route", () => {
    it("ensureAnnouncementReadTable completes as a no-op without executing raw DDL", async () => {
      await ensureAnnouncementReadTable();
      expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
