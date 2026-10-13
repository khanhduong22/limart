import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUserFindUnique,
  mockCheckInFindFirst,
  mockPayrollAdjustmentFindFirst,
  mockPayrollAdjustmentCreate,
  mockLuckyWheelHistoryFindMany,
  mockLuckyWheelHistoryFindFirst,
  mockLuckyWheelHistoryCreate,
  mockLuckyWheelPrizeCount,
  mockLuckyWheelPrizeFindMany,
  mockLuckyWheelPrizeUpdate,
  mockUserAchievementFindUnique,
  mockUserAchievementCreate,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionCreate,
  mockUserTaskFindMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockPayrollAdjustmentFindFirst: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockLuckyWheelHistoryFindMany: vi.fn(),
  mockLuckyWheelHistoryFindFirst: vi.fn(),
  mockLuckyWheelHistoryCreate: vi.fn(),
  mockLuckyWheelPrizeCount: vi.fn(),
  mockLuckyWheelPrizeFindMany: vi.fn(),
  mockLuckyWheelPrizeUpdate: vi.fn(),
  mockUserAchievementFindUnique: vi.fn(),
  mockUserAchievementCreate: vi.fn(),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionCreate: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
    },
    checkIn: {
      findFirst: mockCheckInFindFirst,
    },
    payrollAdjustment: {
      findFirst: mockPayrollAdjustmentFindFirst,
      create: mockPayrollAdjustmentCreate,
    },
    luckyWheelHistory: {
      findMany: mockLuckyWheelHistoryFindMany,
      findFirst: mockLuckyWheelHistoryFindFirst,
      create: mockLuckyWheelHistoryCreate,
    },
    luckyWheelPrize: {
      count: mockLuckyWheelPrizeCount,
      findMany: mockLuckyWheelPrizeFindMany,
      update: mockLuckyWheelPrizeUpdate,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    userAchievement: {
      findUnique: mockUserAchievementFindUnique,
      create: mockUserAchievementCreate,
    },
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      create: mockTaskDefinitionCreate,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
    },
    $queryRaw: mockQueryRaw.mockResolvedValue([]),
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { getVietnamDayRange } from "../src/lib/date-utils";

describe("Valkey Caching Suite for Gacha Status & Staff Tasks Summary", () => {
  let userToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const testUserId = "user-gacha-cache-1";
  const testAdminId = "admin-gacha-cache-1";

  beforeEach(async () => {
    vi.clearAllMocks();

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
      email: "test.staff@limart.vn",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: testAdminId,
      email: "test.admin@limart.vn",
      role: "ADMIN",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === testAdminId) {
        return {
          id: testAdminId,
          email: "test.admin@limart.vn",
          role: "ADMIN",
          isActive: true,
        };
      }
      return {
        id: testUserId,
        email: "test.staff@limart.vn",
        role: "USER",
        isActive: true,
        achievements: [],
      };
    });
  });

  describe("GET /api/gacha Caching", () => {
    it("caches active prize count and full gacha status response on repeated GET /api/gacha", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;
      const activeCountKey = "meta:lucky-wheel:active-count";

      mockCheckInFindFirst.mockResolvedValue({ id: 1, type: "checkin" });
      mockPayrollAdjustmentFindFirst.mockResolvedValue(null);
      mockLuckyWheelHistoryFindMany.mockResolvedValue([]);
      mockLuckyWheelPrizeCount.mockResolvedValue(10);

      // First call: Cache miss, hits DB
      const res1 = await app.request("/api/gacha", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(data1.hasCheckedIn).toBe(true);
      expect(data1.canRoll).toBe(true);
      expect(data1.remainingPrizes).toBe(10);

      expect(mockLuckyWheelPrizeCount).toHaveBeenCalledTimes(1);
      expect(mockCheckInFindFirst).toHaveBeenCalledTimes(1);

      // Verify keys stored in Valkey
      expect(memoryStore.has(statusKey)).toBe(true);
      expect(memoryStore.has(activeCountKey)).toBe(true);

      // Second call: Cache hit from Valkey, DB is not queried again
      const res2 = await app.request("/api/gacha", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2).toEqual(data1);

      // Call counts must still be 1 (served directly from cache)
      expect(mockLuckyWheelPrizeCount).toHaveBeenCalledTimes(1);
      expect(mockCheckInFindFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe("Staff Tasks Summary Caching", () => {
    it("caches packing task definitions with meta:task-definitions:packing on repeated GET /api/staff/tasks/packing-summary", async () => {
      const packingKey = "meta:task-definitions:packing";
      const samplePackingDefs = [
        { id: "td-pack-1", name: "Đóng gói Hộp quà", baseReward: 2500, unit: "điểm", active: true },
        { id: "td-pack-2", name: "Đóng gói Giỏ quà", baseReward: 5000, unit: "điểm", active: true },
      ];

      mockTaskDefinitionFindMany.mockResolvedValue(samplePackingDefs);
      mockUserTaskFindMany.mockResolvedValue([]);

      // First call: Cache miss
      const res1 = await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data.priceList).toHaveLength(2);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);
      expect(memoryStore.has(packingKey)).toBe(true);

      // Second call: Cache hit, taskDefinition.findMany is not called again
      const res2 = await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.data.priceList).toEqual(body1.data.priceList);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);
    });

    it("caches carrying task definitions with meta:task-definitions:carrying on repeated GET /api/staff/tasks/carrying-summary", async () => {
      const carryingKey = "meta:task-definitions:carrying";
      const sampleCarryingDefs = [
        { id: "td-carry-1", name: "Bưng bê tầng 1", baseReward: 1500, unit: "điểm-bưng", active: true },
        { id: "td-carry-2", name: "Bưng bê tầng 2", baseReward: 3000, unit: "điểm-bưng", active: true },
      ];

      mockTaskDefinitionFindMany.mockResolvedValue(sampleCarryingDefs);
      mockUserTaskFindMany.mockResolvedValue([]);

      // First call: Cache miss
      const res1 = await app.request("/api/staff/tasks/carrying-summary", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data.conversionList).toHaveLength(2);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);
      expect(memoryStore.has(carryingKey)).toBe(true);

      // Second call: Cache hit, taskDefinition.findMany is not called again
      const res2 = await app.request("/api/staff/tasks/carrying-summary", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.data.conversionList).toEqual(body1.data.conversionList);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates meta:task-definitions:packing and meta:task-definitions:carrying when task definitions are modified", async () => {
      // Pre-seed caches
      memoryStore.set("meta:task-definitions:packing", JSON.stringify([{ id: "p1" }]));
      memoryStore.set("meta:task-definitions:carrying", JSON.stringify([{ id: "c1" }]));
      expect(memoryStore.has("meta:task-definitions:packing")).toBe(true);
      expect(memoryStore.has("meta:task-definitions:carrying")).toBe(true);

      mockTaskDefinitionCreate.mockResolvedValue({
        id: "td-new",
        name: "Nhiệm vụ mới",
        baseReward: 1000,
        unit: "điểm",
        active: true,
      });

      const res = await app.request("/api/tasks/definitions", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Nhiệm vụ mới",
          baseReward: 1000,
          unit: "điểm",
          active: true,
        }),
      });

      expect(res.status).toBe(201);
      // Both keys matching meta:task-definitions:* must be purged
      expect(memoryStore.has("meta:task-definitions:packing")).toBe(false);
      expect(memoryStore.has("meta:task-definitions:carrying")).toBe(false);
    });
  });

  describe("Gacha Roll Cache Invalidation", () => {
    it("invalidates gacha:status:<userId>:* and meta:lucky-wheel:* when POST /api/gacha/roll is called", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;
      const activeCountKey = "meta:lucky-wheel:active-count";

      // Seed cache
      memoryStore.set(statusKey, JSON.stringify({ success: true, canRoll: true }));
      memoryStore.set(activeCountKey, JSON.stringify(5));
      expect(memoryStore.has(statusKey)).toBe(true);
      expect(memoryStore.has(activeCountKey)).toBe(true);

      mockCheckInFindFirst.mockResolvedValue({ id: 10, type: "checkin" });
      mockPayrollAdjustmentFindFirst.mockResolvedValue(null);
      mockLuckyWheelPrizeFindMany.mockResolvedValue([
        {
          id: "prize-roll-1",
          name: "Thưởng 20k",
          type: "MONEY",
          value: 20000,
          probability: 1.0,
          remaining: 5,
        },
      ]);
      mockLuckyWheelPrizeUpdate.mockResolvedValue({});
      mockLuckyWheelHistoryCreate.mockResolvedValue({});
      mockPayrollAdjustmentCreate.mockResolvedValue({});

      const res = await app.request("/api/gacha/roll", {
        method: "POST",
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.reward.value).toBe(20000);

      // Verify keys were purged
      expect(memoryStore.has(statusKey)).toBe(false);
      expect(memoryStore.has(activeCountKey)).toBe(false);
    });

    it("invalidates gacha:status:<userId>:* and meta:lucky-wheel:* when POST /api/gacha/spin is called", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;
      const activeCountKey = "meta:lucky-wheel:active-count";

      // Seed cache
      memoryStore.set(statusKey, JSON.stringify({ success: true, canRoll: true }));
      memoryStore.set(activeCountKey, JSON.stringify(5));
      expect(memoryStore.has(statusKey)).toBe(true);
      expect(memoryStore.has(activeCountKey)).toBe(true);

      mockCheckInFindFirst.mockResolvedValue({ id: 10, type: "checkin" });
      mockPayrollAdjustmentFindFirst.mockResolvedValue(null);
      mockLuckyWheelPrizeFindMany.mockResolvedValue([
        {
          id: "prize-spin-1",
          name: "Thưởng 10k",
          type: "MONEY",
          value: 10000,
          probability: 1.0,
          remaining: 5,
        },
      ]);
      mockLuckyWheelPrizeUpdate.mockResolvedValue({});
      mockLuckyWheelHistoryCreate.mockResolvedValue({});
      mockPayrollAdjustmentCreate.mockResolvedValue({});

      const res = await app.request("/api/gacha/spin", {
        method: "POST",
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify keys were purged
      expect(memoryStore.has(statusKey)).toBe(false);
      expect(memoryStore.has(activeCountKey)).toBe(false);
    });

    it("invalidates gacha:status:<userId>:* and meta:lucky-wheel:* when POST /api/staff/gacha is called", async () => {
      const { startOfDay } = getVietnamDayRange();
      const statusKey = `gacha:status:${testUserId}:${startOfDay.toISOString().slice(0, 10)}`;
      const activeCountKey = "meta:lucky-wheel:active-count";

      // Seed cache
      memoryStore.set(statusKey, JSON.stringify({ success: true, canRoll: true }));
      memoryStore.set(activeCountKey, JSON.stringify(5));
      expect(memoryStore.has(statusKey)).toBe(true);
      expect(memoryStore.has(activeCountKey)).toBe(true);

      mockCheckInFindFirst.mockResolvedValue({ id: 10, type: "checkin" });
      mockLuckyWheelHistoryFindFirst.mockResolvedValue(null);
      mockLuckyWheelPrizeFindMany.mockResolvedValue([
        {
          id: "prize-staff-1",
          name: "Thưởng 15k",
          type: "MONEY",
          value: 15000,
          probability: 1.0,
          remaining: 5,
        },
      ]);
      mockLuckyWheelPrizeUpdate.mockResolvedValue({});
      mockLuckyWheelHistoryCreate.mockResolvedValue({});
      mockPayrollAdjustmentCreate.mockResolvedValue({});

      const res = await app.request("/api/staff/gacha", {
        method: "POST",
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify keys were purged
      expect(memoryStore.has(statusKey)).toBe(false);
      expect(memoryStore.has(activeCountKey)).toBe(false);
    });
  });
});
