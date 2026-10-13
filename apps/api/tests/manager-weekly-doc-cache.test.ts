import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockUserFindUnique,
  mockChecklistFindMany,
  mockCompletionFindMany,
  mockWeeklyFindMany,
  mockWeeklyFindUnique,
  mockWeeklyCreate,
  mockWeeklyUpdate,
  mockWeeklyDelete,
  mockRequestCreate,
  mockDocumentFindUnique,
  mockDocumentUpsert,
  mockDocumentUpdate,
  mockDocumentDelete,
  mockDocumentChunkDeleteMany,
  mockCalculateUserMonthlyStats,
  mockTransaction,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockChecklistFindMany: vi.fn(),
  mockCompletionFindMany: vi.fn(),
  mockWeeklyFindMany: vi.fn(),
  mockWeeklyFindUnique: vi.fn(),
  mockWeeklyCreate: vi.fn(),
  mockWeeklyUpdate: vi.fn(),
  mockWeeklyDelete: vi.fn(),
  mockRequestCreate: vi.fn(),
  mockDocumentFindUnique: vi.fn(),
  mockDocumentUpsert: vi.fn(),
  mockDocumentUpdate: vi.fn(),
  mockDocumentDelete: vi.fn(),
  mockDocumentChunkDeleteMany: vi.fn(),
  mockCalculateUserMonthlyStats: vi.fn(),
  mockTransaction: vi.fn((actions) =>
    Array.isArray(actions) ? Promise.all(actions) : actions(prisma)
  ),
  mockQueryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
    managerChecklistTask: {
      findMany: mockChecklistFindMany,
    },
    managerChecklistCompletion: {
      findMany: mockCompletionFindMany,
    },
    managerWeeklyTask: {
      findMany: mockWeeklyFindMany,
      findUnique: mockWeeklyFindUnique,
      create: mockWeeklyCreate,
      update: mockWeeklyUpdate,
      delete: mockWeeklyDelete,
    },
    request: {
      create: mockRequestCreate,
    },
    document: {
      findUnique: mockDocumentFindUnique,
      upsert: mockDocumentUpsert,
      update: mockDocumentUpdate,
      delete: mockDocumentDelete,
    },
    documentChunk: {
      deleteMany: mockDocumentChunkDeleteMany,
    },
    $transaction: mockTransaction,
    $queryRaw: mockQueryRaw,
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("../src/lib/payroll-calculator", () => ({
  calculateUserMonthlyStats: mockCalculateUserMonthlyStats,
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Manager Weekly, Stats History & Documents Valkey Caching Suite", () => {
  let adminToken: string;
  let userToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockAdmin = {
    id: "admin-mgr-cache",
    email: "admin-cache@limart.vn",
    role: "ADMIN",
    isActive: true,
  };

  const mockUser = {
    id: "user-mgr-cache",
    email: "user-cache@limart.vn",
    role: "USER",
    isActive: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
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

    adminToken = await signAccessToken({
      sub: mockAdmin.id,
      email: mockAdmin.email,
      role: mockAdmin.role,
    });

    userToken = await signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === mockAdmin.id || where.email === mockAdmin.email) return mockAdmin;
      if (where.id === mockUser.id || where.email === mockUser.email) return mockUser;
      return null;
    });
  });

  // ==========================================================================
  // 1. GET /api/manager-tasks/stats-history Caching
  // ==========================================================================
  describe("1. GET /api/manager-tasks/stats-history Valkey Caching", () => {
    const sampleMonthlyStats = {
      userId: mockUser.id,
      totalHours: 40,
      daysWorked: 5,
      lateCount: 0,
      dailyDetails: [
        {
          date: "2026-10-05",
          hours: 8,
          shift: "08:00 - 17:00",
          error: undefined,
        },
      ],
    };

    it("caches stats-history under manager-tasks:stats-history:<userId>:<YYYY-MM> with 60s TTL (± jitter)", async () => {
      mockCalculateUserMonthlyStats.mockResolvedValue(sampleMonthlyStats);
      mockChecklistFindMany.mockResolvedValue([]);
      mockCompletionFindMany.mockResolvedValue([]);

      const res = await app.request(
        `/api/manager-tasks/stats-history?userId=${mockUser.id}&date=2026-10-06`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalHours).toBe(40);

      const expectedCacheKey = `manager-tasks:stats-history:${mockUser.id}:2026-10`;
      expect(memoryStore.has(expectedCacheKey)).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedCacheKey,
        expect.any(Number),
        expect.any(String)
      );

      // Verify jitter: 60s ± 15% (51s - 69s)
      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(51);
      expect(ttl).toBeLessThanOrEqual(69);
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);
    });

    it("serves repeated GET /api/manager-tasks/stats-history directly from cache", async () => {
      mockCalculateUserMonthlyStats.mockResolvedValue(sampleMonthlyStats);
      mockChecklistFindMany.mockResolvedValue([]);
      mockCompletionFindMany.mockResolvedValue([]);

      // 1st request: Miss
      const res1 = await app.request(
        `/api/manager-tasks/stats-history?userId=${mockUser.id}&date=2026-10-06`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );
      expect(res1.status).toBe(200);
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(1);

      // 2nd request: Cache Hit
      const res2 = await app.request(
        `/api/manager-tasks/stats-history?userId=${mockUser.id}&date=2026-10-06`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.totalHours).toBe(40);

      // No second DB query executed
      expect(mockCalculateUserMonthlyStats).toHaveBeenCalledTimes(1);
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(1);
    });

    it("returns 404 when user stats calculation returns null and does not cache", async () => {
      mockCalculateUserMonthlyStats.mockResolvedValue(null);

      const res = await app.request(
        `/api/manager-tasks/stats-history?userId=${mockUser.id}&date=2026-10-06`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );

      expect(res.status).toBe(404);
      const expectedCacheKey = `manager-tasks:stats-history:${mockUser.id}:2026-10`;
      expect(memoryStore.has(expectedCacheKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. GET /api/manager-tasks/weekly Caching
  // ==========================================================================
  describe("2. GET /api/manager-tasks/weekly Valkey Caching", () => {
    const sampleWeeklyTasks = [
      {
        id: "w-task-1",
        title: "Kiểm kho định kỳ tuần 41",
        description: "Kiểm đếm toàn bộ hàng tồn kho",
        assigneeId: mockUser.id,
        completed: false,
        weekStart: new Date("2026-10-05T00:00:00+07:00"),
        weekEnd: new Date("2026-10-11T23:59:59+07:00"),
        createdAt: new Date("2026-10-05T08:00:00Z"),
      },
    ];

    it("caches weekly tasks with 60s TTL (± jitter) under manager-tasks:weekly:<userId>:<weekStart>", async () => {
      mockWeeklyFindMany.mockResolvedValue(sampleWeeklyTasks);

      const res = await app.request(
        `/api/manager-tasks/weekly?userId=${mockUser.id}&date=2026-10-06`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].title).toBe("Kiểm kho định kỳ tuần 41");

      const expectedCacheKey = `manager-tasks:weekly:${mockUser.id}:2026-10-04`; // or ISO date slice
      const matchingKey = Array.from(memoryStore.keys()).find((k) =>
        k.startsWith(`manager-tasks:weekly:${mockUser.id}:`)
      );
      expect(matchingKey).toBeDefined();

      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(51);
      expect(ttl).toBeLessThanOrEqual(69);
      expect(mockWeeklyFindMany).toHaveBeenCalledTimes(1);
    });

    it("serves repeated GET /api/manager-tasks/weekly directly from cache without re-querying Prisma", async () => {
      mockWeeklyFindMany.mockResolvedValue(sampleWeeklyTasks);

      // Call 1: Miss
      await app.request(
        `/api/manager-tasks/weekly?userId=${mockUser.id}&date=2026-10-06`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );
      expect(mockWeeklyFindMany).toHaveBeenCalledTimes(1);

      // Call 2: Hit
      const res2 = await app.request(
        `/api/manager-tasks/weekly?userId=${mockUser.id}&date=2026-10-06`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);

      // Prisma must NOT be called again
      expect(mockWeeklyFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. Weekly Task Mutations & Cache Invalidation
  // ==========================================================================
  describe("3. Weekly Task Mutations & Invalidation of manager-tasks:weekly:* and stats-history:*", () => {
    beforeEach(() => {
      // Seed keys into memoryStore
      memoryStore.set(`manager-tasks:weekly:${mockUser.id}:2026-10-04`, JSON.stringify([]));
      memoryStore.set(`manager-tasks:stats-history:${mockUser.id}:2026-10`, JSON.stringify({}));
      memoryStore.set("stats:monthly:all", JSON.stringify({}));
      memoryStore.set("payroll:all", JSON.stringify({}));
    });

    it("POST /api/manager-tasks/weekly invalidates manager-tasks:weekly:* and stats-history:*", async () => {
      mockWeeklyCreate.mockResolvedValue({
        id: "w-new-1",
        title: "Nhiệm vụ mới",
        assigneeId: mockUser.id,
      });

      const res = await app.request("/api/manager-tasks/weekly", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Nhiệm vụ mới",
          assigneeId: mockUser.id,
          dateStr: "2026-10-06",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(`manager-tasks:weekly:${mockUser.id}:2026-10-04`)).toBe(false);
      expect(memoryStore.has(`manager-tasks:stats-history:${mockUser.id}:2026-10`)).toBe(false);
    });

    it("PATCH /api/manager-tasks/weekly/:id invalidates manager-tasks:weekly:* and stats-history:*", async () => {
      mockWeeklyFindUnique.mockResolvedValue({ id: "w-task-1" });
      mockWeeklyUpdate.mockResolvedValue({ id: "w-task-1", title: "Cập nhật tiêu đề" });

      const res = await app.request("/api/manager-tasks/weekly/w-task-1", {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Cập nhật tiêu đề" }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(`manager-tasks:weekly:${mockUser.id}:2026-10-04`)).toBe(false);
      expect(memoryStore.has(`manager-tasks:stats-history:${mockUser.id}:2026-10`)).toBe(false);
    });

    it("DELETE /api/manager-tasks/weekly/:id invalidates manager-tasks:weekly:* and stats-history:*", async () => {
      mockWeeklyFindUnique.mockResolvedValue({ id: "w-task-1" });
      mockWeeklyDelete.mockResolvedValue({ id: "w-task-1" });

      const res = await app.request("/api/manager-tasks/weekly/w-task-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(`manager-tasks:weekly:${mockUser.id}:2026-10-04`)).toBe(false);
      expect(memoryStore.has(`manager-tasks:stats-history:${mockUser.id}:2026-10`)).toBe(false);
    });

    it("POST /api/manager-tasks/weekly/:id/toggle invalidates manager-tasks:weekly:* and stats-history:*", async () => {
      mockWeeklyFindUnique.mockResolvedValue({ id: "w-task-1" });
      mockWeeklyUpdate.mockResolvedValue({ id: "w-task-1", completed: true });

      const res = await app.request("/api/manager-tasks/weekly/w-task-1/toggle", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ completed: true }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(`manager-tasks:weekly:${mockUser.id}:2026-10-04`)).toBe(false);
      expect(memoryStore.has(`manager-tasks:stats-history:${mockUser.id}:2026-10`)).toBe(false);
    });

    it("POST /api/manager-tasks/weekly/:id/carry-over invalidates manager-tasks:weekly:* and stats-history:*", async () => {
      mockWeeklyFindUnique.mockResolvedValue({
        id: "w-task-1",
        title: "Việc tồn đọng",
        assigneeId: mockUser.id,
        weekStart: new Date("2026-10-05T00:00:00Z"),
        weekEnd: new Date("2026-10-11T23:59:59Z"),
      });
      mockWeeklyUpdate.mockResolvedValue({ id: "w-task-1", explanation: "Lý do hợp lý" });
      mockWeeklyCreate.mockResolvedValue({ id: "w-task-carried", title: "Việc tồn đọng" });
      mockRequestCreate.mockResolvedValue({ id: "req-1" });

      const res = await app.request("/api/manager-tasks/weekly/w-task-1/carry-over", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ explanation: "Lý do hợp lý" }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has(`manager-tasks:weekly:${mockUser.id}:2026-10-04`)).toBe(false);
      expect(memoryStore.has(`manager-tasks:stats-history:${mockUser.id}:2026-10`)).toBe(false);
    });
  });

  // ==========================================================================
  // 4. GET /api/documents/:id Caching
  // ==========================================================================
  describe("4. GET /api/documents/:id Valkey Caching", () => {
    const sampleDoc = {
      id: "doc-sample-123",
      title: "Chính sách thưởng doanh số Q4",
      path: "policies/q4-rewards.md",
      content: "Nội dung quy định thưởng...",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    };

    it("caches document details under meta:documents:<id> with 1800s TTL (± jitter)", async () => {
      mockDocumentFindUnique.mockResolvedValue(sampleDoc);

      const res = await app.request(`/api/documents/${sampleDoc.id}`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(sampleDoc.id);
      expect(json.data.title).toBe(sampleDoc.title);

      const expectedKey = `meta:documents:${sampleDoc.id}`;
      expect(memoryStore.has(expectedKey)).toBe(true);

      const ttl = (mockRedis.setex as any).mock.calls[0][1];
      // 1800s ± 15% (1530s - 2070s)
      expect(ttl).toBeGreaterThanOrEqual(1530);
      expect(ttl).toBeLessThanOrEqual(2070);
      expect(mockDocumentFindUnique).toHaveBeenCalledTimes(1);
    });

    it("serves repeated GET /api/documents/:id directly from cache without querying Prisma", async () => {
      mockDocumentFindUnique.mockResolvedValue(sampleDoc);

      // Call 1: Miss -> DB
      await app.request(`/api/documents/${sampleDoc.id}`);
      expect(mockDocumentFindUnique).toHaveBeenCalledTimes(1);

      // Call 2: Hit -> From cache
      const res2 = await app.request(`/api/documents/${sampleDoc.id}`);
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.title).toBe(sampleDoc.title);

      // No second DB lookup
      expect(mockDocumentFindUnique).toHaveBeenCalledTimes(1);
    });

    it("returns 404 when document is not found and does not cache null", async () => {
      mockDocumentFindUnique.mockResolvedValue(null);

      const res = await app.request("/api/documents/non-existent-doc");
      expect(res.status).toBe(404);
      expect(memoryStore.has("meta:documents:non-existent-doc")).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Document Mutations & Cache Invalidation
  // ==========================================================================
  describe("5. Document Mutations & Invalidation of meta:documents:*", () => {
    beforeEach(() => {
      // Seed document caches
      memoryStore.set("meta:documents:all", JSON.stringify([]));
      memoryStore.set("meta:documents:doc-1", JSON.stringify({ id: "doc-1" }));
      memoryStore.set("meta:documents:doc-2", JSON.stringify({ id: "doc-2" }));
    });

    it("POST /api/documents (create/upsert) invalidates meta:documents:*", async () => {
      mockDocumentUpsert.mockResolvedValue({
        id: "doc-new",
        title: "Tài liệu mới",
        path: "rules/new.md",
        content: "Nội dung...",
      });
      mockDocumentChunkDeleteMany.mockResolvedValue({ count: 0 });

      const res = await app.request("/api/documents", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Tài liệu mới",
          content: "Nội dung...",
          path: "rules/new.md",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("meta:documents:all")).toBe(false);
      expect(memoryStore.has("meta:documents:doc-1")).toBe(false);
      expect(memoryStore.has("meta:documents:doc-2")).toBe(false);
    });

    it("PATCH /api/documents/:id (update) invalidates meta:documents:*", async () => {
      mockDocumentFindUnique.mockResolvedValue({
        id: "doc-1",
        title: "Tiêu đề cũ",
      });
      mockDocumentUpdate.mockResolvedValue({
        id: "doc-1",
        title: "Tiêu đề mới",
      });

      const res = await app.request("/api/documents/doc-1", {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Tiêu đề mới",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("meta:documents:all")).toBe(false);
      expect(memoryStore.has("meta:documents:doc-1")).toBe(false);
      expect(memoryStore.has("meta:documents:doc-2")).toBe(false);
    });

    it("PUT /api/documents/:id (update) invalidates meta:documents:*", async () => {
      mockDocumentFindUnique.mockResolvedValue({
        id: "doc-2",
        title: "Tiêu đề cũ",
      });
      mockDocumentUpdate.mockResolvedValue({
        id: "doc-2",
        title: "Tiêu đề thay thế",
      });

      const res = await app.request("/api/documents/doc-2", {
        method: "PUT",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Tiêu đề thay thế",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("meta:documents:all")).toBe(false);
      expect(memoryStore.has("meta:documents:doc-1")).toBe(false);
      expect(memoryStore.has("meta:documents:doc-2")).toBe(false);
    });

    it("DELETE /api/documents/:id (delete) invalidates meta:documents:*", async () => {
      mockDocumentFindUnique.mockResolvedValue({
        id: "doc-1",
        title: "Tài liệu cần xóa",
      });
      mockDocumentChunkDeleteMany.mockResolvedValue({ count: 2 });
      mockDocumentDelete.mockResolvedValue({ id: "doc-1" });

      const res = await app.request("/api/documents/doc-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("meta:documents:all")).toBe(false);
      expect(memoryStore.has("meta:documents:doc-1")).toBe(false);
      expect(memoryStore.has("meta:documents:doc-2")).toBe(false);
    });
  });
});
