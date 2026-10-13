import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUserFindMany,
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdate,
  mockUserDelete,
  mockHolidayFindMany,
  mockHolidayUpsert,
  mockHolidayDelete,
  mockWorkShiftFindMany,
  mockSessionDeleteMany,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserDelete: vi.fn(),
  mockHolidayFindMany: vi.fn(),
  mockHolidayUpsert: vi.fn(),
  mockHolidayDelete: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockSessionDeleteMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
      delete: mockUserDelete,
      count: vi.fn().mockResolvedValue(10),
    },
    holiday: {
      findMany: mockHolidayFindMany,
      upsert: mockHolidayUpsert,
      delete: mockHolidayDelete,
    },
    checkIn: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      deleteMany: mockSessionDeleteMany,
    },
    allowedIP: {
      count: vi.fn().mockResolvedValue(1),
    },
    request: {
      count: vi.fn().mockResolvedValue(0),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcement: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcementRead: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, invalidateSpecialDaysCache } from "../src/lib/cache";
import { getSpecialDays } from "../src/lib/special-days";
import { getVietnamDayRange, getVietnamMonthRange } from "../src/lib/date-utils";

describe("Special Days Shared Valkey Caching Suite", () => {
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
      sub: "admin-1",
      email: "admin@limart.vn",
      role: "ADMIN",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "admin-1") {
        return {
          id: "admin-1",
          email: "admin@limart.vn",
          name: "Admin User",
          role: "ADMIN",
          isActive: true,
        };
      }
      return null;
    });

    mockWorkShiftFindMany.mockResolvedValue([]);
    mockSessionDeleteMany.mockResolvedValue({ count: 0 });
  });

  describe("1. getSpecialDays Caching & Jitter Verification", () => {
    it("caches special days with key meta:special-days:YYYY:MM:DD and TTL ~1800s with jitter", async () => {
      const targetDate = new Date("2026-10-15T08:00:00.000Z");
      const { month, year } = getVietnamMonthRange(10, 2026);
      const { dateStr } = getVietnamDayRange(targetDate);
      const day = parseInt(dateStr.split("-")[2], 10);
      const expectedKey = `meta:special-days:${year}:${month}:${day}`;

      mockUserFindMany.mockResolvedValueOnce([
        {
          id: "u-1",
          name: "Nguyễn Văn A",
          image: null,
          birthday: new Date("1995-10-15T00:00:00.000Z"),
          startDate: new Date("2024-10-15T00:00:00.000Z"),
        },
      ]);
      mockHolidayFindMany.mockResolvedValueOnce([
        {
          id: "h-1",
          name: "Ngày Phụ Nữ Việt Nam",
          date: new Date("2026-10-20T00:00:00.000Z"),
        },
      ]);

      // Call 1: Cache Miss -> Queries DB & Writes to Redis
      const result1 = await getSpecialDays(targetDate, month, year);
      expect(result1.length).toBeGreaterThan(0);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);
      expect(mockHolidayFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );

      // Verify TTL jitter: 1800s ± 15% (1530s - 2070s)
      const setexCall = (mockRedis.setex as any).mock.calls.find((c: any) => c[0] === expectedKey);
      expect(setexCall[1]).toBeGreaterThanOrEqual(1800 * 0.85);
      expect(setexCall[1]).toBeLessThanOrEqual(1800 * 1.15 + 1);

      // Call 2: Cache Hit -> Serves directly from Redis without hitting DB
      const result2 = await getSpecialDays(targetDate, month, year);
      expect(result2).toEqual(result1);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1); // No new DB call
      expect(mockHolidayFindMany).toHaveBeenCalledTimes(1); // No new DB call
    });

    it("SingleFlight deduplicates concurrent getSpecialDays misses to a single DB query", async () => {
      const targetDate = new Date("2026-11-20T08:00:00.000Z");
      const { month, year } = getVietnamMonthRange(11, 2026);

      mockUserFindMany.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve([
                  {
                    id: "u-2",
                    name: "Trần Thị B",
                    image: null,
                    birthday: new Date("1998-11-20T00:00:00.000Z"),
                    startDate: null,
                  },
                ]),
              10
            )
          )
      );
      mockHolidayFindMany.mockResolvedValue([]);

      // Trigger 5 concurrent calls
      const results = await Promise.all([
        getSpecialDays(targetDate, month, year),
        getSpecialDays(targetDate, month, year),
        getSpecialDays(targetDate, month, year),
        getSpecialDays(targetDate, month, year),
        getSpecialDays(targetDate, month, year),
      ]);

      expect(results.length).toBe(5);
      expect(results[0]).toEqual(results[1]);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("2. Invalidation via invalidateSpecialDaysCache", () => {
    it("invalidates all meta:special-days:* keys from cache", async () => {
      memoryStore.set("meta:special-days:2026:10:15", JSON.stringify([{ id: "cached-1" }]));
      memoryStore.set("meta:special-days:2026:10:16", JSON.stringify([{ id: "cached-2" }]));
      memoryStore.set("other:cache:key", JSON.stringify({ ok: true }));

      await invalidateSpecialDaysCache();

      expect(memoryStore.has("meta:special-days:2026:10:15")).toBe(false);
      expect(memoryStore.has("meta:special-days:2026:10:16")).toBe(false);
      expect(memoryStore.has("other:cache:key")).toBe(true);
    });
  });

  describe("3. Admin Routes Invalidation Integration", () => {
    it("invalidates special days cache when admin updates employee", async () => {
      memoryStore.set("meta:special-days:2026:10:15", JSON.stringify([{ id: "cached-1" }]));

      mockUserUpdate.mockResolvedValueOnce({
        id: "emp-1",
        name: "Updated Staff",
        birthday: new Date("1995-10-15T00:00:00.000Z"),
      });

      const res = await app.request("/api/admin/employees/emp-1", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Updated Staff",
          birthday: "1995-10-15",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("meta:special-days:2026:10:15")).toBe(false);
    });

    it("invalidates special days cache when admin creates a holiday", async () => {
      memoryStore.set("meta:special-days:2026:10:15", JSON.stringify([{ id: "cached-1" }]));

      mockHolidayUpsert.mockResolvedValueOnce({
        id: "h-new-1",
        date: new Date("2026-10-20"),
        name: "Ngày Phụ Nữ VN",
        multiplier: 3,
      });

      const res = await app.request("/api/admin/settings/holidays", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          date: "2026-10-20",
          name: "Ngày Phụ Nữ VN",
          multiplier: 3,
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("meta:special-days:2026:10:15")).toBe(false);
    });

    it("invalidates special days cache when admin deletes a holiday", async () => {
      memoryStore.set("meta:special-days:2026:10:15", JSON.stringify([{ id: "cached-1" }]));

      mockHolidayDelete.mockResolvedValueOnce({
        id: "h-del-1",
      });

      const res = await app.request("/api/admin/settings/holidays/h-del-1", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("meta:special-days:2026:10:15")).toBe(false);
    });
  });
});
