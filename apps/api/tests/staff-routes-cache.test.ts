import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockCheckInFindMany,
  mockCheckInFindFirst,
  mockCheckInCreate,
  mockCheckInDeleteMany,
  mockRequestFindMany,
  mockRequestCreate,
  mockTaskItemFindMany,
  mockTaskItemFindUnique,
  mockTaskItemCreate,
  mockTaskItemUpdate,
  mockTaskItemUpdateMany,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionFindUnique,
  mockUserTaskFindMany,
  mockUserTaskFindUnique,
  mockUserTaskCreate,
  mockUserTaskUpdate,
  mockPayrollPeriodFindUnique,
  mockPayrollAdjustmentCreate,
  mockPayrollAdjustmentDeleteMany,
  mockCalculateUserMonthlyStats,
  mockCalculateMonthlyPayrollSummary,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockCheckInDeleteMany: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockRequestCreate: vi.fn(),
  mockTaskItemFindMany: vi.fn(),
  mockTaskItemFindUnique: vi.fn(),
  mockTaskItemCreate: vi.fn(),
  mockTaskItemUpdate: vi.fn(),
  mockTaskItemUpdateMany: vi.fn(),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionFindUnique: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskFindUnique: vi.fn(),
  mockUserTaskCreate: vi.fn(),
  mockUserTaskUpdate: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockPayrollAdjustmentDeleteMany: vi.fn(),
  mockCalculateUserMonthlyStats: vi.fn(),
  mockCalculateMonthlyPayrollSummary: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: mockCheckInFindFirst,
      create: mockCheckInCreate,
      deleteMany: mockCheckInDeleteMany,
    },
    request: {
      findMany: mockRequestFindMany,
      create: mockRequestCreate,
    },
    taskItem: {
      findMany: mockTaskItemFindMany,
      findUnique: mockTaskItemFindUnique,
      create: mockTaskItemCreate,
      update: mockTaskItemUpdate,
      updateMany: mockTaskItemUpdateMany,
    },
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      findUnique: mockTaskDefinitionFindUnique,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      findUnique: mockUserTaskFindUnique,
      create: mockUserTaskCreate,
      update: mockUserTaskUpdate,
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
      deleteMany: mockPayrollAdjustmentDeleteMany,
    },
    workShift: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    allowedIP: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    holiday: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    shiftDuty: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-log-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

vi.mock("../src/lib/payroll-calculator", () => ({
  calculateUserMonthlyStats: mockCalculateUserMonthlyStats,
  calculateMonthlyPayrollSummary: mockCalculateMonthlyPayrollSummary,
}));

vi.mock("../src/lib/auto-schedule", () => ({
  ensureAdminNaSchedule: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/schedule-lock", () => ({
  isShiftLocked: vi.fn().mockReturnValue(false),
}));

vi.mock("../src/lib/payroll-period", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/schedule-penalty", () => ({
  applyLateSchedulePenalty: vi.fn().mockResolvedValue(undefined),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Staff Routes Valkey Caching & Invalidation Suite", () => {
  let staffToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let ttlStore: Map<string, number>;
  let mockRedis: any;

  const staffUserId = "staff-route-cache-user-1";
  const adminUserId = "admin-route-cache-user-1";

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetLocks();
    _resetRateLimits();

    memoryStore = new Map<string, string>();
    ttlStore = new Map<string, number>();

    mockRedis = {
      status: "ready",
      ping: vi.fn().mockResolvedValue("PONG"),
      get: vi.fn(async (key: string) => memoryStore.get(key) || null),
      setex: vi.fn(async (key: string, ttl: number, value: string) => {
        memoryStore.set(key, value);
        ttlStore.set(key, ttl);
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        let deleted = 0;
        for (const k of keys) {
          if (memoryStore.delete(k)) {
            ttlStore.delete(k);
            deleted++;
          }
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

    staffToken = await signAccessToken({
      sub: staffUserId,
      email: "staff@limart.vn",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: adminUserId,
      email: "admin@limart.vn",
      role: "ADMIN",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where?.id === staffUserId) {
        return {
          id: staffUserId,
          email: "staff@limart.vn",
          role: "USER",
          name: "Test Staff",
          staffTasksAllowed: true,
        };
      }
      if (where?.id === adminUserId) {
        return {
          id: adminUserId,
          email: "admin@limart.vn",
          role: "ADMIN",
          name: "Test Admin",
        };
      }
      return null;
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ============================================================================
  // 1. GET /api/staff/payroll
  // ============================================================================
  describe("1. GET /api/staff/payroll Caching", () => {
    const mockStats = {
      totalHours: 120,
      totalSalary: 6000000,
      daysWorked: 15,
      baseSalary: 6000000,
      totalAdjustments: 200000,
      lateCount: 1,
      latePenaltyHours: 0.5,
      latePenaltyAmount: 50000,
      dailyDetails: [],
    };

    it("caches staff payroll stats on repeated requests with TTL 120s (±15% jitter)", async () => {
      mockCalculateUserMonthlyStats.mockResolvedValue(mockStats);
      mockPayrollPeriodFindUnique.mockResolvedValue({
        month: 10,
        year: 2026,
        status: "OPEN",
      });

      const url = "/api/staff/payroll?month=10&year=2026";
      const expectedKey = `staff:payroll:${staffUserId}:10:2026`;

      // 1st request -> Cache MISS
      const res1 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data.stats.totalHours).toBe(120);
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);
      expect(mockPayrollPeriodFindUnique).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);

      // Verify TTL in range [120 * 0.85, 120 * 1.15]
      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(120 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(120 * 1.15) + 1);

      // 2nd request -> Cache HIT (zero DB / calculation calls)
      const res2 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.data.stats.totalHours).toBe(120);
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);
      expect(mockPayrollPeriodFindUnique).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 2. GET /api/staff/history
  // ============================================================================
  describe("2. GET /api/staff/history Caching", () => {
    const mockCheckins = [
      {
        id: 1,
        userId: staffUserId,
        type: "checkin",
        timestamp: new Date().toISOString(),
        ipAddress: "127.0.0.1",
      },
      {
        id: 2,
        userId: staffUserId,
        type: "checkout",
        timestamp: new Date().toISOString(),
        ipAddress: "127.0.0.1",
      },
    ];

    it("caches staff checkin history on repeated requests with TTL 60s (±15% jitter)", async () => {
      mockCheckInFindMany.mockResolvedValue(mockCheckins);

      const url = "/api/staff/history";
      const expectedKey = `staff:history:${staffUserId}`;

      // 1st request -> Cache MISS
      const res1 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data).toHaveLength(2);
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1);

      // Verify TTL in range [60 * 0.85, 60 * 1.15]
      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(60 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(60 * 1.15) + 1);

      // 2nd request -> Cache HIT
      const res2 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.data).toHaveLength(2);
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 3. GET /api/staff/requests
  // ============================================================================
  describe("3. GET /api/staff/requests Caching", () => {
    const mockRequests = [
      {
        id: 101,
        userId: staffUserId,
        type: "LEAVE",
        date: new Date().toISOString(),
        reason: "Nghỉ ốm",
        status: "PENDING",
      },
    ];

    it("caches staff requests on repeated requests with TTL 60s (±15% jitter)", async () => {
      mockRequestFindMany.mockResolvedValue(mockRequests);

      const url = "/api/staff/requests";
      const expectedKey = `user:requests:${staffUserId}`;

      // 1st request -> Cache MISS
      const res1 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data).toHaveLength(1);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);

      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(60 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(60 * 1.15) + 1);

      // 2nd request -> Cache HIT
      const res2 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.data).toHaveLength(1);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 4. GET /api/staff/tasks/market
  // ============================================================================
  describe("4. GET /api/staff/tasks/market Caching", () => {
    const mockItems = [
      {
        id: "item-1",
        taskDefId: 1,
        title: "Dán nhãn hộp quà",
        status: "OPEN",
        taskDefinition: { id: 1, name: "Dán nhãn", baseReward: 50000 },
      },
    ];

    it("caches open task market items with TTL 60s (±15% jitter)", async () => {
      mockTaskItemFindMany.mockResolvedValue(mockItems);

      const url = "/api/staff/tasks/market";
      const expectedKey = "tasks:market:open";

      // 1st request -> Cache MISS
      const res1 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data).toHaveLength(1);
      expect(mockTaskItemFindMany).toHaveBeenCalledTimes(1);

      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(60 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(60 * 1.15) + 1);

      // 2nd request -> Cache HIT
      const res2 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.data).toHaveLength(1);
      expect(mockTaskItemFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 5. GET /api/staff/tasks/available
  // ============================================================================
  describe("5. GET /api/staff/tasks/available Caching", () => {
    const mockDefinitions = [
      {
        id: 1,
        name: "Lắp ráp bao bì",
        active: true,
        unit: "hộp",
        baseReward: 10000,
      },
      {
        id: 2,
        name: "Kiểm đếm hàng hoá",
        active: true,
        unit: "kiện",
        baseReward: 20000,
      },
    ];

    it("caches available task definitions with TTL 600s (±15% jitter)", async () => {
      mockTaskDefinitionFindMany.mockResolvedValue(mockDefinitions);

      const url = "/api/staff/tasks/available";
      const expectedKey = "meta:task-definitions:available";

      // 1st request -> Cache MISS
      const res1 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data).toHaveLength(2);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);

      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(600 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(600 * 1.15) + 1);

      // 2nd request -> Cache HIT
      const res2 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.data).toHaveLength(2);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 6. GET /api/staff/tasks/my
  // ============================================================================
  describe("6. GET /api/staff/tasks/my Caching", () => {
    const mockUserTasks = [
      {
        id: "ut-1",
        userId: staffUserId,
        taskDefId: 1,
        status: "PENDING",
        taskDefinition: { id: 1, name: "Dán nhãn" },
        taskItem: null,
      },
    ];

    it("caches user's assigned tasks with TTL 60s (±15% jitter)", async () => {
      mockUserTaskFindMany.mockResolvedValue(mockUserTasks);

      const url = "/api/staff/tasks/my";
      const expectedKey = `user:tasks:my:${staffUserId}`;

      // 1st request -> Cache MISS
      const res1 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data).toHaveLength(1);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);

      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(60 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(60 * 1.15) + 1);

      // 2nd request -> Cache HIT
      const res2 = await app.request(url, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.data).toHaveLength(1);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 7. Cache Invalidation Triggers
  // ============================================================================
  describe("7. Cache Invalidation Triggers", () => {
    it("invalidates staff:history:* and staff:payroll:* when a checkin is performed", async () => {
      // Pre-seed cache
      memoryStore.set(`staff:history:${staffUserId}`, JSON.stringify([{ id: 1 }]));
      memoryStore.set(`staff:payroll:${staffUserId}:10:2026`, JSON.stringify({ stats: {} }));

      mockCheckInCreate.mockResolvedValue({
        id: 999,
        userId: staffUserId,
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "127.0.0.1",
      });

      const res = await app.request("/api/checkins/in", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has(`staff:history:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:payroll:${staffUserId}:10:2026`)).toBe(false);
    });

    it("invalidates staff:history:* and staff:payroll:* when admin performs manual checkin", async () => {
      memoryStore.set(`staff:history:${staffUserId}`, JSON.stringify([{ id: 1 }]));
      memoryStore.set(`staff:payroll:${staffUserId}:10:2026`, JSON.stringify({ stats: {} }));

      mockCheckInDeleteMany.mockResolvedValue({ count: 0 });
      mockCheckInCreate.mockResolvedValue({
        id: 998,
        userId: staffUserId,
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "Manual",
      });

      const res = await app.request("/api/admin/manual-checkin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: staffUserId,
          date: "2026-10-14",
          checkInTime: "08:00",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(`staff:history:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:payroll:${staffUserId}:10:2026`)).toBe(false);
    });

    it("invalidates tasks:market:* and user:tasks:my:* when a task is claimed", async () => {
      memoryStore.set("tasks:market:open", JSON.stringify([{ id: "item-10" }]));
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([]));

      mockTaskItemUpdateMany.mockResolvedValue({ count: 1 });
      mockTaskItemFindUnique.mockResolvedValue({
        id: "item-10",
        taskDefId: 1,
        title: "Test Task",
        taskDefinition: { id: 1, baseReward: 20000 },
      });
      mockUserTaskCreate.mockResolvedValue({
        id: "ut-10",
        userId: staffUserId,
        taskDefId: 1,
        taskItemId: "item-10",
        status: "PENDING",
      });

      const res = await app.request("/api/staff/tasks/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskItemId: "item-10" }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("tasks:market:open")).toBe(false);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
    });

    it("invalidates tasks:market:* and user:tasks:my:* when a task is started", async () => {
      memoryStore.set("tasks:market:open", JSON.stringify([{ id: "item-10" }]));
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([]));

      mockTaskDefinitionFindUnique.mockResolvedValue({
        id: 1,
        name: "Test Def",
        active: true,
        unit: "cái",
        baseReward: 15000,
      });
      mockCheckInFindFirst.mockResolvedValue(null);
      mockUserTaskCreate.mockResolvedValue({
        id: "ut-11",
        userId: staffUserId,
        taskDefId: 1,
        status: "PENDING",
      });

      const res = await app.request("/api/staff/tasks/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskDefId: 1 }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("tasks:market:open")).toBe(false);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
    });

    it("invalidates tasks:market:* and user:tasks:my:* when a task is submitted", async () => {
      memoryStore.set("tasks:market:open", JSON.stringify([{ id: "item-10" }]));
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([]));

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-11",
        userId: staffUserId,
        status: "PENDING",
        quantity: 1,
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-11",
        userId: staffUserId,
        status: "SUBMITTED",
      });

      const res = await app.request("/api/staff/tasks/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userTaskId: "ut-11",
          quantity: 2,
          evidenceLink: "https://example.com/proof",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("tasks:market:open")).toBe(false);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
    });

    it("invalidates user:tasks:my:* and tasks:market:* when admin reviews, approves, or rejects tasks", async () => {
      // 1. Admin approve
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([{ id: "ut-1" }]));
      memoryStore.set("tasks:market:open", JSON.stringify([{ id: "item-1" }]));

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-1",
        userId: staffUserId,
        quantity: 2,
        unitPrice: 20000,
        status: "SUBMITTED",
        taskItem: { title: "Dán nhãn" },
        taskDefinition: { name: "Dán nhãn" },
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-1",
        status: "APPROVED",
      });
      mockPayrollAdjustmentCreate.mockResolvedValue({ id: "adj-1" });

      const resApprove = await app.request("/api/admin/tasks/ut-1/approve", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(resApprove.status).toBe(200);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
      expect(memoryStore.has("tasks:market:open")).toBe(false);

      // 2. Admin reject
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([{ id: "ut-2" }]));
      memoryStore.set("tasks:market:open", JSON.stringify([{ id: "item-2" }]));

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-2",
        userId: staffUserId,
        status: "SUBMITTED",
        taskItem: { title: "Dán nhãn lỗi" },
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-2",
        status: "REJECTED",
      });

      const resReject = await app.request("/api/admin/tasks/ut-2/reject", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Lỗi chất lượng" }),
      });

      expect(resReject.status).toBe(200);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
      expect(memoryStore.has("tasks:market:open")).toBe(false);

      // 3. Admin review
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([{ id: "ut-3" }]));
      memoryStore.set("tasks:market:open", JSON.stringify([{ id: "item-3" }]));

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-3",
        userId: staffUserId,
        quantity: 1,
        unitPrice: 10000,
        status: "SUBMITTED",
        taskItem: { title: "Giao hàng" },
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-3",
        status: "APPROVED",
      });

      const resReview = await app.request("/api/admin/tasks/ut-3/review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision: "APPROVED" }),
      });

      expect(resReview.status).toBe(200);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
      expect(memoryStore.has("tasks:market:open")).toBe(false);
    });
  });
});
