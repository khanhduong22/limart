import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockPayrollPeriodFindUnique,
  mockPayrollPeriodUpdate,
  mockPayrollPeriodUpsert,
  mockPayslipFindUnique,
  mockPayslipFindMany,
  mockPayslipDeleteMany,
  mockPayslipCreateMany,
  mockPayslipCreate,
  mockPayslipUpsert,
  mockCheckInFindMany,
  mockWorkShiftFindMany,
  mockCalculateUserMonthlyStats,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockPayrollPeriodUpdate: vi.fn(),
  mockPayrollPeriodUpsert: vi.fn(),
  mockPayslipFindUnique: vi.fn(),
  mockPayslipFindMany: vi.fn(),
  mockPayslipDeleteMany: vi.fn(),
  mockPayslipCreateMany: vi.fn(),
  mockPayslipCreate: vi.fn(),
  mockPayslipUpsert: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockCalculateUserMonthlyStats: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
      count: vi.fn().mockResolvedValue(1),
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
      update: mockPayrollPeriodUpdate,
      upsert: mockPayrollPeriodUpsert,
    },
    payslip: {
      findUnique: mockPayslipFindUnique,
      findMany: mockPayslipFindMany,
      deleteMany: mockPayslipDeleteMany,
      createMany: mockPayslipCreateMany,
      create: mockPayslipCreate,
      upsert: mockPayslipUpsert,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      count: vi.fn().mockResolvedValue(0),
    },
    checkIn: {
      findMany: mockCheckInFindMany,
    },
    request: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    holiday: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    adjustment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    payrollAdjustment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "adj-1" }),
    },
    shiftDuty: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") {
        return cb(prismaMock);
      }
      return Promise.all(cb);
    }),
  };
  return { prisma: prismaMock };
});

vi.mock("../src/lib/payroll-calculator", () => ({
  calculateUserMonthlyStats: mockCalculateUserMonthlyStats,
  calculateMonthlyPayrollSummary: vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

vi.mock("../src/lib/auto-schedule", () => ({
  ensureAdminNaSchedule: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/schedule-lock", () => ({
  isShiftLocked: vi.fn().mockReturnValue(false),
}));

vi.mock("../src/lib/schedule-penalty", () => ({
  applyLateSchedulePenalty: vi.fn().mockResolvedValue(undefined),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, inFlightPromises, invalidatePayrollCache } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Closed User Payroll Caching & Staff Payroll Fast-Path Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let ttlStore: Map<string, number>;
  let mockRedis: any;

  const testStaffId = "staff-user-payroll-1";
  const testAdminId = "admin-user-payroll-1";
  const month = 10;
  const year = 2026;

  const mockPayslipContent = {
    totalHours: 140,
    totalSalary: 7000000,
    daysWorked: 18,
    baseSalary: 7000000,
    totalAdjustments: 300000,
    lateCount: 0,
    latePenaltyHours: 0,
    latePenaltyAmount: 0,
    bonusAmount: 200000,
    bonusPercent: 5,
    finalNet: 7500000,
    dailyDetails: [
      { date: "2026-10-01", hours: 8, salary: 400000 },
    ],
  };

  const mockLiveStats = {
    totalHours: 120,
    totalSalary: 6000000,
    daysWorked: 15,
    baseSalary: 6000000,
    totalAdjustments: 0,
    lateCount: 1,
    latePenaltyHours: 0.5,
    latePenaltyAmount: 50000,
    dailyDetails: [],
    employmentType: "PART_TIME",
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    inFlightPromises.clear();
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
        let count = 0;
        for (const k of keys) {
          if (memoryStore.delete(k)) {
            ttlStore.delete(k);
            count++;
          }
        }
        return count;
      }),
      keys: vi.fn(async (pattern: string) => {
        const regexStr = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        const regex = new RegExp(`^${regexStr}$`);
        const matched: string[] = [];
        for (const k of memoryStore.keys()) {
          if (regex.test(k)) matched.push(k);
        }
        return matched;
      }),
    };

    setRedisClient(mockRedis);

    adminToken = await signAccessToken({
      sub: testAdminId,
      email: "admin@limart.vn",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: testStaffId,
      email: "staff@limart.vn",
      role: "USER",
    });

    mockUserFindUnique.mockResolvedValue({
      id: testStaffId,
      name: "Nguyễn Văn Staff",
      email: "staff@limart.vn",
      role: "USER",
      isActive: true,
      employmentType: "PART_TIME",
      hourlyRate: 35000,
      monthlySalary: null,
      adjustments: [],
    });

    mockCheckInFindMany.mockResolvedValue([]);
    mockWorkShiftFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    setRedisClient(null);
    inFlightPromises.clear();
  });

  // ============================================================================
  // 1. GET /api/staff/payroll Fast-Path when Period is CLOSED
  // ============================================================================
  describe("1. GET /api/staff/payroll Fast-Path when Period is CLOSED", () => {
    it("returns payslip.content directly without recalculating live stats when period is CLOSED", async () => {
      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-1",
        month,
        year,
        status: "CLOSED",
      });

      mockPayslipFindUnique.mockResolvedValue({
        id: "payslip-staff-1",
        userId: testStaffId,
        month,
        year,
        content: mockPayslipContent,
        netSalary: 7500000,
        status: "PENDING",
      });

      const res = await app.request(`/api/staff/payroll?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isClosed).toBe(true);
      expect(json.data.month).toBe(month);
      expect(json.data.year).toBe(year);

      // Crucial: stats MUST match payslip.content snapshot
      expect(json.data.stats).toEqual(mockPayslipContent);

      // Crucial fast-path assertion: calculateUserMonthlyStats MUST NOT be called!
      expect(mockCalculateUserMonthlyStats).not.toHaveBeenCalled();

      // Verified payslip lookup was queried with compound unique key
      expect(mockPayslipFindUnique).toHaveBeenCalledWith({
        where: { userId_month_year: { userId: testStaffId, month, year } },
      });

      // Verify Redis caching: key stored with 300s TTL (±15% jitter: 255 - 345)
      const expectedKey = `staff:payroll:${testStaffId}:${month}:${year}`;
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex.mock.calls[0][0]).toBe(expectedKey);
      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(300 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(300 * 1.15) + 1);

      // 2nd Request: served strictly from Redis cache (0 DB queries)
      const res2 = await app.request(`/api/staff/payroll?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.stats).toEqual(mockPayslipContent);

      // No new DB lookups occurred on cache hit
      expect(mockPayrollPeriodFindUnique).toHaveBeenCalledTimes(1);
      expect(mockPayslipFindUnique).toHaveBeenCalledTimes(1);
      expect(mockCalculateUserMonthlyStats).not.toHaveBeenCalled();
    });

    it("falls back to calculateUserMonthlyStats if period is CLOSED but no payslip snapshot exists, caching with 300s TTL", async () => {
      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-1",
        month,
        year,
        status: "CLOSED",
      });

      // Payslip does not exist
      mockPayslipFindUnique.mockResolvedValue(null);
      mockCalculateUserMonthlyStats.mockResolvedValue(mockLiveStats);

      const res = await app.request(`/api/staff/payroll?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isClosed).toBe(true);
      expect(json.data.stats.totalHours).toBe(120);

      // Fallback calculation occurred
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);

      // TTL is still 300s because isClosed is true
      const expectedKey = `staff:payroll:${testStaffId}:${month}:${year}`;
      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(300 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(300 * 1.15) + 1);
    });
  });

  // ============================================================================
  // 2. GET /api/staff/payroll Live Calculation when Period is OPEN
  // ============================================================================
  describe("2. GET /api/staff/payroll Live Calculation when Period is OPEN", () => {
    it("calculates live stats and uses 120s TTL when payroll period is OPEN", async () => {
      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-1",
        month,
        year,
        status: "OPEN",
      });

      mockCalculateUserMonthlyStats.mockResolvedValue(mockLiveStats);

      const res = await app.request(`/api/staff/payroll?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isClosed).toBe(false);
      expect(json.data.stats).toEqual(mockLiveStats);

      // Live calculator was called
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);
      // Payslip was NOT looked up when status is OPEN
      expect(mockPayslipFindUnique).not.toHaveBeenCalled();

      // Verify Redis caching with 120s TTL (±15% jitter: 102 - 138)
      const expectedKey = `staff:payroll:${testStaffId}:${month}:${year}`;
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(120 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(120 * 1.15) + 1);

      // 2nd Request: served from cache
      const res2 = await app.request(`/api/staff/payroll?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 3. GET /api/admin/payroll/:userId Caching when CLOSED vs OPEN
  // ============================================================================
  describe("3. GET /api/admin/payroll/:userId Caching when CLOSED vs OPEN", () => {
    it("caches with 300s TTL when period is CLOSED and payslip exists", async () => {
      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-1",
        month,
        year,
        status: "CLOSED",
      });

      mockPayslipFindUnique.mockResolvedValue({
        id: "payslip-1",
        userId: testStaffId,
        month,
        year,
        content: mockPayslipContent,
        netSalary: 7500000,
        status: "PENDING",
      });

      const res = await app.request(`/api/admin/payroll/${testStaffId}?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isClosed).toBe(true);
      expect(json.data.stats).toEqual(mockPayslipContent);

      // Live stats calculation was bypassed
      expect(mockCalculateUserMonthlyStats).not.toHaveBeenCalled();

      // Verify Redis caching key and 300s TTL (±15% jitter)
      const expectedKey = `admin:payroll-user:${testStaffId}:${month}:${year}`;
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );

      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(300 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(300 * 1.15) + 1);

      // 2nd Request: served from cache
      const res2 = await app.request(`/api/admin/payroll/${testStaffId}?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
    });

    it("caches with 60s TTL when period is OPEN", async () => {
      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-1",
        month,
        year,
        status: "OPEN",
      });

      mockPayslipFindUnique.mockResolvedValue(null);
      mockCalculateUserMonthlyStats.mockResolvedValue(mockLiveStats);

      const res = await app.request(`/api/admin/payroll/${testStaffId}?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isClosed).toBe(false);

      // Verify Redis caching key and 60s TTL (±15% jitter: 51 - 69)
      const expectedKey = `admin:payroll-user:${testStaffId}:${month}:${year}`;
      const actualTTL = ttlStore.get(expectedKey);
      expect(actualTTL).toBeDefined();
      expect(actualTTL!).toBeGreaterThanOrEqual(Math.floor(60 * 0.85));
      expect(actualTTL!).toBeLessThanOrEqual(Math.ceil(60 * 1.15) + 1);
    });
  });

  // ============================================================================
  // 4. Cache Invalidation when Payroll Period is Reopened or Closed
  // ============================================================================
  describe("4. Cache Invalidation when Payroll Period is Reopened or Closed", () => {
    it("invalidates staff:payroll:* and admin:payroll-user:* on POST /api/admin/payroll/reopen", async () => {
      const staffKey = `staff:payroll:${testStaffId}:${month}:${year}`;
      const adminKey = `admin:payroll-user:${testStaffId}:${month}:${year}`;
      const adminSummaryKey = `admin:payroll:${month}:${year}`;

      memoryStore.set(staffKey, JSON.stringify({ cached: true }));
      memoryStore.set(adminKey, JSON.stringify({ cached: true }));
      memoryStore.set(adminSummaryKey, JSON.stringify({ cached: true }));

      expect(memoryStore.has(staffKey)).toBe(true);
      expect(memoryStore.has(adminKey)).toBe(true);
      expect(memoryStore.has(adminSummaryKey)).toBe(true);

      mockPayrollPeriodUpdate.mockResolvedValue({
        id: "period-1",
        month,
        year,
        status: "OPEN",
      });

      const res = await app.request("/api/admin/payroll/reopen", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month, year }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify both staff and admin user payroll caches are invalidated
      expect(memoryStore.has(staffKey)).toBe(false);
      expect(memoryStore.has(adminKey)).toBe(false);
      expect(memoryStore.has(adminSummaryKey)).toBe(false);
    });

    it("invalidates staff:payroll:* and admin:payroll-user:* on POST /api/admin/payroll/close", async () => {
      const staffKey = `staff:payroll:${testStaffId}:${month}:${year}`;
      const adminKey = `admin:payroll-user:${testStaffId}:${month}:${year}`;

      memoryStore.set(staffKey, JSON.stringify({ cached: true }));
      memoryStore.set(adminKey, JSON.stringify({ cached: true }));

      expect(memoryStore.has(staffKey)).toBe(true);
      expect(memoryStore.has(adminKey)).toBe(true);

      mockUserFindMany.mockResolvedValue([
        {
          id: testStaffId,
          name: "Nguyễn Văn Staff",
          email: "staff@limart.vn",
          role: "USER",
          employmentType: "PART_TIME",
        },
      ]);
      mockCalculateUserMonthlyStats.mockResolvedValue(mockLiveStats);
      mockPayrollPeriodUpsert.mockResolvedValue({
        id: "period-1",
        month,
        year,
        status: "CLOSED",
      });
      mockPayslipDeleteMany.mockResolvedValue({ count: 1 });
      mockPayslipCreateMany.mockResolvedValue({ count: 1 });

      const res = await app.request("/api/admin/payroll/close", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          month,
          year,
          bonusPercent: 5,
          targets: ["PART_TIME"],
          excludedBonusUsers: [],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Cache keys were flushed
      expect(memoryStore.has(staffKey)).toBe(false);
      expect(memoryStore.has(adminKey)).toBe(false);
    });

    it("invalidates all payroll cache patterns via invalidatePayrollCache()", async () => {
      const keys = [
        `staff:payroll:${testStaffId}:${month}:${year}`,
        `admin:payroll-user:${testStaffId}:${month}:${year}`,
        `admin:payroll:${month}:${year}`,
        `admin:payroll:closed-payslips:${month}:${year}`,
        `stats:monthly:${testStaffId}:${month}:${year}`,
      ];

      for (const k of keys) {
        memoryStore.set(k, JSON.stringify({ data: 123 }));
      }

      await invalidatePayrollCache();

      for (const k of keys) {
        expect(memoryStore.has(k)).toBe(false);
      }
    });
  });
});
