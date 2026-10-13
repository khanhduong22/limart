import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockSessionAuditLogCount,
  mockSessionAuditLogFindMany,
  mockSessionAuditLogCreate,
  mockSessionAuditLogFindFirst,
  mockStaffTaskFindMany,
  mockStaffTaskFindUnique,
  mockStaffTaskUpdate,
  mockAutoScheduleAdminNa,
  mockRunBirthdayBonus,
  mockRunCarryingBonus,
  mockRunPackingBonus,
  mockClosePayrollMonth,
  mockPayrollPeriodFindUnique,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockSessionAuditLogCount: vi.fn(),
  mockSessionAuditLogFindMany: vi.fn(),
  mockSessionAuditLogCreate: vi.fn(),
  mockSessionAuditLogFindFirst: vi.fn(),
  mockStaffTaskFindMany: vi.fn(),
  mockStaffTaskFindUnique: vi.fn(),
  mockStaffTaskUpdate: vi.fn(),
  mockAutoScheduleAdminNa: vi.fn(),
  mockRunBirthdayBonus: vi.fn(),
  mockRunCarryingBonus: vi.fn(),
  mockRunPackingBonus: vi.fn(),
  mockClosePayrollMonth: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
    },
    sessionAuditLog: {
      count: mockSessionAuditLogCount,
      findMany: mockSessionAuditLogFindMany,
      create: mockSessionAuditLogCreate,
      findFirst: mockSessionAuditLogFindFirst,
    },
    staffTask: {
      findMany: mockStaffTaskFindMany,
      findUnique: mockStaffTaskFindUnique,
      update: mockStaffTaskUpdate,
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

vi.mock("@checkin/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@checkin/shared")>();
  return {
    ...actual,
    runBirthdayBonus: mockRunBirthdayBonus,
    runCarryingBonus: mockRunCarryingBonus,
    runPackingBonus: mockRunPackingBonus,
  };
});

vi.mock("../src/lib/payroll-close", () => ({
  closePayrollMonth: mockClosePayrollMonth,
}));

vi.mock("../src/lib/auto-schedule", () => ({
  autoScheduleAdminNa: mockAutoScheduleAdminNa,
  ensureAdminNaSchedule: vi.fn(),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { recordSecureAuditLog, logSessionAudit } from "../src/lib/audit";

describe("Audit Logs, Staff Tasks & Cron Valkey Caching Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const originalCronSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    vi.clearAllMocks();
    memoryStore = new Map<string, string>();

    mockRedis = {
      status: "ready",
      get: vi.fn(async (key: string) => memoryStore.get(key) || null),
      set: vi.fn(async (key: string, value: string) => {
        memoryStore.set(key, value);
        return "OK";
      }),
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

    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NODE_ENV = "production";

    adminToken = await signAccessToken({
      sub: "admin-user-id",
      email: "admin@example.com",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: "staff-user-id",
      email: "staff@example.com",
      role: "USER",
    });

    mockPayrollPeriodFindUnique.mockResolvedValue(null);
    mockSessionAuditLogFindFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    setRedisClient(null);
    process.env.CRON_SECRET = originalCronSecret;
    process.env.NODE_ENV = originalNodeEnv;
  });

  // ============================================================================
  // 1. GET /api/auth/audit-logs Valkey Caching
  // ============================================================================
  describe("1. GET /api/auth/audit-logs Caching", () => {
    const sampleLogs = [
      {
        id: "log-1",
        userId: "admin-user-id",
        action: "LOGIN",
        status: "SUCCESS",
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-10-13T10:00:00Z"),
        user: {
          id: "admin-user-id",
          name: "Admin User",
          email: "admin@example.com",
          image: null,
          role: "ADMIN",
        },
      },
      {
        id: "log-2",
        userId: "staff-user-id",
        action: "CHECKIN",
        status: "SUCCESS",
        ipAddress: "192.168.1.100",
        createdAt: new Date("2026-10-13T10:05:00Z"),
        user: {
          id: "staff-user-id",
          name: "Staff User",
          email: "staff@example.com",
          image: null,
          role: "USER",
        },
      },
    ];

    it("caches audit-logs query and returns cached response on repeated request", async () => {
      mockSessionAuditLogCount.mockResolvedValue(2);
      mockSessionAuditLogFindMany.mockResolvedValue(sampleLogs);

      // First request: Cache Miss -> queries DB
      const res1 = await app.request("/api/auth/audit-logs?page=1&limit=50", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.total).toBe(2);
      expect(json1.logs).toHaveLength(2);
      expect(mockSessionAuditLogCount).toHaveBeenCalledTimes(1);
      expect(mockSessionAuditLogFindMany).toHaveBeenCalledTimes(1);

      // Verify that Redis was populated with key matching pattern auth:audit-logs:1:50:*
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "auth:audit-logs:1:50:ALL:ALL:ALL:NONE",
        expect.any(Number),
        expect.any(String)
      );

      // Second request: Cache Hit -> served from Redis
      const res2 = await app.request("/api/auth/audit-logs?page=1&limit=50", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.total).toBe(2);
      expect(json2.logs).toHaveLength(2);
      // DB queries MUST NOT be executed again
      expect(mockSessionAuditLogCount).toHaveBeenCalledTimes(1);
      expect(mockSessionAuditLogFindMany).toHaveBeenCalledTimes(1);
    });

    it("differentiates cache keys by query filters (action, status, search, userId)", async () => {
      mockSessionAuditLogCount.mockResolvedValue(1);
      mockSessionAuditLogFindMany.mockResolvedValue([sampleLogs[0]]);

      const resFilter = await app.request(
        "/api/auth/audit-logs?page=2&limit=10&action=LOGIN&status=SUCCESS&userId=admin-user-id&search=Admin",
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );

      expect(resFilter.status).toBe(200);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "auth:audit-logs:2:10:LOGIN:SUCCESS:admin-user-id:Admin",
        expect.any(Number),
        expect.any(String)
      );
    });

    it("invalidates auth:audit-logs:* cache when a new SessionAuditLog is recorded", async () => {
      mockSessionAuditLogCount.mockResolvedValue(2);
      mockSessionAuditLogFindMany.mockResolvedValue(sampleLogs);

      // 1. Warm the cache
      const resInitial = await app.request("/api/auth/audit-logs?page=1&limit=50", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resInitial.status).toBe(200);
      expect(memoryStore.has("auth:audit-logs:1:50:ALL:ALL:ALL:NONE")).toBe(true);

      // 2. Record new audit log via recordSecureAuditLog
      mockSessionAuditLogCreate.mockResolvedValue({
        id: "log-3",
        userId: "staff-user-id",
        action: "LOGOUT",
        status: "SUCCESS",
        details: { hash: "new-hash-3" },
      });

      await recordSecureAuditLog({
        userId: "staff-user-id",
        action: "LOGOUT",
        status: "SUCCESS",
        ipAddress: "127.0.0.1",
      });

      // 3. Verify Redis del was invoked on matching keys and memoryStore key was purged
      expect(mockRedis.del).toHaveBeenCalled();
      expect(memoryStore.has("auth:audit-logs:1:50:ALL:ALL:ALL:NONE")).toBe(false);

      // 4. Next GET request must query DB again
      mockSessionAuditLogCount.mockResolvedValue(3);
      mockSessionAuditLogFindMany.mockResolvedValue([...sampleLogs, { id: "log-3", action: "LOGOUT" }]);

      const resPostInvalidate = await app.request("/api/auth/audit-logs?page=1&limit=50", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resPostInvalidate.status).toBe(200);
      expect(mockSessionAuditLogCount).toHaveBeenCalledTimes(2);
      expect(mockSessionAuditLogFindMany).toHaveBeenCalledTimes(2);
    });

    it("logSessionAudit alias also invalidates auth:audit-logs:*", async () => {
      // Warm cache
      memoryStore.set("auth:audit-logs:1:20:ALL:ALL:ALL:NONE", JSON.stringify({ total: 1, logs: [], totalPages: 1 }));

      mockSessionAuditLogCreate.mockResolvedValue({
        id: "log-4",
        userId: "admin-user-id",
        action: "PASSWORD_CHANGE",
        details: { hash: "hash-4" },
      });

      await logSessionAudit({
        userId: "admin-user-id",
        action: "PASSWORD_CHANGE",
      });

      expect(memoryStore.has("auth:audit-logs:1:20:ALL:ALL:ALL:NONE")).toBe(false);
    });
  });

  // ============================================================================
  // 2. GET /api/staff/staff-tasks Valkey Caching
  // ============================================================================
  describe("2. GET /api/staff/staff-tasks Caching & Mutations Invalidation", () => {
    const sampleStaffTasks = [
      {
        id: "st-task-1",
        assigneeId: "staff-user-id",
        createdById: "admin-user-id",
        title: "Soát hàng tồn kho",
        status: "TODO",
        createdAt: new Date("2026-10-10T08:00:00Z"),
        startDate: new Date("2026-10-10T08:00:00Z"),
        deadline: new Date("2026-10-20T17:00:00Z"),
        assignee: {
          id: "staff-user-id",
          name: "Staff User",
          email: "staff@example.com",
          image: null,
        },
        createdBy: {
          id: "admin-user-id",
          name: "Admin User",
        },
      },
    ];

    it("caches staff-tasks retrieval and returns cached data on second call", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-user-id",
        role: "USER",
        staffTasksAllowed: true,
      });
      mockStaffTaskFindMany.mockResolvedValue(sampleStaffTasks);

      // First call: Miss -> queries DB
      const res1 = await app.request("/api/staff/staff-tasks", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.allowed).toBe(true);
      expect(json1.data.tasks).toHaveLength(1);
      expect(json1.data.stats).toBeDefined();
      expect(mockStaffTaskFindMany).toHaveBeenCalledTimes(1);

      // Verify cached in Redis with key staff:staff-tasks:staff-user-id
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "staff:staff-tasks:staff-user-id",
        expect.any(Number),
        expect.any(String)
      );

      // Second call: Hit -> returns from memoryStore, no DB query
      const res2 = await app.request("/api/staff/staff-tasks", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.tasks).toHaveLength(1);
      expect(mockStaffTaskFindMany).toHaveBeenCalledTimes(1);
    });

    it("caches admin querying specific user tasks with distinct cache key", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "admin-user-id",
        role: "ADMIN",
        staffTasksAllowed: true,
      });
      mockStaffTaskFindMany.mockResolvedValue(sampleStaffTasks);

      const resAdmin = await app.request("/api/staff/staff-tasks?userId=staff-user-id", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(resAdmin.status).toBe(200);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "staff:staff-tasks:staff-user-id",
        expect.any(Number),
        expect.any(String)
      );

      // Admin querying all tasks
      const resAll = await app.request("/api/staff/staff-tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resAll.status).toBe(200);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "staff:staff-tasks:all",
        expect.any(Number),
        expect.any(String)
      );
    });

    it("invalidates staff:staff-tasks:* and tasks:staff-tasks:* on POST /api/staff/staff-tasks/:id/toggle", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-user-id",
        role: "USER",
        staffTasksAllowed: true,
      });
      mockStaffTaskFindUnique.mockResolvedValue(sampleStaffTasks[0]);
      mockStaffTaskUpdate.mockResolvedValue({
        ...sampleStaffTasks[0],
        status: "DOING",
      });

      // Warm caches
      memoryStore.set("staff:staff-tasks:staff-user-id", JSON.stringify({ tasks: sampleStaffTasks }));
      memoryStore.set("tasks:staff-tasks:staff-user-id", JSON.stringify({ tasks: sampleStaffTasks }));
      memoryStore.set("staff-tasks:stats:staff:staff-user-id", JSON.stringify({ stats: {} }));

      const res = await app.request("/api/staff/staff-tasks/st-task-1/toggle", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "DOING" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Assert both staff:staff-tasks:* and tasks:staff-tasks:* were invalidated
      expect(memoryStore.has("staff:staff-tasks:staff-user-id")).toBe(false);
      expect(memoryStore.has("tasks:staff-tasks:staff-user-id")).toBe(false);
      expect(memoryStore.has("staff-tasks:stats:staff:staff-user-id")).toBe(false);
    });

    it("invalidates staff:staff-tasks:* and tasks:staff-tasks:* on POST /api/staff/staff-tasks/:id/status", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "staff-user-id",
        role: "USER",
        staffTasksAllowed: true,
      });
      mockStaffTaskFindUnique.mockResolvedValue(sampleStaffTasks[0]);
      mockStaffTaskUpdate.mockResolvedValue({
        ...sampleStaffTasks[0],
        status: "DONE",
      });

      // Warm caches
      memoryStore.set("staff:staff-tasks:staff-user-id", JSON.stringify({ tasks: sampleStaffTasks }));
      memoryStore.set("tasks:staff-tasks:staff-user-id", JSON.stringify({ tasks: sampleStaffTasks }));

      const res = await app.request("/api/staff/staff-tasks/st-task-1/status", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "DONE", evidenceNote: "Đã hoàn tất kiểm kê kho" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(memoryStore.has("staff:staff-tasks:staff-user-id")).toBe(false);
      expect(memoryStore.has("tasks:staff-tasks:staff-user-id")).toBe(false);
    });
  });

  // ============================================================================
  // 3. Cron Route Cache Invalidation
  // ============================================================================
  describe("3. Cron Route Schedule Cache Invalidation", () => {
    it("invalidates shifts:* and admin:schedule:* on GET /api/cron/auto-schedule", async () => {
      mockAutoScheduleAdminNa.mockResolvedValue({ createdShifts: 12, weekCount: 12 });

      // Seed schedule and shifts keys into Redis memory store
      memoryStore.set("shifts:current:staff-user-id", JSON.stringify([{ id: 1 }]));
      memoryStore.set("admin:schedule:current-month", JSON.stringify([{ id: 1 }]));
      memoryStore.set("admin:schedule:duties:week-1", JSON.stringify([{ id: 2 }]));

      const res = await app.request("/api/cron/auto-schedule", {
        headers: {
          Authorization: "Bearer test-cron-secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockAutoScheduleAdminNa).toHaveBeenCalledWith(12);

      // Verify that shifts:* and admin:schedule:* keys were invalidated from cache
      expect(memoryStore.has("shifts:current:staff-user-id")).toBe(false);
      expect(memoryStore.has("admin:schedule:current-month")).toBe(false);
      expect(memoryStore.has("admin:schedule:duties:week-1")).toBe(false);
    });

    it("invalidates shifts:* and admin:schedule:* on GET /api/cron/all", async () => {
      mockAutoScheduleAdminNa.mockResolvedValue({ createdShifts: 12 });
      mockRunBirthdayBonus.mockResolvedValue({ count: 1 });
      mockRunCarryingBonus.mockResolvedValue({ topUserId: "u1" });
      mockRunPackingBonus.mockResolvedValue({ topUserId: "u2" });

      // Seed multiple cache keys
      memoryStore.set("shifts:2026-10", JSON.stringify({ shifts: [] }));
      memoryStore.set("admin:schedule:oct-2026", JSON.stringify({ schedule: [] }));
      memoryStore.set("staff:payroll:staff-user-id", JSON.stringify({ payroll: [] }));
      memoryStore.set("stats:monthly:staff-user-id", JSON.stringify({ stats: [] }));

      const res = await app.request("/api/cron/all", {
        headers: {
          Authorization: "Bearer test-cron-secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify all invalidated
      expect(memoryStore.has("shifts:2026-10")).toBe(false);
      expect(memoryStore.has("admin:schedule:oct-2026")).toBe(false);
      expect(memoryStore.has("staff:payroll:staff-user-id")).toBe(false);
      expect(memoryStore.has("stats:monthly:staff-user-id")).toBe(false);
    });
  });
});
