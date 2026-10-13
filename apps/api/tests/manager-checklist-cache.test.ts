import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockChecklistCount,
  mockChecklistFindMany,
  mockChecklistFindUnique,
  mockChecklistCreate,
  mockChecklistUpdate,
  mockChecklistDelete,
  mockCompletionFindMany,
  mockCompletionUpsert,
  mockTransaction,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockChecklistCount: vi.fn(),
  mockChecklistFindMany: vi.fn(),
  mockChecklistFindUnique: vi.fn(),
  mockChecklistCreate: vi.fn(),
  mockChecklistUpdate: vi.fn(),
  mockChecklistDelete: vi.fn(),
  mockCompletionFindMany: vi.fn(),
  mockCompletionUpsert: vi.fn(),
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
      count: mockChecklistCount,
      findMany: mockChecklistFindMany,
      findUnique: mockChecklistFindUnique,
      create: mockChecklistCreate,
      update: mockChecklistUpdate,
      delete: mockChecklistDelete,
    },
    managerChecklistCompletion: {
      findMany: mockCompletionFindMany,
      upsert: mockCompletionUpsert,
    },
    $transaction: mockTransaction,
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Manager Checklist & Templates Valkey Caching Suite", () => {
  let adminToken: string;
  let user1Token: string;
  let user2Token: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockAdmin = {
    id: "admin-mgr-1",
    email: "admin@limart.vn",
    role: "ADMIN",
    isActive: true,
  };

  const mockUser1 = {
    id: "mgr-user-1",
    email: "user1@limart.vn",
    role: "USER",
    isActive: true,
  };

  const mockUser2 = {
    id: "mgr-user-2",
    email: "user2@limart.vn",
    role: "USER",
    isActive: true,
  };

  const sampleTemplates = [
    {
      id: "task-tpl-1",
      title: "🧹 Kiểm tra vệ sinh phía trước và trong shop",
      description: "Quét dọn trước sân và lau dọn quầy kệ",
      assigneeId: "mgr-user-1",
      active: true,
      targetDate: null,
      order: 0,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
    {
      id: "task-tpl-2",
      title: "📧 Kiểm tra đơn hàng vào mỗi 9h30 và 12h30",
      description: "Rà soát đơn hàng mới",
      assigneeId: "mgr-user-1",
      active: true,
      targetDate: null,
      order: 1,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
  ];

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

    user1Token = await signAccessToken({
      sub: mockUser1.id,
      email: mockUser1.email,
      role: mockUser1.role,
    });

    user2Token = await signAccessToken({
      sub: mockUser2.id,
      email: mockUser2.email,
      role: mockUser2.role,
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === mockAdmin.id || where.email === mockAdmin.email) return mockAdmin;
      if (where.id === mockUser1.id || where.email === mockUser1.email) return mockUser1;
      if (where.id === mockUser2.id || where.email === mockUser2.email) return mockUser2;
      return null;
    });

    mockChecklistCount.mockResolvedValue(2);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/manager-tasks/templates Valkey Caching
  // ==========================================================================
  describe("1. GET /api/manager-tasks/templates Caching", () => {
    it("caches checklist templates under manager-tasks:templates:<userId> for 600s TTL on cache miss", async () => {
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);

      const res = await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex was called with manager-tasks:templates:mgr-user-1 and ~600s TTL (±15% jitter: 510 - 690)
      const expectedKey = "manager-tasks:templates:" + mockUser1.id;
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );

      const setexTTL = mockRedis.setex.mock.calls[0][1];
      expect(setexTTL).toBeGreaterThanOrEqual(510);
      expect(setexTTL).toBeLessThanOrEqual(690);
      expect(memoryStore.has(expectedKey)).toBe(true);
    });

    it("serves repeated GET /api/manager-tasks/templates directly from Valkey without touching DB (Cache Hit)", async () => {
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);

      // First call: Cache Miss -> fetches from DB and populates cache
      const res1 = await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(res1.status).toBe(200);
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(1);

      // Second call: Cache Hit -> served from Valkey
      const res2 = await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(2);
      expect(json2.data[0].id).toBe("task-tpl-1");

      // Verify mockChecklistFindMany was NOT called again (still 1)
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith("manager-tasks:templates:" + mockUser1.id);
    });

    it("isolates templates cache between different users", async () => {
      const user2Templates = [
        {
          id: "task-tpl-user2",
          title: "🎯 Duyệt KPI và WFH",
          description: "Phê duyệt các yêu cầu",
          assigneeId: "mgr-user-2",
          active: true,
          targetDate: null,
          order: 0,
          createdAt: new Date(),
        },
      ];

      mockChecklistFindMany
        .mockResolvedValueOnce(sampleTemplates)
        .mockResolvedValueOnce(user2Templates);

      // User 1 requests templates
      await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      // User 2 requests templates
      await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user2Token}` },
      });

      expect(mockRedis.get).toHaveBeenCalledWith("manager-tasks:templates:" + mockUser1.id);
      expect(mockRedis.get).toHaveBeenCalledWith("manager-tasks:templates:" + mockUser2.id);
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(2);
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(true);
      expect(memoryStore.has("manager-tasks:templates:" + mockUser2.id)).toBe(true);
    });

    it("allows ADMIN to query templates for specific targetUserId and caches under targetUserId", async () => {
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);

      const res = await app.request("/api/manager-tasks/templates?userId=" + mockUser1.id, {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith("manager-tasks:templates:" + mockUser1.id);
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(true);
    });

    it("blocks non-admin from querying another user's templates (403)", async () => {
      const res = await app.request("/api/manager-tasks/templates?userId=" + mockUser2.id, {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      expect(res.status).toBe(403);
      expect(mockChecklistFindMany).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. GET /api/manager-tasks/checklist Valkey Caching
  // ==========================================================================
  describe("2. GET /api/manager-tasks/checklist Caching", () => {
    const testDate = "2026-10-13";
    const sampleCompletions = [
      {
        id: "comp-1",
        taskId: "task-tpl-1",
        date: testDate,
        completed: true,
        completedAt: new Date("2026-10-13T10:00:00Z"),
      },
    ];

    it("caches daily checklist under manager-tasks:checklist:<userId>:<date> for 60s TTL on cache miss", async () => {
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      mockCompletionFindMany.mockResolvedValueOnce(sampleCompletions);

      const res = await app.request(`/api/manager-tasks/checklist?date=${testDate}`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].completed).toBe(true);
      expect(json.data[1].completed).toBe(false);

      const expectedKey = `manager-tasks:checklist:${mockUser1.id}:${testDate}`;
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        expect.any(String)
      );

      // Verify TTL is around 60s (±15% jitter: 51 - 69)
      const setexTTL = mockRedis.setex.mock.calls[0][1];
      expect(setexTTL).toBeGreaterThanOrEqual(51);
      expect(setexTTL).toBeLessThanOrEqual(69);
      expect(memoryStore.has(expectedKey)).toBe(true);
    });

    it("serves repeated GET /api/manager-tasks/checklist from cache without touching DB (Cache Hit)", async () => {
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      mockCompletionFindMany.mockResolvedValueOnce(sampleCompletions);

      // First call: Miss
      const res1 = await app.request(`/api/manager-tasks/checklist?date=${testDate}`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(res1.status).toBe(200);
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(1);
      expect(mockCompletionFindMany).toHaveBeenCalledTimes(1);

      // Second call: Hit
      const res2 = await app.request(`/api/manager-tasks/checklist?date=${testDate}`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(2);
      expect(json2.data[0].completed).toBe(true);
      expect(json2.data[1].completed).toBe(false);

      // Ensure DB queries were not called again
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(1);
      expect(mockCompletionFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith(`manager-tasks:checklist:${mockUser1.id}:${testDate}`);
    });

    it("caches separate checklist responses for different dates", async () => {
      const date2 = "2026-10-14";
      mockChecklistFindMany
        .mockResolvedValueOnce(sampleTemplates)
        .mockResolvedValueOnce(sampleTemplates);
      mockCompletionFindMany
        .mockResolvedValueOnce(sampleCompletions)
        .mockResolvedValueOnce([]);

      await app.request(`/api/manager-tasks/checklist?date=${testDate}`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      await app.request(`/api/manager-tasks/checklist?date=${date2}`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:${testDate}`)).toBe(true);
      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:${date2}`)).toBe(true);
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // 3. Cache Invalidation on Checklist Item Toggle
  // ==========================================================================
  describe("3. Invalidation on Checklist Item Toggle", () => {
    const testDate = "2026-10-13";

    it("invalidates manager-tasks:checklist:<userId>:* when toggled via POST /checklist/toggle", async () => {
      // 1. Prime checklist cache for user 1 on two dates
      mockChecklistFindMany
        .mockResolvedValueOnce(sampleTemplates)
        .mockResolvedValueOnce(sampleTemplates);
      mockCompletionFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await app.request(`/api/manager-tasks/checklist?date=${testDate}`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      await app.request(`/api/manager-tasks/checklist?date=2026-10-14`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:${testDate}`)).toBe(true);
      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:2026-10-14`)).toBe(true);

      // 2. Toggle checklist task
      mockChecklistFindUnique.mockResolvedValueOnce({
        id: "task-tpl-1",
        assigneeId: mockUser1.id,
      });
      mockCompletionUpsert.mockResolvedValueOnce({
        id: "comp-1",
        taskId: "task-tpl-1",
        date: testDate,
        completed: true,
        completedAt: new Date(),
      });

      const toggleRes = await app.request("/api/manager-tasks/checklist/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${user1Token}`,
        },
        body: JSON.stringify({
          taskId: "task-tpl-1",
          date: testDate,
          completed: true,
        }),
      });

      expect(toggleRes.status).toBe(200);

      // Checklist cache keys for user 1 must be invalidated!
      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:${testDate}`)).toBe(false);
      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:2026-10-14`)).toBe(false);

      // 3. Next GET request must miss cache and query DB
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      mockCompletionFindMany.mockResolvedValueOnce([
        {
          id: "comp-1",
          taskId: "task-tpl-1",
          date: testDate,
          completed: true,
          completedAt: new Date(),
        },
      ]);

      const resAfter = await app.request(`/api/manager-tasks/checklist?date=${testDate}`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      expect(resAfter.status).toBe(200);
      const jsonAfter = await resAfter.json();
      expect(jsonAfter.data[0].completed).toBe(true);
      expect(mockChecklistFindMany).toHaveBeenCalledTimes(3); // 1 + 1 + 1
    });

    it("invalidates manager-tasks:checklist:<userId>:* when toggled via POST /checklist/:taskId/toggle", async () => {
      // 1. Prime cache
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      mockCompletionFindMany.mockResolvedValueOnce([]);

      await app.request(`/api/manager-tasks/checklist?date=${testDate}`, {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:${testDate}`)).toBe(true);

      // 2. Toggle via :taskId param route
      mockChecklistFindUnique.mockResolvedValueOnce({
        id: "task-tpl-1",
        assigneeId: mockUser1.id,
      });
      mockCompletionUpsert.mockResolvedValueOnce({
        id: "comp-1",
        taskId: "task-tpl-1",
        date: testDate,
        completed: true,
        completedAt: new Date(),
      });

      const toggleRes = await app.request("/api/manager-tasks/checklist/task-tpl-1/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${user1Token}`,
        },
        body: JSON.stringify({
          date: testDate,
          completed: true,
        }),
      });

      expect(toggleRes.status).toBe(200);
      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:${testDate}`)).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Cache Invalidation on Template Create / Update / Delete / Reorder
  // ==========================================================================
  describe("4. Invalidation on Template Create / Update / Delete / Reorder", () => {
    it("invalidates manager-tasks:templates:* and manager-tasks:checklist:* on POST /api/manager-tasks/templates", async () => {
      // 1. Prime templates cache and checklist cache
      mockChecklistFindMany
        .mockResolvedValueOnce(sampleTemplates)
        .mockResolvedValueOnce(sampleTemplates);
      mockCompletionFindMany.mockResolvedValueOnce([]);

      await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      await app.request("/api/manager-tasks/checklist?date=2026-10-13", {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(true);
      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:2026-10-13`)).toBe(true);

      // 2. Admin creates new template via POST /api/manager-tasks/templates
      const createdTask = {
        id: "task-tpl-new",
        title: "📦 Kiểm tra hàng tồn",
        description: "Kiểm tra kho",
        assigneeId: mockUser1.id,
        targetDate: null,
        active: true,
        createdAt: new Date(),
      };
      mockChecklistCreate.mockResolvedValueOnce(createdTask);

      const createRes = await app.request("/api/manager-tasks/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "📦 Kiểm tra hàng tồn",
          description: "Kiểm tra kho",
          assigneeId: mockUser1.id,
        }),
      });

      expect(createRes.status).toBe(200);

      // Both templates and checklist cache must be invalidated
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(false);
      expect(memoryStore.has(`manager-tasks:checklist:${mockUser1.id}:2026-10-13`)).toBe(false);

      // 3. Next GET /api/manager-tasks/templates must query DB
      mockChecklistFindMany.mockResolvedValueOnce([...sampleTemplates, createdTask]);
      const resAfter = await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });

      expect(resAfter.status).toBe(200);
      const jsonAfter = await resAfter.json();
      expect(jsonAfter.data).toHaveLength(3);
    });

    it("invalidates manager-tasks:templates:* and manager-tasks:checklist:* on POST /api/manager-tasks/checklist (create template)", async () => {
      // Prime cache
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(true);

      // Create via /checklist endpoint
      mockChecklistCreate.mockResolvedValueOnce({
        id: "task-tpl-from-checklist",
        title: "Test task",
        assigneeId: mockUser1.id,
      });

      const res = await app.request("/api/manager-tasks/checklist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "Test task",
          assigneeId: mockUser1.id,
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(false);
    });

    it("invalidates manager-tasks:templates:* and manager-tasks:checklist:* on PUT /api/manager-tasks/templates/:id", async () => {
      // Prime cache
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(true);

      // Update via PUT /templates/:id
      mockChecklistFindUnique.mockResolvedValueOnce({ id: "task-tpl-1" });
      mockChecklistUpdate.mockResolvedValueOnce({
        id: "task-tpl-1",
        title: "Updated Title",
      });

      const res = await app.request("/api/manager-tasks/templates/task-tpl-1", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          title: "Updated Title",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(false);
    });

    it("invalidates manager-tasks:templates:* and manager-tasks:checklist:* on PATCH /api/manager-tasks/checklist/:id", async () => {
      // Prime cache
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(true);

      // Update via PATCH /checklist/:id
      mockChecklistFindUnique.mockResolvedValueOnce({ id: "task-tpl-1" });
      mockChecklistUpdate.mockResolvedValueOnce({
        id: "task-tpl-1",
        active: false,
      });

      const res = await app.request("/api/manager-tasks/checklist/task-tpl-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          active: false,
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(false);
    });

    it("invalidates manager-tasks:templates:* and manager-tasks:checklist:* on DELETE /api/manager-tasks/templates/:id", async () => {
      // Prime cache
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(true);

      // Delete via DELETE /templates/:id
      mockChecklistFindUnique.mockResolvedValueOnce({ id: "task-tpl-1" });
      mockChecklistDelete.mockResolvedValueOnce({ id: "task-tpl-1" });

      const res = await app.request("/api/manager-tasks/templates/task-tpl-1", {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(false);
    });

    it("invalidates manager-tasks:templates:* and manager-tasks:checklist:* on POST /api/manager-tasks/checklist/reorder", async () => {
      // Prime cache
      mockChecklistFindMany.mockResolvedValueOnce(sampleTemplates);
      await app.request("/api/manager-tasks/templates", {
        headers: { Cookie: `access_token=${user1Token}` },
      });
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(true);

      // Reorder tasks
      mockChecklistUpdate.mockResolvedValue({ id: "any" });

      const res = await app.request("/api/manager-tasks/checklist/reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          taskIds: ["task-tpl-2", "task-tpl-1"],
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("manager-tasks:templates:" + mockUser1.id)).toBe(false);
    });
  });
});
