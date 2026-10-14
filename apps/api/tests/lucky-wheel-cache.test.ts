import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockLuckyWheelPrizeFindMany,
  mockLuckyWheelPrizeUpdate,
  mockLuckyWheelPrizeUpdateMany,
  mockCheckInFindFirst,
  mockCheckInCreate,
  mockCheckInFindMany,
  mockLuckyWheelHistoryFindFirst,
  mockLuckyWheelHistoryFindMany,
  mockLuckyWheelHistoryCreate,
  mockPayrollAdjustmentCreate,
  mockUserAchievementCreate,
  mockAllowedIPFindMany,
  mockSessionAuditLogCreate,
  mockSessionAuditLogFindFirst,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockLuckyWheelPrizeFindMany: vi.fn(),
  mockLuckyWheelPrizeUpdate: vi.fn(),
  mockLuckyWheelPrizeUpdateMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockLuckyWheelHistoryFindFirst: vi.fn(),
  mockLuckyWheelHistoryFindMany: vi.fn(),
  mockLuckyWheelHistoryCreate: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockUserAchievementCreate: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
  mockSessionAuditLogCreate: vi.fn(),
  mockSessionAuditLogFindFirst: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
    },
    luckyWheelPrize: {
      findMany: mockLuckyWheelPrizeFindMany,
      update: mockLuckyWheelPrizeUpdate,
      updateMany: mockLuckyWheelPrizeUpdateMany,
    },
    checkIn: {
      findFirst: mockCheckInFindFirst,
      findMany: mockCheckInFindMany,
      create: mockCheckInCreate,
    },
    luckyWheelHistory: {
      findFirst: mockLuckyWheelHistoryFindFirst,
      findMany: mockLuckyWheelHistoryFindMany,
      create: mockLuckyWheelHistoryCreate,
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
    },
    userAchievement: {
      create: mockUserAchievementCreate,
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
    },
    sessionAuditLog: {
      create: mockSessionAuditLogCreate,
      findFirst: mockSessionAuditLogFindFirst,
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

describe("Lucky Wheel User Status Caching & Cross-Cutting Invalidation Suite", () => {
  let userToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const testUserId = "user-lucky-wheel-cache-1";
  const testAdminId = "admin-lucky-wheel-cache-1";

  const samplePrizes = [
    {
      id: "p-lucky-1",
      name: "Thưởng nóng 50k",
      type: "MONEY",
      value: 50000,
      remaining: 5,
      active: true,
      probability: 10,
      createdAt: new Date(),
    },
    {
      id: "p-lucky-2",
      name: "Chúc bạn may mắn lần sau",
      type: "BETTER_LUCK_NEXT_TIME",
      value: 0,
      remaining: 100,
      active: true,
      probability: 90,
      createdAt: new Date(),
    },
  ];

  const sampleRecentWinners = [
    {
      id: "win-1",
      prizeId: "p-lucky-1",
      prizeName: "Thưởng nóng 50k",
      createdAt: new Date(),
      user: { id: "u-prev", name: "Nguyễn Văn A", image: null },
    },
  ];

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
      email: "staff.wheel@limart.vn",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: testAdminId,
      email: "admin.wheel@limart.vn",
      role: "ADMIN",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === testAdminId) {
        return {
          id: testAdminId,
          role: "ADMIN",
          luckyWheelAllowed: true,
          achievements: [],
        };
      }
      return {
        id: testUserId,
        role: "USER",
        luckyWheelAllowed: true,
        achievements: [],
      };
    });

    mockLuckyWheelPrizeFindMany.mockResolvedValue(samplePrizes);
    mockLuckyWheelHistoryFindMany.mockResolvedValue(sampleRecentWinners);
    mockLuckyWheelHistoryFindFirst.mockResolvedValue(null);
    mockAllowedIPFindMany.mockResolvedValue([]);
    mockSessionAuditLogCreate.mockResolvedValue({ id: "audit-1" });
    mockSessionAuditLogFindFirst.mockResolvedValue(null);
    mockCheckInFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/lucky-wheel Caching & Cache Hit
  // ==========================================================================
  describe("1. GET /api/lucky-wheel Caching", () => {
    it("caches status under lucky-wheel:status:${userId}:${date} with TTL 60s (with jitter) on initial request", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `lucky-wheel:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      mockCheckInFindFirst.mockResolvedValue({ id: 101, type: "checkin" });

      const res = await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.allowed).toBe(true);
      expect(json.hasCheckedInToday).toBe(true);
      expect(json.hasSpunToday).toBe(false);
      expect(json.canSpin).toBe(true);
      expect(json.prizes).toHaveLength(2);
      expect(json.recentWinners).toHaveLength(1);

      // Verify status key is cached in Redis
      expect(memoryStore.has(statusKey)).toBe(true);

      // Verify TTL was set with ±15% jitter (51s - 69s)
      const setexCalls = (mockRedis.setex as any).mock.calls.filter(
        (c: any[]) => c[0] === statusKey
      );
      expect(setexCalls).toHaveLength(1);
      const ttl = setexCalls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(51);
      expect(ttl).toBeLessThanOrEqual(69);

      // Verify cached content
      const cachedData = JSON.parse(memoryStore.get(statusKey)!);
      expect(cachedData.allowed).toBe(true);
      expect(cachedData.hasCheckedInToday).toBe(true);
      expect(cachedData.canSpin).toBe(true);
    });

    it("serves repeated GET /api/lucky-wheel from cache without hitting Prisma", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `lucky-wheel:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      mockCheckInFindFirst.mockResolvedValue({ id: 101, type: "checkin" });

      // First request (Cache Miss)
      const res1 = await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res1.status).toBe(200);
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
      expect(mockCheckInFindFirst).toHaveBeenCalledTimes(1);
      expect(mockLuckyWheelHistoryFindFirst).toHaveBeenCalledTimes(1);

      // Second request (Cache Hit - served from Valkey)
      const res2 = await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.canSpin).toBe(true);
      expect(json2.prizes).toHaveLength(2);

      // Verify DB was NOT re-queried for status
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
      expect(mockCheckInFindFirst).toHaveBeenCalledTimes(1);
      expect(mockLuckyWheelHistoryFindFirst).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith(statusKey);
    });
  });

  // ==========================================================================
  // 2. Cache Invalidation on Spin (POST /api/lucky-wheel/spin)
  // ==========================================================================
  describe("2. Spin Cache Invalidation", () => {
    it("invalidates lucky-wheel:status:${userId}:* when spin is performed", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `lucky-wheel:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      mockCheckInFindFirst.mockResolvedValue({ id: 101, type: "checkin" });

      // 1. Seed cache via GET
      await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has(statusKey)).toBe(true);

      // 2. Perform Spin
      mockLuckyWheelPrizeUpdateMany.mockResolvedValue({ count: 1 });
      mockLuckyWheelHistoryCreate.mockResolvedValue({ id: "hist-1" });

      const spinRes = await app.request("/api/lucky-wheel/spin", {
        method: "POST",
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(spinRes.status).toBe(200);
      const spinJson = await spinRes.json();
      expect(spinJson.success).toBe(true);

      // 3. Verify lucky-wheel:status:${userId}:* was evicted from cache
      expect(memoryStore.has(statusKey)).toBe(false);

      // 4. Next GET should be a cache miss and re-query DB
      mockLuckyWheelHistoryFindFirst.mockResolvedValue({ id: "hist-1" }); // now user has spun today

      const resAfterSpin = await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(resAfterSpin.status).toBe(200);
      const jsonAfterSpin = await resAfterSpin.json();
      expect(jsonAfterSpin.hasSpunToday).toBe(true);
      expect(jsonAfterSpin.canSpin).toBe(false);

      // Prisma was queried again after invalidation
      expect(mockCheckInFindFirst.mock.calls.length).toBeGreaterThan(1);
    });

    it("invalidates payroll:* and staff:home:* when spin awards a MONEY prize", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `lucky-wheel:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      mockCheckInFindFirst.mockResolvedValue({ id: 101, type: "checkin" });

      // Seed payroll and staff:home caches
      memoryStore.set(statusKey, JSON.stringify({ canSpin: true }));
      memoryStore.set(`staff:home:${testUserId}:2026-10-14`, JSON.stringify({ home: true }));
      memoryStore.set(`payroll:${testUserId}:2026-10`, JSON.stringify({ payroll: true }));
      memoryStore.set("stats:monthly:all", JSON.stringify({ stats: true }));

      // Spin awards MONEY prize
      mockLuckyWheelPrizeFindMany.mockResolvedValue([samplePrizes[0]]); // MONEY prize
      mockLuckyWheelPrizeUpdateMany.mockResolvedValue({ count: 1 });
      mockLuckyWheelHistoryCreate.mockResolvedValue({ id: "hist-money" });
      mockPayrollAdjustmentCreate.mockResolvedValue({ id: "adj-1" });

      const spinRes = await app.request("/api/lucky-wheel/spin", {
        method: "POST",
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(spinRes.status).toBe(200);

      // Verify lucky-wheel:status, staff:home:*, payroll:*, stats:* all evicted
      expect(memoryStore.has(statusKey)).toBe(false);
      expect(memoryStore.has(`staff:home:${testUserId}:2026-10-14`)).toBe(false);
      expect(memoryStore.has(`payroll:${testUserId}:2026-10`)).toBe(false);
      expect(memoryStore.has("stats:monthly:all")).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Cache Invalidation on Checkin (POST /api/checkins)
  // ==========================================================================
  describe("3. Checkin Cache Invalidation", () => {
    it("invalidates lucky-wheel:status:${userId}:* when checkin is recorded via POST /api/checkins/in", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `lucky-wheel:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      // 1. Initial GET: User has not checked in today
      mockCheckInFindFirst.mockResolvedValue(null);

      const initialRes = await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(initialRes.status).toBe(200);
      const initialJson = await initialRes.json();
      expect(initialJson.hasCheckedInToday).toBe(false);
      expect(initialJson.canSpin).toBe(false);
      expect(memoryStore.has(statusKey)).toBe(true);

      // 2. User checks in
      mockCheckInFindFirst.mockResolvedValue(null); // sequence check: no previous checkin
      mockCheckInCreate.mockResolvedValue({
        id: 201,
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

      // 3. Verify lucky-wheel:status was evicted!
      expect(memoryStore.has(statusKey)).toBe(false);

      // 4. Subsequent GET re-queries DB and now shows canSpin: true
      mockCheckInFindFirst.mockResolvedValue({ id: 201, type: "checkin" });

      const updatedRes = await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(updatedRes.status).toBe(200);
      const updatedJson = await updatedRes.json();
      expect(updatedJson.hasCheckedInToday).toBe(true);
      expect(updatedJson.canSpin).toBe(true);
    });

    it("invalidates lucky-wheel:status:${userId}:* on offline sync via POST /api/checkins/sync-offline", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `lucky-wheel:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;

      // Seed cache
      memoryStore.set(statusKey, JSON.stringify({ canSpin: false }));
      expect(memoryStore.has(statusKey)).toBe(true);

      mockCheckInFindFirst.mockResolvedValue(null);
      mockCheckInCreate.mockResolvedValue({
        id: 202,
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
              id: "sync-1",
              type: "checkin",
              timestamp: Date.now(),
            },
          ],
        }),
      });

      expect(syncRes.status).toBe(200);
      const syncJson = await syncRes.json();
      expect(syncJson.synced).toBe(1);

      // Verify lucky-wheel:status was invalidated
      expect(memoryStore.has(statusKey)).toBe(false);
    });
  });
});
