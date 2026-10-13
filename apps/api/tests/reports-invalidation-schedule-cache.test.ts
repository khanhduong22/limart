import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockWorkShiftFindMany,
  mockWorkShiftFindUnique,
  mockWorkShiftCreate,
  mockWorkShiftUpdate,
  mockCheckInFindMany,
  mockCheckInFindFirst,
  mockCheckInFindUnique,
  mockCheckInCreate,
  mockCheckInDelete,
  mockCheckInDeleteMany,
  mockAllowedIPFindFirst,
  mockPayrollPeriodFindUnique,
  mockSessionAuditLogCreate,
  mockShiftAuditLogCreate,
} = vi.hoisted(() => ({
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockCheckInFindUnique: vi.fn(),
  mockCheckInCreate: vi.fn(),
  mockCheckInDelete: vi.fn(),
  mockCheckInDeleteMany: vi.fn(),
  mockAllowedIPFindFirst: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockSessionAuditLogCreate: vi.fn(),
  mockShiftAuditLogCreate: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    workShift: {
      findMany: mockWorkShiftFindMany,
      findUnique: mockWorkShiftFindUnique,
      findFirst: vi.fn().mockResolvedValue(null),
      create: mockWorkShiftCreate,
      update: mockWorkShiftUpdate,
    },
    checkIn: {
      findMany: mockCheckInFindMany,
      findFirst: mockCheckInFindFirst,
      findUnique: mockCheckInFindUnique,
      create: mockCheckInCreate,
      delete: mockCheckInDelete,
      deleteMany: mockCheckInDeleteMany,
    },
    allowedIP: {
      findFirst: mockAllowedIPFindFirst,
      findMany: vi.fn().mockResolvedValue([]),
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    sessionAuditLog: {
      create: mockSessionAuditLogCreate,
    },
    shiftAuditLog: {
      create: mockShiftAuditLogCreate,
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Admin Reports Invalidation & Staff Schedule Caching Test Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let staff2Token: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

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

    adminToken = await signAccessToken({
      sub: "admin-rep-1",
      name: "Admin Reports",
      email: "admin.rep@example.com",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: "staff-sched-1",
      name: "Staff Sched",
      email: "staff.sched@example.com",
      role: "USER",
    });

    staff2Token = await signAccessToken({
      sub: "staff-sched-2",
      name: "Staff Sched 2",
      email: "staff.sched2@example.com",
      role: "USER",
    });

    mockPayrollPeriodFindUnique.mockResolvedValue(null);
    mockAllowedIPFindFirst.mockResolvedValue({ id: 1, ip: "127.0.0.1", label: "HQ Office" });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/schedule/my-shifts Caching
  // ==========================================================================
  describe("1. GET /api/schedule/my-shifts caching and retrieval", () => {
    const mockShifts = [
      {
        id: 1001,
        userId: "staff-sched-1",
        start: new Date("2026-10-15T08:00:00.000Z"),
        end: new Date("2026-10-15T17:00:00.000Z"),
        shiftType: "FULL_DAY",
        status: "APPROVED",
        isOpenForSwap: false,
        isSenior: false,
        duties: [
          {
            id: "duty-101",
            title: "Kiểm tra hàng tồn kho",
            description: "Đếm số lượng hàng trên kệ",
            isCompleted: false,
            date: new Date("2026-10-15T08:00:00.000Z"),
            createdAt: new Date("2026-10-14T00:00:00.000Z"),
          },
        ],
      },
    ];

    it("caches GET /api/schedule/my-shifts with key shifts:my-shifts:userId:month:year and hits cache on repeat", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce(mockShifts);

      const url = "/api/schedule/my-shifts?month=10&year=2026";

      // 1st request -> fetches from Prisma DB and writes to Valkey cache
      const res1 = await app.request(url, {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(json1.data[0].id).toBe(1001);
      expect(json1.data[0].duties).toHaveLength(1);
      expect(json1.data[0].shiftDuties).toHaveLength(1);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);

      // Verify exact cache key in memory store
      const expectedKey = "shifts:my-shifts:staff-sched-1:10:2026";
      expect(memoryStore.has(expectedKey)).toBe(true);

      // 2nd request -> serves immediately from cache, zero additional DB queries
      const res2 = await app.request(url, {
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
  // 2. Shift Mutations Invalidate shifts:my-shifts:*
  // ==========================================================================
  describe("2. Shift mutations invalidate shifts:my-shifts:* and admin:schedule:*", () => {
    it("invalidates shifts:my-shifts:* and admin:schedule:* on POST /api/schedule/:id/swap", async () => {
      // Seed keys into cache
      memoryStore.set("shifts:my-shifts:staff-sched-1:10:2026", JSON.stringify([{ id: 1001 }]));
      memoryStore.set("admin:schedule:2026-10", JSON.stringify({ ok: true }));

      mockWorkShiftFindUnique.mockResolvedValueOnce({
        id: 1001,
        userId: "staff-sched-1",
        start: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Future, unlocked
        end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 8 * 3600 * 1000),
        isOpenForSwap: false,
        user: { id: "staff-sched-1", name: "Staff 1", image: null, email: "staff1@example.com" },
      });

      mockWorkShiftUpdate.mockResolvedValueOnce({
        id: 1001,
        userId: "staff-sched-1",
        start: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isOpenForSwap: true,
        user: { id: "staff-sched-1", name: "Staff 1", image: null, email: "staff1@example.com" },
      });

      const res = await app.request("/api/schedule/1001/swap", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isOpen: true }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Assert both patterns were evicted
      expect(memoryStore.has("shifts:my-shifts:staff-sched-1:10:2026")).toBe(false);
      expect(memoryStore.has("admin:schedule:2026-10")).toBe(false);
    });

    it("invalidates both taker and giver shifts:my-shifts:* on POST /api/schedule/:id/take", async () => {
      memoryStore.set("shifts:my-shifts:staff-sched-1:10:2026", JSON.stringify([{ id: 1001 }]));
      memoryStore.set("shifts:my-shifts:staff-sched-2:10:2026", JSON.stringify([{ id: 2002 }]));
      memoryStore.set("admin:schedule:2026-10", JSON.stringify({ ok: true }));

      // Shift belongs to staff-sched-1, taken by staff-sched-2
      mockWorkShiftFindUnique.mockResolvedValueOnce({
        id: 1001,
        userId: "staff-sched-1",
        start: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 8 * 3600 * 1000),
        isOpenForSwap: true,
        user: { id: "staff-sched-1", name: "Staff 1", image: null, email: "staff1@example.com" },
      });

      mockWorkShiftUpdate.mockResolvedValueOnce({
        id: 1001,
        userId: "staff-sched-2",
        isOpenForSwap: false,
        user: { id: "staff-sched-2", name: "Staff 2", image: null, email: "staff2@example.com" },
      });

      const res = await app.request("/api/schedule/1001/take", {
        method: "POST",
        headers: { Cookie: `access_token=${staff2Token}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify both staff cache entries are cleared
      expect(memoryStore.has("shifts:my-shifts:staff-sched-1:10:2026")).toBe(false);
      expect(memoryStore.has("shifts:my-shifts:staff-sched-2:10:2026")).toBe(false);
      expect(memoryStore.has("admin:schedule:2026-10")).toBe(false);
    });

    it("invalidates shifts:my-shifts:* on POST /api/schedule shift creation", async () => {
      memoryStore.set("shifts:my-shifts:staff-sched-1:10:2026", JSON.stringify([{ id: 1001 }]));
      memoryStore.set("admin:schedule:2026-10", JSON.stringify({ ok: true }));

      mockWorkShiftCreate.mockResolvedValueOnce({
        id: 3003,
        userId: "staff-sched-1",
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
      expect(memoryStore.has("shifts:my-shifts:staff-sched-1:10:2026")).toBe(false);
      expect(memoryStore.has("admin:schedule:2026-10")).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Checkin Mutations Invalidate admin:reports:*
  // ==========================================================================
  describe("3. Checkin mutations invalidate admin:reports:*", () => {
    it("invalidates admin:reports:* on staff check-in POST /api/checkins", async () => {
      memoryStore.set("admin:reports:10:2026", JSON.stringify({ summary: "monthly-report" }));
      memoryStore.set("admin:reports:overview", JSON.stringify({ stats: [] }));

      mockCheckInFindFirst.mockResolvedValueOnce(null); // No prior checkin
      mockCheckInCreate.mockResolvedValueOnce({
        id: 501,
        userId: "staff-sched-1",
        type: "checkin",
        timestamp: new Date(),
        ipAddress: "127.0.0.1",
        note: null,
      });

      const res = await app.request("/api/checkins", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "checkin" }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify admin:reports:* keys were evicted immediately
      expect(memoryStore.has("admin:reports:10:2026")).toBe(false);
      expect(memoryStore.has("admin:reports:overview")).toBe(false);
    });

    it("invalidates admin:reports:* on POST /api/checkins/sync-offline", async () => {
      memoryStore.set("admin:reports:10:2026", JSON.stringify({ summary: "monthly-report" }));

      mockCheckInFindFirst.mockResolvedValue(null);
      mockCheckInCreate.mockResolvedValue({
        id: 502,
        userId: "staff-sched-1",
        type: "checkin",
        timestamp: new Date(),
      });

      const res = await app.request("/api/checkins/sync-offline", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              id: "offline-1",
              type: "checkin",
              timestamp: Date.now() - 3600000,
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.synced).toBe(1);

      expect(memoryStore.has("admin:reports:10:2026")).toBe(false);
    });

    it("invalidates admin:reports:* on admin manual check-in POST /api/admin/manual-checkin", async () => {
      memoryStore.set("admin:reports:10:2026", JSON.stringify({ summary: "monthly-report" }));
      memoryStore.set("admin:reports:yearly", JSON.stringify({ count: 12 }));

      mockCheckInDeleteMany.mockResolvedValueOnce({ count: 0 });
      mockCheckInCreate.mockResolvedValueOnce({
        id: 503,
        userId: "staff-sched-1",
        type: "checkin",
        timestamp: new Date(),
      });

      const res = await app.request("/api/admin/manual-checkin", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "staff-sched-1",
          date: "2026-10-15",
          checkInTime: "08:30",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(memoryStore.has("admin:reports:10:2026")).toBe(false);
      expect(memoryStore.has("admin:reports:yearly")).toBe(false);
    });

    it("invalidates admin:reports:* on admin manual check-in alias POST /api/admin/checkin/manual", async () => {
      memoryStore.set("admin:reports:10:2026", JSON.stringify({ summary: "monthly-report" }));

      mockCheckInDeleteMany.mockResolvedValueOnce({ count: 0 });
      mockCheckInCreate.mockResolvedValueOnce({
        id: 504,
        userId: "staff-sched-1",
        type: "checkin",
        timestamp: new Date(),
      });

      const res = await app.request("/api/admin/checkin/manual", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "staff-sched-1",
          date: "2026-10-15",
          checkInTime: "08:30",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(memoryStore.has("admin:reports:10:2026")).toBe(false);
    });

    it("invalidates admin:reports:* on DELETE /api/admin/checkin/:id", async () => {
      memoryStore.set("admin:reports:10:2026", JSON.stringify({ summary: "monthly-report" }));
      memoryStore.set("admin:reports:user-stats", JSON.stringify({ stats: [] }));

      mockCheckInFindUnique.mockResolvedValueOnce({
        id: 505,
        userId: "staff-sched-1",
        type: "checkin",
        timestamp: new Date("2026-10-15T08:00:00.000Z"),
      });
      mockCheckInDelete.mockResolvedValueOnce({ id: 505 });

      const res = await app.request("/api/admin/checkin/505", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("Đã xóa bản ghi chấm công");

      expect(memoryStore.has("admin:reports:10:2026")).toBe(false);
      expect(memoryStore.has("admin:reports:user-stats")).toBe(false);
    });
  });
});
