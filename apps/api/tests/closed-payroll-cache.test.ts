import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockPayrollPeriodFindUnique,
  mockPayrollPeriodUpdate,
  mockPayrollPeriodUpsert,
  mockPayslipFindUnique,
  mockPayslipFindMany,
  mockPayslipUpsert,
  mockWorkShiftFindUnique,
  mockWorkShiftFindMany,
  mockWorkShiftCount,
  mockWorkShiftUpdateMany,
  mockShiftAuditLogCreate,
  mockCheckInFindMany,
  mockRequestFindMany,
  mockHolidayFindMany,
  mockAdjustmentFindMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockPayrollPeriodUpdate: vi.fn(),
  mockPayrollPeriodUpsert: vi.fn(),
  mockPayslipFindUnique: vi.fn(),
  mockPayslipFindMany: vi.fn(),
  mockPayslipUpsert: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftCount: vi.fn(),
  mockWorkShiftUpdateMany: vi.fn(),
  mockShiftAuditLogCreate: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockHolidayFindMany: vi.fn(),
  mockAdjustmentFindMany: vi.fn(),
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
      upsert: mockPayslipUpsert,
    },
    workShift: {
      findUnique: mockWorkShiftFindUnique,
      findMany: mockWorkShiftFindMany,
      count: mockWorkShiftCount,
      updateMany: mockWorkShiftUpdateMany,
    },
    shiftAuditLog: {
      create: mockShiftAuditLogCreate,
    },
    checkIn: {
      findMany: mockCheckInFindMany,
    },
    request: {
      findMany: mockRequestFindMany,
    },
    holiday: {
      findMany: mockHolidayFindMany,
    },
    adjustment: {
      findMany: mockAdjustmentFindMany,
    },
    payrollAdjustment: {
      create: vi.fn().mockResolvedValue({ id: "adj-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    shiftDuty: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "duty-1" }),
      delete: vi.fn().mockResolvedValue({ id: "duty-1" }),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-test" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") {
        return cb(prismaMock);
      }
      return Promise.all(cb);
    }),
  };
  return { prisma: prismaMock };
});

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, inFlightPromises } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Closed Payroll Payslips Caching & Shift Audit Invalidation Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let otherStaffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const testAdminId = "admin-payroll-id-1";
  const testStaffId = "staff-user-id-1";
  const otherStaffId = "staff-user-id-2";

  beforeEach(async () => {
    vi.clearAllMocks();
    inFlightPromises.clear();
    _resetLocks();
    _resetRateLimits();

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
      email: "staff1@limart.vn",
      role: "USER",
    });

    otherStaffToken = await signAccessToken({
      sub: otherStaffId,
      email: "staff2@limart.vn",
      role: "USER",
    });

    mockCheckInFindMany.mockResolvedValue([]);
    mockWorkShiftFindMany.mockResolvedValue([]);
    mockRequestFindMany.mockResolvedValue([]);
    mockHolidayFindMany.mockResolvedValue([]);
    mockAdjustmentFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    setRedisClient(null);
    inFlightPromises.clear();
  });

  // ==========================================================================
  // 1. GET /api/admin/payroll/summary Caching when period is CLOSED
  // ==========================================================================
  describe("1. GET /api/admin/payroll/summary when period is CLOSED", () => {
    it("caches closed payslips snapshot with TTL 300s and avoids repeated DB lookups", async () => {
      const month = 10;
      const year = 2026;

      mockUserFindMany.mockResolvedValue([
        {
          id: testStaffId,
          name: "Trần Nhân Viên",
          email: "staff1@limart.vn",
          role: "USER",
          hourlyRate: 35000,
          monthlySalary: null,
          employmentType: "PART_TIME",
          adjustments: [],
        },
      ]);

      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-10-2026",
        month,
        year,
        status: "CLOSED",
        bonusPercent: 0,
        bonusTargets: ["PART_TIME"],
        excludedBonusUsers: [],
      });

      const mockPayslipList = [
        {
          id: "payslip-1",
          userId: testStaffId,
          month,
          year,
          content: {
            totalHours: 120,
            baseSalary: 4200000,
            bonusAmount: 0,
            latePenaltyAmount: 0,
            totalSalary: 4200000,
            employmentType: "PART_TIME",
          },
          netSalary: 4200000,
          status: "PENDING",
          emailSentAt: null,
          user: {
            id: testStaffId,
            name: "Trần Nhân Viên",
            email: "staff1@limart.vn",
            role: "USER",
            employmentType: "PART_TIME",
            hourlyRate: 35000,
            adjustments: [],
          },
        },
      ];

      mockPayslipFindMany.mockResolvedValue(mockPayslipList);

      // 1st request: Cache MISS -> executes prisma.payslip.findMany
      const res1 = await app.request(`/api/admin/payroll/summary?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.isClosed).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(json1.data[0].userId).toBe(testStaffId);
      expect(json1.data[0].actualHours).toBe(120);
      expect(mockPayslipFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis closed payslip cache key and outer cache key are set
      const closedKey = `admin:payroll:closed-payslips:${month}:${year}`;
      const outerKey = `admin:payroll:${month}:${year}`;
      expect(memoryStore.has(closedKey)).toBe(true);
      expect(memoryStore.has(outerKey)).toBe(true);

      // 2nd request: Evict outer cache to specifically test the closed payslips cache layer
      memoryStore.delete(outerKey);

      const res2 = await app.request(`/api/admin/payroll/summary?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.isClosed).toBe(true);
      expect(json2.data).toEqual(json1.data);
      // mockPayslipFindMany must NOT have been called again!
      expect(mockPayslipFindMany).toHaveBeenCalledTimes(1);

      // 3rd request: Also test that /api/admin/payroll (alias) hits the cache cleanly
      const res3 = await app.request(`/api/admin/payroll?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res3.status).toBe(200);
      const json3 = await res3.json();
      expect(json3.success).toBe(true);
      expect(json3.data).toEqual(json1.data);
      expect(mockPayslipFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. GET /api/admin/payroll/summary Cache Bypass when period is OPEN
  // ==========================================================================
  describe("2. GET /api/admin/payroll/summary when period is OPEN", () => {
    it("bypasses closed payslips cache and does not call prisma.payslip.findMany", async () => {
      const month = 11;
      const year = 2026;

      mockUserFindMany.mockResolvedValue([
        {
          id: testStaffId,
          name: "Trần Nhân Viên",
          email: "staff1@limart.vn",
          role: "USER",
          hourlyRate: 35000,
          monthlySalary: null,
          employmentType: "PART_TIME",
          adjustments: [],
        },
      ]);

      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-11-2026",
        month,
        year,
        status: "OPEN",
        bonusPercent: 0,
        bonusTargets: ["PART_TIME"],
        excludedBonusUsers: [],
      });

      const res = await app.request(`/api/admin/payroll/summary?month=${month}&year=${year}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.isClosed).toBe(false);

      // prisma.payslip.findMany must NOT be called when period is OPEN
      expect(mockPayslipFindMany).toHaveBeenCalledTimes(0);

      // Closed payslips cache key must NOT exist in Redis
      const closedKey = `admin:payroll:closed-payslips:${month}:${year}`;
      expect(memoryStore.has(closedKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Cache Invalidation on POST /api/admin/payroll/reopen
  // ==========================================================================
  describe("3. POST /api/admin/payroll/reopen cache invalidation", () => {
    it("invalidates admin:payroll:closed-payslips:* when reopening a payroll period", async () => {
      const month = 10;
      const year = 2026;

      const closedKey = `admin:payroll:closed-payslips:${month}:${year}`;
      const outerKey = `admin:payroll:${month}:${year}`;
      memoryStore.set(closedKey, JSON.stringify([{ id: "cached-slip" }]));
      memoryStore.set(outerKey, JSON.stringify({ success: true, data: [] }));

      mockPayrollPeriodUpdate.mockResolvedValue({
        id: "period-10-2026",
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
      expect(json.message).toContain("Đã mở lại sổ tính lương");

      // Verify closed payslips cache and payroll cache are invalidated
      expect(memoryStore.has(closedKey)).toBe(false);
      expect(memoryStore.has(outerKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Cache Invalidation on POST /api/admin/payroll/close & bonus
  // ==========================================================================
  describe("4. POST /api/admin/payroll/close and /payroll/bonus cache invalidation", () => {
    it("invalidates admin:payroll:closed-payslips:* on /payroll/close", async () => {
      const month = 10;
      const year = 2026;

      const closedKey = `admin:payroll:closed-payslips:${month}:${year}`;
      memoryStore.set(closedKey, JSON.stringify([{ id: "stale-closed" }]));

      mockUserFindMany.mockResolvedValue([]);
      mockPayrollPeriodUpsert.mockResolvedValue({
        id: "period-10-2026",
        month,
        year,
        status: "CLOSED",
      });

      const res = await app.request("/api/admin/payroll/close", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month, year }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(closedKey)).toBe(false);
    });

    it("invalidates admin:payroll:closed-payslips:* on /payroll/bonus", async () => {
      const month = 10;
      const year = 2026;

      const closedKey = `admin:payroll:closed-payslips:${month}:${year}`;
      memoryStore.set(closedKey, JSON.stringify([{ id: "stale-bonus" }]));

      mockPayrollPeriodUpsert.mockResolvedValue({
        id: "period-10-2026",
        month,
        year,
        bonusPercent: 15,
      });

      const res = await app.request("/api/admin/payroll/bonus", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month, year, bonusPercent: 15 }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(closedKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Shift Audit Invalidation on POST /api/staff/schedule/:id/take
  // ==========================================================================
  describe("5. POST /api/staff/schedule/:id/take schedule cache invalidation", () => {
    it("creates ShiftAuditLog with TAKE_SWAP and flushes admin:schedule:* and admin:schedule:history:*", async () => {
      const shiftId = 999;
      const shiftStart = new Date("2026-10-20T08:00:00.000Z");
      const shiftEnd = new Date("2026-10-20T12:00:00.000Z");

      const existingShift = {
        id: shiftId,
        userId: otherStaffId,
        start: shiftStart,
        end: shiftEnd,
        isOpenForSwap: true,
        user: {
          id: otherStaffId,
          name: "Other Staff",
          image: null,
          email: "staff2@limart.vn",
        },
      };

      mockWorkShiftFindUnique.mockResolvedValue(existingShift);
      mockPayrollPeriodFindUnique.mockResolvedValue({ status: "OPEN" });
      mockWorkShiftCount.mockResolvedValue(0); // No overlap
      mockWorkShiftUpdateMany.mockResolvedValue({ count: 1 });
      mockShiftAuditLogCreate.mockResolvedValue({
        id: "audit-log-1",
        shiftId,
        action: "TAKE_SWAP",
      });

      // Pre-seed Redis cache with schedule history & admin schedule keys
      const historyKey = "admin:schedule:history:1:50:all:all";
      const weekKey = "admin:schedule:2026-10-20";
      const userShiftsKey = `shifts:my-shifts:${testStaffId}:2026-10`;
      const otherShiftsKey = `shifts:my-shifts:${otherStaffId}:2026-10`;

      memoryStore.set(historyKey, JSON.stringify({ total: 1, logs: [] }));
      memoryStore.set(weekKey, JSON.stringify({ shifts: [] }));
      memoryStore.set(userShiftsKey, JSON.stringify([]));
      memoryStore.set(otherShiftsKey, JSON.stringify([]));

      const res = await app.request(`/api/staff/schedule/${shiftId}/take`, {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("Đã nhận ca thành công");

      // Verify ShiftAuditLog was created
      expect(mockShiftAuditLogCreate).toHaveBeenCalledTimes(1);
      expect(mockShiftAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shiftId,
            userId: testStaffId,
            action: "TAKE_SWAP",
            changedById: testStaffId,
          }),
        })
      );

      // Verify all schedule caches including admin:schedule:history:* were invalidated
      expect(memoryStore.has(historyKey)).toBe(false);
      expect(memoryStore.has(weekKey)).toBe(false);
      expect(memoryStore.has(userShiftsKey)).toBe(false);
      expect(memoryStore.has(otherShiftsKey)).toBe(false);
    });
  });
});
