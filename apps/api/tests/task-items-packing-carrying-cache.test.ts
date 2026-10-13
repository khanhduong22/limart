import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockTaskItemFindMany,
  mockTaskItemFindUnique,
  mockTaskItemCreate,
  mockTaskItemUpdate,
  mockTaskItemDelete,
  mockTaskItemUpdateMany,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionFindUnique,
  mockUserTaskFindMany,
  mockUserTaskFindUnique,
  mockUserTaskCreate,
  mockUserTaskUpdate,
  mockPayrollAdjustmentCreate,
  mockPayrollAdjustmentDeleteMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTaskItemFindMany: vi.fn(),
  mockTaskItemFindUnique: vi.fn(),
  mockTaskItemCreate: vi.fn(),
  mockTaskItemUpdate: vi.fn(),
  mockTaskItemDelete: vi.fn(),
  mockTaskItemUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionFindUnique: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskFindUnique: vi.fn(),
  mockUserTaskCreate: vi.fn(),
  mockUserTaskUpdate: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn().mockResolvedValue({ id: "adj-1" }),
  mockPayrollAdjustmentDeleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockQueryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    taskItem: {
      findMany: mockTaskItemFindMany,
      findUnique: mockTaskItemFindUnique,
      create: mockTaskItemCreate,
      update: mockTaskItemUpdate,
      delete: mockTaskItemDelete,
      updateMany: mockTaskItemUpdateMany,
    },
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      findUnique: mockTaskDefinitionFindUnique,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      findUnique: mockUserTaskFindUnique,
      create: mockUserTaskCreate,
      update: mockUserTaskUpdate,
      delete: vi.fn().mockResolvedValue({ id: "task-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
      deleteMany: mockPayrollAdjustmentDeleteMany,
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

describe("Task Items & Staff Packing/Carrying Valkey Caching Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const adminUserId = "admin-test-uid";
  const staffUserId = "staff-test-uid";

  const sampleTaskItem = {
    id: "item-1",
    taskDefId: "def-packing-1",
    title: "Đóng gói 50 hộp quà",
    description: "Nhiệm vụ đóng gói hộp quà Tết",
    deadline: new Date("2026-12-31T00:00:00Z"),
    status: "OPEN",
    createdAt: new Date("2026-10-01T08:00:00Z"),
    updatedAt: new Date("2026-10-01T08:00:00Z"),
    taskDefinition: {
      id: "def-packing-1",
      name: "Đóng gói hộp quà",
      unit: "điểm",
      baseReward: 5000,
    },
    assignee: null,
  };

  const samplePackingDef = {
    id: "def-packing-1",
    name: "Đóng gói hộp quà",
    unit: "điểm",
    baseReward: 5000,
    active: true,
  };

  const sampleCarryingDef = {
    id: "def-carrying-1",
    name: "Bưng hàng lên lầu 3",
    unit: "điểm-bưng",
    baseReward: 8000,
    active: true,
  };

  const samplePackingUserTask = {
    id: "ut-packing-1",
    userId: staffUserId,
    taskDefId: "def-packing-1",
    quantity: 10,
    unitPrice: 5000,
    finalAmount: 50000,
    status: "APPROVED",
    createdAt: new Date(),
    submittedAt: new Date(),
    taskDefinition: samplePackingDef,
  };

  const sampleCarryingUserTask = {
    id: "ut-carrying-1",
    userId: staffUserId,
    taskDefId: "def-carrying-1",
    quantity: 5,
    unitPrice: 8000,
    finalAmount: 40000,
    status: "APPROVED",
    createdAt: new Date(),
    submittedAt: new Date(),
    taskDefinition: sampleCarryingDef,
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

    mockTaskItemFindMany.mockResolvedValue([sampleTaskItem]);
    mockTaskDefinitionFindMany.mockImplementation(async ({ where }: any) => {
      if (where?.unit === "điểm") return [samplePackingDef];
      if (where?.unit === "điểm-bưng") return [sampleCarryingDef];
      return [];
    });
    mockTaskDefinitionFindUnique.mockImplementation(async ({ where }: any) => {
      if (where?.id === "def-packing-1") return samplePackingDef;
      if (where?.id === "def-carrying-1") return sampleCarryingDef;
      return null;
    });
  });

  afterEach(() => {
    setRedisClient(null);
    inFlightPromises.clear();
  });

  // ==========================================================================
  // 1. Task Items Valkey Caching (GET /api/tasks/items & invalidation)
  // ==========================================================================
  describe("1. Task Items Valkey Caching (tasks:items:all)", () => {
    it("caches task items on GET /api/tasks/items and serves cache hit on subsequent requests", async () => {
      const res1 = await app.request("/api/tasks/items", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(json1.data[0].id).toBe("item-1");
      expect(mockTaskItemFindMany).toHaveBeenCalledTimes(1);
      expect(memoryStore.has("tasks:items:all")).toBe(true);

      // Second request: Cache hit, DB findMany should NOT be called again
      const res2 = await app.request("/api/tasks/items", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      expect(mockTaskItemFindMany).toHaveBeenCalledTimes(1);
    });

    it("serves cache hit on GET /api/admin/tasks/items", async () => {
      const res1 = await app.request("/api/admin/tasks/items", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      expect(mockTaskItemFindMany).toHaveBeenCalledTimes(1);

      const res2 = await app.request("/api/admin/tasks/items", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      expect(mockTaskItemFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates tasks:items:* cache on task item creation", async () => {
      // Prime cache
      await app.request("/api/tasks/items", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("tasks:items:all")).toBe(true);

      mockTaskItemCreate.mockResolvedValue({
        id: "item-2",
        taskDefId: "def-packing-1",
        title: "Đóng gói 100 hộp",
        status: "OPEN",
      });

      const createRes = await app.request("/api/tasks/items", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskDefId: "def-packing-1",
          title: "Đóng gói 100 hộp",
        }),
      });
      expect(createRes.status).toBe(201);
      expect(memoryStore.has("tasks:items:all")).toBe(false);

      // Next GET triggers DB query
      await app.request("/api/tasks/items", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(mockTaskItemFindMany).toHaveBeenCalledTimes(2);
    });

    it("invalidates tasks:items:* cache on task item deletion", async () => {
      // Prime cache
      await app.request("/api/tasks/items", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("tasks:items:all")).toBe(true);

      mockTaskItemFindUnique.mockResolvedValue(sampleTaskItem);
      mockTaskItemDelete.mockResolvedValue(sampleTaskItem);

      const delRes = await app.request("/api/tasks/items/item-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(delRes.status).toBe(200);
      expect(memoryStore.has("tasks:items:all")).toBe(false);

      // Next GET triggers DB query
      await app.request("/api/tasks/items", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(mockTaskItemFindMany).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // 2. Staff Packing Summary Valkey Caching & Invalidation
  // ==========================================================================
  describe("2. Staff Packing Summary Valkey Caching (staff:tasks:packing-summary:*)", () => {
    it("caches packing summary on GET /api/staff/tasks/packing-summary and returns cache hit on subsequent calls", async () => {
      mockUserTaskFindMany.mockResolvedValue([samplePackingUserTask]);

      const res1 = await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.totalPoints).toBe(50000);
      expect(json1.data.approvedCount).toBe(1);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);

      const expectedCacheKey = `staff:tasks:packing-summary:${staffUserId}`;
      expect(memoryStore.has(expectedCacheKey)).toBe(true);

      // Subsequent call should hit cache without querying userTask.findMany again
      const res2 = await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.totalPoints).toBe(50000);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. Staff Carrying Summary Valkey Caching & Invalidation
  // ==========================================================================
  describe("3. Staff Carrying Summary Valkey Caching (staff:tasks:carrying-summary:*)", () => {
    it("caches carrying summary on GET /api/staff/tasks/carrying-summary and returns cache hit on subsequent calls", async () => {
      mockUserTaskFindMany.mockResolvedValue([sampleCarryingUserTask]);

      const res1 = await app.request("/api/staff/tasks/carrying-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.totalPoints).toBe(40000);
      expect(json1.data.totalTrips).toBe(40000);
      expect(json1.data.approvedCount).toBe(1);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);

      const expectedCacheKey = `staff:tasks:carrying-summary:${staffUserId}`;
      expect(memoryStore.has(expectedCacheKey)).toBe(true);

      // Subsequent call should hit cache without querying userTask.findMany again
      const res2 = await app.request("/api/staff/tasks/carrying-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.totalPoints).toBe(40000);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 4. Invalidation of staff:tasks:* on Actions & Reviews
  // ==========================================================================
  describe("4. Cache Invalidation of staff:tasks:* on task submission & admin review", () => {
    it("invalidates packing and carrying summaries when staff submits a task", async () => {
      // Prime both packing and carrying caches
      mockUserTaskFindMany.mockResolvedValue([samplePackingUserTask]);
      await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      mockUserTaskFindMany.mockResolvedValue([sampleCarryingUserTask]);
      await app.request("/api/staff/tasks/carrying-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      const packingKey = `staff:tasks:packing-summary:${staffUserId}`;
      const carryingKey = `staff:tasks:carrying-summary:${staffUserId}`;
      expect(memoryStore.has(packingKey)).toBe(true);
      expect(memoryStore.has(carryingKey)).toBe(true);

      mockUserTaskCreate.mockResolvedValue({
        id: "ut-new-1",
        userId: staffUserId,
        taskDefId: "def-packing-1",
        status: "SUBMITTED",
        quantity: 2,
        unitPrice: 5000,
      });

      const submitRes = await app.request("/api/staff/tasks/submit", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskDefId: "def-packing-1",
          quantity: 2,
          note: "Hoàn thành 2 hộp quà",
        }),
      });
      expect(submitRes.status).toBe(200);

      // Both summary caches must be invalidated!
      expect(memoryStore.has(packingKey)).toBe(false);
      expect(memoryStore.has(carryingKey)).toBe(false);
    });

    it("invalidates staff:tasks:* when admin reviews (approves) a task", async () => {
      // Prime packing cache
      mockUserTaskFindMany.mockResolvedValue([samplePackingUserTask]);
      await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      const packingKey = `staff:tasks:packing-summary:${staffUserId}`;
      expect(memoryStore.has(packingKey)).toBe(true);

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-packing-1",
        userId: staffUserId,
        status: "SUBMITTED",
        quantity: 10,
        unitPrice: 5000,
        taskDefinition: samplePackingDef,
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-packing-1",
        status: "APPROVED",
        finalAmount: 50000,
      });

      const reviewRes = await app.request("/api/admin/tasks/ut-packing-1/approve", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      expect(reviewRes.status).toBe(200);

      // Cache must be invalidated!
      expect(memoryStore.has(packingKey)).toBe(false);
    });
  });
});
