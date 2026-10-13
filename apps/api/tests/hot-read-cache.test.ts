import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockCheckInFindMany,
  mockCheckInFindFirst,
  mockCheckInCreate,
  mockAllowedIPFindMany,
  mockAllowedIPCreate,
  mockAllowedIPDelete,
  mockHolidayFindMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
  mockAllowedIPCreate: vi.fn(),
  mockAllowedIPDelete: vi.fn(),
  mockHolidayFindMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findMany: vi.fn().mockResolvedValue([]),
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: mockCheckInFindFirst,
      create: mockCheckInCreate,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    workShift: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    announcement: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcementRead: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    request: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    shiftDuty: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    staffTask: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userTask: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
      create: mockAllowedIPCreate,
      delete: mockAllowedIPDelete,
      count: vi.fn().mockResolvedValue(1),
    },
    holiday: {
      findMany: mockHolidayFindMany,
      upsert: vi.fn().mockResolvedValue({ id: "h-1", date: new Date(), name: "Tet", multiplier: 3.0 }),
      delete: vi.fn().mockResolvedValue({ id: "h-1" }),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { getAllowedIPs } from "../src/lib/ip-utils";
import { getVietnamDayRange, getVietnamMonthRange } from "../src/lib/date-utils";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Hot Read Endpoints Valkey Caching & Invalidation Suite", () => {
  let staffToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetLocks();
    _resetRateLimits();
    mockHolidayFindMany.mockResolvedValue([]);
    mockCheckInFindMany.mockResolvedValue([]);
    mockCheckInFindFirst.mockResolvedValue(null);
    mockAllowedIPFindMany.mockResolvedValue([]);

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
      sub: "staff-cache-1",
      email: "staff.cache@example.com",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: "admin-cache-1",
      email: "admin.cache@example.com",
      role: "ADMIN",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  describe("1. getAllowedIPs() Caching & Admin Invalidation", () => {
    it("caches config:allowed-ips for 600s and avoids re-querying Prisma", async () => {
      mockAllowedIPFindMany.mockResolvedValueOnce([
        { id: 1, prefix: "192.168.1.", label: "HQ" },
      ]);

      // Call 1: Cache miss -> queries DB and caches
      const ips1 = await getAllowedIPs();
      expect(ips1).toHaveLength(1);
      expect(mockAllowedIPFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "config:allowed-ips",
        expect.any(Number),
        expect.any(String)
      );
      const ipTtl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ipTtl).toBeGreaterThanOrEqual(600 * 0.85);
      expect(ipTtl).toBeLessThanOrEqual(600 * 1.15 + 1);

      // Call 2: Cache hit -> returns cached without DB query
      const ips2 = await getAllowedIPs();
      expect(ips2).toHaveLength(1);
      expect(mockAllowedIPFindMany).toHaveBeenCalledTimes(1); // not called again
    });

    it("invalidates config:allowed-ips when admin creates or deletes an IP", async () => {
      // Seed cache
      memoryStore.set("config:allowed-ips", JSON.stringify([{ id: 1, prefix: "192.168.1." }]));

      mockAllowedIPCreate.mockResolvedValueOnce({
        id: 2,
        prefix: "10.0.0.",
        label: "Store 2",
      });

      const res = await app.request("/api/admin/ip-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ prefix: "10.0.0.", label: "Store 2" }),
      });

      expect(res.status).toBe(201);
      // Cache key must be invalidated
      expect(memoryStore.has("config:allowed-ips")).toBe(false);
    });
  });

  describe("2. GET /api/checkins/today Caching & Checkin Invalidation", () => {
    it("caches checkin:today:${userId}:${todayStr} for 30s", async () => {
      const { dateStr } = getVietnamDayRange();
      const expectedKey = `checkin:today:staff-cache-1:${dateStr}`;

      mockCheckInFindMany.mockResolvedValueOnce([
        {
          id: "chk-1",
          userId: "staff-cache-1",
          type: "checkin",
          timestamp: new Date().toISOString(),
          user: { id: "staff-cache-1", name: "Cache Staff", email: "staff@example.com", image: null, role: "USER" },
        },
      ]);

      // Request 1: DB query + Cache set
      const res1 = await app.request("/api/checkins/today", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res1.status).toBe(200);
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
      const checkinCall = (mockRedis.setex as any).mock.calls.find((c: any) => c[0] === expectedKey);
      expect(checkinCall[1]).toBeGreaterThanOrEqual(Math.floor(30 * 0.85));
      expect(checkinCall[1]).toBeLessThanOrEqual(Math.ceil(30 * 1.15) + 1);

      // Request 2: Served from cache
      const res2 = await app.request("/api/checkins/today", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1); // No second DB call
    });

    it("invalidates checkin:today:${userId}:* and staff:home:${userId}:* on checkin/checkout", async () => {
      const { dateStr } = getVietnamDayRange();
      const checkinKey = `checkin:today:staff-cache-1:${dateStr}`;
      const homeKey = `staff:home:staff-cache-1:${dateStr}`;

      memoryStore.set(checkinKey, JSON.stringify([{ id: "chk-1" }]));
      memoryStore.set(homeKey, JSON.stringify({ streak: 5 }));

      mockAllowedIPFindMany.mockResolvedValue([{ id: 1, prefix: "127.0.0.1", label: "Local" }]);
      mockCheckInFindFirst.mockResolvedValue(null);
      mockCheckInCreate.mockResolvedValue({
        id: "new-chk-1",
        userId: "staff-cache-1",
        type: "checkin",
        timestamp: new Date(),
      });

      const res = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({ type: "checkin" }),
      });

      expect(res.status).toBe(201);
      // Both keys must be cleared by pattern invalidation
      expect(memoryStore.has(checkinKey)).toBe(false);
      expect(memoryStore.has(homeKey)).toBe(false);
    });
  });

  describe("3. GET /api/staff/home-data Caching", () => {
    it("caches staff:home:${userId}:${todayStr} for 60s and skips DB on subsequent requests", async () => {
      const { dateStr } = getVietnamDayRange();
      const expectedKey = `staff:home:staff-cache-1:${dateStr}`;

      mockUserFindUnique.mockResolvedValue({
        id: "staff-cache-1",
        name: "Cache Staff",
        email: "staff.cache@example.com",
        role: "USER",
        isActive: true,
        employmentType: "FULL_TIME",
        hourlyRate: 35000,
        monthlySalary: 6000000,
        birthday: null,
        startDate: null,
        luckyWheelAllowed: false,
        staffTasksAllowed: false,
        achievements: [],
        adjustments: [],
        payslips: [],
      });

      // Request 1: hits DB and sets cache
      const res1 = await app.request("/api/staff/home-data", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res1.status).toBe(200);
      // Called twice on initial miss: 1 for user profile in home-data, 1 for monthly stats calculator
      expect(mockUserFindUnique).toHaveBeenCalledTimes(2);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
      const homeCall = (mockRedis.setex as any).mock.calls.find((c: any) => c[0] === expectedKey);
      expect(homeCall[1]).toBeGreaterThanOrEqual(60 * 0.85);
      expect(homeCall[1]).toBeLessThanOrEqual(60 * 1.15 + 1);

      // Request 2: cache hit
      const res2 = await app.request("/api/staff/home-data", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      // Still 2: zero new DB calls on cache hit
      expect(mockUserFindUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe("4. GET /api/special-days Caching", () => {
    it("returns special days and caches with key meta:special-days:${year}-${month} for 3600s", async () => {
      const { month, year } = getVietnamMonthRange();
      const expectedKey = `meta:special-days:${year}-${month}`;

      mockHolidayFindMany.mockResolvedValueOnce([
        { id: "h-1", name: "Ngày Quốc Tế Lao Động", date: new Date(year, month - 1, 1) },
      ]);

      // Request 1: miss -> query DB & set cache
      const res1 = await app.request(`/api/special-days?year=${year}&month=${month}`);
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(mockHolidayFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
      const specialDaysCall = (mockRedis.setex as any).mock.calls.find((c: any) => c[0] === expectedKey);
      expect(specialDaysCall[1]).toBeGreaterThanOrEqual(3600 * 0.85);
      expect(specialDaysCall[1]).toBeLessThanOrEqual(3600 * 1.15 + 1);

      // Request 2: hit from cache
      const res2 = await app.request(`/api/special-days?year=${year}&month=${month}`);
      expect(res2.status).toBe(200);
      expect(mockHolidayFindMany).toHaveBeenCalledTimes(1); // Not called again
    });
  });
});
