import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockUserCreate,
  mockUserUpdate,
  mockUserDelete,
  mockCalculateUserMonthlyStats,
  mockShiftAuditLogFindMany,
  mockShiftAuditLogCount,
  mockShiftAuditLogCreate,
  mockWorkShiftFindUnique,
  mockWorkShiftFindMany,
  mockWorkShiftCreate,
  mockWorkShiftUpdate,
  mockWorkShiftDelete,
  mockWorkShiftDeleteMany,
  mockLuckyWheelPrizeFindMany,
  mockLuckyWheelPrizeCreate,
  mockLuckyWheelPrizeUpdate,
  mockLuckyWheelPrizeDelete,
  mockLuckyWheelHistoryFindMany,
  mockLuckyWheelHistoryCreate,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserDelete: vi.fn(),
  mockCalculateUserMonthlyStats: vi.fn(),
  mockShiftAuditLogFindMany: vi.fn(),
  mockShiftAuditLogCount: vi.fn(),
  mockShiftAuditLogCreate: vi.fn().mockResolvedValue({ id: 1 }),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockWorkShiftDelete: vi.fn(),
  mockWorkShiftDeleteMany: vi.fn(),
  mockLuckyWheelPrizeFindMany: vi.fn(),
  mockLuckyWheelPrizeCreate: vi.fn(),
  mockLuckyWheelPrizeUpdate: vi.fn(),
  mockLuckyWheelPrizeDelete: vi.fn(),
  mockLuckyWheelHistoryFindMany: vi.fn(),
  mockLuckyWheelHistoryCreate: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock = {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
      create: mockUserCreate,
      update: mockUserUpdate,
      delete: mockUserDelete,
      count: vi.fn().mockResolvedValue(10),
    },
    workShift: {
      findUnique: mockWorkShiftFindUnique,
      findMany: mockWorkShiftFindMany,
      create: mockWorkShiftCreate,
      update: mockWorkShiftUpdate,
      delete: mockWorkShiftDelete,
      deleteMany: mockWorkShiftDeleteMany,
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    shiftAuditLog: {
      findMany: mockShiftAuditLogFindMany,
      count: mockShiftAuditLogCount,
      create: mockShiftAuditLogCreate,
    },
    shiftDuty: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    luckyWheelPrize: {
      findMany: mockLuckyWheelPrizeFindMany,
      create: mockLuckyWheelPrizeCreate,
      update: mockLuckyWheelPrizeUpdate,
      delete: mockLuckyWheelPrizeDelete,
    },
    luckyWheelHistory: {
      findMany: mockLuckyWheelHistoryFindMany,
      create: mockLuckyWheelHistoryCreate,
      count: vi.fn().mockResolvedValue(0),
    },
    payrollPeriod: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    payrollAdjustment: {
      create: vi.fn().mockResolvedValue({ id: "adj-1" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    allowedIP: {
      count: vi.fn().mockResolvedValue(1),
    },
    request: {
      count: vi.fn().mockResolvedValue(0),
    },
    userTask: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    checkIn: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcement: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcementRead: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

vi.mock("../src/lib/payroll-calculator", () => ({
  calculateUserMonthlyStats: mockCalculateUserMonthlyStats,
  calculateMonthlyPayrollSummary: vi.fn().mockResolvedValue({ totalPayroll: 0 }),
}));

vi.mock("../src/lib/schedule-penalty", () => ({
  applyLateSchedulePenalty: vi.fn().mockResolvedValue(undefined),
  reconcileFalseLateSchedulePenalties: vi.fn().mockResolvedValue({ deletedCount: 0, details: [] }),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Admin Extended Endpoints Valkey Caching Suite", () => {
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetLocks();
    _resetRateLimits();

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
      sub: "admin-ext-tester",
      email: "admin.ext@example.com",
      role: "ADMIN",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/admin/employees/:id Caching & Invalidation
  // ==========================================================================
  describe("1. GET /api/admin/employees/:id Cache & Invalidation", () => {
    const mockEmployee = {
      id: "emp-100",
      name: "Nguyen Van A",
      email: "vana@example.com",
      role: "USER",
      employmentType: "PART_TIME",
      hourlyRate: 35000,
      monthlySalary: 0,
      isActive: true,
      luckyWheelAllowed: true,
      staffTasksAllowed: true,
      achievements: [],
      adjustments: [],
      requests: [],
    };

    const mockStats = {
      totalHours: 120,
      estimatedSalary: 4200000,
      lateMinutes: 15,
      actualLateTimes: 1,
      shiftsCount: 20,
    };

    it("caches employee detail under admin:employee-detail:${id}:${month}:${year} for 60s with jitter", async () => {
      mockUserFindUnique.mockResolvedValueOnce(mockEmployee);
      mockCalculateUserMonthlyStats.mockResolvedValueOnce(mockStats);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/admin/employees/emp-100?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.user.id).toBe("emp-100");
      expect(json1.data.stats.totalHours).toBe(120);
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);

      // Verify Redis setex was called with proper key and ~60s TTL
      const expectedKey = "admin:employee-detail:emp-100:10:2026";
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
      const setexCall = (mockRedis.setex as any).mock.calls.find(
        (call: any[]) => call[0] === expectedKey
      );
      expect(setexCall).toBeDefined();
      const ttl = setexCall[1];
      expect(ttl).toBeGreaterThanOrEqual(Math.floor(60 * 0.85));
      expect(ttl).toBeLessThanOrEqual(Math.ceil(60 * 1.15) + 1);

      // Request 2: Cache Hit
      const res2 = await app.request("/api/admin/employees/emp-100?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.user.id).toBe("emp-100");
      expect(json2.data.stats.totalHours).toBe(120);
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);
    });

    it("invalidates admin:employee-detail:* when employee status is toggled via PATCH /api/admin/employees/:id/status", async () => {
      // Seed cache
      const cacheKey = "admin:employee-detail:emp-100:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ user: mockEmployee, stats: mockStats }));

      mockUserUpdate.mockResolvedValueOnce({
        ...mockEmployee,
        isActive: false,
      });

      // Update status
      const patchRes = await app.request("/api/admin/employees/emp-100/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ isActive: false }),
      });

      expect(patchRes.status).toBe(200);
      expect(mockRedis.del).toHaveBeenCalled();
      // Ensure the key is removed from cache store
      expect(memoryStore.has(cacheKey)).toBe(false);

      // Next GET request causes cache miss and re-fetches from DB
      mockUserFindUnique.mockResolvedValueOnce({ ...mockEmployee, isActive: false });
      mockCalculateUserMonthlyStats.mockResolvedValueOnce(mockStats);

      const resAfter = await app.request("/api/admin/employees/emp-100?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resAfter.status).toBe(200);
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
    });

    it("invalidates admin:employee-detail:* when status is toggled via alias PATCH /api/admin/users/:id/status", async () => {
      const cacheKey = "admin:employee-detail:emp-100:10:2026";
      memoryStore.set(cacheKey, JSON.stringify({ user: mockEmployee, stats: mockStats }));

      mockUserUpdate.mockResolvedValueOnce({
        ...mockEmployee,
        isActive: true,
      });

      const patchRes = await app.request("/api/admin/users/emp-100/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ isActive: true }),
      });

      expect(patchRes.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. GET /api/admin/schedule/history Caching & Invalidation
  // ==========================================================================
  describe("2. GET /api/admin/schedule/history Cache & Invalidation", () => {
    const mockLogs = [
      {
        id: 1,
        shiftId: 10,
        userId: "emp-100",
        action: "CREATE",
        changedById: "admin-ext-tester",
        oldStart: null,
        oldEnd: null,
        newStart: new Date("2026-10-15T02:00:00.000Z"),
        newEnd: new Date("2026-10-15T10:00:00.000Z"),
        createdAt: new Date("2026-10-14T10:00:00.000Z"),
        user: { id: "emp-100", name: "Nguyen Van A", email: "vana@example.com" },
        changedBy: { id: "admin-ext-tester", name: "Admin", email: "admin.ext@example.com" },
      },
    ];

    it("caches schedule history under admin:schedule:history:page:pageSize:startDate:endDate for 60s with jitter", async () => {
      mockShiftAuditLogFindMany.mockResolvedValueOnce(mockLogs);
      mockShiftAuditLogCount.mockResolvedValueOnce(1);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/admin/schedule/history?page=1&pageSize=50", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(json1.logs).toHaveLength(1);
      expect(json1.total).toBe(1);
      expect(mockShiftAuditLogFindMany).toHaveBeenCalledTimes(1);
      expect(mockShiftAuditLogCount).toHaveBeenCalledTimes(1);

      const expectedKey = "admin:schedule:history:1:50:all:all";
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
      const setexCall = (mockRedis.setex as any).mock.calls.find(
        (call: any[]) => call[0] === expectedKey
      );
      expect(setexCall).toBeDefined();
      const ttl = setexCall[1];
      expect(ttl).toBeGreaterThanOrEqual(Math.floor(60 * 0.85));
      expect(ttl).toBeLessThanOrEqual(Math.ceil(60 * 1.15) + 1);

      // Request 2: Cache Hit
      const res2 = await app.request("/api/admin/schedule/history?page=1&pageSize=50", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      expect(json2.total).toBe(1);
      expect(mockShiftAuditLogFindMany).toHaveBeenCalledTimes(1); // Not called again
      expect(mockShiftAuditLogCount).toHaveBeenCalledTimes(1);
    });

    it("invalidates admin:schedule:history:* when a shift is created (POST /api/admin/schedule)", async () => {
      const cacheKey = "admin:schedule:history:1:50:all:all";
      memoryStore.set(cacheKey, JSON.stringify({ logs: mockLogs, total: 1 }));

      mockWorkShiftCreate.mockResolvedValueOnce({
        id: 10,
        userId: "emp-100",
        start: new Date("2026-10-15T02:00:00.000Z"),
        end: new Date("2026-10-15T10:00:00.000Z"),
        shiftType: "FULL",
        status: "APPROVED",
        isSenior: false,
        isOpenForSwap: false,
        user: { id: "emp-100", name: "Nguyen Van A", email: "vana@example.com", role: "USER", employmentType: "PART_TIME" },
        duties: [],
      });
      mockShiftAuditLogCreate.mockResolvedValueOnce({ id: 2 });

      const res = await app.request("/api/admin/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          userId: "emp-100",
          start: "2026-10-15T09:00:00+07:00",
          end: "2026-10-15T17:00:00+07:00",
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates admin:schedule:history:* when a shift is deleted (DELETE /api/admin/schedule/:id)", async () => {
      const cacheKey = "admin:schedule:history:1:50:all:all";
      memoryStore.set(cacheKey, JSON.stringify({ logs: mockLogs, total: 1 }));

      mockWorkShiftFindUnique.mockResolvedValueOnce({
        id: 10,
        userId: "emp-100",
        start: new Date("2026-10-15T02:00:00.000Z"),
        end: new Date("2026-10-15T10:00:00.000Z"),
      });
      mockWorkShiftDelete.mockResolvedValueOnce({ id: 10 });

      const res = await app.request("/api/admin/schedule/10", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates admin:schedule:history:* when a shift is updated (PUT /api/admin/schedule/:id)", async () => {
      const cacheKey = "admin:schedule:history:1:50:all:all";
      memoryStore.set(cacheKey, JSON.stringify({ logs: mockLogs, total: 1 }));

      mockWorkShiftFindUnique.mockResolvedValueOnce({
        id: 10,
        userId: "emp-100",
        start: new Date("2026-10-15T02:00:00.000Z"),
        end: new Date("2026-10-15T10:00:00.000Z"),
      });
      mockWorkShiftUpdate.mockResolvedValueOnce({
        id: 10,
        userId: "emp-100",
        start: new Date("2026-10-15T02:00:00.000Z"),
        end: new Date("2026-10-15T11:00:00.000Z"),
        shiftType: "FULL",
        status: "APPROVED",
        isSenior: false,
        isOpenForSwap: false,
        user: { id: "emp-100", name: "Nguyen Van A", email: "vana@example.com", role: "USER", employmentType: "PART_TIME" },
        duties: [],
      });

      const res = await app.request("/api/admin/schedule/10", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          end: "2026-10-15T18:00:00+07:00",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 3. GET /api/admin/lucky-wheel Caching & Invalidation
  // ==========================================================================
  describe("3. GET /api/admin/lucky-wheel Cache & Invalidation", () => {
    const mockPrizes = [
      {
        id: "prize-1",
        name: "Phiếu giảm giá 50k",
        description: "Áp dụng hóa đơn trên 200k",
        value: 50000,
        type: "VOUCHER",
        quantity: 100,
        remaining: 95,
        probability: 20,
        active: true,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    ];

    const mockHistory = [
      {
        id: "hist-1",
        userId: "emp-100",
        prizeId: "prize-1",
        createdAt: new Date("2026-10-10T10:00:00.000Z"),
        user: {
          id: "emp-100",
          name: "Nguyen Van A",
          email: "vana@example.com",
          role: "USER",
          image: null,
        },
      },
    ];

    it("caches lucky wheel prizes and history under admin:lucky-wheel:all for 60s with jitter", async () => {
      mockLuckyWheelPrizeFindMany.mockResolvedValueOnce(mockPrizes);
      mockLuckyWheelHistoryFindMany.mockResolvedValueOnce(mockHistory);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/admin/lucky-wheel", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.prizes).toHaveLength(1);
      expect(json1.history).toHaveLength(1);
      expect(mockLuckyWheelPrizeFindMany).toHaveBeenCalledTimes(1);
      expect(mockLuckyWheelHistoryFindMany).toHaveBeenCalledTimes(1);

      const expectedKey = "admin:lucky-wheel:all";
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
      const setexCall = (mockRedis.setex as any).mock.calls.find(
        (call: any[]) => call[0] === expectedKey
      );
      expect(setexCall).toBeDefined();
      const ttl = setexCall[1];
      expect(ttl).toBeGreaterThanOrEqual(Math.floor(60 * 0.85));
      expect(ttl).toBeLessThanOrEqual(Math.ceil(60 * 1.15) + 1);

      // Request 2: Cache Hit
      const res2 = await app.request("/api/admin/lucky-wheel", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.prizes).toHaveLength(1);
      expect(json2.history).toHaveLength(1);
      expect(mockLuckyWheelPrizeFindMany).toHaveBeenCalledTimes(1); // Not called again
      expect(mockLuckyWheelHistoryFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates admin:lucky-wheel:* when a prize is updated (PUT /api/admin/lucky-wheel/prizes/:id)", async () => {
      const cacheKey = "admin:lucky-wheel:all";
      memoryStore.set(cacheKey, JSON.stringify({ prizes: mockPrizes, history: mockHistory }));

      mockLuckyWheelPrizeUpdate.mockResolvedValueOnce({
        ...mockPrizes[0],
        name: "Phiếu giảm giá 100k",
      });

      const res = await app.request("/api/admin/lucky-wheel/prizes/prize-1", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ name: "Phiếu giảm giá 100k" }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates admin:lucky-wheel:* when a prize is created (POST /api/admin/lucky-wheel/prizes)", async () => {
      const cacheKey = "admin:lucky-wheel:all";
      memoryStore.set(cacheKey, JSON.stringify({ prizes: mockPrizes, history: mockHistory }));

      mockLuckyWheelPrizeCreate.mockResolvedValueOnce({
        id: "prize-2",
        name: "Áo thun Limart",
        value: 150000,
        type: "PHYSICAL",
      });

      const res = await app.request("/api/admin/lucky-wheel/prizes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Áo thun Limart",
          value: 150000,
          quantity: 20,
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });

    it("invalidates admin:lucky-wheel:* when a prize is deleted (DELETE /api/admin/lucky-wheel/prizes/:id)", async () => {
      const cacheKey = "admin:lucky-wheel:all";
      memoryStore.set(cacheKey, JSON.stringify({ prizes: mockPrizes, history: mockHistory }));

      mockLuckyWheelPrizeDelete.mockResolvedValueOnce({ id: "prize-1" });

      const res = await app.request("/api/admin/lucky-wheel/prizes/prize-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(false);
    });
  });
});
