import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCheckInFindFirst,
  mockCheckInFindMany,
  mockCheckInCreate,
  mockUserFindUnique,
  mockAllowedIPFindMany,
} = vi.hoisted(() => ({
  mockCheckInFindFirst: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockAllowedIPFindMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    checkIn: {
      findFirst: mockCheckInFindFirst,
      findMany: mockCheckInFindMany,
      create: mockCheckInCreate,
    },
    user: {
      findUnique: mockUserFindUnique,
      findMany: vi.fn().mockResolvedValue([]),
    },
    workShift: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    announcement: {
      findMany: vi.fn().mockResolvedValue([]),
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
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-123" }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/lib/special-days", () => ({
  getSpecialDays: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/lib/payroll-calculator", () => ({
  calculateMonthlyPayrollSummary: vi.fn().mockResolvedValue({}),
  calculateUserMonthlyStats: vi.fn().mockResolvedValue({
    totalHours: 0,
    totalSalary: 0,
    daysWorked: 0,
  }),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";
import {
  setRedisClient,
  getOrSetCache,
  invalidateCachePattern,
  inFlightPromises,
} from "../src/lib/cache";

describe("Check-In & Staff Home Data Cache Concurrency & Idempotency", () => {
  let memoryStore: Map<string, string>;
  let mockRedis: any;
  let authToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetLocks();
    _resetRateLimits();
    inFlightPromises.clear();

    memoryStore = new Map<string, string>();
    mockRedis = {
      status: "ready",
      get: vi.fn(async (key: string) => memoryStore.get(key) || null),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => {
        memoryStore.set(key, value);
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        let count = 0;
        for (const k of keys) {
          if (memoryStore.delete(k)) count++;
        }
        return count;
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

    authToken = await signAccessToken({
      sub: "u1",
      email: "staff1@limart.vn",
      role: "USER",
    });

    mockAllowedIPFindMany.mockResolvedValue([]);
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      name: "Staff 1",
      email: "staff1@limart.vn",
      role: "USER",
      isActive: true,
      monthlySalary: 5000000,
    });
    mockCheckInFindMany.mockResolvedValue([]);
  });

  describe("1. Epoch-Guarded SingleFlight Race Condition Prevention", () => {
    it("clears inFlightPromises immediately on invalidateCachePattern and prevents stale in-flight fetcher from overwriting cache", async () => {
      let resolveSlowFetcher: (val: any) => void;
      const slowFetcherPromise = new Promise((resolve) => {
        resolveSlowFetcher = resolve;
      });

      // 1. Start in-flight cache fetcher for staff home data
      const fetchPromise = getOrSetCache(
        "staff:home:u1:2026-10-17",
        60,
        () => slowFetcherPromise
      );

      // Allow microtask to finish Redis GET and enter in-flight fetcher
      await new Promise((r) => setTimeout(r, 5));

      // Verify in-flight promise was registered
      expect(inFlightPromises.has("staff:home:u1:2026-10-17")).toBe(true);

      // 2. Concurrently call invalidateCachePattern (e.g. from check-in POST)
      await invalidateCachePattern("staff:home:u1:*");

      // Verify inFlightPromises was cleared synchronously
      expect(inFlightPromises.has("staff:home:u1:2026-10-17")).toBe(false);

      // 3. Complete the old in-flight fetcher with stale data
      resolveSlowFetcher!({ staleData: "old_before_checkin" });
      const staleResult = await fetchPromise;
      expect(staleResult).toEqual({ staleData: "old_before_checkin" });

      // 4. Verify stale data was NOT written to Valkey setex!
      expect(memoryStore.get("staff:home:u1:2026-10-17")).toBeUndefined();
      expect(mockRedis.setex).not.toHaveBeenCalled();

      // 5. Subsequent request can fetch and store fresh data without being blocked or overwritten
      const freshResult = await getOrSetCache(
        "staff:home:u1:2026-10-17",
        60,
        async () => ({ freshData: "new_after_checkin" })
      );
      expect(freshResult).toEqual({ freshData: "new_after_checkin" });
      expect(memoryStore.get("staff:home:u1:2026-10-17")).toBe(
        JSON.stringify({ freshData: "new_after_checkin" })
      );
    });
  });

  describe("2. HTTP Cache-Control & ETag Skipping on Real-Time Routes", () => {
    it("returns Cache-Control: no-store, no-cache, must-revalidate and no ETag header on GET /api/staff/home-data", async () => {
      const res = await app.request("/api/staff/home-data", {
        headers: {
          Cookie: `access_token=${authToken}`,
        },
      });

      expect(res.status).toBe(200);
      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toBe("no-store, no-cache, must-revalidate");
      expect(res.headers.get("Pragma")).toBe("no-cache");

      // ETag must be completely absent so browsers/ServiceWorkers never return 304 Not Modified
      expect(res.headers.get("ETag")).toBeNull();

      // Even if client sends If-None-Match, response must still be 200 OK (never 304)
      const resWithIfNoneMatch = await app.request("/api/staff/home-data", {
        headers: {
          Cookie: `access_token=${authToken}`,
          "If-None-Match": '"some-cached-etag"',
        },
      });

      expect(resWithIfNoneMatch.status).toBe(200);
      expect(resWithIfNoneMatch.headers.get("ETag")).toBeNull();
    });

    it("returns Cache-Control: no-store, no-cache, must-revalidate and no ETag header on GET /api/checkins/today", async () => {
      const res = await app.request("/api/checkins/today", {
        headers: {
          Cookie: `access_token=${authToken}`,
        },
      });

      expect(res.status).toBe(200);
      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toBe("no-store, no-cache, must-revalidate");
      expect(res.headers.get("ETag")).toBeNull();
    });

    it("returns Cache-Control: no-store, no-cache, must-revalidate and no ETag header on GET /api/ip-status", async () => {
      const res = await app.request("/api/ip-status");

      expect(res.status).toBe(200);
      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toBe("no-store, no-cache, must-revalidate");
      expect(res.headers.get("ETag")).toBeNull();
    });
  });

  describe("3. Idempotent Double-Tap Protection (15-second window)", () => {
    it("returns 200 with deduplicated: true when a user double-taps check-in within 15 seconds", async () => {
      const firstCheckin = {
        id: "checkin-1",
        userId: "u1",
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "127.0.0.1",
      };

      // Scenario 1: First check-in
      mockCheckInFindFirst.mockResolvedValueOnce(null);
      mockCheckInCreate.mockResolvedValueOnce(firstCheckin);

      const firstRes = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${authToken}`,
        },
        body: JSON.stringify({ type: "checkin" }),
      });

      expect(firstRes.status).toBe(201);
      const firstBody = await firstRes.json();
      expect(firstBody.success).toBe(true);
      expect(firstBody.data.id).toBe("checkin-1");

      // Scenario 2: Double-tap 1 second later (same type: "checkin", within 15 seconds)
      mockCheckInFindFirst.mockResolvedValueOnce({
        ...firstCheckin,
        timestamp: new Date(Date.now() - 1000), // 1 second ago
      });

      const secondRes = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${authToken}`,
        },
        body: JSON.stringify({ type: "checkin" }),
      });

      // Must succeed with 200 and deduplicated: true instead of 400 Bad Request
      expect(secondRes.status).toBe(200);
      const secondBody = await secondRes.json();
      expect(secondBody.success).toBe(true);
      expect(secondBody.deduplicated).toBe(true);
      expect(secondBody.data.id).toBe("checkin-1");
      expect(secondBody.message).toBe("Đã ghi nhận vào ca thành công!");
      expect(mockCheckInCreate).toHaveBeenCalledTimes(1); // Didn't duplicate DB insert
    });

    it("returns 200 with deduplicated: true when a user double-taps check-out within 15 seconds", async () => {
      const checkoutRecord = {
        id: "checkout-1",
        userId: "u1",
        type: "checkout",
        timestamp: new Date(Date.now() - 2000), // 2 seconds ago
        ipAddress: "127.0.0.1",
      };

      // Double-tap checkout: last checkin is checkout created 2 seconds ago
      mockCheckInFindFirst.mockResolvedValueOnce(checkoutRecord);

      const res = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${authToken}`,
        },
        body: JSON.stringify({ type: "checkout" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deduplicated).toBe(true);
      expect(body.data.id).toBe("checkout-1");
      expect(body.message).toBe("Đã ghi nhận tan ca thành công!");
    });

    it("rejects consecutive duplicate checkin after the 15-second double-tap window expires", async () => {
      // Checkin was created 20 seconds ago (> 15s)
      mockCheckInFindFirst.mockResolvedValueOnce({
        id: "checkin-old",
        userId: "u1",
        type: "checkin",
        timestamp: new Date(Date.now() - 20_000),
        ipAddress: "127.0.0.1",
      });

      const res = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${authToken}`,
        },
        body: JSON.stringify({ type: "checkin" }),
      });

      // Must be rejected with 400 Bad Request
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Bạn chưa Check-out lượt trước đó");
    });
  });
});
