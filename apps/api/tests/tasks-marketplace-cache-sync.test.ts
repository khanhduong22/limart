import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionFindUnique,
  mockTaskDefinitionCreate,
  mockTaskDefinitionUpdate,
  mockTaskDefinitionDelete,
  mockTaskItemFindMany,
  mockTaskItemFindUnique,
  mockTaskItemCreate,
  mockTaskItemUpdate,
  mockTaskItemUpdateMany,
  mockTaskItemDelete,
  mockUserTaskFindMany,
  mockUserTaskCreate,
  mockDocumentFindMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionFindUnique: vi.fn(),
  mockTaskDefinitionCreate: vi.fn(),
  mockTaskDefinitionUpdate: vi.fn(),
  mockTaskDefinitionDelete: vi.fn(),
  mockTaskItemFindMany: vi.fn(),
  mockTaskItemFindUnique: vi.fn(),
  mockTaskItemCreate: vi.fn(),
  mockTaskItemUpdate: vi.fn(),
  mockTaskItemUpdateMany: vi.fn(),
  mockTaskItemDelete: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskCreate: vi.fn(),
  mockDocumentFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      findUnique: mockTaskDefinitionFindUnique,
      create: mockTaskDefinitionCreate,
      update: mockTaskDefinitionUpdate,
      delete: mockTaskDefinitionDelete,
    },
    taskItem: {
      findMany: mockTaskItemFindMany,
      findUnique: mockTaskItemFindUnique,
      create: mockTaskItemCreate,
      update: mockTaskItemUpdate,
      updateMany: mockTaskItemUpdateMany,
      delete: mockTaskItemDelete,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      create: mockUserTaskCreate,
    },
    document: {
      findMany: mockDocumentFindMany,
    },
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, inFlightPromises } from "../src/lib/cache";

describe("Cross-Cutting Task Marketplace Cache Sync & Document RAG Fallback Cache Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const adminUserId = "admin-sync-uid";
  const staffUserId = "staff-sync-uid";

  const sampleDefinition = {
    id: "def-sync-1",
    name: "Đóng gói Hộp quà Tết",
    description: "Đóng gói hộp quà",
    baseReward: 5000,
    unit: "hộp",
    active: true,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };

  const sampleTaskItem = {
    id: "item-sync-1",
    taskDefId: "def-sync-1",
    title: "Đóng 100 hộp quà Tết",
    description: "Hoàn thành trước 17h",
    deadline: new Date("2026-12-31T00:00:00Z"),
    status: "OPEN",
    assigneeId: null,
    createdAt: new Date("2026-10-01T08:00:00Z"),
    updatedAt: new Date("2026-10-01T08:00:00Z"),
    taskDefinition: sampleDefinition,
    assignee: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    inFlightPromises.clear();
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
      sub: adminUserId,
      email: "admin@limart.vn",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: staffUserId,
      email: "staff@limart.vn",
      role: "USER",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === adminUserId) {
        return {
          id: adminUserId,
          email: "admin@limart.vn",
          role: "ADMIN",
          isActive: true,
        };
      }
      if (where.id === staffUserId) {
        return {
          id: staffUserId,
          email: "staff@limart.vn",
          role: "USER",
          isActive: true,
        };
      }
      return null;
    });
  });

  afterEach(() => {
    setRedisClient(null);
    inFlightPromises.clear();
  });

  // ==========================================================================
  // 1. Task Definition Mutations Cross-Domain Cache Invalidation
  // ==========================================================================
  describe("1. Task Definition Mutations Invalidate Cross-Domain Caches", () => {
    const seedDefinitionDependentCaches = () => {
      memoryStore.set("meta:task-definitions:all", JSON.stringify([sampleDefinition]));
      memoryStore.set("meta:task-definitions:available", JSON.stringify([sampleDefinition]));
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 10 }));
      memoryStore.set("admin:tasks:all", JSON.stringify([]));
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([]));
      memoryStore.set("tasks:market:open", JSON.stringify([sampleTaskItem]));
    };

    it("POST /api/admin/tasks/definitions invalidates staff:tasks:*, meta:task-definitions:*, admin:tasks:*, user:tasks:my:*, and task*", async () => {
      seedDefinitionDependentCaches();
      mockTaskDefinitionCreate.mockResolvedValue(sampleDefinition);

      const res = await app.request("/api/admin/tasks/definitions", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Đóng gói Hộp quà Tết",
          description: "Đóng gói hộp quà",
          baseReward: 5000,
          unit: "hộp",
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("meta:task-definitions:all")).toBe(false);
      expect(memoryStore.has("meta:task-definitions:available")).toBe(false);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
      expect(memoryStore.has("tasks:market:open")).toBe(false);

      expect(mockRedis.keys).toHaveBeenCalledWith("meta:task-definitions:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("staff:tasks:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("admin:tasks:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("user:tasks:my:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("task*");
    });

    it("PATCH /api/admin/tasks/definitions/:id invalidates staff:tasks:* and meta:task-definitions:*", async () => {
      seedDefinitionDependentCaches();
      mockTaskDefinitionFindUnique.mockResolvedValue(sampleDefinition);
      mockTaskDefinitionUpdate.mockResolvedValue({ ...sampleDefinition, baseReward: 6000 });

      const res = await app.request(`/api/admin/tasks/definitions/${sampleDefinition.id}`, {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ baseReward: 6000 }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("meta:task-definitions:all")).toBe(false);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
    });

    it("DELETE /api/admin/tasks/definitions/:id invalidates staff:tasks:* and meta:task-definitions:*", async () => {
      seedDefinitionDependentCaches();
      mockTaskDefinitionFindUnique.mockResolvedValue({
        ...sampleDefinition,
        _count: { tasks: 0, taskItems: 0 },
      });
      mockTaskDefinitionDelete.mockResolvedValue(sampleDefinition);

      const res = await app.request(`/api/admin/tasks/definitions/${sampleDefinition.id}`, {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("meta:task-definitions:all")).toBe(false);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Task Item (Marketplace) Mutations Cross-Domain Cache Invalidation
  // ==========================================================================
  describe("2. Task Item (Marketplace) Mutations Invalidate Cross-Domain Caches", () => {
    const seedTaskItemDependentCaches = () => {
      memoryStore.set("tasks:items:all", JSON.stringify([sampleTaskItem]));
      memoryStore.set("tasks:market:open", JSON.stringify([sampleTaskItem]));
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 10 }));
      memoryStore.set("admin:tasks:all", JSON.stringify([]));
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([]));
      memoryStore.set(`staff:home:${staffUserId}:2026-10-14`, JSON.stringify({}));
    };

    it("POST /api/admin/tasks/items invalidates tasks:items:*, staff:tasks:*, admin:tasks:*, user:tasks:my:*, staff:home:*, and task*", async () => {
      seedTaskItemDependentCaches();
      mockTaskItemCreate.mockResolvedValue(sampleTaskItem);

      const res = await app.request("/api/admin/tasks/items", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskDefId: sampleDefinition.id,
          title: "Đóng 100 hộp quà Tết",
          description: "Hoàn thành trước 17h",
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("tasks:items:all")).toBe(false);
      expect(memoryStore.has("tasks:market:open")).toBe(false);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:home:${staffUserId}:2026-10-14`)).toBe(false);

      expect(mockRedis.keys).toHaveBeenCalledWith("tasks:items:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("staff:tasks:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("admin:tasks:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("user:tasks:my:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("staff:home:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("task*");
    });

    it("PATCH /api/admin/tasks/items/:id, status, reset, close, and DELETE all invalidate cross-domain task caches", async () => {
      mockTaskItemFindUnique.mockResolvedValue(sampleTaskItem);
      mockTaskItemUpdate.mockResolvedValue({ ...sampleTaskItem, status: "IN_PROGRESS" });
      mockTaskItemDelete.mockResolvedValue(sampleTaskItem);

      const operations = [
        {
          method: "PATCH",
          url: `/api/admin/tasks/items/${sampleTaskItem.id}`,
          body: { title: "Updated Title" },
        },
        {
          method: "PATCH",
          url: `/api/admin/tasks/items/${sampleTaskItem.id}/status`,
          body: { status: "IN_PROGRESS" },
        },
        {
          method: "POST",
          url: `/api/admin/tasks/items/${sampleTaskItem.id}/reset`,
          body: {},
        },
        {
          method: "POST",
          url: `/api/admin/tasks/items/${sampleTaskItem.id}/close`,
          body: {},
        },
        {
          method: "DELETE",
          url: `/api/admin/tasks/items/${sampleTaskItem.id}`,
          body: undefined,
        },
      ];

      for (const op of operations) {
        seedTaskItemDependentCaches();
        const res = await app.request(op.url, {
          method: op.method,
          headers: {
            Cookie: `access_token=${adminToken}`,
            ...(op.body ? { "Content-Type": "application/json" } : {}),
          },
          body: op.body ? JSON.stringify(op.body) : undefined,
        });

        expect(res.status).toBe(200);
        expect(memoryStore.has("tasks:items:all")).toBe(false);
        expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
        expect(memoryStore.has("admin:tasks:all")).toBe(false);
        expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);
        expect(memoryStore.has(`staff:home:${staffUserId}:2026-10-14`)).toBe(false);
      }
    });
  });

  // ==========================================================================
  // 3. POST /api/staff/tasks/claim Cross-Domain Cache Invalidation
  // ==========================================================================
  describe("3. POST /api/staff/tasks/claim Marketplace & Staff Cache Invalidation", () => {
    it("invalidates tasks:items:*, admin:tasks:*, staff:tasks:*, and tasks:market:* when staff claims a marketplace item", async () => {
      memoryStore.set("tasks:items:all", JSON.stringify([sampleTaskItem]));
      memoryStore.set("tasks:market:open", JSON.stringify([sampleTaskItem]));
      memoryStore.set("admin:tasks:all", JSON.stringify([]));
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 0 }));
      memoryStore.set(`user:tasks:my:${staffUserId}`, JSON.stringify([]));

      mockTaskItemUpdateMany.mockResolvedValue({ count: 1 });
      mockTaskItemFindUnique.mockResolvedValue({
        ...sampleTaskItem,
        status: "IN_PROGRESS",
        assigneeId: staffUserId,
      });
      mockUserTaskCreate.mockResolvedValue({
        id: "ut-claimed-1",
        userId: staffUserId,
        taskDefId: sampleDefinition.id,
        taskItemId: sampleTaskItem.id,
        unitPrice: sampleDefinition.baseReward,
        status: "PENDING",
        note: sampleTaskItem.description,
        taskDefinition: sampleDefinition,
        taskItem: { ...sampleTaskItem, status: "IN_PROGRESS", assigneeId: staffUserId },
      });

      const res = await app.request("/api/staff/tasks/claim", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskItemId: sampleTaskItem.id }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Admin Marketplace (tasks:items:all) and Staff Market (tasks:market:open) must be invalidated immediately
      expect(memoryStore.has("tasks:items:all")).toBe(false);
      expect(memoryStore.has("tasks:market:open")).toBe(false);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`user:tasks:my:${staffUserId}`)).toBe(false);

      expect(mockRedis.keys).toHaveBeenCalledWith("tasks:items:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("staff:tasks:*");
      expect(mockRedis.keys).toHaveBeenCalledWith("admin:tasks:*");
    });
  });

  // ==========================================================================
  // 4. Document RAG Keyword Fallback Cache (meta:documents:all)
  // ==========================================================================
  describe("4. POST /api/documents/chat Keyword Fallback Cache", () => {
    it("caches prisma.document.findMany under meta:documents:all (TTL 600s) during keyword fallback", async () => {
      const originalGeminiKey = process.env.GEMINI_API_KEY;
      const originalGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      try {
        mockDocumentFindMany.mockResolvedValue([
          {
            id: "doc-fallback-1",
            title: "Quy chế chấm công LimArt",
            path: "quy-che/cham-cong",
            content: "Nhân viên đi làm đúng giờ theo ca đã đăng ký trên hệ thống.",
            createdAt: new Date("2026-10-01T00:00:00Z"),
            updatedAt: new Date("2026-10-01T00:00:00Z"),
          },
        ]);

        // First chat query (cold cache)
        const res1 = await app.request("/api/documents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "Quy chế chấm công hệ thống" }),
        });

        expect(res1.status).toBe(200);
        expect(mockDocumentFindMany).toHaveBeenCalledTimes(1);
        expect(memoryStore.has("meta:documents:all")).toBe(true);

        // Second chat query (hot cache hit - no extra DB query)
        const res2 = await app.request("/api/documents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "Hướng dẫn đăng ký chấm công" }),
        });

        expect(res2.status).toBe(200);
        expect(mockDocumentFindMany).toHaveBeenCalledTimes(1);
      } finally {
        if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
        if (originalGoogleKey !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleKey;
      }
    });
  });
});
