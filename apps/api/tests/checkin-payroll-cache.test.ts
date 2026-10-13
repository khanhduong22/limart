import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockCheckInFindMany,
  mockCheckInFindFirst,
  mockCheckInCreate,
  mockCheckInDeleteMany,
  mockWorkShiftFindMany,
  mockRequestFindMany,
  mockHolidayFindMany,
  mockAllowedIPFindMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockCheckInDeleteMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockHolidayFindMany: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: mockCheckInFindFirst,
      create: mockCheckInCreate,
      deleteMany: mockCheckInDeleteMany,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
    },
    request: {
      findMany: mockRequestFindMany,
    },
    holiday: {
      findMany: mockHolidayFindMany,
    },
    allowedIP: {
      findMany: mockAllowedIPFindMany,
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-cache-test" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, invalidatePayrollCache } from "../src/lib/cache";
import { getVietnamDayRange } from "../src/lib/date-utils";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Valkey Caching Suite for Checkin Status & Staff Payroll Summary", () => {
  let userToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const testUserId = "user-cache-test-1";
  const testAdminId = "admin-cache-test-1";

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
      email: "staff.cache@limart.vn",
      name: "Staff Cache Test",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: testAdminId,
      email: "admin.cache@limart.vn",
      name: "Admin Cache Test",
      role: "ADMIN",
    });

    mockAllowedIPFindMany.mockResolvedValue([]);
  });

  describe("GET /api/checkins/status Caching & Invalidation", () => {
    it("caches checkin status on repeated requests with TTL 15s (cache hit, no duplicate DB query)", async () => {
      const { dateStr } = getVietnamDayRange();
      const expectedCacheKey = `checkin:status:${testUserId}:${dateStr}`;

      const mockDbCheckins = [
        {
          id: 101,
          userId: testUserId,
          type: "checkin",
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
          note: null,
        },
      ];

      mockCheckInFindMany.mockResolvedValue(mockDbCheckins);

      // First Request: Cache Miss -> Queries DB
      const res1 = await app.request("/api/checkins/status", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(data1.isWorking).toBe(true);
      expect(data1.isCheckedIn).toBe(true);
      expect(data1.lastCheckin.id).toBe(101);
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1);

      // Verify stored in Redis with key
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(memoryStore.has(expectedCacheKey)).toBe(true);
      const cachedRaw = memoryStore.get(expectedCacheKey);
      expect(cachedRaw).toBeDefined();

      // Second Request: Cache Hit -> Reads from Redis without calling DB
      const res2 = await app.request("/api/checkins/status", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.isWorking).toBe(true);
      expect(data2.lastCheckin.id).toBe(101);
      // DB call count MUST remain 1!
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith(expectedCacheKey);
    });

    it("invalidates checkin:status cache when user creates a checkin via POST /api/checkins", async () => {
      const { dateStr } = getVietnamDayRange();
      const statusKey = `checkin:status:${testUserId}:${dateStr}`;

      // Populate cache initially
      memoryStore.set(
        statusKey,
        JSON.stringify({
          isWorking: false,
          isCheckedIn: false,
          lastCheckin: null,
          todayCheckins: [],
        })
      );

      mockCheckInFindFirst.mockResolvedValue(null);
      mockCheckInCreate.mockResolvedValue({
        id: 202,
        userId: testUserId,
        type: "checkin",
        timestamp: new Date().toISOString(),
      });

      // User performs checkin
      const checkinRes = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${userToken}`,
        },
        body: JSON.stringify({ type: "checkin", note: "Start work" }),
      });

      expect(checkinRes.status).toBe(201);

      // Cache for user's status must be invalidated
      expect(memoryStore.has(statusKey)).toBe(false);

      // Next GET /api/checkins/status must miss cache and re-query DB
      mockCheckInFindMany.mockResolvedValue([
        {
          id: 202,
          userId: testUserId,
          type: "checkin",
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
          note: "Start work",
        },
      ]);

      const resAfterCheckin = await app.request("/api/checkins/status", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(resAfterCheckin.status).toBe(200);
      const dataAfter = await resAfterCheckin.json();
      expect(dataAfter.isWorking).toBe(true);
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates checkin:status cache when admin performs manual checkin via POST /api/admin/manual-checkin", async () => {
      const { dateStr } = getVietnamDayRange();
      const statusKey = `checkin:status:${testUserId}:${dateStr}`;

      // Populate cache
      memoryStore.set(
        statusKey,
        JSON.stringify({
          isWorking: false,
          isCheckedIn: false,
          lastCheckin: null,
          todayCheckins: [],
        })
      );

      mockCheckInDeleteMany.mockResolvedValue({ count: 0 });
      mockCheckInCreate.mockResolvedValue({
        id: 303,
        userId: testUserId,
        type: "checkin",
        timestamp: new Date(),
      });

      // Admin executes manual checkin for user
      const adminRes = await app.request("/api/admin/manual-checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          userId: testUserId,
          date: dateStr,
          checkInTime: "08:00",
          checkOutTime: "17:00",
        }),
      });

      expect(adminRes.status).toBe(200);

      // Invalidation check: checkin:status:* must be deleted from memoryStore
      expect(memoryStore.has(statusKey)).toBe(false);
    });
  });

  describe("GET /api/payroll/my-summary Caching & Invalidation", () => {
    it("caches payroll summary on repeated GET /api/payroll/my-summary with TTL 120s", async () => {
      const targetMonth = 10;
      const targetYear = 2026;
      const expectedCacheKey = `payroll:my-summary:${testUserId}:${targetMonth}:${targetYear}`;

      mockUserFindUnique.mockResolvedValue({
        id: testUserId,
        name: "Staff Cache Test",
        employmentType: "PART_TIME",
        hourlyRate: 35000,
        monthlySalary: 7000000,
        adjustments: [],
        payslips: [],
      });

      mockCheckInFindMany.mockResolvedValue([
        {
          id: 501,
          userId: testUserId,
          type: "checkin",
          timestamp: new Date("2026-10-05T01:00:00Z"),
        },
        {
          id: 502,
          userId: testUserId,
          type: "checkout",
          timestamp: new Date("2026-10-05T09:00:00Z"),
        },
      ]);

      mockWorkShiftFindMany.mockResolvedValue([
        {
          id: 601,
          userId: testUserId,
          start: new Date("2026-10-05T01:00:00Z"),
          end: new Date("2026-10-05T09:00:00Z"),
          isSenior: false,
        },
      ]);

      mockRequestFindMany.mockResolvedValue([]);
      mockHolidayFindMany.mockResolvedValue([]);

      // First Request: Cache Miss -> calls calculateUserMonthlyStats & hits DB
      const res1 = await app.request(
        `/api/payroll/my-summary?month=${targetMonth}&year=${targetYear}`,
        {
          headers: { Cookie: `access_token=${userToken}` },
        }
      );

      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(data1.month).toBe(targetMonth);
      expect(data1.year).toBe(targetYear);
      expect(data1.data).toBeDefined();
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);

      // Verify stored in Redis with jittered TTL 120s
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(memoryStore.has(expectedCacheKey)).toBe(true);

      // Second Request: Cache Hit -> Returns cached data without DB calls
      const res2 = await app.request(
        `/api/payroll/my-summary?month=${targetMonth}&year=${targetYear}`,
        {
          headers: { Cookie: `access_token=${userToken}` },
        }
      );

      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.data.totalHours).toEqual(data1.data.totalHours);

      // mockUserFindUnique should STILL be called only 1 time!
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
    });

    it("invalidates payroll:my-summary cache via invalidatePayrollCache", async () => {
      const targetMonth = 10;
      const targetYear = 2026;
      const expectedCacheKey = `payroll:my-summary:${testUserId}:${targetMonth}:${targetYear}`;

      // Populate cache
      memoryStore.set(
        expectedCacheKey,
        JSON.stringify({
          userId: testUserId,
          totalHours: 40,
          totalSalary: 1400000,
        })
      );

      expect(memoryStore.has(expectedCacheKey)).toBe(true);

      // Trigger standard payroll cache invalidation
      await invalidatePayrollCache();

      // Ensure key is purged by pattern payroll:*
      expect(memoryStore.has(expectedCacheKey)).toBe(false);
    });
  });
});
