import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

const {
  mockUserCount,
  mockUserFindMany,
  mockUserFindUnique,
  mockAllowedIPCount,
  mockRequestCount,
  mockRequestFindMany,
  mockRequestFindUnique,
  mockRequestCreate,
  mockRequestUpdate,
  mockCheckInFindMany,
  mockCheckInCreate,
  mockCheckInDeleteMany,
  mockWorkShiftFindMany,
  mockWorkShiftFindUnique,
  mockWorkShiftCreate,
  mockWorkShiftUpdate,
  mockWorkShiftDelete,
  mockWorkShiftDeleteMany,
  mockHolidayFindMany,
  mockUserTaskCount,
  mockStaffTaskCount,
  mockSessionAuditLogCreate,
  mockShiftAuditLogCreate,
  mockPayrollAdjustmentCreate,
  mockPayrollPeriodFindUnique,
} = vi.hoisted(() => ({
  mockUserCount: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockAllowedIPCount: vi.fn(),
  mockRequestCount: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockRequestFindUnique: vi.fn(),
  mockRequestCreate: vi.fn(),
  mockRequestUpdate: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockCheckInDeleteMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockWorkShiftDelete: vi.fn(),
  mockWorkShiftDeleteMany: vi.fn(),
  mockHolidayFindMany: vi.fn(),
  mockUserTaskCount: vi.fn(),
  mockStaffTaskCount: vi.fn(),
  mockSessionAuditLogCreate: vi.fn(),
  mockShiftAuditLogCreate: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      count: mockUserCount,
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
    },
    allowedIP: {
      count: mockAllowedIPCount,
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 1, ip: "127.0.0.1", label: "Office" }),
    },
    request: {
      count: mockRequestCount,
      findMany: mockRequestFindMany,
      findUnique: mockRequestFindUnique,
      create: mockRequestCreate,
      update: mockRequestUpdate,
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: vi.fn().mockResolvedValue(null),
      create: mockCheckInCreate,
      deleteMany: mockCheckInDeleteMany,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      findUnique: mockWorkShiftFindUnique,
      findFirst: vi.fn().mockResolvedValue(null),
      create: mockWorkShiftCreate,
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: mockWorkShiftUpdate,
      delete: mockWorkShiftDelete,
      deleteMany: mockWorkShiftDeleteMany,
    },
    holiday: {
      findMany: mockHolidayFindMany,
    },
    userTask: {
      count: mockUserTaskCount,
      findMany: vi.fn().mockResolvedValue([]),
    },
    staffTask: {
      count: mockStaffTaskCount,
      findMany: vi.fn().mockResolvedValue([]),
    },
    sessionAuditLog: {
      create: mockSessionAuditLogCreate,
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    shiftAuditLog: {
      create: mockShiftAuditLogCreate,
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
      findMany: vi.fn().mockResolvedValue([]),
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import {
  setRedisClient,
  invalidateCachePattern,
  invalidatePayrollCache,
  invalidateShiftDutyCache,
  invalidateScheduleCache,
} from "../src/lib/cache";
import { getVietnamDayRange } from "../src/lib/date-utils";

describe("Admin Dashboard & Dashboard Stats Valkey Caching Suite", () => {
  let adminToken: string;
  let userToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;
  const { dateStr } = getVietnamDayRange();

  const mockAdminUser = {
    id: "admin-1",
    name: "Admin Boss",
    email: "admin@example.com",
    role: "ADMIN",
    image: null,
  };

  const mockStaffUser = {
    id: "user-1",
    name: "Staff Member",
    email: "staff@example.com",
    role: "USER",
    image: null,
    employmentType: "PART_TIME",
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    memoryStore = new Map<string, string>();

    // Mock Redis instance mimicking Valkey with scanStream and pipeline support
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
      scanStream: vi.fn((options: { match: string; count?: number }) => {
        const emitter = new EventEmitter();
        const pattern = options.match;
        const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
        const matched: string[] = [];
        for (const k of memoryStore.keys()) {
          if (regex.test(k)) matched.push(k);
        }
        process.nextTick(() => {
          if (matched.length > 0) {
            emitter.emit("data", matched);
          }
          emitter.emit("end");
        });
        return emitter;
      }),
      pipeline: vi.fn(() => {
        const operations: Array<() => void> = [];
        return {
          del: vi.fn((...keys: string[]) => {
            operations.push(() => {
              for (const k of keys) {
                memoryStore.delete(k);
              }
            });
            return this;
          }),
          exec: vi.fn(async () => {
            for (const op of operations) op();
            return [];
          }),
        };
      }),
    };

    setRedisClient(mockRedis);

    adminToken = await signAccessToken({
      sub: mockAdminUser.id,
      email: mockAdminUser.email,
      role: "ADMIN",
    });

    userToken = await signAccessToken({
      sub: mockStaffUser.id,
      email: mockStaffUser.email,
      role: "USER",
    });

    // Default mock returns
    mockUserCount.mockResolvedValue(15);
    mockAllowedIPCount.mockResolvedValue(2);
    mockRequestCount.mockResolvedValue(3);
    mockCheckInFindMany.mockResolvedValue([
      {
        id: 101,
        userId: mockStaffUser.id,
        type: "checkin",
        timestamp: new Date(),
        user: mockStaffUser,
      },
      {
        id: 102,
        userId: mockStaffUser.id,
        type: "checkout",
        timestamp: new Date(),
        user: mockStaffUser,
      },
    ]);
    mockWorkShiftFindMany.mockResolvedValue([
      {
        id: 201,
        userId: mockStaffUser.id,
        start: new Date(),
        end: new Date(Date.now() + 4 * 3600000),
        shiftType: "PART_TIME",
        status: "APPROVED",
        isSenior: false,
        isOpenForSwap: false,
        user: mockStaffUser,
        duties: [],
      },
    ]);
    mockUserFindMany.mockResolvedValue([mockAdminUser, mockStaffUser]);
    mockHolidayFindMany.mockResolvedValue([]);
    mockUserTaskCount.mockResolvedValue(1);
    mockStaffTaskCount.mockResolvedValue(2);
    mockPayrollPeriodFindUnique.mockResolvedValue({
      month: 10,
      year: 2026,
      status: "OPEN",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/admin/dashboard CACHING
  // ==========================================================================
  describe("1. GET /api/admin/dashboard Caching", () => {
    it("caches full dashboard payload under admin:dashboard:<dateStr> with TTL ~30s", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;

      // --- Request 1: Cache Miss ---
      const res1 = await app.request("/api/admin/dashboard", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.userCount).toBe(15);
      expect(json1.data.ipCount).toBe(2);
      expect(json1.data.pendingRequests).toBe(3);
      expect(mockUserCount).toHaveBeenCalledTimes(1);
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex was called with dashboardKey and ~30s TTL (with ±15% jitter -> [25, 35])
      expect(mockRedis.setex).toHaveBeenCalledWith(
        dashboardKey,
        expect.any(Number),
        expect.any(String)
      );
      const setexCall = (mockRedis.setex as any).mock.calls.find(
        (call: any[]) => call[0] === dashboardKey
      );
      expect(setexCall).toBeDefined();
      const actualTTL = setexCall[1];
      expect(actualTTL).toBeGreaterThanOrEqual(25);
      expect(actualTTL).toBeLessThanOrEqual(36);

      // Verify entry in memoryStore
      expect(memoryStore.has(dashboardKey)).toBe(true);

      // --- Request 2: Cache Hit ---
      const res2 = await app.request("/api/admin/dashboard", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.userCount).toBe(15);
      expect(json2.data.ipCount).toBe(2);

      // Crucial: DB methods must NOT have been called again on cache hit!
      expect(mockUserCount).toHaveBeenCalledTimes(1);
      expect(mockCheckInFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. GET /api/admin/dashboard-stats CACHING
  // ==========================================================================
  describe("2. GET /api/admin/dashboard-stats Caching", () => {
    it("caches stats payload under admin:dashboard-stats:<dateStr> with TTL ~30s", async () => {
      const statsKey = `admin:dashboard-stats:${dateStr}`;

      // --- Request 1: Cache Miss ---
      const res1 = await app.request("/api/admin/dashboard-stats", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.todayCheckinCount).toBe(1);
      expect(json1.data.todayCheckoutCount).toBe(1);
      expect(json1.data.pendingRequestsCount).toBe(3);
      expect(json1.data.totalEmployeesCount).toBe(15);
      expect(mockUserCount).toHaveBeenCalledTimes(1);

      // Verify Redis setex was called with statsKey and ~30s TTL
      const setexCall = (mockRedis.setex as any).mock.calls.find(
        (call: any[]) => call[0] === statsKey
      );
      expect(setexCall).toBeDefined();
      const actualTTL = setexCall[1];
      expect(actualTTL).toBeGreaterThanOrEqual(25);
      expect(actualTTL).toBeLessThanOrEqual(36);

      expect(memoryStore.has(statsKey)).toBe(true);

      // --- Request 2: Cache Hit ---
      const res2 = await app.request("/api/admin/dashboard-stats", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.todayCheckinCount).toBe(1);
      expect(json2.data.totalEmployeesCount).toBe(15);

      // Crucial: DB count not called again on cache hit!
      expect(mockUserCount).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. CACHE INVALIDATION ACROSS ALL DASHBOARD KEYS WITH admin:dashboard*
  // ==========================================================================
  describe("3. Cache Invalidation & Multi-Key Clearing with admin:dashboard*", () => {
    it("invalidates both admin:dashboard:* and admin:dashboard-stats:* simultaneously", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      const summaryKey = `admin:dashboard:summary:10:2026`;

      // Seed all 3 keys into cache
      memoryStore.set(dashboardKey, JSON.stringify({ cached: "dashboard" }));
      memoryStore.set(statsKey, JSON.stringify({ cached: "stats" }));
      memoryStore.set(summaryKey, JSON.stringify({ cached: "summary" }));

      expect(memoryStore.has(dashboardKey)).toBe(true);
      expect(memoryStore.has(statsKey)).toBe(true);
      expect(memoryStore.has(summaryKey)).toBe(true);

      // Invalidate using pattern "admin:dashboard*"
      await invalidateCachePattern("admin:dashboard*");

      // Verify ALL keys matching admin:dashboard* are completely purged
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
      expect(memoryStore.has(summaryKey)).toBe(false);
    });

    it("clears dashboard caches when a checkin is submitted via POST /api/checkins", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));

      mockCheckInCreate.mockResolvedValue({
        id: 999,
        userId: mockStaffUser.id,
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "127.0.0.1",
      });

      const res = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${userToken}`,
        },
        body: JSON.stringify({
          type: "checkin",
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });

    it("clears dashboard caches when a user creates a request via POST /api/requests", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));

      mockRequestCreate.mockResolvedValue({
        id: 888,
        userId: mockStaffUser.id,
        type: "LEAVE",
        date: new Date(),
        reason: "Xin nghỉ phép có việc gia đình",
        status: "PENDING",
      });

      const res = await app.request("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${userToken}`,
        },
        body: JSON.stringify({
          type: "LEAVE",
          date: "2026-10-20",
          reason: "Xin nghỉ phép có việc gia đình",
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });

    it("clears dashboard caches when admin approves a request via POST /api/admin/requests/:id/approve", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));

      mockRequestUpdate.mockResolvedValue({
        id: 777,
        status: "APPROVED",
      });

      const res = await app.request("/api/admin/requests/777/approve", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });

    it("clears dashboard caches when admin rejects a request via POST /api/admin/requests/:id/reject", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));

      mockRequestUpdate.mockResolvedValue({
        id: 778,
        status: "REJECTED",
      });

      const res = await app.request("/api/admin/requests/778/reject", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });

    it("clears dashboard caches when admin creates a work shift via POST /api/admin/schedule", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));

      mockWorkShiftCreate.mockResolvedValue({
        id: 501,
        userId: mockStaffUser.id,
        start: new Date("2026-10-15T08:00:00Z"),
        end: new Date("2026-10-15T16:00:00Z"),
        shiftType: "PART_TIME",
        status: "APPROVED",
        isSenior: false,
        isOpenForSwap: false,
        user: mockStaffUser,
        duties: [],
      });
      mockShiftAuditLogCreate.mockResolvedValue({ id: "audit-shift-1" });

      const res = await app.request("/api/admin/schedule", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: mockStaffUser.id,
          start: "2026-10-15T08:00:00.000Z",
          end: "2026-10-15T16:00:00.000Z",
          shiftType: "PART_TIME",
          skipPenalty: true,
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });

    it("clears dashboard caches when a shift is taken via POST /api/schedule/:id/take", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 555,
        userId: "other-user",
        start: new Date("2026-10-15T08:00:00Z"),
        end: new Date("2026-10-15T16:00:00Z"),
        isOpenForSwap: true,
        user: { id: "other-user", name: "Other User" },
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 555,
        userId: mockStaffUser.id,
        isOpenForSwap: false,
        user: mockStaffUser,
      });

      const res = await app.request("/api/schedule/555/take", {
        method: "POST",
        headers: {
          Cookie: `access_token=${userToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });

    it("clears dashboard caches when admin performs manual checkin via POST /api/admin/manual-checkin", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));

      mockCheckInDeleteMany.mockResolvedValue({ count: 0 });
      mockCheckInCreate.mockResolvedValue({
        id: 998,
        userId: mockStaffUser.id,
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
          userId: mockStaffUser.id,
          date: "2026-10-15",
          checkInTime: "08:00",
          checkOutTime: "17:00",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });

    it("clears dashboard caches when admin auto-closes shifts via POST /api/admin/close-all-shifts", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));

      mockCheckInFindMany.mockResolvedValue([
        { id: 1, userId: mockStaffUser.id, type: "checkin", timestamp: new Date() },
      ]);
      mockCheckInCreate.mockResolvedValue({
        id: 2,
        userId: mockStaffUser.id,
        type: "checkout",
        timestamp: new Date(),
      });

      const res = await app.request("/api/admin/close-all-shifts", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });

    it("clears dashboard caches via invalidatePayrollCache, invalidateShiftDutyCache, and invalidateScheduleCache", async () => {
      const dashboardKey = `admin:dashboard:${dateStr}`;
      const statsKey = `admin:dashboard-stats:${dateStr}`;

      // Test invalidatePayrollCache
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));
      await invalidatePayrollCache();
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);

      // Test invalidateShiftDutyCache
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));
      await invalidateShiftDutyCache();
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);

      // Test invalidateScheduleCache
      memoryStore.set(dashboardKey, JSON.stringify({ cached: true }));
      memoryStore.set(statsKey, JSON.stringify({ cached: true }));
      await invalidateScheduleCache();
      expect(memoryStore.has(dashboardKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 4. SINGLEFLIGHT CONCURRENCY DEDUPLICATION
  // ==========================================================================
  describe("4. Singleflight In-Flight Concurrency Deduplication", () => {
    it("coalesces concurrent requests onto a single fetcher execution", async () => {
      // Clear memoryStore
      memoryStore.clear();

      // Fire 5 concurrent requests simultaneously
      const promises = Array.from({ length: 5 }, () =>
        app.request("/api/admin/dashboard", {
          headers: { Cookie: `access_token=${adminToken}` },
        })
      );

      const responses = await Promise.all(promises);

      // All 5 responses should be 200 OK
      for (const res of responses) {
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
      }

      // Thanks to SingleFlight, DB was only queried ONCE across all 5 concurrent requests!
      expect(mockUserCount).toHaveBeenCalledTimes(1);
    });
  });
});
