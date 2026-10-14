import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockCheckInFindFirst,
  mockCheckInCreate,
  mockCheckInFindMany,
  mockPayrollAdjustmentFindFirst,
  mockPayrollAdjustmentCreate,
  mockLuckyWheelHistoryFindMany,
  mockLuckyWheelHistoryCreate,
  mockLuckyWheelPrizeCount,
  mockLuckyWheelPrizeFindMany,
  mockLuckyWheelPrizeUpdate,
  mockUserAchievementFindUnique,
  mockUserAchievementCreate,
  mockAllowedIPFindMany,
  mockSessionAuditLogCreate,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockPayrollAdjustmentFindFirst: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockLuckyWheelHistoryFindMany: vi.fn(),
  mockLuckyWheelHistoryCreate: vi.fn(),
  mockLuckyWheelPrizeCount: vi.fn(),
  mockLuckyWheelPrizeFindMany: vi.fn(),
  mockLuckyWheelPrizeUpdate: vi.fn(),
  mockUserAchievementFindUnique: vi.fn(),
  mockUserAchievementCreate: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
  mockSessionAuditLogCreate: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
    },
    checkIn: {
      findFirst: mockCheckInFindFirst,
      findMany: mockCheckInFindMany,
      create: mockCheckInCreate,
    },
    payrollAdjustment: {
      findFirst: mockPayrollAdjustmentFindFirst,
      create: mockPayrollAdjustmentCreate,
    },
    luckyWheelHistory: {
      findMany: mockLuckyWheelHistoryFindMany,
      create: mockLuckyWheelHistoryCreate,
    },
    luckyWheelPrize: {
      count: mockLuckyWheelPrizeCount,
      findMany: mockLuckyWheelPrizeFindMany,
      update: mockLuckyWheelPrizeUpdate,
      updateMany: vi.fn((...args: any[]) => {
        mockLuckyWheelPrizeUpdate(...args);
        return Promise.resolve({ count: 1 });
      }),
    },
    userAchievement: {
      findUnique: mockUserAchievementFindUnique,
      create: mockUserAchievementCreate,
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
    },
    sessionAuditLog: {
      create: mockSessionAuditLogCreate,
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";
import { getVietnamDayRange } from "../src/lib/date-utils";

describe("Gacha Status Caching & Cross-Cutting Invalidation Suite", () => {
  let userToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const testUserId = "user-gacha-cache-1";
  const testAdminId = "admin-gacha-cache-1";

  const sampleMoneyPrize = {
    id: "gacha-prize-money",
    name: "Thưởng Tiền Mặt 100k",
    type: "MONEY",
    value: 100000,
    probability: 10,
    remaining: 5,
    active: true,
  };

  const sampleTitlePrize = {
    id: "gacha-prize-title",
    name: "Chiến Thần Checkin",
    type: "TITLE",
    value: 0,
    probability: 20,
    remaining: 10,
    active: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
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
        const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
        const matched: string[] = [];
        for (const k of memoryStore.keys()) {
          if (regex.test(k)) matched.push(k);
        }
        return matched;
      }),
    };

    setRedisClient(mockRedis);

    userToken = await signAccessToken({
      sub: testUserId,
      email: "staff.gacha@limart.vn",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: testAdminId,
      email: "admin.gacha@limart.vn",
      role: "ADMIN",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === testAdminId) {
        return {
          id: testAdminId,
          role: "ADMIN",
          luckyWheelAllowed: true,
        };
      }
      return {
        id: testUserId,
        role: "USER",
        luckyWheelAllowed: true,
      };
    });

    mockLuckyWheelPrizeCount.mockResolvedValue(10);
    mockLuckyWheelPrizeFindMany.mockResolvedValue([sampleTitlePrize, sampleMoneyPrize]);
    mockLuckyWheelHistoryFindMany.mockResolvedValue([]);
    mockLuckyWheelHistoryCreate.mockResolvedValue({ id: "hist-1" });
    mockLuckyWheelPrizeUpdate.mockResolvedValue({});
    mockPayrollAdjustmentFindFirst.mockResolvedValue(null);
    mockPayrollAdjustmentCreate.mockResolvedValue({ id: "adj-1" });
    mockAllowedIPFindMany.mockResolvedValue([]);
    mockSessionAuditLogCreate.mockResolvedValue({ id: "audit-1" });
    mockCheckInFindMany.mockResolvedValue([]);
    mockUserAchievementFindUnique.mockResolvedValue(null);
    mockUserAchievementCreate.mockResolvedValue({ id: "ach-1" });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/gacha Caching & Repeated Request Cache Hit
  // ==========================================================================
  describe("1. GET /api/gacha Caching & Cache Hit", () => {
    it("caches gacha status under gacha:status:${userId}:${date} on initial request", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      mockCheckInFindFirst.mockResolvedValue({ id: 101, type: "checkin" });

      const res = await app.request("/api/gacha", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.hasCheckedIn).toBe(true);
      expect(json.hasRolled).toBe(false);
      expect(json.canRoll).toBe(true);
      expect(json.remainingPrizes).toBe(10);

      // Verify cached in memoryStore
      expect(memoryStore.has(statusKey)).toBe(true);

      // Verify TTL was set with ±15% jitter around 30s (25s - 35s)
      const setexCalls = (mockRedis.setex as any).mock.calls.filter(
        (c: any[]) => c[0] === statusKey
      );
      expect(setexCalls).toHaveLength(1);
      const ttl = setexCalls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(25);
      expect(ttl).toBeLessThanOrEqual(35);
    });

    it("serves repeated GET /api/gacha directly from gacha:status:* cache without hitting DB", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      mockCheckInFindFirst.mockResolvedValue({ id: 101, type: "checkin" });

      // First request (Cache Miss -> hits DB)
      const res1 = await app.request("/api/gacha", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res1.status).toBe(200);
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
      expect(mockCheckInFindFirst).toHaveBeenCalledTimes(1);
      expect(mockPayrollAdjustmentFindFirst).toHaveBeenCalledTimes(1);

      // Second request (Cache Hit -> served from Valkey)
      const res2 = await app.request("/api/gacha", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.canRoll).toBe(true);

      // DB should NOT have been re-queried
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
      expect(mockCheckInFindFirst).toHaveBeenCalledTimes(1);
      expect(mockPayrollAdjustmentFindFirst).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith(statusKey);
    });
  });

  // ==========================================================================
  // 2. Checkin Invalidation of gacha:status:*
  // ==========================================================================
  describe("2. Checkin Invalidation of gacha:status:*", () => {
    it("invalidates gacha:status:${userId}:* when checkin is recorded via POST /api/checkins/in", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      // 1. Initial GET before checkin: user has not checked in today
      mockCheckInFindFirst.mockResolvedValue(null);

      const initialRes = await app.request("/api/gacha", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(initialRes.status).toBe(200);
      const initialJson = await initialRes.json();
      expect(initialJson.hasCheckedIn).toBe(false);
      expect(initialJson.canRoll).toBe(false);
      expect(memoryStore.has(statusKey)).toBe(true);

      // 2. Staff performs checkin
      mockCheckInCreate.mockResolvedValue({
        id: 301,
        userId: testUserId,
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "127.0.0.1",
      });

      const checkinRes = await app.request("/api/checkins/in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${userToken}`,
        },
        body: JSON.stringify({ type: "checkin" }),
      });

      expect(checkinRes.status).toBe(201);

      // 3. Verify gacha:status:${userId}:* was invalidated
      expect(memoryStore.has(statusKey)).toBe(false);

      // 4. Subsequent GET re-queries DB and reflects hasCheckedIn: true, canRoll: true
      mockCheckInFindFirst.mockResolvedValue({ id: 301, type: "checkin" });

      const updatedRes = await app.request("/api/gacha", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(updatedRes.status).toBe(200);
      const updatedJson = await updatedRes.json();
      expect(updatedJson.hasCheckedIn).toBe(true);
      expect(updatedJson.canRoll).toBe(true);
    });

    it("invalidates gacha:status:${userId}:* when checkin is synced offline via POST /api/checkins/sync-offline", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      // Seed cache
      memoryStore.set(statusKey, JSON.stringify({ canRoll: false, hasCheckedIn: false }));
      expect(memoryStore.has(statusKey)).toBe(true);

      mockCheckInFindFirst.mockResolvedValue(null);
      mockCheckInCreate.mockResolvedValue({
        id: 302,
        userId: testUserId,
        type: "checkin",
        timestamp: new Date(),
      });

      const syncRes = await app.request("/api/checkins/sync-offline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${userToken}`,
        },
        body: JSON.stringify({
          items: [
            {
              id: "sync-offline-gacha-1",
              type: "checkin",
              timestamp: Date.now(),
            },
          ],
        }),
      });

      expect(syncRes.status).toBe(200);
      const syncJson = await syncRes.json();
      expect(syncJson.synced).toBe(1);

      // Verify gacha:status:${userId}:* is evicted
      expect(memoryStore.has(statusKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Gacha Roll Cache Invalidation
  // ==========================================================================
  describe("3. Gacha Roll Cache Invalidation (POST /api/gacha/roll & /spin)", () => {
    it("invalidates gacha:status:* and staff:home:* when gacha roll is executed (TITLE prize)", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;
      const staffHomeKey = `staff:home:${testUserId}:2026-10-14`;

      // Seed caches
      memoryStore.set(statusKey, JSON.stringify({ canRoll: true, hasRolled: false }));
      memoryStore.set(staffHomeKey, JSON.stringify({ homeData: true }));

      // Setup user checkin and TITLE prize
      mockCheckInFindFirst.mockResolvedValue({ id: 101, type: "checkin" });
      mockPayrollAdjustmentFindFirst.mockResolvedValue(null);
      mockLuckyWheelPrizeFindMany.mockResolvedValue([sampleTitlePrize]);

      const rollRes = await app.request("/api/gacha/roll", {
        method: "POST",
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(rollRes.status).toBe(200);
      const rollJson = await rollRes.json();
      expect(rollJson.success).toBe(true);
      expect(rollJson.reward.type).toBe("TITLE");

      // Verify both gacha:status:* and staff:home:* were invalidated
      expect(memoryStore.has(statusKey)).toBe(false);
      expect(memoryStore.has(staffHomeKey)).toBe(false);

      // Subsequent GET /api/gacha re-queries DB and reflects hasRolled: true, canRoll: false
      mockPayrollAdjustmentFindFirst.mockResolvedValue({
        id: "adj-gacha",
        reason: "[Gacha] [Title] Chiến Thần Checkin",
      });

      const nextRes = await app.request("/api/gacha", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(nextRes.status).toBe(200);
      const nextJson = await nextRes.json();
      expect(nextJson.hasRolled).toBe(true);
      expect(nextJson.canRoll).toBe(false);
    });

    it("invalidates payroll caches via invalidatePayrollCache() when roll awards a MONEY prize", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;
      const staffHomeKey = `staff:home:${testUserId}:2026-10-14`;
      const adminPayrollKey = "admin:payroll:10:2026";
      const userPayrollKey = `admin:payroll-user:${testUserId}:10:2026`;
      const staffPayrollKey = `staff:payroll:${testUserId}:10:2026`;
      const employeeDetailKey = `admin:employee-detail:${testUserId}:10:2026`;
      const statsMonthlyKey = "stats:monthly:all";

      // Seed all relevant caches
      memoryStore.set(statusKey, JSON.stringify({ canRoll: true }));
      memoryStore.set(staffHomeKey, JSON.stringify({ home: true }));
      memoryStore.set(adminPayrollKey, JSON.stringify({ payroll: true }));
      memoryStore.set(userPayrollKey, JSON.stringify({ userPayroll: true }));
      memoryStore.set(staffPayrollKey, JSON.stringify({ staffPayroll: true }));
      memoryStore.set(employeeDetailKey, JSON.stringify({ employeeDetail: true }));
      memoryStore.set(statsMonthlyKey, JSON.stringify({ stats: true }));

      mockCheckInFindFirst.mockResolvedValue({ id: 101, type: "checkin" });
      mockPayrollAdjustmentFindFirst.mockResolvedValue(null);
      mockLuckyWheelPrizeFindMany.mockResolvedValue([sampleMoneyPrize]);

      const spinRes = await app.request("/api/gacha/spin", {
        method: "POST",
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(spinRes.status).toBe(200);
      const spinJson = await spinRes.json();
      expect(spinJson.success).toBe(true);
      expect(spinJson.reward.type).toBe("MONEY");
      expect(spinJson.reward.value).toBe(100000);

      // Verify all invalidated: gacha:status, staff:home, and all payroll domain caches
      expect(memoryStore.has(statusKey)).toBe(false);
      expect(memoryStore.has(staffHomeKey)).toBe(false);
      expect(memoryStore.has(adminPayrollKey)).toBe(false);
      expect(memoryStore.has(userPayrollKey)).toBe(false);
      expect(memoryStore.has(staffPayrollKey)).toBe(false);
      expect(memoryStore.has(employeeDetailKey)).toBe(false);
      expect(memoryStore.has(statsMonthlyKey)).toBe(false);
    });
  });
});
