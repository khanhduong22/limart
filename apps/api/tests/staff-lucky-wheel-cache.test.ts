import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockLuckyWheelPrizeFindMany,
  mockLuckyWheelPrizeUpdate,
  mockLuckyWheelHistoryFindFirst,
  mockLuckyWheelHistoryFindMany,
  mockLuckyWheelHistoryCreate,
  mockCheckInFindFirst,
  mockPayrollAdjustmentCreate,
  mockUserAchievementCreate,
  mockAutoScheduleAdminNa,
  mockRunBirthdayBonus,
  mockRunCarryingBonus,
  mockRunPackingBonus,
  mockClosePayrollMonth,
  mockPayrollPeriodFindUnique,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockLuckyWheelPrizeFindMany: vi.fn(),
  mockLuckyWheelPrizeUpdate: vi.fn(),
  mockLuckyWheelHistoryFindFirst: vi.fn(),
  mockLuckyWheelHistoryFindMany: vi.fn(),
  mockLuckyWheelHistoryCreate: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockUserAchievementCreate: vi.fn(),
  mockAutoScheduleAdminNa: vi.fn(),
  mockRunBirthdayBonus: vi.fn(),
  mockRunCarryingBonus: vi.fn(),
  mockRunPackingBonus: vi.fn(),
  mockClosePayrollMonth: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
    luckyWheelPrize: {
      findMany: mockLuckyWheelPrizeFindMany,
      update: mockLuckyWheelPrizeUpdate,
    },
    luckyWheelHistory: {
      findFirst: mockLuckyWheelHistoryFindFirst,
      findMany: mockLuckyWheelHistoryFindMany,
      create: mockLuckyWheelHistoryCreate,
    },
    checkIn: {
      findFirst: mockCheckInFindFirst,
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
    },
    userAchievement: {
      create: mockUserAchievementCreate,
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

vi.mock("@checkin/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@checkin/shared")>();
  return {
    ...actual,
    runBirthdayBonus: mockRunBirthdayBonus,
    runCarryingBonus: mockRunCarryingBonus,
    runPackingBonus: mockRunPackingBonus,
  };
});

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

describe("Staff Lucky-Wheel Valkey Caching & Cron Dashboard Invalidation Suite", () => {
  let userToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const originalCronSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  const samplePrizes = [
    {
      id: "prize-1",
      name: "Thưởng 50k",
      type: "MONEY",
      value: 50000,
      probability: 10,
      remaining: 5,
      active: true,
      createdAt: new Date("2026-01-01"),
    },
    {
      id: "prize-2",
      name: "Danh hiệu Chiến Thần May Mắn",
      type: "TITLE",
      value: 0,
      probability: 20,
      remaining: 10,
      active: true,
      createdAt: new Date("2026-01-02"),
    },
  ];

  const sampleRecentWinners = [
    {
      id: "hist-1",
      userId: "winner-user-1",
      prizeId: "prize-1",
      prizeName: "Thưởng 50k",
      createdAt: new Date("2026-10-13T10:00:00Z"),
      user: {
        id: "winner-user-1",
        name: "Nguyen Van A",
        image: "https://example.com/avatar1.png",
      },
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
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

    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NODE_ENV = "production";

    userToken = await signAccessToken({
      sub: "staff-user-1",
      email: "staff1@example.com",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: "admin-user-1",
      email: "admin1@example.com",
      role: "ADMIN",
    });

    mockUserFindUnique.mockResolvedValue({
      id: "staff-user-1",
      role: "USER",
      luckyWheelAllowed: true,
      achievements: [],
    });
    mockCheckInFindFirst.mockResolvedValue({ id: 101 });
    mockLuckyWheelHistoryFindFirst.mockResolvedValue(null);
    mockLuckyWheelPrizeFindMany.mockResolvedValue(samplePrizes);
    mockLuckyWheelHistoryFindMany.mockResolvedValue(sampleRecentWinners);
    mockLuckyWheelPrizeUpdate.mockResolvedValue(samplePrizes[0]);
    mockLuckyWheelHistoryCreate.mockResolvedValue({ id: "hist-new" });
    mockPayrollAdjustmentCreate.mockResolvedValue({ id: "adj-1" });
    mockPayrollPeriodFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    setRedisClient(null);
    process.env.CRON_SECRET = originalCronSecret;
    process.env.NODE_ENV = originalNodeEnv;
  });

  // ============================================================================
  // 1. GET /api/staff/lucky-wheel Valkey Caching (Prizes & Recent Winners)
  // ============================================================================
  describe("1. GET /api/staff/lucky-wheel Caching", () => {
    it("caches prizes and recentWinners in Valkey on cache miss", async () => {
      const res = await app.request("/api/staff/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.prizes).toHaveLength(2);
      expect(data.recentWinners).toHaveLength(1);

      // Verify DB was called on miss
      expect(mockLuckyWheelPrizeFindMany).toHaveBeenCalledTimes(1);
      expect(mockLuckyWheelHistoryFindMany).toHaveBeenCalledTimes(1);

      // Verify cached in Redis with proper keys
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "meta:lucky-wheel:prizes",
        expect.any(Number),
        expect.any(String)
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "meta:lucky-wheel:recent-winners",
        expect.any(Number),
        expect.any(String)
      );

      expect(memoryStore.has("meta:lucky-wheel:prizes")).toBe(true);
      expect(memoryStore.has("meta:lucky-wheel:recent-winners")).toBe(true);
    });

    it("serves prizes and recentWinners from Valkey cache on repeated GET without hitting DB again", async () => {
      // First call: populates cache
      const res1 = await app.request("/api/staff/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res1.status).toBe(200);
      expect(mockLuckyWheelPrizeFindMany).toHaveBeenCalledTimes(1);
      expect(mockLuckyWheelHistoryFindMany).toHaveBeenCalledTimes(1);

      // Second call: should hit cache for prizes & recentWinners
      const res2 = await app.request("/api/staff/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.prizes).toHaveLength(2);
      expect(data2.recentWinners).toHaveLength(1);

      // DB findMany must NOT have been called a second time
      expect(mockLuckyWheelPrizeFindMany).toHaveBeenCalledTimes(1);
      expect(mockLuckyWheelHistoryFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 2. Lucky Wheel Spin Invalidation (recent-winners & admin:lucky-wheel:*)
  // ============================================================================
  describe("2. Spin Cache Invalidation", () => {
    it("invalidates meta:lucky-wheel:recent-winners and admin:lucky-wheel:* on POST /api/staff/gacha", async () => {
      // Warm caches
      memoryStore.set("meta:lucky-wheel:recent-winners", JSON.stringify(sampleRecentWinners));
      memoryStore.set("meta:lucky-wheel:prizes", JSON.stringify(samplePrizes));
      memoryStore.set("admin:lucky-wheel:all", JSON.stringify(samplePrizes));
      memoryStore.set("admin:lucky-wheel:stats", JSON.stringify({ total: 10 }));

      const res = await app.request("/api/staff/gacha", {
        method: "POST",
        headers: {
          Cookie: `access_token=${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify meta:lucky-wheel:recent-winners and admin:lucky-wheel:* were invalidated
      expect(memoryStore.has("meta:lucky-wheel:recent-winners")).toBe(false);
      expect(memoryStore.has("admin:lucky-wheel:all")).toBe(false);
      expect(memoryStore.has("admin:lucky-wheel:stats")).toBe(false);
    });

    it("invalidates meta:lucky-wheel:recent-winners and admin:lucky-wheel:* on POST /api/staff/lucky-wheel/spin", async () => {
      // Warm caches
      memoryStore.set("meta:lucky-wheel:recent-winners", JSON.stringify(sampleRecentWinners));
      memoryStore.set("meta:lucky-wheel:prizes", JSON.stringify(samplePrizes));
      memoryStore.set("admin:lucky-wheel:all", JSON.stringify(samplePrizes));

      const res = await app.request("/api/staff/lucky-wheel/spin", {
        method: "POST",
        headers: {
          Cookie: `access_token=${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(memoryStore.has("meta:lucky-wheel:recent-winners")).toBe(false);
      expect(memoryStore.has("admin:lucky-wheel:all")).toBe(false);
    });
  });

  // ============================================================================
  // 3. Cron Dashboard Cache Invalidation (admin:dashboard*)
  // ============================================================================
  describe("3. Cron Dashboard Invalidation (admin:dashboard*)", () => {
    it("invalidates admin:dashboard* on GET /api/cron/birthday-bonus", async () => {
      mockRunBirthdayBonus.mockResolvedValue({ count: 1 });

      memoryStore.set("admin:dashboard:summary:2026-10", JSON.stringify({ ok: true }));
      memoryStore.set("admin:dashboard:kpi", JSON.stringify({ kpi: 100 }));
      memoryStore.set("staff:payroll:user-1", JSON.stringify({}));

      const res = await app.request("/api/cron/birthday-bonus", {
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify admin:dashboard* keys invalidated
      expect(memoryStore.has("admin:dashboard:summary:2026-10")).toBe(false);
      expect(memoryStore.has("admin:dashboard:kpi")).toBe(false);
      expect(memoryStore.has("staff:payroll:user-1")).toBe(false);
    });

    it("invalidates admin:dashboard* on GET /api/cron/carrying-bonus", async () => {
      mockRunCarryingBonus.mockResolvedValue({ topUserId: "staff-1" });

      memoryStore.set("admin:dashboard:summary:2026-10", JSON.stringify({ ok: true }));
      memoryStore.set("admin:dashboard:overview", JSON.stringify({ active: 5 }));

      const res = await app.request("/api/cron/carrying-bonus", {
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(memoryStore.has("admin:dashboard:summary:2026-10")).toBe(false);
      expect(memoryStore.has("admin:dashboard:overview")).toBe(false);
    });

    it("invalidates admin:dashboard* on GET /api/cron/packing-bonus", async () => {
      mockRunPackingBonus.mockResolvedValue({ topUserId: "staff-2" });

      memoryStore.set("admin:dashboard:summary:2026-10", JSON.stringify({ ok: true }));
      memoryStore.set("admin:dashboard:chart", JSON.stringify({ pts: [] }));

      const res = await app.request("/api/cron/packing-bonus", {
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(memoryStore.has("admin:dashboard:summary:2026-10")).toBe(false);
      expect(memoryStore.has("admin:dashboard:chart")).toBe(false);
    });

    it("invalidates admin:dashboard* on POST /api/cron/payroll-close", async () => {
      mockClosePayrollMonth.mockResolvedValue({
        month: 10,
        year: 2026,
        summary: { totalDistributed: 1000000 },
      });

      memoryStore.set("admin:dashboard:summary:2026-10", JSON.stringify({ ok: true }));
      memoryStore.set("admin:dashboard:payroll", JSON.stringify({ total: 5000 }));

      const res = await app.request("/api/cron/payroll-close?force=true", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(memoryStore.has("admin:dashboard:summary:2026-10")).toBe(false);
      expect(memoryStore.has("admin:dashboard:payroll")).toBe(false);
    });

    it("invalidates admin:dashboard* on GET /api/cron/all", async () => {
      mockAutoScheduleAdminNa.mockResolvedValue({ createdShifts: 6 });
      mockRunBirthdayBonus.mockResolvedValue({ count: 1 });
      mockRunCarryingBonus.mockResolvedValue({ topUserId: "staff-1" });
      mockRunPackingBonus.mockResolvedValue({ topUserId: "staff-2" });

      memoryStore.set("admin:dashboard:summary:2026-10", JSON.stringify({ ok: true }));
      memoryStore.set("admin:dashboard:widgets", JSON.stringify({ count: 4 }));
      memoryStore.set("shifts:current", JSON.stringify([]));
      memoryStore.set("admin:schedule:oct", JSON.stringify([]));

      const res = await app.request("/api/cron/all", {
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(memoryStore.has("admin:dashboard:summary:2026-10")).toBe(false);
      expect(memoryStore.has("admin:dashboard:widgets")).toBe(false);
      expect(memoryStore.has("shifts:current")).toBe(false);
      expect(memoryStore.has("admin:schedule:oct")).toBe(false);
    });
  });
});
