import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionFindUnique,
  mockTaskDefinitionCreate,
  mockTaskDefinitionUpdate,
  mockTaskDefinitionDelete,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionFindUnique: vi.fn(),
  mockTaskDefinitionCreate: vi.fn(),
  mockTaskDefinitionUpdate: vi.fn(),
  mockTaskDefinitionDelete: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      findUnique: mockTaskDefinitionFindUnique,
      create: mockTaskDefinitionCreate,
      update: mockTaskDefinitionUpdate,
      delete: mockTaskDefinitionDelete,
    },
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Task Definitions Valkey Caching & /health Log Suppression Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockAdminUser = {
    id: "admin-user-1",
    email: "admin@limart.vn",
    role: "ADMIN",
    isActive: true,
  };

  const mockStaffUser = {
    id: "staff-user-1",
    email: "staff@limart.vn",
    role: "USER",
    isActive: true,
  };

  const sampleDefinitions = [
    {
      id: "def-1",
      name: "Đóng gói Hộp quà Tết Limited",
      description: "Đóng gói hộp quà Tết",
      baseReward: 3500,
      unit: "hộp",
      active: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "def-2",
      name: "Sản xuất Video ngắn TikTok",
      description: "Quay và dựng video",
      baseReward: 200000,
      unit: "video",
      active: true,
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
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
      sub: mockAdminUser.id,
      email: mockAdminUser.email,
      role: mockAdminUser.role,
    });

    staffToken = await signAccessToken({
      sub: mockStaffUser.id,
      email: mockStaffUser.email,
      role: mockStaffUser.role,
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === mockAdminUser.id || where.email === mockAdminUser.email) {
        return mockAdminUser;
      }
      if (where.id === mockStaffUser.id || where.email === mockStaffUser.email) {
        return mockStaffUser;
      }
      return null;
    });

    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mockTaskDefinitionFindMany.mockResolvedValue(sampleDefinitions);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. /health Endpoint Verification & Log Suppression
  // ==========================================================================
  describe("1. /health endpoint and log suppression", () => {
    it("returns 200 OK and healthy status without logging to console", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");

      const res = await app.request("/health");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.db).toBe("connected");
      expect(body.valkey).toBe("connected");
      expect(body.meilisearch).toBe("connected");

      // Verify that request logger did NOT log anything for /health
      const healthLogs = consoleLogSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("/health")
      );
      expect(healthLogs.length).toBe(0);

      consoleLogSpy.mockRestore();
    });

    it("logs console output for non-health endpoints", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");

      const res = await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res.status).toBe(200);

      // Verify console.log was called with request/response info
      const apiLogs = consoleLogSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("/api/tasks/definitions")
      );
      expect(apiLogs.length).toBeGreaterThanOrEqual(2); // <-- and -->

      consoleLogSpy.mockRestore();
    });
  });

  // ==========================================================================
  // 2. GET /api/tasks/definitions Valkey Caching
  // ==========================================================================
  describe("2. GET /api/tasks/definitions caching", () => {
    it("caches task definitions with key meta:task-definitions:all and serves subsequent requests from cache", async () => {
      // First call: Cold cache
      const res1 = await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(2);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);

      // Verify memoryStore has the cache key
      expect(memoryStore.has("meta:task-definitions:all")).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "meta:task-definitions:all",
        expect.any(Number),
        expect.any(String)
      );

      // Second call: Hot cache hit
      const res2 = await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(2);

      // prisma.taskDefinition.findMany must NOT be called again
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith("meta:task-definitions:all");
    });

    it("shares cache between /api/tasks/definitions and /api/admin/tasks/definitions", async () => {
      // Warm up cache via /api/tasks/definitions
      const res1 = await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);

      // Fetch via admin route alias /api/admin/tasks/definitions
      const res2 = await app.request("/api/admin/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(2);

      // Should still be 1 call to prisma
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. Cache Invalidation on Mutations
  // ==========================================================================
  describe("3. Cache invalidation on mutations", () => {
    it("invalidates meta:task-definitions:* when creating a task definition", async () => {
      // Warm cache
      await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("meta:task-definitions:all")).toBe(true);

      const newDef = {
        id: "def-3",
        name: "Kiểm tra hàng tồn kho",
        description: "Kiểm kho định kỳ",
        baseReward: 50000,
        unit: "ca",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTaskDefinitionCreate.mockResolvedValue(newDef);

      // Create definition
      const createRes = await app.request("/api/tasks/definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Kiểm tra hàng tồn kho",
          description: "Kiểm kho định kỳ",
          baseReward: 50000,
          unit: "ca",
        }),
      });
      expect(createRes.status).toBe(201);

      // Cache key must be evicted
      expect(memoryStore.has("meta:task-definitions:all")).toBe(false);

      // Next GET should query prisma again
      mockTaskDefinitionFindMany.mockResolvedValue([...sampleDefinitions, newDef]);
      const resAfter = await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resAfter.status).toBe(200);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(2);
    });

    it("invalidates meta:task-definitions:* when updating a task definition", async () => {
      // Warm cache
      await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("meta:task-definitions:all")).toBe(true);

      mockTaskDefinitionFindUnique.mockResolvedValue(sampleDefinitions[0]);
      mockTaskDefinitionUpdate.mockResolvedValue({
        ...sampleDefinitions[0],
        baseReward: 4000,
      });

      // Update definition
      const updateRes = await app.request(`/api/tasks/definitions/${sampleDefinitions[0].id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          baseReward: 4000,
        }),
      });
      expect(updateRes.status).toBe(200);

      // Cache key must be evicted
      expect(memoryStore.has("meta:task-definitions:all")).toBe(false);

      // Next GET queries DB
      const resAfter = await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resAfter.status).toBe(200);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(2);
    });

    it("invalidates meta:task-definitions:* when deleting a task definition", async () => {
      // Warm cache
      await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("meta:task-definitions:all")).toBe(true);

      mockTaskDefinitionFindUnique.mockResolvedValue({
        ...sampleDefinitions[1],
        _count: { tasks: 0, taskItems: 0 },
      });
      mockTaskDefinitionDelete.mockResolvedValue(sampleDefinitions[1]);

      // Delete definition
      const deleteRes = await app.request(`/api/tasks/definitions/${sampleDefinitions[1].id}`, {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(deleteRes.status).toBe(200);

      // Cache key must be evicted
      expect(memoryStore.has("meta:task-definitions:all")).toBe(false);

      // Next GET queries DB
      const resAfter = await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resAfter.status).toBe(200);
      expect(mockTaskDefinitionFindMany).toHaveBeenCalledTimes(2);
    });

    it("does NOT invalidate cache when mutation fails validation", async () => {
      // Warm cache
      await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("meta:task-definitions:all")).toBe(true);

      // Attempt invalid create (missing required fields)
      const badCreateRes = await app.request("/api/tasks/definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({}),
      });
      expect(badCreateRes.status).toBe(400);

      // Cache should still be intact
      expect(memoryStore.has("meta:task-definitions:all")).toBe(true);
      expect(mockTaskDefinitionCreate).not.toHaveBeenCalled();
    });

    it("does NOT invalidate cache when updating non-existent definition", async () => {
      // Warm cache
      await app.request("/api/tasks/definitions", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("meta:task-definitions:all")).toBe(true);

      mockTaskDefinitionFindUnique.mockResolvedValue(null);

      // Attempt update on non-existent ID
      const notFoundRes = await app.request("/api/tasks/definitions/def-non-existent", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ name: "New Name" }),
      });
      expect(notFoundRes.status).toBe(404);

      // Cache should still be intact
      expect(memoryStore.has("meta:task-definitions:all")).toBe(true);
      expect(mockTaskDefinitionUpdate).not.toHaveBeenCalled();
    });
  });
});
