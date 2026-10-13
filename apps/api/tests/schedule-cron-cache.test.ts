import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockWorkShiftFindMany,
  mockWorkShiftFindUnique,
  mockWorkShiftUpdate,
  mockPayrollPeriodFindUnique,
  mockRunBirthdayBonus,
  mockRunCarryingBonus,
  mockRunPackingBonus,
  mockClosePayrollMonth,
  mockAutoScheduleAdminNa,
} = vi.hoisted(() => ({
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockRunBirthdayBonus: vi.fn(),
  mockRunCarryingBonus: vi.fn(),
  mockRunPackingBonus: vi.fn(),
  mockClosePayrollMonth: vi.fn(),
  mockAutoScheduleAdminNa: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    workShift: {
      findMany: mockWorkShiftFindMany,
      findUnique: mockWorkShiftFindUnique,
      update: mockWorkShiftUpdate,
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

vi.mock("@checkin/shared", () => ({
  runBirthdayBonus: mockRunBirthdayBonus,
  runCarryingBonus: mockRunCarryingBonus,
  runPackingBonus: mockRunPackingBonus,
}));

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

describe("Schedule Valkey Caching & Cron Invalidation Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let staff2Token: string;
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

    process.env.CRON_SECRET = "schedule-cron-test-secret";
    process.env.NODE_ENV = "production";

    adminToken = await signAccessToken({
      sub: "admin-sched-1",
      email: "admin.sched@example.com",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: "staff-sched-1",
      email: "staff.sched@example.com",
      role: "USER",
    });

    staff2Token = await signAccessToken({
      sub: "staff-sched-2",
      email: "staff2.sched@example.com",
      role: "USER",
    });

    mockPayrollPeriodFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    setRedisClient(null);
    process.env.CRON_SECRET = originalCronSecret;
    process.env.NODE_ENV = originalNodeEnv;
  });

  // ==========================================================================
  // 1. GET /api/schedule Valkey Caching
  // ==========================================================================
  describe("1. GET /api/schedule Caching", () => {
    const mockShifts = [
      {
        id: 101,
        userId: "staff-sched-1",
        start: new Date("2026-10-05T08:00:00.000Z"),
        end: new Date("2026-10-05T17:00:00.000Z"),
        user: {
          id: "staff-sched-1",
          name: "Staff One",
          email: "staff.sched@example.com",
          image: null,
          role: "USER",
          employmentType: "PART_TIME",
        },
        duties: [
          {
            id: "duty-1",
            title: "Check Inventory",
            description: "Check morning stocks",
            isCompleted: false,
            date: new Date("2026-10-05T08:00:00.000Z"),
          },
        ],
      },
    ];

    it("caches schedule response on repeated calls for all users (Admin)", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce(mockShifts);

      const url = "/api/schedule?start=2026-10-01T00:00:00.000Z&end=2026-10-31T23:59:59.999Z";

      // Request 1: Cache Miss
      const res1 = await app.request(url, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis key stored
      const cacheKey = "shifts:schedule:all:2026-10-01:2026-10-31";
      expect(mockRedis.setex).toHaveBeenCalledWith(cacheKey, expect.any(Number), expect.any(String));
      expect(memoryStore.has(cacheKey)).toBe(true);

      // Request 2: Cache Hit
      const res2 = await app.request(url, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(json1.data);
      // DB must NOT be called again
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    });

    it("caches schedule response partitioned by target userId (Admin query)", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce(mockShifts);

      const url =
        "/api/schedule?start=2026-10-01T00:00:00.000Z&end=2026-10-31T23:59:59.999Z&userId=staff-sched-1";

      const res1 = await app.request(url, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);

      const targetCacheKey = "shifts:schedule:staff-sched-1:2026-10-01:2026-10-31";
      expect(memoryStore.has(targetCacheKey)).toBe(true);

      // Repeated call hits cache
      const res2 = await app.request(url, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. GET /api/schedule/my and /my-shifts Valkey Caching
  // ==========================================================================
  describe("2. GET /api/schedule/my & /my-shifts Caching", () => {
    const mockUserShifts = [
      {
        id: 202,
        userId: "staff-sched-1",
        start: new Date("2026-10-10T08:00:00.000Z"),
        end: new Date("2026-10-10T17:00:00.000Z"),
        duties: [],
      },
    ];

    it("caches GET /api/schedule/my and returns cache on repeated calls", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce(mockUserShifts);

      const url = "/api/schedule/my?start=2026-10-01T00:00:00.000Z&end=2026-10-31T23:59:59.999Z";

      // 1st call: DB fetch
      const res1 = await app.request(url, {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);

      const cacheKey = "shifts:my:staff-sched-1:2026-10-01:2026-10-31";
      expect(memoryStore.has(cacheKey)).toBe(true);

      // 2nd call: Cache Hit
      const res2 = await app.request(url, {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.data).toEqual(json1.data);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);
    });

    it("shares cache between /api/schedule/my and /api/schedule/my-shifts", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce(mockUserShifts);

      const url1 = "/api/schedule/my?start=2026-10-01T00:00:00.000Z&end=2026-10-31T23:59:59.999Z";
      const url2 = "/api/schedule/my-shifts?start=2026-10-01T00:00:00.000Z&end=2026-10-31T23:59:59.999Z";

      // Request via /my populates cache
      const res1 = await app.request(url1, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res1.status).toBe(200);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);

      // Request via /my-shifts hits the exact same cache key!
      const res2 = await app.request(url2, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. Cache Invalidation on Shift Swap & Take
  // ==========================================================================
  describe("3. Shift Swap & Take Cache Invalidation", () => {
    it("invalidates shifts:* cache when a shift is marked for swap", async () => {
      // Seed memoryStore with schedule and my-shifts cache
      memoryStore.set("shifts:schedule:all:2026-10-01:2026-10-31", JSON.stringify([{ id: 101 }]));
      memoryStore.set("shifts:my:staff-sched-1:2026-10-01:2026-10-31", JSON.stringify([{ id: 101 }]));
      memoryStore.set("admin:schedule:2026-10", JSON.stringify({ ok: true }));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 101,
        userId: "staff-sched-1",
        start: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks in future (unlocked)
        end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 8 * 3600 * 1000),
        isOpenForSwap: false,
        user: { id: "staff-sched-1", name: "Staff 1", image: null, email: "staff1@example.com" },
      });

      mockWorkShiftUpdate.mockResolvedValue({
        id: 101,
        userId: "staff-sched-1",
        start: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isOpenForSwap: true,
        user: { id: "staff-sched-1", name: "Staff 1", image: null, email: "staff1@example.com" },
      });

      const swapRes = await app.request("/api/schedule/101/swap", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isOpen: true }),
      });

      expect(swapRes.status).toBe(200);
      const swapJson = await swapRes.json();
      expect(swapJson.success).toBe(true);

      // Verify shifts:* and admin:schedule:* keys were invalidated
      expect(memoryStore.has("shifts:schedule:all:2026-10-01:2026-10-31")).toBe(false);
      expect(memoryStore.has("shifts:my:staff-sched-1:2026-10-01:2026-10-31")).toBe(false);
      expect(memoryStore.has("admin:schedule:2026-10")).toBe(false);
    });

    it("invalidates shifts:*, payroll:*, stats:* when a shift is taken by another staff", async () => {
      // Seed memoryStore with schedule, payroll, stats cache
      memoryStore.set("shifts:schedule:all:2026-10-01:2026-10-31", JSON.stringify([{ id: 101 }]));
      memoryStore.set("shifts:my:staff-sched-1:2026-10-01:2026-10-31", JSON.stringify([{ id: 101 }]));
      memoryStore.set("payroll:overview:10:2026", JSON.stringify({ total: 1000000 }));
      memoryStore.set("stats:monthly:staff-sched-1:2026:10", JSON.stringify({ totalHours: 40 }));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 101,
        userId: "staff-sched-1",
        start: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 8 * 3600 * 1000),
        isOpenForSwap: true,
        user: { id: "staff-sched-1", name: "Staff 1", image: null, email: "staff1@example.com" },
      });

      mockWorkShiftUpdate.mockResolvedValue({
        id: 101,
        userId: "staff-sched-2",
        start: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isOpenForSwap: false,
        user: { id: "staff-sched-2", name: "Staff 2", image: null, email: "staff2@example.com" },
      });

      const takeRes = await app.request("/api/schedule/101/take", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staff2Token}`,
        },
      });

      expect(takeRes.status).toBe(200);
      const takeJson = await takeRes.json();
      expect(takeJson.success).toBe(true);

      // Verify all related cache keys are evicted
      expect(memoryStore.has("shifts:schedule:all:2026-10-01:2026-10-31")).toBe(false);
      expect(memoryStore.has("shifts:my:staff-sched-1:2026-10-01:2026-10-31")).toBe(false);
      expect(memoryStore.has("payroll:overview:10:2026")).toBe(false);
      expect(memoryStore.has("stats:monthly:staff-sched-1:2026:10")).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Cache Invalidation on Cron Bonus & Payroll Close Endpoints
  // ==========================================================================
  describe("4. Cron Bonus & Payroll Close Cache Invalidation", () => {
    it("invalidates payroll and stats cache after birthday bonus execution", async () => {
      memoryStore.set("payroll:period:10:2026", JSON.stringify({ id: 1 }));
      memoryStore.set("staff:payroll:user-1:10:2026", JSON.stringify({ amount: 500000 }));
      memoryStore.set("stats:monthly:user-1:2026:10", JSON.stringify({ points: 100 }));
      memoryStore.set("stats:overview", JSON.stringify({ count: 10 }));

      mockRunBirthdayBonus.mockResolvedValue(undefined);

      const res = await app.request("/api/cron/birthday-bonus", {
        headers: { Authorization: "Bearer schedule-cron-test-secret" },
      });

      expect(res.status).toBe(200);
      expect(mockRunBirthdayBonus).toHaveBeenCalledTimes(1);

      // Invalidation verified
      expect(memoryStore.has("payroll:period:10:2026")).toBe(false);
      expect(memoryStore.has("staff:payroll:user-1:10:2026")).toBe(false);
      expect(memoryStore.has("stats:monthly:user-1:2026:10")).toBe(false);
      expect(memoryStore.has("stats:overview")).toBe(false);
    });

    it("invalidates payroll and stats cache after carrying bonus execution", async () => {
      memoryStore.set("payroll:summary:10:2026", JSON.stringify({ bonus: 200000 }));
      memoryStore.set("staff:payroll:user-2:10:2026", JSON.stringify({ amount: 600000 }));
      memoryStore.set("stats:monthly:user-2:2026:10", JSON.stringify({ carryingCount: 50 }));

      mockRunCarryingBonus.mockResolvedValue(undefined);

      const res = await app.request("/api/cron/carrying-bonus", {
        headers: { Authorization: "Bearer schedule-cron-test-secret" },
      });

      expect(res.status).toBe(200);
      expect(mockRunCarryingBonus).toHaveBeenCalledTimes(1);

      expect(memoryStore.has("payroll:summary:10:2026")).toBe(false);
      expect(memoryStore.has("staff:payroll:user-2:10:2026")).toBe(false);
      expect(memoryStore.has("stats:monthly:user-2:2026:10")).toBe(false);
    });

    it("invalidates payroll and stats cache after packing bonus execution", async () => {
      memoryStore.set("payroll:summary:10:2026", JSON.stringify({ bonus: 150000 }));
      memoryStore.set("staff:payroll:user-3:10:2026", JSON.stringify({ amount: 450000 }));
      memoryStore.set("stats:packing:2026:10", JSON.stringify({ packages: 120 }));

      mockRunPackingBonus.mockResolvedValue(undefined);

      const res = await app.request("/api/cron/packing-bonus", {
        headers: { Authorization: "Bearer schedule-cron-test-secret" },
      });

      expect(res.status).toBe(200);
      expect(mockRunPackingBonus).toHaveBeenCalledTimes(1);

      expect(memoryStore.has("payroll:summary:10:2026")).toBe(false);
      expect(memoryStore.has("staff:payroll:user-3:10:2026")).toBe(false);
      expect(memoryStore.has("stats:packing:2026:10")).toBe(false);
    });

    it("invalidates payroll and stats cache on POST /api/cron/payroll-close (force=true)", async () => {
      memoryStore.set("payroll:month:10:2026", JSON.stringify({ closed: false }));
      memoryStore.set("staff:payroll:user-1:10:2026", JSON.stringify({ amount: 1000000 }));
      memoryStore.set("stats:overview:2026:10", JSON.stringify({ total: 5000000 }));

      mockClosePayrollMonth.mockResolvedValue({
        periodId: "period-1",
        recordsCount: 5,
        totalNetSalary: 25000000,
      });

      const res = await app.request("/api/cron/payroll-close?force=true", {
        method: "POST",
        headers: { Authorization: "Bearer schedule-cron-test-secret" },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockClosePayrollMonth).toHaveBeenCalledTimes(1);

      // Verify all payroll and stats cache entries cleared
      expect(memoryStore.has("payroll:month:10:2026")).toBe(false);
      expect(memoryStore.has("staff:payroll:user-1:10:2026")).toBe(false);
      expect(memoryStore.has("stats:overview:2026:10")).toBe(false);
    });

    it("invalidates payroll and stats cache on GET /api/cron/payroll-close (force=true)", async () => {
      memoryStore.set("payroll:month:10:2026", JSON.stringify({ closed: false }));
      memoryStore.set("staff:payroll:user-1:10:2026", JSON.stringify({ amount: 1000000 }));

      mockClosePayrollMonth.mockResolvedValue({
        periodId: "period-1",
        recordsCount: 5,
        totalNetSalary: 25000000,
      });

      const res = await app.request("/api/cron/payroll-close?force=true", {
        method: "GET",
        headers: { Authorization: "Bearer schedule-cron-test-secret" },
      });

      expect(res.status).toBe(200);
      expect(mockClosePayrollMonth).toHaveBeenCalledTimes(1);

      expect(memoryStore.has("payroll:month:10:2026")).toBe(false);
      expect(memoryStore.has("staff:payroll:user-1:10:2026")).toBe(false);
    });

    it("invalidates payroll and stats cache on GET /api/cron/all batch execution", async () => {
      memoryStore.set("payroll:batch:test", JSON.stringify({ active: true }));
      memoryStore.set("staff:payroll:batch:test", JSON.stringify({ active: true }));
      memoryStore.set("stats:batch:test", JSON.stringify({ active: true }));

      mockAutoScheduleAdminNa.mockResolvedValue({ success: true, count: 6 });
      mockRunBirthdayBonus.mockResolvedValue(undefined);
      mockRunCarryingBonus.mockResolvedValue(undefined);
      mockRunPackingBonus.mockResolvedValue(undefined);

      const res = await app.request("/api/cron/all", {
        headers: { Authorization: "Bearer schedule-cron-test-secret" },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(memoryStore.has("payroll:batch:test")).toBe(false);
      expect(memoryStore.has("staff:payroll:batch:test")).toBe(false);
      expect(memoryStore.has("stats:batch:test")).toBe(false);
    });
  });
});
