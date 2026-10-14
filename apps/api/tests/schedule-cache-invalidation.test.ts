import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockWorkShiftFindMany,
  mockWorkShiftCreate,
  mockWorkShiftFindUnique,
  mockWorkShiftFindFirst,
  mockWorkShiftUpdate,
  mockWorkShiftUpdateMany,
  mockWorkShiftDelete,
  mockWorkShiftCount,
  mockUserFindMany,
  mockUserFindUnique,
  mockShiftDutyFindMany,
  mockShiftAuditLogCreate,
} = vi.hoisted(() => ({
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftFindFirst: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockWorkShiftUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockWorkShiftDelete: vi.fn(),
  mockWorkShiftCount: vi.fn().mockResolvedValue(0),
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockShiftDutyFindMany: vi.fn().mockResolvedValue([]),
  mockShiftAuditLogCreate: vi.fn().mockResolvedValue({ id: "log-1" }),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    workShift: {
      findMany: mockWorkShiftFindMany,
      create: mockWorkShiftCreate,
      findUnique: mockWorkShiftFindUnique,
      findFirst: mockWorkShiftFindFirst,
      update: mockWorkShiftUpdate,
      updateMany: mockWorkShiftUpdateMany,
      delete: mockWorkShiftDelete,
      count: mockWorkShiftCount,
    },
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    shiftDuty: {
      findMany: mockShiftDutyFindMany,
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    shiftAuditLog: {
      create: mockShiftAuditLogCreate,
    },
    allowedIP: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
  },
}));

vi.mock("../src/lib/auto-schedule", () => ({
  ensureAdminNaSchedule: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/schedule-lock", () => ({
  isShiftLocked: vi.fn().mockReturnValue(false),
}));

vi.mock("../src/lib/payroll-period", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/schedule-penalty", () => ({
  applyLateSchedulePenalty: vi.fn().mockResolvedValue(undefined),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Staff Schedule Cache Invalidation Suite", () => {
  let staffToken: string;
  let staffToken2: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

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

    staffToken = await signAccessToken({
      sub: "staff-sched-user-1",
      email: "staff1@limart.com",
      role: "USER",
    });

    staffToken2 = await signAccessToken({
      sub: "staff-sched-user-2",
      email: "staff2@limart.com",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: "admin-sched-user",
      email: "admin@limart.com",
      role: "ADMIN",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/staff/schedule Caching
  // ==========================================================================
  describe("1. GET /api/staff/schedule cache hit & miss", () => {
    const mockShifts = [
      {
        id: 201,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-20T08:30:00.000Z"),
        end: new Date("2026-10-20T12:00:00.000Z"),
        shiftType: "MORNING",
        status: "APPROVED",
        user: {
          id: "staff-sched-user-1",
          name: "Staff One",
          image: null,
          email: "staff1@limart.com",
        },
      },
    ];

    it("serves from DB on cache miss, caches key, and serves from cache on repeat GET", async () => {
      mockWorkShiftFindMany.mockResolvedValue(mockShifts);

      // 1st request: Cache miss -> query DB
      const res1 = await app.request("/api/staff/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);

      const cacheKey = "staff:schedule:staff-sched-user-1:10:2026";
      expect(memoryStore.has(cacheKey)).toBe(true);

      // 2nd request: Cache hit -> do not query DB again
      const res2 = await app.request("/api/staff/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(json1.data);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1); // Still 1!
    });
  });

  // ==========================================================================
  // 2. Staff Route Shift Mutations Invalidate staff:schedule:*
  // ==========================================================================
  describe("2. Staff route mutations invalidate staff:schedule:*", () => {
    it("invalidates staff:schedule:* on POST /api/staff/schedule/register", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));
      memoryStore.set("staff:schedule:staff-sched-user-2:10:2026", JSON.stringify([]));

      mockWorkShiftFindFirst.mockResolvedValue(null); // No overlap
      mockWorkShiftCreate.mockResolvedValue({
        id: 202,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-25T01:30:00.000Z"),
        end: new Date("2026-10-25T05:00:00.000Z"),
        shiftType: "MORNING",
        status: "APPROVED",
        user: {
          id: "staff-sched-user-1",
          name: "Staff One",
          image: null,
          email: "staff1@limart.com",
        },
      });

      const res = await app.request("/api/staff/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateStr: "2026-10-25",
          shift: "MORNING",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify all staff:schedule:* keys were evicted
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
      expect(memoryStore.has("staff:schedule:staff-sched-user-2:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on POST /api/staff/schedule/cancel", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 203,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-26T08:30:00.000Z"),
      });
      mockWorkShiftDelete.mockResolvedValue({ id: 203 });

      const res = await app.request("/api/staff/schedule/cancel", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shiftId: 203 }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on POST /api/staff/schedule/:id/swap", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 204,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-27T08:30:00.000Z"),
        isOpenForSwap: false,
        user: { id: "staff-sched-user-1" },
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 204,
        isOpenForSwap: true,
        user: { id: "staff-sched-user-1" },
      });

      const res = await app.request("/api/staff/schedule/204/swap", {
        method: "POST",
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on POST /api/staff/schedule/:id/take", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));
      memoryStore.set("staff:schedule:staff-sched-user-2:10:2026", JSON.stringify([]));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 205,
        userId: "staff-sched-user-2",
        start: new Date("2026-10-28T08:30:00.000Z"),
        end: new Date("2026-10-28T12:00:00.000Z"),
        isOpenForSwap: true,
        user: { id: "staff-sched-user-2", name: "Staff 2", email: "staff2@example.com" },
      });
      mockWorkShiftCount.mockResolvedValue(0); // No overlap
      mockWorkShiftUpdateMany.mockResolvedValue({ count: 1 });

      const res = await app.request("/api/staff/schedule/205/take", {
        method: "POST",
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
      expect(memoryStore.has("staff:schedule:staff-sched-user-2:10:2026")).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Generic Schedule Route Shift Mutations Invalidate staff:schedule:*
  // ==========================================================================
  describe("3. Generic schedule route mutations invalidate staff:schedule:*", () => {
    it("invalidates staff:schedule:* on POST /api/schedule (shift creation)", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftCreate.mockResolvedValue({
        id: 301,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-20T08:00:00.000Z"),
        end: new Date("2026-10-20T17:00:00.000Z"),
        status: "APPROVED",
      });

      const res = await app.request("/api/schedule", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: "2026-10-20T08:00:00.000Z",
          end: "2026-10-20T17:00:00.000Z",
          shiftType: "FULL_DAY",
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on POST /api/schedule/register", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftCreate.mockResolvedValue({
        id: 302,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-21T08:00:00.000Z"),
        end: new Date("2026-10-21T12:00:00.000Z"),
        status: "APPROVED",
      });

      const res = await app.request("/api/schedule/register", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: "2026-10-21T08:00:00.000Z",
          end: "2026-10-21T12:00:00.000Z",
          shiftType: "MORNING",
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on POST /api/schedule/:id/swap", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 303,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-22T08:00:00.000Z"),
        isOpenForSwap: false,
        user: { id: "staff-sched-user-1" },
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 303,
        isOpenForSwap: true,
        user: { id: "staff-sched-user-1" },
      });

      const res = await app.request("/api/schedule/303/swap", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isOpen: true }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on POST /api/schedule/:id/take", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));
      memoryStore.set("staff:schedule:staff-sched-user-2:10:2026", JSON.stringify([]));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 304,
        userId: "staff-sched-user-2",
        start: new Date("2026-10-23T08:00:00.000Z"),
        isOpenForSwap: true,
        user: { id: "staff-sched-user-2" },
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 304,
        userId: "staff-sched-user-1",
        isOpenForSwap: false,
        user: { id: "staff-sched-user-1" },
      });

      const res = await app.request("/api/schedule/304/take", {
        method: "POST",
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
      expect(memoryStore.has("staff:schedule:staff-sched-user-2:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on DELETE /api/schedule/:id", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 305,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-24T08:00:00.000Z"),
        end: new Date("2026-10-24T12:00:00.000Z"),
      });
      mockWorkShiftDelete.mockResolvedValue({ id: 305 });

      const res = await app.request("/api/schedule/305", {
        method: "DELETE",
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Admin Schedule Route Mutations Invalidate staff:schedule:*
  // ==========================================================================
  describe("4. Admin schedule route mutations invalidate staff:schedule:*", () => {
    it("invalidates staff:schedule:* on POST /api/admin/schedule", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftCreate.mockResolvedValue({
        id: 401,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-25T08:00:00.000Z"),
        end: new Date("2026-10-25T17:00:00.000Z"),
        user: { id: "staff-sched-user-1", name: "Staff 1", employmentType: "FULL_TIME" },
        duties: [],
      });

      const res = await app.request("/api/admin/schedule", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "staff-sched-user-1",
          start: "2026-10-25T08:00:00.000Z",
          end: "2026-10-25T17:00:00.000Z",
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on PUT /api/admin/schedule/:id", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 402,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-26T08:00:00.000Z"),
        end: new Date("2026-10-26T17:00:00.000Z"),
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 402,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-26T09:00:00.000Z"),
        end: new Date("2026-10-26T18:00:00.000Z"),
        user: { id: "staff-sched-user-1", name: "Staff 1" },
        duties: [],
      });

      const res = await app.request("/api/admin/schedule/402", {
        method: "PUT",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: "2026-10-26T09:00:00.000Z",
          end: "2026-10-26T18:00:00.000Z",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });

    it("invalidates staff:schedule:* on DELETE /api/admin/schedule/:id", async () => {
      memoryStore.set("staff:schedule:staff-sched-user-1:10:2026", JSON.stringify([]));

      mockWorkShiftFindUnique.mockResolvedValue({
        id: 403,
        userId: "staff-sched-user-1",
        start: new Date("2026-10-27T08:00:00.000Z"),
        end: new Date("2026-10-27T17:00:00.000Z"),
      });
      mockWorkShiftDelete.mockResolvedValue({ id: 403 });

      const res = await app.request("/api/admin/schedule/403", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("staff:schedule:staff-sched-user-1:10:2026")).toBe(false);
    });
  });
});
