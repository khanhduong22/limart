import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindMany,
  mockUserFindUnique,
  mockCheckInFindMany,
  mockCheckInFindFirst,
  mockCheckInCreate,
  mockUserTaskFindMany,
  mockWorkShiftFindMany,
  mockWorkShiftFindFirst,
  mockAllowedIPFindMany,
  mockCalculateMonthlyPayrollSummary,
  mockCalculateUserMonthlyStats,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftFindFirst: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
  mockCalculateMonthlyPayrollSummary: vi.fn().mockResolvedValue({
    totalPayroll: 15000000,
    totalProjected: 18000000,
    details: [
      {
        userId: "staff-cache-rep-1",
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
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: mockCheckInFindFirst,
      create: mockCheckInCreate,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      findFirst: mockWorkShiftFindFirst,
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
      count: vi.fn().mockResolvedValue(1),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/lib/payroll-calculator", () => ({
  calculateMonthlyPayrollSummary: mockCalculateMonthlyPayrollSummary,
  calculateUserMonthlyStats: mockCalculateUserMonthlyStats,
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import {
  setRedisClient,
  invalidateScheduleCache,
  invalidatePayrollCache,
} from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Staff Reports Cache Invalidation Suite", () => {
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockUsers = [
    {
      id: "staff-cache-rep-1",
      name: "Alice Nguyen",
      role: "USER",
      image: null,
      employmentType: "PART_TIME",
      isActive: true,
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetLocks();
    _resetRateLimits();

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

    staffToken = await signAccessToken({
      sub: "staff-cache-rep-1",
      email: "staff1@limart.com",
      role: "USER",
    });

    mockAllowedIPFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue(mockUsers);
    mockCheckInFindMany.mockResolvedValue([]);
    mockUserTaskFindMany.mockResolvedValue([]);
    mockWorkShiftFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/staff/reports Cache Hit & Jitter TTL
  // ==========================================================================
  describe("1. GET /api/staff/reports Caching & Hit Verification", () => {
    it("caches staff reports with key staff:reports:10:2026 and serves subsequent requests from cache", async () => {
      const cacheKey = "staff:reports:10:2026";

      // Request 1: Cache Miss -> calculates and writes to cache
      const res1 = await app.request("/api/staff/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveProperty("totalPayrollCost");
      expect(json1.data).toHaveProperty("totalEmployeeCount");

      // Verify cached in memory store with key staff:reports:10:2026
      expect(memoryStore.has(cacheKey)).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex.mock.calls[0][0]).toBe(cacheKey);

      // Verify jitter TTL: base 180s ± 15% (153s to 207s)
      const ttl = mockRedis.setex.mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(153);
      expect(ttl).toBeLessThanOrEqual(207);

      const dbUserCalls = mockUserFindMany.mock.calls.length;

      // Request 2: Cache Hit -> served from Valkey cache without DB queries
      const res2 = await app.request("/api/staff/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(json1.data);

      // Verify no additional DB queries occurred
      expect(mockUserFindMany.mock.calls.length).toBe(dbUserCalls);
      expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    });
  });

  // ==========================================================================
  // 2. Cache Invalidation via POST /api/checkins
  // ==========================================================================
  describe("2. Cache Invalidation on Checkin Mutations", () => {
    it("invalidates staff:reports:* when checkin is recorded via POST /api/checkins", async () => {
      // Pre-seed cache with reports keys for current and previous months
      memoryStore.set("staff:reports:10:2026", JSON.stringify({ ok: true, month: 10 }));
      memoryStore.set("staff:reports:9:2026", JSON.stringify({ ok: true, month: 9 }));
      expect(memoryStore.has("staff:reports:10:2026")).toBe(true);
      expect(memoryStore.has("staff:reports:9:2026")).toBe(true);

      mockCheckInFindFirst.mockResolvedValueOnce(null); // No prior checkin
      mockCheckInCreate.mockResolvedValueOnce({
        id: 701,
        userId: "staff-cache-rep-1",
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "127.0.0.1",
      });

      const res = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "checkin" }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify staff:reports:* keys were evicted immediately
      expect(memoryStore.has("staff:reports:10:2026")).toBe(false);
      expect(memoryStore.has("staff:reports:9:2026")).toBe(false);
    });

    it("invalidates staff:reports:* when offline checkins are synced via POST /api/checkins/sync-offline", async () => {
      memoryStore.set("staff:reports:10:2026", JSON.stringify({ cached: true }));
      expect(memoryStore.has("staff:reports:10:2026")).toBe(true);

      mockCheckInFindFirst.mockResolvedValue(null);
      mockCheckInCreate.mockResolvedValue({
        id: 702,
        userId: "staff-cache-rep-1",
        type: "checkin",
        timestamp: new Date(),
      });

      const res = await app.request("/api/checkins/sync-offline", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              id: "offline-rep-1",
              type: "checkin",
              timestamp: Date.now() - 1800000,
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.synced).toBe(1);

      // Verify staff:reports:* was evicted
      expect(memoryStore.has("staff:reports:10:2026")).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Cache Invalidation via invalidateScheduleCache()
  // ==========================================================================
  describe("3. Cache Invalidation via invalidateScheduleCache()", () => {
    it("invalidates staff:reports:* pattern when invalidateScheduleCache() is called", async () => {
      memoryStore.set("staff:reports:10:2026", JSON.stringify({ month: 10 }));
      memoryStore.set("staff:reports:11:2026", JSON.stringify({ month: 11 }));
      memoryStore.set("admin:schedule:2026-10", JSON.stringify({ schedule: true }));
      memoryStore.set("shifts:my-shifts:user-1:10:2026", JSON.stringify([]));

      await invalidateScheduleCache();

      // Assert staff:reports:* keys were evicted along with schedule keys
      expect(memoryStore.has("staff:reports:10:2026")).toBe(false);
      expect(memoryStore.has("staff:reports:11:2026")).toBe(false);
      expect(memoryStore.has("admin:schedule:2026-10")).toBe(false);
      expect(memoryStore.has("shifts:my-shifts:user-1:10:2026")).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Cache Invalidation via invalidatePayrollCache()
  // ==========================================================================
  describe("4. Cache Invalidation via invalidatePayrollCache()", () => {
    it("invalidates staff:reports:* pattern when invalidatePayrollCache() is called", async () => {
      memoryStore.set("staff:reports:10:2026", JSON.stringify({ month: 10 }));
      memoryStore.set("staff:reports:11:2026", JSON.stringify({ month: 11 }));
      memoryStore.set("admin:reports:10:2026", JSON.stringify({ adminReport: true }));
      memoryStore.set("payroll:10:2026", JSON.stringify({ payroll: true }));

      await invalidatePayrollCache();

      // Assert staff:reports:* keys were evicted along with payroll & admin report keys
      expect(memoryStore.has("staff:reports:10:2026")).toBe(false);
      expect(memoryStore.has("staff:reports:11:2026")).toBe(false);
      expect(memoryStore.has("admin:reports:10:2026")).toBe(false);
      expect(memoryStore.has("payroll:10:2026")).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Full End-to-End Lifecycle: Cache -> Invalidation -> Recalculation
  // ==========================================================================
  describe("5. End-to-End Lifecycle: Read -> Invalidate -> Re-read", () => {
    it("completes full lifecycle: GET reports caches -> Checkin evicts -> next GET recalculates from DB", async () => {
      const cacheKey = "staff:reports:10:2026";

      // 1. Initial GET -> populates cache
      const res1 = await app.request("/api/staff/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res1.status).toBe(200);
      expect(memoryStore.has(cacheKey)).toBe(true);
      const dbCallsAfterFirstGet = mockUserFindMany.mock.calls.length;

      // 2. Second GET -> hits cache (no new DB query)
      const res2 = await app.request("/api/staff/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      expect(mockUserFindMany.mock.calls.length).toBe(dbCallsAfterFirstGet);

      // 3. User checks in -> evicts staff:reports:*
      mockCheckInFindFirst.mockResolvedValueOnce(null);
      mockCheckInCreate.mockResolvedValueOnce({
        id: 703,
        userId: "staff-cache-rep-1",
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "127.0.0.1",
      });

      const checkinRes = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "checkin" }),
      });
      expect(checkinRes.status).toBe(201);
      expect(memoryStore.has(cacheKey)).toBe(false);

      // 4. Third GET -> cache miss due to eviction -> fetches fresh data from DB
      const res3 = await app.request("/api/staff/reports?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res3.status).toBe(200);
      expect(mockUserFindMany.mock.calls.length).toBeGreaterThan(dbCallsAfterFirstGet);
      expect(memoryStore.has(cacheKey)).toBe(true);
    });
  });
});
