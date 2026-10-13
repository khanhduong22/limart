import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockWorkShiftFindMany,
  mockWorkShiftFindUnique,
  mockWorkShiftCreate,
  mockWorkShiftUpdate,
  mockWorkShiftDelete,
  mockWorkShiftDeleteMany,
  mockWorkShiftUpdateMany,
  mockAnnouncementFindMany,
  mockAnnouncementFindUnique,
  mockAnnouncementCreate,
  mockAnnouncementUpdate,
  mockAnnouncementDelete,
  mockUserFindMany,
  mockUserFindUnique,
  mockShiftDutyFindMany,
  mockShiftDutyCreate,
  mockShiftDutyDelete,
  mockShiftDutyDeleteMany,
  mockShiftAuditLogCreate,
  mockPayrollPeriodFindUnique,
} = vi.hoisted(() => ({
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftFindUnique: vi.fn(),
  mockWorkShiftCreate: vi.fn(),
  mockWorkShiftUpdate: vi.fn(),
  mockWorkShiftDelete: vi.fn(),
  mockWorkShiftDeleteMany: vi.fn(),
  mockWorkShiftUpdateMany: vi.fn(),
  mockAnnouncementFindMany: vi.fn(),
  mockAnnouncementFindUnique: vi.fn(),
  mockAnnouncementCreate: vi.fn(),
  mockAnnouncementUpdate: vi.fn(),
  mockAnnouncementDelete: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockShiftDutyFindMany: vi.fn(),
  mockShiftDutyCreate: vi.fn(),
  mockShiftDutyDelete: vi.fn(),
  mockShiftDutyDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  mockShiftAuditLogCreate: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    workShift: {
      findMany: mockWorkShiftFindMany,
      findUnique: mockWorkShiftFindUnique,
      create: mockWorkShiftCreate,
      update: mockWorkShiftUpdate,
      delete: mockWorkShiftDelete,
      deleteMany: mockWorkShiftDeleteMany,
      updateMany: mockWorkShiftUpdateMany,
    },
    announcement: {
      findMany: mockAnnouncementFindMany,
      findUnique: mockAnnouncementFindUnique,
      create: mockAnnouncementCreate,
      update: mockAnnouncementUpdate,
      delete: mockAnnouncementDelete,
    },
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    shiftDuty: {
      findMany: mockShiftDutyFindMany,
      create: mockShiftDutyCreate,
      delete: mockShiftDutyDelete,
      deleteMany: mockShiftDutyDeleteMany,
    },
    shiftAuditLog: {
      create: mockShiftAuditLogCreate,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    userPenalty: {
      create: vi.fn().mockResolvedValue({ id: "pen-1" }),
    },
    allowedIP: {
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

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Admin Schedule & Announcements Valkey Caching Suite", () => {
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

    adminToken = await signAccessToken({
      sub: "admin-schedule-cache-test",
      email: "admin.cache@example.com",
      role: "ADMIN",
    });

    mockPayrollPeriodFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/admin/schedule Caching
  // ==========================================================================
  describe("1. GET /api/admin/schedule Caching", () => {
    const mockShifts = [
      {
        id: 201,
        userId: "user-alice",
        start: new Date("2026-10-05T08:00:00.000Z"),
        end: new Date("2026-10-05T17:00:00.000Z"),
        shiftType: "FULL",
        status: "APPROVED",
        isSenior: true,
        isOpenForSwap: false,
        user: {
          id: "user-alice",
          name: "Alice Nguyen",
          image: null,
          email: "alice@example.com",
          role: "USER",
          employmentType: "FULL_TIME",
        },
        duties: [{ id: "duty-1", title: "Mở cửa", isCompleted: false }],
      },
    ];

    it("caches monthly schedule under admin:schedule:${month}:${year}:none:none for 120s", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce(mockShifts);

      // Request 1: Cache miss
      const res1 = await app.request("/api/admin/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(json1.data[0].title).toBe("Alice Nguyen");
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex called with key admin:schedule:10:2026:none:none and TTL around 120s
      const expectedKey = "admin:schedule:10:2026:none:none";
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(120 * 0.85);
      expect(ttl).toBeLessThanOrEqual(120 * 1.15 + 1);

      // Request 2: Cache hit
      const res2 = await app.request("/api/admin/schedule?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      expect(json2.data[0].id).toBe(201);
      expect(mockWorkShiftFindMany).toHaveBeenCalledTimes(1); // Not called again!
    });

    it("uses start and end query parameters in the cache key", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce(mockShifts);

      const res = await app.request(
        "/api/admin/schedule?start=2026-10-01T00:00:00Z&end=2026-10-15T23:59:59Z",
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const expectedKey =
        "admin:schedule:all:all:2026-10-01T00:00:00Z:2026-10-15T23:59:59Z";
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
    });

    it("uses default parameters when no query params are passed", async () => {
      mockWorkShiftFindMany.mockResolvedValueOnce(mockShifts);

      const res = await app.request("/api/admin/schedule", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const expectedKey = "admin:schedule:all:all:none:none";
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  // ==========================================================================
  // 2. admin:schedule:* Invalidation on Shift Mutations
  // ==========================================================================
  describe("2. admin:schedule:* Invalidation on Shift Mutations", () => {
    beforeEach(() => {
      // Seed pre-existing schedule cache entries
      memoryStore.set("admin:schedule:10:2026:none:none", JSON.stringify([]));
      memoryStore.set("admin:schedule:all:all:none:none", JSON.stringify([]));
    });

    it("invalidates admin:schedule:* on POST /api/admin/schedule (create shift)", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: "user-alice",
        employmentType: "FULL_TIME",
        role: "USER",
      });
      mockWorkShiftCreate.mockResolvedValue({
        id: 202,
        userId: "user-alice",
        start: new Date("2026-10-06T08:00:00.000Z"),
        end: new Date("2026-10-06T17:00:00.000Z"),
        shiftType: "FULL",
        status: "APPROVED",
        isSenior: false,
        user: { id: "user-alice", name: "Alice", employmentType: "FULL_TIME" },
        duties: [],
      });
      mockShiftAuditLogCreate.mockResolvedValue({ id: "audit-2" });

      const res = await app.request("/api/admin/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          userId: "user-alice",
          start: "2026-10-06T08:00:00.000Z",
          end: "2026-10-06T17:00:00.000Z",
          shiftType: "FULL",
        }),
      });

      expect(res.status).toBe(201);
      // Cache entries matching admin:schedule:* must have been invalidated (deleted)
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
      expect(memoryStore.has("admin:schedule:all:all:none:none")).toBe(false);
    });

    it("invalidates admin:schedule:* on PUT /api/admin/schedule/:id (update shift)", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 201,
        userId: "user-alice",
        start: new Date("2026-10-05T08:00:00.000Z"),
        end: new Date("2026-10-05T17:00:00.000Z"),
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 201,
        userId: "user-alice",
        start: new Date("2026-10-05T09:00:00.000Z"),
        end: new Date("2026-10-05T18:00:00.000Z"),
        user: { id: "user-alice", name: "Alice", employmentType: "FULL_TIME" },
        duties: [],
      });
      mockShiftAuditLogCreate.mockResolvedValue({ id: "audit-3" });

      const res = await app.request("/api/admin/schedule/201", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          start: "2026-10-05T09:00:00.000Z",
          end: "2026-10-05T18:00:00.000Z",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
      expect(memoryStore.has("admin:schedule:all:all:none:none")).toBe(false);
    });

    it("invalidates admin:schedule:* on DELETE /api/admin/schedule/:id (delete shift)", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 201,
        userId: "user-alice",
        start: new Date("2026-10-05T08:00:00.000Z"),
        end: new Date("2026-10-05T17:00:00.000Z"),
      });
      mockWorkShiftDelete.mockResolvedValue({ id: 201 });
      mockShiftAuditLogCreate.mockResolvedValue({ id: "audit-4" });

      const res = await app.request("/api/admin/schedule/201", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
      expect(memoryStore.has("admin:schedule:all:all:none:none")).toBe(false);
    });

    it("invalidates admin:schedule:* on POST /api/admin/schedule/:id/swap", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 201,
        userId: "user-alice",
        start: new Date("2026-10-05T08:00:00.000Z"),
        isOpenForSwap: false,
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 201,
        isOpenForSwap: true,
      });

      const res = await app.request("/api/admin/schedule/201/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ isOpen: true }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
    });

    it("invalidates admin:schedule:* on POST /api/admin/schedule/swap (body id)", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 201,
        userId: "user-alice",
        start: new Date("2026-10-05T08:00:00.000Z"),
        isOpenForSwap: false,
      });
      mockWorkShiftUpdate.mockResolvedValue({
        id: 201,
        isOpenForSwap: true,
      });

      const res = await app.request("/api/admin/schedule/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ id: 201, isOpen: true }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
    });

    it("invalidates admin:schedule:* on POST /api/admin/schedule/:id/take", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 201,
        userId: "user-alice",
        start: new Date("2026-10-05T08:00:00.000Z"),
        end: new Date("2026-10-05T17:00:00.000Z"),
        isOpenForSwap: true,
        user: { id: "admin-schedule-cache-test", name: "Admin", email: "admin@example.com" },
      });
      mockWorkShiftUpdateMany.mockResolvedValue({ count: 1 });
      mockShiftAuditLogCreate.mockResolvedValue({ id: "audit-5" });

      const res = await app.request("/api/admin/schedule/201/take", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
    });

    it("invalidates admin:schedule:* on PATCH /api/admin/schedule/:id/senior", async () => {
      mockWorkShiftFindUnique.mockResolvedValue({
        id: 201,
        userId: "user-alice",
        start: new Date("2026-10-05T08:00:00.000Z"),
        end: new Date("2026-10-05T17:00:00.000Z"),
        isSenior: false,
        user: { name: "Alice" },
      });
      mockWorkShiftFindMany.mockResolvedValue([]);
      mockWorkShiftUpdate.mockResolvedValue({
        id: 201,
        userId: "user-alice",
        isSenior: true,
        user: { id: "user-alice", name: "Alice", employmentType: "FULL_TIME" },
        duties: [],
      });
      mockShiftAuditLogCreate.mockResolvedValue({ id: "audit-6" });

      const res = await app.request("/api/admin/schedule/201/senior", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ isSenior: true }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
    });

    it("invalidates admin:schedule:* on DELETE /api/admin/schedule/user/:userId/all", async () => {
      mockWorkShiftDeleteMany.mockResolvedValue({ count: 5 });

      const res = await app.request("/api/admin/schedule/user/user-alice/all", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      const body = await res.json();
      expect(body.error).toBeUndefined();
      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
    });

    it("invalidates admin:schedule:* on POST /api/admin/schedule/duties and DELETE /api/admin/schedule/duties/:dutyId", async () => {
      // POST duty
      mockShiftDutyCreate.mockResolvedValue({
        id: "duty-new",
        title: "Dọn quầy",
        userId: "user-alice",
        user: { id: "user-alice", name: "Alice", email: "alice@example.com" },
      });

      const resPost = await app.request("/api/admin/schedule/duties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "Dọn quầy",
          userId: "user-alice",
          shiftId: "201",
        }),
      });

      expect(resPost.status).toBe(201);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);

      // Re-seed cache
      memoryStore.set("admin:schedule:10:2026:none:none", JSON.stringify([]));

      // DELETE duty
      mockShiftDutyDelete.mockResolvedValue({ id: "duty-new" });
      const resDel = await app.request("/api/admin/schedule/duties/duty-new", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(resDel.status).toBe(200);
      expect(memoryStore.has("admin:schedule:10:2026:none:none")).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Announcements Caching & Invalidation
  // ==========================================================================
  describe("3. GET /api/admin/announcements Caching & Invalidation", () => {
    const mockAnnouncements = [
      {
        id: "ann-1",
        title: "Thông báo nghỉ lễ",
        content: "Nghỉ lễ 30/4 - 1/5",
        type: "IMPORTANT",
        active: true,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    ];

    it("caches announcements under admin:announcements:all for 300s", async () => {
      mockAnnouncementFindMany.mockResolvedValueOnce(mockAnnouncements);

      // Request 1: Cache miss
      const res1 = await app.request("/api/admin/announcements", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockAnnouncementFindMany).toHaveBeenCalledTimes(1);

      // Check Redis setex called with key admin:announcements:all and ~300s TTL
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "admin:announcements:all",
        expect.any(Number),
        expect.any(String)
      );
      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(300 * 0.85);
      expect(ttl).toBeLessThanOrEqual(300 * 1.15 + 1);

      // Request 2: Cache hit
      const res2 = await app.request("/api/admin/announcements", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      expect(mockAnnouncementFindMany).toHaveBeenCalledTimes(1); // Not called again!
    });

    it("invalidates admin:announcements:* AND staff:home:* on POST /api/admin/announcements", async () => {
      memoryStore.set("admin:announcements:all", JSON.stringify(mockAnnouncements));
      memoryStore.set("staff:home:user-1", JSON.stringify({}));

      mockAnnouncementCreate.mockResolvedValue({
        id: "ann-2",
        title: "Thông báo họp",
        content: "Họp lúc 9h sáng",
        type: "INFO",
        active: true,
      });

      const res = await app.request("/api/admin/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "Thông báo họp",
          content: "Họp lúc 9h sáng",
          type: "INFO",
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("admin:announcements:all")).toBe(false);
      expect(memoryStore.has("staff:home:user-1")).toBe(false);
    });

    it("invalidates admin:announcements:* AND staff:home:* on DELETE /api/admin/announcements/:id", async () => {
      memoryStore.set("admin:announcements:all", JSON.stringify(mockAnnouncements));
      memoryStore.set("staff:home:user-1", JSON.stringify({}));

      mockAnnouncementDelete.mockResolvedValue({ id: "ann-1" });

      const res = await app.request("/api/admin/announcements/ann-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:announcements:all")).toBe(false);
      expect(memoryStore.has("staff:home:user-1")).toBe(false);
    });

    it("invalidates admin:announcements:* AND staff:home:* on PATCH /api/admin/announcements/:id/toggle", async () => {
      memoryStore.set("admin:announcements:all", JSON.stringify(mockAnnouncements));
      memoryStore.set("staff:home:user-1", JSON.stringify({}));

      mockAnnouncementFindUnique.mockResolvedValue({
        id: "ann-1",
        title: "Thông báo",
        active: true,
      });
      mockAnnouncementUpdate.mockResolvedValue({
        id: "ann-1",
        title: "Thông báo",
        active: false,
      });

      const res = await app.request("/api/admin/announcements/ann-1/toggle", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ active: false }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:announcements:all")).toBe(false);
      expect(memoryStore.has("staff:home:user-1")).toBe(false);
    });
  });
});
