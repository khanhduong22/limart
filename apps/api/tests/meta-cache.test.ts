import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockUserUpdate,
  mockUserDelete,
  mockUserUpdateMany,
  mockLuckyWheelPrizeFindMany,
  mockLuckyWheelPrizeCreate,
  mockLuckyWheelPrizeUpdate,
  mockLuckyWheelPrizeUpdateMany,
  mockLuckyWheelPrizeDelete,
  mockLuckyWheelHistoryFindMany,
  mockLuckyWheelHistoryFindFirst,
  mockLuckyWheelHistoryCreate,
  mockCheckInFindFirst,
  mockDocumentFindMany,
  mockDocumentFindUnique,
  mockDocumentUpsert,
  mockDocumentDelete,
  mockDocumentChunkDeleteMany,
  mockExecuteRawUnsafe,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserDelete: vi.fn(),
  mockUserUpdateMany: vi.fn(),
  mockLuckyWheelPrizeFindMany: vi.fn(),
  mockLuckyWheelPrizeCreate: vi.fn(),
  mockLuckyWheelPrizeUpdate: vi.fn(),
  mockLuckyWheelPrizeUpdateMany: vi.fn(),
  mockLuckyWheelPrizeDelete: vi.fn(),
  mockLuckyWheelHistoryFindMany: vi.fn(),
  mockLuckyWheelHistoryFindFirst: vi.fn(),
  mockLuckyWheelHistoryCreate: vi.fn(),
  mockCheckInFindFirst: vi.fn(),
  mockDocumentFindMany: vi.fn(),
  mockDocumentFindUnique: vi.fn(),
  mockDocumentUpsert: vi.fn(),
  mockDocumentDelete: vi.fn(),
  mockDocumentChunkDeleteMany: vi.fn(),
  mockExecuteRawUnsafe: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
      update: mockUserUpdate,
      delete: mockUserDelete,
      updateMany: mockUserUpdateMany,
      count: vi.fn().mockResolvedValue(5),
    },
    luckyWheelPrize: {
      findMany: mockLuckyWheelPrizeFindMany,
      create: mockLuckyWheelPrizeCreate,
      update: mockLuckyWheelPrizeUpdate,
      updateMany: mockLuckyWheelPrizeUpdateMany,
      delete: mockLuckyWheelPrizeDelete,
    },
    luckyWheelHistory: {
      findMany: mockLuckyWheelHistoryFindMany,
      findFirst: mockLuckyWheelHistoryFindFirst,
      create: mockLuckyWheelHistoryCreate,
    },
    checkIn: {
      findFirst: mockCheckInFindFirst,
      findMany: vi.fn().mockResolvedValue([]),
    },
    document: {
      findMany: mockDocumentFindMany,
      findUnique: mockDocumentFindUnique,
      upsert: mockDocumentUpsert,
      delete: mockDocumentDelete,
    },
    documentChunk: {
      deleteMany: mockDocumentChunkDeleteMany,
    },
    userAchievement: {
      create: vi.fn().mockResolvedValue({ id: "ach-1" }),
    },
    payrollAdjustment: {
      create: vi.fn().mockResolvedValue({ id: "pay-1" }),
    },
    workShift: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    allowedIP: {
      count: vi.fn().mockResolvedValue(1),
    },
    request: {
      count: vi.fn().mockResolvedValue(0),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcement: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    announcementRead: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $queryRaw: mockQueryRaw,
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Meta & Profile Valkey Caching Suite", () => {
  let userToken: string;
  let adminToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const testUserId = "user-meta-test-1";
  const testAdminId = "admin-meta-test-1";

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetLocks();
    _resetRateLimits();

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

    userToken = await signAccessToken({
      sub: testUserId,
      email: "test.user@limart.vn",
      role: "USER",
    });

    adminToken = await signAccessToken({
      sub: testAdminId,
      email: "test.admin@limart.vn",
      role: "ADMIN",
    });

    mockExecuteRawUnsafe.mockResolvedValue(1);
    mockQueryRaw.mockResolvedValue([]);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/me Valkey Caching & Admin Invalidation
  // ==========================================================================
  describe("1. GET /api/me Valkey Caching & Admin Invalidation", () => {
    const mockProfile = {
      id: testUserId,
      name: "Test User",
      email: "test.user@limart.vn",
      role: "USER",
      image: "https://example.com/avatar.png",
      isActive: true,
      employmentType: "PART_TIME",
      hourlyRate: 30000,
      monthlySalary: null,
      birthday: new Date("1998-05-12"),
      startDate: new Date("2024-01-01"),
      luckyWheelAllowed: true,
      achievements: [],
    };

    it("caches user profile under user:me:${userId} with TTL 120s (± jitter) on initial request", async () => {
      mockUserFindUnique.mockResolvedValue(mockProfile);

      const res = await app.request("/api/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.user.id).toBe(testUserId);
      expect(json.user.name).toBe("Test User");

      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `user:me:${testUserId}`,
        expect.any(Number),
        expect.any(String)
      );

      // Verify TTL is within 120s ± 15% (102s - 138s)
      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(102);
      expect(ttl).toBeLessThanOrEqual(138);

      // Verify memoryStore has entry
      expect(memoryStore.has(`user:me:${testUserId}`)).toBe(true);
    });

    it("serves repeated GET /api/me directly from Valkey cache without hitting Prisma DB", async () => {
      mockUserFindUnique.mockResolvedValue(mockProfile);

      // Call 1: Miss -> DB + Cache write
      await app.request("/api/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);

      // Call 2: Hit -> From cache
      const res2 = await app.request("/api/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.user.id).toBe(testUserId);
      expect(json2.user.name).toBe("Test User");

      // Verify DB was NOT called again
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith(`user:me:${testUserId}`);
    });

    it("invalidates user:me:${id} when admin updates user profile via PUT /api/admin/employees/:id", async () => {
      mockUserFindUnique.mockResolvedValue(mockProfile);

      // Seed cache
      await app.request("/api/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has(`user:me:${testUserId}`)).toBe(true);

      // Admin updates employee
      mockUserUpdate.mockResolvedValue({
        ...mockProfile,
        name: "Updated Name",
      });

      const updateRes = await app.request(`/api/admin/employees/${testUserId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Updated Name",
          role: "USER",
        }),
      });

      expect(updateRes.status).toBe(200);

      // Verify cache was evicted
      expect(memoryStore.has(`user:me:${testUserId}`)).toBe(false);

      // Subsequent GET /api/me should re-query DB
      mockUserFindUnique.mockResolvedValue({
        ...mockProfile,
        name: "Updated Name",
      });

      const resAfterUpdate = await app.request("/api/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(resAfterUpdate.status).toBe(200);
      const jsonAfter = await resAfterUpdate.json();
      expect(jsonAfter.user.name).toBe("Updated Name");
      expect(mockUserFindUnique).toHaveBeenCalledTimes(2);
    });

    it("invalidates user:me:${id} when admin changes status via PATCH /api/admin/employees/:id/status", async () => {
      mockUserFindUnique.mockResolvedValue(mockProfile);

      // Seed cache
      await app.request("/api/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has(`user:me:${testUserId}`)).toBe(true);

      mockUserUpdate.mockResolvedValue({
        ...mockProfile,
        isActive: false,
      });

      const patchRes = await app.request(`/api/admin/employees/${testUserId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ isActive: false }),
      });

      expect(patchRes.status).toBe(200);

      // Cache for user must be invalidated
      expect(memoryStore.has(`user:me:${testUserId}`)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Lucky Wheel Meta Caching & Spin Invalidation
  // ==========================================================================
  describe("2. Lucky Wheel Meta Caching & Invalidation Suite", () => {
    const mockPrizes = [
      { id: "prize-1", name: "Voucher 50k", probability: 50, remaining: 10, active: true, type: "PHYSICAL", createdAt: new Date() },
      { id: "prize-2", name: "Chúc bạn may mắn", probability: 50, remaining: 100, active: true, type: "BETTER_LUCK_NEXT_TIME", createdAt: new Date() },
    ];

    const mockRecentWinners = [
      {
        id: "win-1",
        prizeId: "prize-1",
        prizeName: "Voucher 50k",
        createdAt: new Date(),
        user: { id: "u-winner", name: "Lucky Winner", image: null },
      },
    ];

    beforeEach(() => {
      mockUserFindUnique.mockResolvedValue({
        id: testUserId,
        role: "USER",
        luckyWheelAllowed: true,
        achievements: [],
      });
      mockCheckInFindFirst.mockResolvedValue({ id: 99 });
      mockLuckyWheelHistoryFindFirst.mockResolvedValue(null);
      mockLuckyWheelPrizeFindMany.mockResolvedValue(mockPrizes);
      mockLuckyWheelHistoryFindMany.mockResolvedValue(mockRecentWinners);
    });

    it("caches prizes under meta:lucky-wheel:prizes (TTL 300s) and recent winners under meta:lucky-wheel:recent-winners (TTL 60s)", async () => {
      const res = await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.prizes).toHaveLength(2);
      expect(json.recentWinners).toHaveLength(1);

      // Verify prizes cached with TTL ~300s (255s - 345s)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "meta:lucky-wheel:prizes",
        expect.any(Number),
        expect.any(String)
      );
      const prizeCalls = (mockRedis.setex as any).mock.calls.filter(
        (c: any[]) => c[0] === "meta:lucky-wheel:prizes"
      );
      expect(prizeCalls).toHaveLength(1);
      const prizeTTL = prizeCalls[0][1];
      expect(prizeTTL).toBeGreaterThanOrEqual(255);
      expect(prizeTTL).toBeLessThanOrEqual(345);

      // Verify recent winners cached with TTL ~60s (51s - 69s)
      const winnerCalls = (mockRedis.setex as any).mock.calls.filter(
        (c: any[]) => c[0] === "meta:lucky-wheel:recent-winners"
      );
      expect(winnerCalls).toHaveLength(1);
      const winnerTTL = winnerCalls[0][1];
      expect(winnerTTL).toBeGreaterThanOrEqual(51);
      expect(winnerTTL).toBeLessThanOrEqual(69);

      expect(memoryStore.has("meta:lucky-wheel:prizes")).toBe(true);
      expect(memoryStore.has("meta:lucky-wheel:recent-winners")).toBe(true);
    });

    it("serves repeated GET /api/lucky-wheel from cache without re-querying Prisma", async () => {
      // Call 1: Miss
      await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(mockLuckyWheelPrizeFindMany).toHaveBeenCalledTimes(1);
      expect(mockLuckyWheelHistoryFindMany).toHaveBeenCalledTimes(1);

      // Call 2: Hit
      const res2 = await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.prizes).toHaveLength(2);
      expect(json2.recentWinners).toHaveLength(1);

      // Verify Prisma was not invoked again for prizes or recent winners
      expect(mockLuckyWheelPrizeFindMany).toHaveBeenCalledTimes(1);
      expect(mockLuckyWheelHistoryFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates meta:lucky-wheel:* when a user spins the wheel (POST /api/lucky-wheel/spin)", async () => {
      // Seed cache
      await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has("meta:lucky-wheel:prizes")).toBe(true);
      expect(memoryStore.has("meta:lucky-wheel:recent-winners")).toBe(true);

      // Setup spin mocks
      mockLuckyWheelPrizeUpdateMany.mockResolvedValue({ count: 1 });
      mockLuckyWheelHistoryCreate.mockResolvedValue({ id: "hist-new" });

      const spinRes = await app.request("/api/lucky-wheel/spin", {
        method: "POST",
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(spinRes.status).toBe(200);
      const spinJson = await spinRes.json();
      expect(spinJson.success).toBe(true);

      // Both prize and winner caches must be evicted by meta:lucky-wheel:* invalidation
      expect(memoryStore.has("meta:lucky-wheel:prizes")).toBe(false);
      expect(memoryStore.has("meta:lucky-wheel:recent-winners")).toBe(false);

      // Subsequent GET should re-fetch from DB
      await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      // Called once during setup spin, once in initial, once now -> total 3
      expect(mockLuckyWheelPrizeFindMany.mock.calls.length).toBeGreaterThan(1);
    });

    it("invalidates meta:lucky-wheel:* when admin creates a new prize via POST /api/admin/lucky-wheel/prizes", async () => {
      // Seed cache
      await app.request("/api/lucky-wheel", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has("meta:lucky-wheel:prizes")).toBe(true);

      mockLuckyWheelPrizeCreate.mockResolvedValue({
        id: "prize-3",
        name: "Áo thun Limart",
        value: 100000,
        type: "PHYSICAL",
        quantity: 20,
        remaining: 20,
        probability: 10,
        active: true,
      });

      const res = await app.request("/api/admin/lucky-wheel/prizes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Áo thun Limart",
          value: 100000,
          type: "PHYSICAL",
          quantity: 20,
          probability: 10,
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("meta:lucky-wheel:prizes")).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Documents Meta Caching & Mutation Invalidation
  // ==========================================================================
  describe("3. Documents Meta Caching & Invalidation Suite", () => {
    const mockDocs = [
      {
        id: "doc-1",
        title: "Quy chuẩn check-in cửa hàng",
        path: "rules/checkin.md",
        content: "Nội dung quy chuẩn checkin...",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "doc-2",
        title: "Hướng dẫn sử dụng máy POS",
        path: "pos/guide.md",
        content: "Nội dung hướng dẫn POS...",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it("caches all documents under meta:documents:all with TTL 600s (± jitter)", async () => {
      mockDocumentFindMany.mockResolvedValue(mockDocs);

      const res = await app.request("/api/documents");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(2);

      expect(mockDocumentFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "meta:documents:all",
        expect.any(Number),
        expect.any(String)
      );

      // Verify TTL is within 600s ± 15% (510s - 690s)
      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(510);
      expect(ttl).toBeLessThanOrEqual(690);

      expect(memoryStore.has("meta:documents:all")).toBe(true);
    });

    it("serves repeated GET /api/documents directly from Valkey cache", async () => {
      mockDocumentFindMany.mockResolvedValue(mockDocs);

      // Call 1: Miss -> DB
      await app.request("/api/documents");
      expect(mockDocumentFindMany).toHaveBeenCalledTimes(1);

      // Call 2: Hit -> From cache
      const res2 = await app.request("/api/documents");
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.count).toBe(2);
      expect(json2.data[0].title).toBe("Quy chuẩn check-in cửa hàng");

      // Verify Prisma was not invoked again
      expect(mockDocumentFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates meta:documents:* when admin uploads/creates a document (POST /api/documents)", async () => {
      mockDocumentFindMany.mockResolvedValue(mockDocs);

      // Seed cache
      await app.request("/api/documents");
      expect(memoryStore.has("meta:documents:all")).toBe(true);

      // Admin uploads new document
      mockDocumentUpsert.mockResolvedValue({
        id: "doc-new",
        title: "Quy trình vệ sinh",
        path: "rules/hygiene.md",
        content: "Nội dung quy trình vệ sinh...",
      });
      mockDocumentChunkDeleteMany.mockResolvedValue({ count: 0 });

      const postRes = await app.request("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "Quy trình vệ sinh",
          content: "Nội dung quy trình vệ sinh...",
          path: "rules/hygiene.md",
        }),
      });

      expect(postRes.status).toBe(200);

      // Cache must be cleared
      expect(memoryStore.has("meta:documents:all")).toBe(false);

      // Next GET /api/documents must re-query DB
      await app.request("/api/documents");
      expect(mockDocumentFindMany).toHaveBeenCalledTimes(2);
    });

    it("invalidates meta:documents:* when admin deletes a document (DELETE /api/documents/:id)", async () => {
      mockDocumentFindMany.mockResolvedValue(mockDocs);

      // Seed cache
      await app.request("/api/documents");
      expect(memoryStore.has("meta:documents:all")).toBe(true);

      mockDocumentFindUnique.mockResolvedValue({
        id: "doc-1",
        title: "Quy chuẩn check-in cửa hàng",
      });
      mockDocumentChunkDeleteMany.mockResolvedValue({ count: 2 });
      mockDocumentDelete.mockResolvedValue({ id: "doc-1" });

      const delRes = await app.request("/api/documents/doc-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(delRes.status).toBe(200);

      // Cache must be cleared
      expect(memoryStore.has("meta:documents:all")).toBe(false);

      // Next GET /api/documents must re-query DB
      await app.request("/api/documents");
      expect(mockDocumentFindMany).toHaveBeenCalledTimes(2);
    });
  });
});
