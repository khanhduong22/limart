import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockUserFindFirst,
  mockCheckInFindMany,
  mockCheckInFindFirst,
  mockCheckInCreate,
  mockCheckInDelete,
  mockCheckInDeleteMany,
  mockWorkShiftFindMany,
  mockUserTaskFindMany,
  mockUserTaskFindUnique,
  mockUserTaskCreate,
  mockUserTaskUpdate,
  mockUserTaskDelete,
  mockUserTaskDeleteMany,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionFindUnique,
  mockTaskItemFindMany,
  mockTaskItemFindUnique,
  mockTaskItemUpdateMany,
  mockAllowedIPFindMany,
  mockPayrollAdjustmentCreate,
  mockPayrollAdjustmentDeleteMany,
  mockCalculateUserMonthlyStats,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockCheckInDelete: vi.fn(),
  mockCheckInDeleteMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskFindUnique: vi.fn(),
  mockUserTaskCreate: vi.fn(),
  mockUserTaskUpdate: vi.fn(),
  mockUserTaskDelete: vi.fn(),
  mockUserTaskDeleteMany: vi.fn(),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionFindUnique: vi.fn(),
  mockTaskItemFindMany: vi.fn(),
  mockTaskItemFindUnique: vi.fn(),
  mockTaskItemUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockAllowedIPFindMany: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn().mockResolvedValue({ id: "adj-test-1" }),
  mockPayrollAdjustmentDeleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockCalculateUserMonthlyStats: vi.fn().mockResolvedValue({
    totalHours: 80,
    daysWorked: 10,
    totalOvertimeHours: 5,
    leaderboardOvertimeHours: 5,
  }),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
      findFirst: mockUserFindFirst,
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: mockCheckInFindFirst,
      create: mockCheckInCreate,
      delete: mockCheckInDelete,
      deleteMany: mockCheckInDeleteMany,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      findUnique: mockUserTaskFindUnique,
      create: mockUserTaskCreate,
      update: mockUserTaskUpdate,
      delete: mockUserTaskDelete,
      deleteMany: mockUserTaskDeleteMany,
    },
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      findUnique: mockTaskDefinitionFindUnique,
    },
    taskItem: {
      findMany: mockTaskItemFindMany,
      findUnique: mockTaskItemFindUnique,
      updateMany: mockTaskItemUpdateMany,
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
      count: vi.fn().mockResolvedValue(1),
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
      deleteMany: mockPayrollAdjustmentDeleteMany,
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-log-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    setting: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

vi.mock("../src/lib/payroll-calculator", () => ({
  calculateUserMonthlyStats: mockCalculateUserMonthlyStats,
  calculateMonthlyPayrollSummary: vi.fn().mockResolvedValue({
    totalPayroll: 10000000,
    totalProjected: 10000000,
    details: [],
  }),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, inFlightPromises } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Staff Rewards Leaderboard Valkey Caching & Invalidation Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const adminUserId = "admin-leaderboard-uid";
  const staffUserId = "staff-leaderboard-uid";

  const sampleUsers = [
    {
      id: staffUserId,
      name: "Minh Trang",
      email: "trang@limart.vn",
      role: "USER",
      image: null,
      employmentType: "PART_TIME",
      hourlyRate: 30000,
      monthlySalary: null,
      isActive: true,
    },
    {
      id: "staff-2",
      name: "Thanh Tung",
      email: "tung@limart.vn",
      role: "USER",
      image: null,
      employmentType: "FULL_TIME",
      hourlyRate: 35000,
      monthlySalary: 8000000,
      isActive: true,
    },
  ];

  const sampleTaskDef = {
    id: "def-point-1",
    name: "Dong goi don hang",
    unit: "điểm",
    baseReward: 5000,
    active: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetLocks();
    _resetRateLimits();
    inFlightPromises.clear();
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
      sub: adminUserId,
      email: "admin@limart.vn",
      name: "Admin Leaderboard",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: staffUserId,
      email: "trang@limart.vn",
      name: "Minh Trang",
      role: "USER",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === adminUserId) {
        return {
          id: adminUserId,
          email: "admin@limart.vn",
          name: "Admin Leaderboard",
          role: "ADMIN",
          isActive: true,
        };
      }
      if (where.id === staffUserId) {
        return {
          id: staffUserId,
          email: "trang@limart.vn",
          name: "Minh Trang",
          role: "USER",
          isActive: true,
        };
      }
      return null;
    });

    mockUserFindMany.mockResolvedValue(sampleUsers);
    mockCheckInFindMany.mockResolvedValue([]);
    mockWorkShiftFindMany.mockResolvedValue([]);
    mockUserTaskFindMany.mockResolvedValue([]);
    mockAllowedIPFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/staff/rewards/leaderboard Caching
  // ==========================================================================
  describe("1. GET /api/staff/rewards/leaderboard Caching", () => {
    it("caches leaderboard calculation with key staff:rewards:leaderboard:${month}:${year} and serves from cache on subsequent request", async () => {
      const month = 10;
      const year = 2026;
      const cacheKey = `staff:rewards:leaderboard:${month}:${year}`;

      // 1. First Request: Cache Miss -> calculates and writes to Valkey
      const res1 = await app.request(
        `/api/staff/rewards/leaderboard?month=${month}&year=${year}`,
        {
          headers: { Cookie: `access_token=${staffToken}` },
        }
      );

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveProperty("topDiscipline");
      expect(json1.data).toHaveProperty("topHardworking");
      expect(json1.data).toHaveProperty("topOvertime");
      expect(json1.data).toHaveProperty("topPacking");
      expect(json1.data).toHaveProperty("topCarrying");

      // Verify cached in memoryStore
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex.mock.calls[0][0]).toBe(cacheKey);
      expect(memoryStore.has(cacheKey)).toBe(true);

      const dbUserCallsAfterFirst = mockUserFindMany.mock.calls.length;
      expect(dbUserCallsAfterFirst).toBeGreaterThan(0);

      // 2. Second Request: Cache Hit -> served from Valkey without extra DB queries
      const res2 = await app.request(
        `/api/staff/rewards/leaderboard?month=${month}&year=${year}`,
        {
          headers: { Cookie: `access_token=${staffToken}` },
        }
      );

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(json1.data);

      // No new DB calls occurred
      expect(mockUserFindMany.mock.calls.length).toBe(dbUserCallsAfterFirst);
      expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    });
  });

  // ==========================================================================
  // 2. Cache Invalidation on Check-in Creation & Offline Sync
  // ==========================================================================
  describe("2. Cache Invalidation on Check-in Creation & Sync", () => {
    it("invalidates staff:rewards:leaderboard:* cache upon check-in creation via POST /api/checkins", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockCheckInFindFirst.mockResolvedValue(null);
      mockCheckInCreate.mockResolvedValue({
        id: 991,
        userId: staffUserId,
        type: "checkin",
        timestamp: new Date().toISOString(),
        ipAddress: "127.0.0.1",
      });

      const res = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({ type: "checkin", note: "Start morning shift" }),
      });

      expect(res.status).toBe(201);
      // Cache must be evicted
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates staff:rewards:leaderboard:* cache upon offline check-in sync via POST /api/checkins/sync-offline", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockCheckInFindFirst.mockResolvedValue(null);
      mockCheckInCreate.mockResolvedValue({
        id: 992,
        userId: staffUserId,
        type: "checkin",
        timestamp: new Date().toISOString(),
        ipAddress: "127.0.0.1",
      });

      const res = await app.request("/api/checkins/sync-offline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({
          items: [
            {
              id: "client-sync-1",
              type: "checkin",
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Cache Invalidation on Admin Task Review & Approval
  // ==========================================================================
  describe("3. Cache Invalidation on Admin Task Review & Approval", () => {
    it("invalidates staff:rewards:leaderboard:* cache upon task approval via POST /api/admin/tasks/:id/approve", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockUserTaskFindUnique.mockResolvedValue({
        id: "task-test-1",
        userId: staffUserId,
        status: "SUBMITTED",
        quantity: 10,
        unitPrice: 5000,
        taskDefinition: sampleTaskDef,
      });

      mockUserTaskUpdate.mockResolvedValue({
        id: "task-test-1",
        userId: staffUserId,
        status: "APPROVED",
        finalAmount: 50000,
      });

      const res = await app.request("/api/admin/tasks/task-test-1/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ bonusPenalty: 0 }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates staff:rewards:leaderboard:* cache upon task rejection via POST /api/admin/tasks/:id/reject", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockUserTaskFindUnique.mockResolvedValue({
        id: "task-test-2",
        userId: staffUserId,
        status: "SUBMITTED",
        quantity: 5,
        unitPrice: 5000,
        taskDefinition: sampleTaskDef,
      });

      mockUserTaskUpdate.mockResolvedValue({
        id: "task-test-2",
        userId: staffUserId,
        status: "REJECTED",
      });

      const res = await app.request("/api/admin/tasks/task-test-2/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ reason: "Unqualified" }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates staff:rewards:leaderboard:* cache upon task review via POST /api/admin/tasks/:id/review", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockUserTaskFindUnique.mockResolvedValue({
        id: "task-test-3",
        userId: staffUserId,
        status: "SUBMITTED",
        quantity: 8,
        unitPrice: 5000,
        taskDefinition: sampleTaskDef,
      });

      mockUserTaskUpdate.mockResolvedValue({
        id: "task-test-3",
        userId: staffUserId,
        status: "APPROVED",
        finalAmount: 40000,
      });

      const res = await app.request("/api/admin/tasks/task-test-3/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ decision: "APPROVED", bonusPenalty: 0 }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Cache Invalidation on Manual Check-in & Delete Check-in
  // ==========================================================================
  describe("4. Cache Invalidation on Manual Check-in & Deletion", () => {
    it("invalidates staff:rewards:leaderboard:* cache upon manual check-in via POST /api/admin/manual-checkin", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockCheckInDeleteMany.mockResolvedValue({ count: 0 });
      mockCheckInCreate.mockResolvedValue({
        id: 881,
        userId: staffUserId,
        type: "checkin",
        timestamp: new Date("2026-10-14T08:30:00+07:00"),
      });

      const res = await app.request("/api/admin/manual-checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          userId: staffUserId,
          date: "2026-10-14",
          checkInTime: "08:30",
          checkOutTime: "17:30",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates staff:rewards:leaderboard:* cache upon manual check-in via alias POST /api/admin/checkin/manual", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockCheckInDeleteMany.mockResolvedValue({ count: 0 });
      mockCheckInCreate.mockResolvedValue({
        id: 882,
        userId: staffUserId,
        type: "checkin",
        timestamp: new Date("2026-10-14T08:30:00+07:00"),
      });

      const res = await app.request("/api/admin/checkin/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          userId: staffUserId,
          date: "2026-10-14",
          checkInTime: "08:30",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates staff:rewards:leaderboard:* cache upon check-in deletion via DELETE /api/admin/checkin/:id", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockCheckInFindUnique: mockCheckInFindFirst.mockResolvedValue({
        id: 883,
        userId: staffUserId,
        timestamp: new Date("2026-10-14T08:30:00+07:00"),
        type: "checkin",
      });

      const prisma = (await import("@checkin/db")).prisma as any;
      prisma.checkIn.findUnique = vi.fn().mockResolvedValue({
        id: 883,
        userId: staffUserId,
        timestamp: new Date("2026-10-14T08:30:00+07:00"),
        type: "checkin",
      });
      mockCheckInDelete.mockResolvedValue({ id: 883 });

      const res = await app.request("/api/admin/checkin/883", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Cache Invalidation on Staff Task Submission & Starts
  // ==========================================================================
  describe("5. Cache Invalidation on Staff Task Actions & Batch Shifts Close", () => {
    it("invalidates staff:rewards:leaderboard:* cache upon staff task start via POST /api/staff/tasks/start", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockTaskDefinitionFindUnique.mockResolvedValue({
        id: "def-point-1",
        name: "Dong goi don hang",
        unit: "điểm",
        baseReward: 5000,
        active: true,
      });

      mockUserTaskCreate.mockResolvedValue({
        id: "ut-new-1",
        userId: staffUserId,
        taskDefId: "def-point-1",
        status: "PENDING",
      });

      const res = await app.request("/api/staff/tasks/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({ taskDefId: "def-point-1" }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates staff:rewards:leaderboard:* cache upon staff task submit via POST /api/staff/tasks/submit", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockTaskDefinitionFindUnique.mockResolvedValue({
        id: "def-point-1",
        name: "Dong goi don hang",
        unit: "điểm",
        baseReward: 5000,
        active: true,
      });

      mockUserTaskCreate.mockResolvedValue({
        id: "ut-sub-1",
        userId: staffUserId,
        taskDefId: "def-point-1",
        status: "SUBMITTED",
        quantity: 5,
      });

      const res = await app.request("/api/staff/tasks/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({ taskDefId: "def-point-1", quantity: 5 }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates staff:rewards:leaderboard:* cache upon admin batch close shifts via POST /api/admin/close-all-shifts", async () => {
      const cacheKey = "staff:rewards:leaderboard:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ month: 10, year: 2026, cached: true }));
      expect(memoryStore.has(cacheKey)).toBe(true);

      mockCheckInFindMany.mockResolvedValue([
        {
          id: 551,
          userId: staffUserId,
          type: "checkin",
          timestamp: new Date(),
        },
      ]);
      mockCheckInCreate.mockResolvedValue({
        id: 552,
        userId: staffUserId,
        type: "checkout",
        timestamp: new Date(),
      });

      const res = await app.request("/api/admin/close-all-shifts", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });
  });
});
