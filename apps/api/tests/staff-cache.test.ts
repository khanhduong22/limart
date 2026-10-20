import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockWorkShiftFindMany,
  mockWorkShiftCreate,
  mockWorkShiftFindUnique,
  mockWorkShiftFindFirst,
  mockWorkShiftUpdate,
  mockWorkShiftUpdateMany,
  mockWorkShiftDelete,
  mockWorkShiftCount,
  mockUserFindMany,
  mockUserFindUnique,
  mockCheckInFindMany,
  mockUserTaskFindMany,
  mockShiftDutyFindMany,
  mockShiftAuditLogCreate,
  mockCalculateMonthlyPayrollSummary,
  mockCalculateUserMonthlyStats,
} = vi.hoisted(() => ({
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftFindFirst: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockWorkShiftUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockWorkShiftDelete: vi.fn(),
  mockWorkShiftCount: vi.fn().mockResolvedValue(0),
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockShiftDutyFindMany: vi.fn(),
  mockShiftAuditLogCreate: vi.fn(),
  mockCalculateMonthlyPayrollSummary: vi.fn().mockResolvedValue({
    totalPayroll: 15000000,
    totalProjected: 18000000,
    details: [
      {
        userId: "staff-cache-user-1",
        userName: "Alice Nguyen",
        role: "USER",
        employmentType: "PART_TIME",
        actualHours: 80,
        daysWorked: 10,
        totalOvertimeHours: 5,
        leaderboardOvertimeHours: 5,
      },
    ],
  }),
  mockCalculateUserMonthlyStats: vi.fn().mockResolvedValue({
    totalHours: 80,
    daysWorked: 10,
    totalOvertimeHours: 5,
    leaderboardOvertimeHours: 5,
  }),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    workShift: {
      findMany: mockWorkShiftFindMany,
      create: mockWorkShiftCreate,
      findUnique: mockWorkShiftFindUnique,
      findFirst: mockWorkShiftFindFirst,
      update: mockWorkShiftUpdate,
      updateMany: mockWorkShiftUpdateMany,
      delete: mockWorkShiftDelete,
      count: mockWorkShiftCount,
    },
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    userTask: {
      findMany: mockUserTaskFindMany,
    },
    shiftDuty: {
      findMany: mockShiftDutyFindMany,
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    shiftAuditLog: {
      create: mockShiftAuditLogCreate,
    },
    allowedIP: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
  },
}));

vi.mock("../src/lib/payroll-calculator", () => ({
  calculateMonthlyPayrollSummary: mockCalculateMonthlyPayrollSummary,
  calculateUserMonthlyStats: mockCalculateUserMonthlyStats,
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
  reconcileFalseLateSchedulePenalties: vi.fn().mockResolvedValue({ deletedCount: 0, details: [] }),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import {
  setRedisClient,
  invalidateShiftDutyCache,
  invalidateScheduleCache,
} from "../src/lib/cache";

describe("Staff Valkey Caching Suite (Schedule, Rewards Leaderboard, Reports)", () => {
  let staffToken: string;
  let staffToken2: string;
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

    staffToken = await signAccessToken({
      sub: "staff-cache-user-1",
      email: "staff1@limart.com",
      role: "USER",
    });

    staffToken2 = await signAccessToken({
      sub: "staff-cache-user-2",
      email: "staff2@limart.com",
      role: "USER",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/staff/schedule Caching
  // ==========================================================================
  describe("1. GET /api/staff/schedule Caching", () => {
    const mockShifts = [
      {
        id: 101,
        userId: "staff-cache-user-1",
        start: new Date("2026-10-14T08:30:00.000Z"),
        end: new Date("2026-10-14T12:00:00.000Z"),
        shiftType: "MORNING",
        status: "APPROVED",
        user: {
          id: "staff-cache-user-1",
          name: "Alice Nguyen",
          image: null,
          email: "staff1@limart.com",
        },
      },
    ];

    it("caches shifts on first GET and serves from cache on second GET (Cache Hit)", async () => {
      mockWorkShiftFindMany.mockResolvedValue(mockShifts);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/staff/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex called with key and jittered TTL around 120s
      const cacheKey = "staff:schedule:staff-cache-user-1:10:2026";
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex.mock.calls[0][0]).toBe(cacheKey);
      const ttl = mockRedis.setex.mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(102);
      expect(ttl).toBeLessThanOrEqual(138);

      // Request 2: Cache Hit
      const res2 = await app.request("/api/staff/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      // DB query should NOT have been called again!
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    });

    it("caches shifts with default 'curr' placeholders when month and year are omitted", async () => {
      mockWorkShiftFindMany.mockResolvedValue(mockShifts);

      const res = await app.request("/api/staff/schedule", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      const expectedKey = "staff:schedule:staff-cache-user-1:curr:curr";
      expect(mockRedis.setex.mock.calls[0][0]).toBe(expectedKey);
    });

    it("enforces staff privacy isolation (separate cache keys per user)", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce([mockShifts[0]]);
      mockWorkShiftFindMany.mockResolvedValueOnce([
        {
          id: 102,
          userId: "staff-cache-user-2",
          start: new Date("2026-10-15T08:30:00.000Z"),
          end: new Date("2026-10-15T12:00:00.000Z"),
          shiftType: "MORNING",
          status: "APPROVED",
          user: {
            id: "staff-cache-user-2",
            name: "Bob Tran",
            image: null,
            email: "staff2@limart.com",
          },
        },
      ]);

      // User 1
      await app.request("/api/staff/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      // User 2
      await app.request("/api/staff/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken2}` },
      });

      expect(memoryStore.has("staff:schedule:staff-cache-user-1:10:2026")).toBe(true);
      expect(memoryStore.has("staff:schedule:staff-cache-user-2:10:2026")).toBe(true);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // 2. GET /api/staff/rewards/leaderboard Caching
  // ==========================================================================
  describe("2. GET /api/staff/rewards/leaderboard Caching", () => {
    const mockUsers = [
      {
        id: "staff-cache-user-1",
        name: "Alice Nguyen",
        email: "staff1@limart.com",
        role: "USER",
        isActive: true,
        employmentType: "PART_TIME",
        hourlyRate: 30000,
        monthlySalary: null,
      },
      {
        id: "staff-cache-user-2",
        name: "Bob Tran",
        email: "staff2@limart.com",
        role: "USER",
        isActive: true,
        employmentType: "PART_TIME",
        hourlyRate: 30000,
        monthlySalary: null,
      },
    ];

    it("caches leaderboard calculation and serves from cache on subsequent request", async () => {
      mockUserFindMany.mockResolvedValue(mockUsers);
      mockCheckInFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockUserTaskFindMany.mockResolvedValue([]);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/staff/rewards/leaderboard?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveProperty("topDiscipline");
      expect(json1.data).toHaveProperty("topHardworking");
      expect(json1.data).toHaveProperty("topOvertime");
      expect(json1.data).toHaveProperty("topPacking");
      expect(json1.data).toHaveProperty("topCarrying");

      const cacheKey = "staff:rewards:leaderboard:10:2026";
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex.mock.calls[0][0]).toBe(cacheKey);
      const ttl = mockRedis.setex.mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(153);
      expect(ttl).toBeLessThanOrEqual(207);

      const dbUserCalls = mockUserFindMany.mock.calls.length;
      expect(dbUserCalls).toBeGreaterThan(0);

      // Request 2: Cache Hit
      const res2 = await app.request("/api/staff/rewards/leaderboard?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(json1.data);

      // No new DB calls during cache hit
      expect(mockUserFindMany.mock.calls.length).toBe(dbUserCalls);
      expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    });
  });

  // ==========================================================================
  // 3. GET /api/staff/reports Caching
  // ==========================================================================
  describe("3. GET /api/staff/reports Caching", () => {
    const mockUsers = [
      {
        id: "staff-cache-user-1",
        name: "Alice Nguyen",
        role: "USER",
        image: null,
        employmentType: "PART_TIME",
        isActive: true,
      },
    ];

    it("caches monthly reports calculation and serves from cache on subsequent request", async () => {
      mockUserFindMany.mockResolvedValue(mockUsers);
      mockCheckInFindMany.mockResolvedValue([]);
      mockUserTaskFindMany.mockResolvedValue([]);
      mockWorkShiftFindMany.mockResolvedValue([]);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/staff/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveProperty("totalPayrollCost");
      expect(json1.data).toHaveProperty("totalEmployeeCount");
      expect(json1.data).toHaveProperty("topHardworking");
      expect(json1.data).toHaveProperty("topDiscipline");

      const cacheKey = "staff:reports:10:2026";
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex.mock.calls[0][0]).toBe(cacheKey);
      const ttl = mockRedis.setex.mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(153);
      expect(ttl).toBeLessThanOrEqual(207);

      const dbUserCalls = mockUserFindMany.mock.calls.length;

      // Request 2: Cache Hit
      const res2 = await app.request("/api/staff/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(json1.data);

      // No new DB calls during cache hit
      expect(mockUserFindMany.mock.calls.length).toBe(dbUserCalls);
      expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    });
  });

  // ==========================================================================
  // 4. Cache Invalidation Suite
  // ==========================================================================
  describe("4. Cache Invalidation Suite", () => {
    it("invalidates staff:schedule:*, staff:rewards:*, and staff:reports:* when a shift is registered", async () => {
      // Pre-seed cache
      memoryStore.set("staff:schedule:staff-cache-user-1:10:2026", JSON.stringify([]));
      memoryStore.set("staff:rewards:leaderboard:10:2026", JSON.stringify({}));
      memoryStore.set("staff:reports:10:2026", JSON.stringify({}));

      mockWorkShiftFindFirst.mockResolvedValue(null); // No overlap
      mockWorkShiftCreate.mockResolvedValue({
        id: 105,
        userId: "staff-cache-user-1",
        start: new Date("2026-10-25T08:30:00.000Z"),
        end: new Date("2026-10-25T12:00:00.000Z"),
        shiftType: "MORNING",
        status: "APPROVED",
        user: {
          id: "staff-cache-user-1",
          name: "Alice Nguyen",
          image: null,
          email: "staff1@limart.com",
        },
      });

      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-25",
          shift: "MORNING",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify cached keys are deleted!
      expect(memoryStore.has("staff:schedule:staff-cache-user-1:10:2026")).toBe(false);
      expect(memoryStore.has("staff:rewards:leaderboard:10:2026")).toBe(false);
      expect(memoryStore.has("staff:reports:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:*, staff:rewards:*, and staff:reports:* when a shift is cancelled", async () => {
      memoryStore.set("staff:schedule:staff-cache-user-1:10:2026", JSON.stringify([]));
      memoryStore.set("staff:rewards:leaderboard:10:2026", JSON.stringify({}));
      memoryStore.set("staff:reports:10:2026", JSON.stringify({}));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 106,
        userId: "staff-cache-user-1",
        start: new Date("2026-10-26T08:30:00.000Z"),
      });
      mockWorkShiftDelete.mockResolvedValue({ id: 106 });

      const res = await app.request("/api/staff/schedule/cancel", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shiftId: 106 }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("staff:schedule:staff-cache-user-1:10:2026")).toBe(false);
      expect(memoryStore.has("staff:rewards:leaderboard:10:2026")).toBe(false);
      expect(memoryStore.has("staff:reports:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:*, staff:rewards:*, and staff:reports:* when a shift swap is updated", async () => {
      memoryStore.set("staff:schedule:staff-cache-user-1:10:2026", JSON.stringify([]));
      memoryStore.set("staff:rewards:leaderboard:10:2026", JSON.stringify({}));
      memoryStore.set("staff:reports:10:2026", JSON.stringify({}));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 107,
        userId: "staff-cache-user-1",
        start: new Date("2026-10-27T08:30:00.000Z"),
        isOpenForSwap: false,
        user: { id: "staff-cache-user-1" },
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 107,
        isOpenForSwap: true,
        user: { id: "staff-cache-user-1" },
      });

      const res = await app.request("/api/staff/schedule/107/swap", {
        method: "POST",
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("staff:schedule:staff-cache-user-1:10:2026")).toBe(false);
      expect(memoryStore.has("staff:rewards:leaderboard:10:2026")).toBe(false);
      expect(memoryStore.has("staff:reports:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:*, staff:rewards:*, and staff:reports:* when a shift is claimed via /take", async () => {
      memoryStore.set("staff:schedule:staff-cache-user-1:10:2026", JSON.stringify([]));
      memoryStore.set("staff:rewards:leaderboard:10:2026", JSON.stringify({}));
      memoryStore.set("staff:reports:10:2026", JSON.stringify({}));

      // Another user owns shift 108
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 108,
        userId: "staff-cache-user-2",
        start: new Date("2026-10-28T08:30:00.000Z"),
        end: new Date("2026-10-28T12:00:00.000Z"),
        isOpenForSwap: true,
        user: { id: "staff-cache-user-2", name: "Bob", email: "bob@example.com" },
      });
      mockWorkShiftFindFirst.mockResolvedValue(null); // No overlap
      mockWorkShiftUpdate.mockResolvedValue({
        id: 108,
        userId: "staff-cache-user-1",
        isOpenForSwap: false,
        user: { id: "staff-cache-user-1", name: "Alice", email: "alice@example.com" },
      });

      const res = await app.request("/api/staff/schedule/108/take", {
        method: "POST",
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("staff:schedule:staff-cache-user-1:10:2026")).toBe(false);
      expect(memoryStore.has("staff:rewards:leaderboard:10:2026")).toBe(false);
      expect(memoryStore.has("staff:reports:10:2026")).toBe(false);
    });

    it("direct call to invalidateShiftDutyCache invalidates schedule, rewards, and reports patterns", async () => {
      const mockKeys = vi.fn().mockResolvedValue(["key-1"]);
      const mockDel = vi.fn().mockResolvedValue(1);

      setRedisClient({
        status: "ready",
        keys: mockKeys,
        del: mockDel,
      } as any);

      await invalidateShiftDutyCache();

      const invalidatedPatterns = mockKeys.mock.calls.map((c) => c[0]);
      expect(invalidatedPatterns).toContain("staff:schedule:*");
      expect(invalidatedPatterns).toContain("staff:rewards:*");
      expect(invalidatedPatterns).toContain("staff:reports:*");
      expect(invalidatedPatterns).toContain("shift-duties:*");
      expect(invalidatedPatterns).toContain("shifts:*");
      expect(invalidatedPatterns).toContain("staff:home:*");
      expect(invalidatedPatterns).toContain("admin:schedule:*");
    });

    it("direct call to invalidateScheduleCache invalidates staff:schedule:* pattern", async () => {
      const mockKeys = vi.fn().mockResolvedValue(["key-1"]);
      const mockDel = vi.fn().mockResolvedValue(1);

      setRedisClient({
        status: "ready",
        keys: mockKeys,
        del: mockDel,
      } as any);

      await invalidateScheduleCache();

      const invalidatedPatterns = mockKeys.mock.calls.map((c) => c[0]);
      expect(invalidatedPatterns).toContain("staff:schedule:*");
      expect(invalidatedPatterns).toContain("admin:schedule:*");
      expect(invalidatedPatterns).toContain("shifts:*");
      expect(invalidatedPatterns).toContain("shift-duties:*");
    });
  });
});
