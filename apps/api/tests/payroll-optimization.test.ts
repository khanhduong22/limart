import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockCheckInFindMany,
  mockCheckInDeleteMany,
  mockCheckInCreate,
  mockWorkShiftFindMany,
  mockRequestFindMany,
  mockHolidayFindMany,
  mockStaffTaskFindMany,
  mockPayrollPeriodFindUnique,
  mockPayrollAdjustmentCreate,
  mockPayrollAdjustmentFindFirst,
  mockSessionAuditLogCreate,
  mockUserCount,
  mockAllowedIPCount,
  mockRequestCount,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInDeleteMany: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockHolidayFindMany: vi.fn(),
  mockStaffTaskFindMany: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockPayrollAdjustmentFindFirst: vi.fn(),
  mockSessionAuditLogCreate: vi.fn(),
  mockUserCount: vi.fn(),
  mockAllowedIPCount: vi.fn(),
  mockRequestCount: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
      count: mockUserCount,
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      deleteMany: mockCheckInDeleteMany,
      create: mockCheckInCreate,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
    },
    request: {
      findMany: mockRequestFindMany,
      count: mockRequestCount,
    },
    holiday: {
      findMany: mockHolidayFindMany,
    },
    staffTask: {
      findMany: mockStaffTaskFindMany,
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
      findFirst: mockPayrollAdjustmentFindFirst,
    },
    sessionAuditLog: {
      create: mockSessionAuditLogCreate,
    },
    allowedIP: {
      count: mockAllowedIPCount,
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

import * as cacheModule from "../src/lib/cache";
import {
  calculateMonthlyPayrollSummary,
  calculateUserMonthlyStats,
} from "../src/lib/payroll-calculator";
import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";

describe("Payroll Calculator N+1 Elimination & Valkey Caching", () => {
  let adminToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await signAccessToken({
      sub: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
    });
  });

  describe("1. N+1 Holiday Query & Sequential Loop Elimination", () => {
    it("queries prisma.holiday.findMany exactly ONCE for 10 users in calculateMonthlyPayrollSummary", async () => {
      // 10 users to simulate multiple staff
      const mockUsers = Array.from({ length: 10 }, (_, i) => ({
        id: `user-${i + 1}`,
        name: `Staff ${i + 1}`,
        role: "USER",
        employmentType: "PART_TIME",
        hourlyRate: 30000,
        monthlySalary: null,
      }));

      mockUserFindMany.mockResolvedValue(mockUsers);
      mockHolidayFindMany.mockResolvedValue([
        { id: 1, date: new Date("2026-10-20"), multiplier: 2.0, name: "Phụ nữ VN" },
      ]);

      // Mock user unique returns
      mockUserFindUnique.mockImplementation(async ({ where }) => {
        const u = mockUsers.find((user) => user.id === where.id);
        if (!u) return null;
        return {
          ...u,
          adjustments: [],
          payslips: [],
        };
      });

      mockCheckInFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockRequestFindMany.mockResolvedValue([]);
      mockStaffTaskFindMany.mockResolvedValue([]);

      const targetDate = new Date("2026-10-15T00:00:00Z");
      const summary = await calculateMonthlyPayrollSummary(targetDate);

      expect(summary).toBeDefined();
      expect(summary.details).toHaveLength(10);

      // Holiday must be queried exactly ONCE at the summary level, NOT 10 times!
      expect(mockHolidayFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("2. Valkey Cache Key & TTL Contracts", () => {
    it("calculateUserMonthlyStats invokes getOrSetCache with stats:monthly:${userId}:${month}:${year} and TTL 300", async () => {
      const getOrSetCacheSpy = vi.spyOn(cacheModule, "getOrSetCache");

      mockUserFindUnique.mockResolvedValue({
        id: "emp-42",
        name: "Test Staff",
        role: "USER",
        employmentType: "PART_TIME",
        hourlyRate: 30000,
        monthlySalary: null,
        adjustments: [],
        payslips: [],
      });
      mockCheckInFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockRequestFindMany.mockResolvedValue([]);
      mockHolidayFindMany.mockResolvedValue([]);

      const targetDate = new Date("2026-10-15T00:00:00Z");
      await calculateUserMonthlyStats("emp-42", targetDate);

      expect(getOrSetCacheSpy).toHaveBeenCalledWith(
        "stats:monthly:emp-42:10:2026",
        300,
        expect.any(Function)
      );

      getOrSetCacheSpy.mockRestore();
    });

    it("GET /api/admin/dashboard caches dashboard summary under admin:dashboard:summary:${month}:${year} (TTL 180)", async () => {
      const getOrSetCacheSpy = vi.spyOn(cacheModule, "getOrSetCache");

      mockUserCount.mockResolvedValue(5);
      mockAllowedIPCount.mockResolvedValue(1);
      mockRequestCount.mockResolvedValue(0);
      mockCheckInFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockUserFindMany.mockResolvedValue([]);
      mockHolidayFindMany.mockResolvedValue([]);

      const res = await app.request("/api/admin/dashboard", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);

      const dashboardCall = getOrSetCacheSpy.mock.calls.find((call) =>
        call[0].startsWith("admin:dashboard:summary:")
      );
      expect(dashboardCall).toBeDefined();
      expect(dashboardCall?.[1]).toBe(180);

      getOrSetCacheSpy.mockRestore();
    });

    it("GET /api/admin/dashboard-stats caches dashboard summary under admin:dashboard:summary:${month}:${year} (TTL 180)", async () => {
      const getOrSetCacheSpy = vi.spyOn(cacheModule, "getOrSetCache");

      mockUserCount.mockResolvedValue(5);
      mockRequestCount.mockResolvedValue(0);
      mockCheckInFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockUserFindMany.mockResolvedValue([]);
      mockHolidayFindMany.mockResolvedValue([]);

      const res = await app.request("/api/admin/dashboard-stats", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);

      const statsCall = getOrSetCacheSpy.mock.calls.find((call) =>
        call[0].startsWith("admin:dashboard:summary:")
      );
      expect(statsCall).toBeDefined();
      expect(statsCall?.[1]).toBe(180);

      getOrSetCacheSpy.mockRestore();
    });
  });

  describe("3. Cache Invalidation on Attendance & Adjustments", () => {
    it("POST /api/admin/manual-checkin invalidates admin:dashboard* and stats:monthly:*", async () => {
      const invalidateSpy = vi.spyOn(cacheModule, "invalidateCachePattern").mockResolvedValue();

      mockCheckInDeleteMany.mockResolvedValue({ count: 0 });
      mockCheckInCreate.mockResolvedValue({
        id: 99,
        userId: "user-test",
        type: "checkin",
        timestamp: new Date(),
      });
      mockSessionAuditLogCreate.mockResolvedValue({ id: "audit-1" });

      const res = await app.request("/api/admin/manual-checkin", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "user-test",
          date: "2026-10-15",
          checkInTime: "08:00",
          checkOutTime: "17:00",
        }),
      });

      expect(res.status).toBe(200);

      const patternsInvalidated = invalidateSpy.mock.calls.map((call) => call[0]);
      expect(patternsInvalidated).toContain("admin:dashboard*");
      expect(patternsInvalidated).toContain("stats:monthly:*");

      invalidateSpy.mockRestore();
    });

    it("POST /api/admin/adjustments invalidates admin:dashboard* and stats:monthly:*", async () => {
      const invalidateSpy = vi.spyOn(cacheModule, "invalidateCachePattern").mockResolvedValue();

      mockPayrollPeriodFindUnique.mockResolvedValue({
        month: 10,
        year: 2026,
        status: "OPEN",
      });
      mockPayrollAdjustmentCreate.mockResolvedValue({
        id: 1,
        userId: "user-test",
        amount: 200000,
        reason: "Thưởng chuyên cần",
      });

      const res = await app.request("/api/admin/adjustments", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "user-test",
          amount: 200000,
          reason: "Thưởng chuyên cần",
          date: "2026-10-15",
        }),
      });

      expect(res.status).toBe(200);

      const patternsInvalidated = invalidateSpy.mock.calls.map((call) => call[0]);
      expect(patternsInvalidated).toContain("admin:dashboard*");
      expect(patternsInvalidated).toContain("stats:monthly:*");

      invalidateSpy.mockRestore();
    });

    it("invalidatePayrollCache and invalidateUserStatsCache invalidate admin:dashboard* and stats:monthly:*", async () => {
      const mockKeys = vi.fn().mockResolvedValue(["key1"]);
      const mockDel = vi.fn().mockResolvedValue(1);
      cacheModule.setRedisClient({
        status: "ready",
        keys: mockKeys,
        del: mockDel,
      } as any);

      await cacheModule.invalidatePayrollCache();
      let patterns = mockKeys.mock.calls.map((call) => call[0]);
      expect(patterns).toContain("admin:dashboard*");
      expect(patterns).toContain("stats:monthly:*");

      mockKeys.mockClear();

      await cacheModule.invalidateUserStatsCache("user-1");
      patterns = mockKeys.mock.calls.map((call) => call[0]);
      expect(patterns).toContain("admin:dashboard*");
      expect(patterns).toContain("stats:monthly:user-1:*");

      cacheModule.setRedisClient(null);
    });
  });
});
