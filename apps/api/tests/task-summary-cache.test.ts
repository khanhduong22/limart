import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockTaskDefinitionFindMany,
  mockTaskDefinitionFindUnique,
  mockUserTaskFindMany,
  mockUserTaskFindUnique,
  mockUserTaskCreate,
  mockUserTaskUpdate,
  mockUserTaskDelete,
  mockUserTaskDeleteMany,
  mockPayrollAdjustmentCreate,
  mockPayrollAdjustmentDeleteMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTaskDefinitionFindMany: vi.fn(),
  mockTaskDefinitionFindUnique: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskFindUnique: vi.fn(),
  mockUserTaskCreate: vi.fn(),
  mockUserTaskUpdate: vi.fn(),
  mockUserTaskDelete: vi.fn(),
  mockUserTaskDeleteMany: vi.fn().mockResolvedValue({ count: 1 }),
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
    taskDefinition: {
      findMany: mockTaskDefinitionFindMany,
      findUnique: mockTaskDefinitionFindUnique,
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      findUnique: mockUserTaskFindUnique,
      create: mockUserTaskCreate,
      update: mockUserTaskUpdate,
      delete: mockUserTaskDelete,
      deleteMany: mockUserTaskDeleteMany,
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
import {
  setRedisClient,
  inFlightPromises,
  invalidateTaskSummaryCache,
} from "../src/lib/cache";

describe("Task Summary Caching & Invalidation Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let otherStaffToken: string;
  let memoryStore: Map<string, string>;
  let ttlStore: Map<string, number>;
  let mockRedis: any;

  const adminUserId = "admin-summary-test";
  const staffUserId = "staff-summary-test";
  const otherStaffUserId = "staff-summary-other";

  const samplePackingDef = {
    id: "def-packing-10",
    name: "Đóng gói tiêu chuẩn",
    description: "Đóng gói hàng hóa",
    unit: "điểm",
    baseReward: 5000,
    active: true,
  };

  const sampleCarryingDef = {
    id: "def-carrying-10",
    name: "Bưng lầu tiêu chuẩn",
    description: "Bưng hàng lên tầng",
    unit: "điểm-bưng",
    baseReward: 10000,
    active: true,
  };

  const samplePackingUserTask = {
    id: "ut-packing-10",
    userId: staffUserId,
    taskDefId: "def-packing-10",
    unitPrice: 5000,
    quantity: 10,
    finalAmount: 50000,
    status: "APPROVED",
    submittedAt: new Date(),
    createdAt: new Date(),
    taskDefinition: samplePackingDef,
  };

  const sampleCarryingUserTask = {
    id: "ut-carrying-10",
    userId: staffUserId,
    taskDefId: "def-carrying-10",
    unitPrice: 10000,
    quantity: 4,
    finalAmount: 40000,
    status: "APPROVED",
    submittedAt: new Date(),
    createdAt: new Date(),
    taskDefinition: sampleCarryingDef,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    inFlightPromises.clear();

    memoryStore = new Map<string, string>();
    ttlStore = new Map<string, number>();

    mockRedis = {
      status: "ready",
      ping: vi.fn().mockResolvedValue("PONG"),
      get: vi.fn(async (key: string) => memoryStore.get(key) || null),
      setex: vi.fn(async (key: string, ttl: number, value: string) => {
        memoryStore.set(key, value);
        ttlStore.set(key, ttl);
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        let count = 0;
        for (const k of keys) {
          if (memoryStore.delete(k)) count++;
          ttlStore.delete(k);
        }
        return count;
      }),
      keys: vi.fn(async (pattern: string) => {
        const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
        const matched: string[] = [];
        for (const k of memoryStore.keys()) {
          if (regex.test(k)) matched.push(k);
        }
        return matched;
      }),
      pipeline: vi.fn(() => {
        const batchKeys: string[] = [];
        return {
          del: (...k: string[]) => batchKeys.push(...k),
          exec: async () => {
            for (const k of batchKeys) {
              memoryStore.delete(k);
              ttlStore.delete(k);
            }
            return batchKeys.map(() => [null, 1]);
          },
        };
      }),
    };

    setRedisClient(mockRedis);

    adminToken = await signAccessToken({
      sub: adminUserId,
      email: "admin.summary@limart.vn",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: staffUserId,
      email: "staff.summary@limart.vn",
      role: "USER",
    });

    otherStaffToken = await signAccessToken({
      sub: otherStaffUserId,
      email: "staff.other@limart.vn",
      role: "USER",
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === adminUserId) {
        return {
          id: adminUserId,
          name: "Admin User",
          email: "admin.summary@limart.vn",
          role: "ADMIN",
          isActive: true,
        };
      }
      if (where.id === otherStaffUserId) {
        return {
          id: otherStaffUserId,
          name: "Other Staff",
          email: "staff.other@limart.vn",
          role: "USER",
          isActive: true,
        };
      }
      return {
        id: staffUserId,
        name: "Staff User",
        email: "staff.summary@limart.vn",
        role: "USER",
        isActive: true,
      };
    });

    mockTaskDefinitionFindMany.mockImplementation(async ({ where }: any) => {
      if (where?.unit === "điểm") return [samplePackingDef];
      if (where?.unit === "điểm-bưng") return [sampleCarryingDef];
      return [samplePackingDef, sampleCarryingDef];
    });

    mockTaskDefinitionFindUnique.mockImplementation(async ({ where }: any) => {
      if (where?.id === samplePackingDef.id) return samplePackingDef;
      if (where?.id === sampleCarryingDef.id) return sampleCarryingDef;
      return null;
    });
  });

  afterEach(() => {
    setRedisClient(null);
    inFlightPromises.clear();
  });

  // ==========================================================================
  // 1. GET /api/staff/tasks/packing-summary Caching & 120s TTL with Jitter
  // ==========================================================================
  describe("1. GET /api/staff/tasks/packing-summary Caching & TTL", () => {
    it("caches packing summary on repeated calls with 120s base TTL + jitter", async () => {
      mockUserTaskFindMany.mockResolvedValue([samplePackingUserTask]);

      const res1 = await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.totalPoints).toBe(50000);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);

      const cacheKey = `staff:tasks:packing-summary:${staffUserId}`;
      expect(memoryStore.has(cacheKey)).toBe(true);

      // Verify TTL has 120s base with ±15% jitter (102 to 138 seconds)
      const storedTTL = ttlStore.get(cacheKey);
      expect(storedTTL).toBeDefined();
      expect(storedTTL).toBeGreaterThanOrEqual(102);
      expect(storedTTL).toBeLessThanOrEqual(138);

      // Second call returns cached data without hitting DB again
      const res2 = await app.request("/api/staff/tasks/packing-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2).toEqual(json1);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 2. GET /api/staff/tasks/carrying-summary Caching & 120s TTL with Jitter
  // ==========================================================================
  describe("2. GET /api/staff/tasks/carrying-summary Caching & TTL", () => {
    it("caches carrying summary on repeated calls with 120s base TTL + jitter", async () => {
      mockUserTaskFindMany.mockResolvedValue([sampleCarryingUserTask]);

      const res1 = await app.request("/api/staff/tasks/carrying-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.totalPoints).toBe(40000);
      expect(json1.data.totalTrips).toBe(40000);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);

      const cacheKey = `staff:tasks:carrying-summary:${staffUserId}`;
      expect(memoryStore.has(cacheKey)).toBe(true);

      // Verify TTL has 120s base with ±15% jitter (102 to 138 seconds)
      const storedTTL = ttlStore.get(cacheKey);
      expect(storedTTL).toBeDefined();
      expect(storedTTL).toBeGreaterThanOrEqual(102);
      expect(storedTTL).toBeLessThanOrEqual(138);

      // Second call returns cached data without hitting DB again
      const res2 = await app.request("/api/staff/tasks/carrying-summary", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2).toEqual(json1);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. Cache Invalidation on Staff Task Submissions
  // ==========================================================================
  describe("3. Cache Invalidation on Staff Task Submissions", () => {
    it("invalidates task summary cache when POST /api/staff/tasks/submit-packing is called", async () => {
      // Warm up both packing and carrying caches
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
        id: "ut-new-packing",
        userId: staffUserId,
        taskDefId: samplePackingDef.id,
        status: "SUBMITTED",
        quantity: 5,
        unitPrice: 5000,
        taskDefinition: samplePackingDef,
      });

      const res = await app.request("/api/staff/tasks/submit-packing", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskDefId: samplePackingDef.id,
          quantity: 5,
          note: "Đóng gói 5 hộp quà",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify task summary caches are purged
      expect(memoryStore.has(packingKey)).toBe(false);
      expect(memoryStore.has(carryingKey)).toBe(false);
    });

    it("invalidates task summary cache when POST /api/staff/tasks/submit-carrying is called", async () => {
      // Warm up both packing and carrying caches
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
        id: "ut-new-carrying",
        userId: staffUserId,
        taskDefId: sampleCarryingDef.id,
        status: "SUBMITTED",
        quantity: 2,
        unitPrice: 10000,
        taskDefinition: sampleCarryingDef,
      });

      const res = await app.request("/api/staff/tasks/submit-carrying", {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskDefId: sampleCarryingDef.id,
          quantity: 2,
          note: "Bưng 2 chuyến lầu",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify task summary caches are purged
      expect(memoryStore.has(packingKey)).toBe(false);
      expect(memoryStore.has(carryingKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Cache Invalidation on Admin Review, Approval, Reject & Deletion
  // ==========================================================================
  describe("4. Cache Invalidation on Admin Task Actions", () => {
    it("invalidates task summary cache on POST and PATCH /api/admin/tasks/:id/approve", async () => {
      // Test POST /tasks/:id/approve
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-test-app",
        userId: staffUserId,
        status: "SUBMITTED",
        quantity: 5,
        unitPrice: 5000,
        taskDefinition: samplePackingDef,
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-test-app",
        status: "APPROVED",
        finalAmount: 25000,
      });

      const resPost = await app.request("/api/admin/tasks/ut-test-app/approve", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resPost.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);

      // Test PATCH /tasks/:id/approve
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      const resPatch = await app.request("/api/admin/tasks/ut-test-app/approve", {
        method: "PATCH",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resPatch.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);
    });

    it("invalidates task summary cache on POST and PATCH /api/admin/tasks/:id/reject", async () => {
      // Test POST /tasks/:id/reject
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-test-rej",
        userId: staffUserId,
        status: "SUBMITTED",
        quantity: 5,
        unitPrice: 5000,
        taskDefinition: samplePackingDef,
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-test-rej",
        status: "REJECTED",
        finalAmount: 0,
      });

      const resPost = await app.request("/api/admin/tasks/ut-test-rej/reject", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resPost.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);

      // Test PATCH /tasks/:id/reject
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      const resPatch = await app.request("/api/admin/tasks/ut-test-rej/reject", {
        method: "PATCH",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resPatch.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);
    });

    it("invalidates task summary cache on POST and PATCH /api/admin/tasks/:id/review", async () => {
      // Test POST /tasks/:id/review with APPROVED decision
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-test-rev",
        userId: staffUserId,
        status: "SUBMITTED",
        quantity: 5,
        unitPrice: 5000,
        taskDefinition: samplePackingDef,
      });
      mockUserTaskUpdate.mockResolvedValue({
        id: "ut-test-rev",
        status: "APPROVED",
        finalAmount: 25000,
      });

      const resPost = await app.request("/api/admin/tasks/ut-test-rev/review", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision: "APPROVED" }),
      });
      expect(resPost.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);

      // Test PATCH /tasks/:id/review with REJECTED decision
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      const resPatch = await app.request("/api/admin/tasks/ut-test-rev/review", {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision: "REJECTED" }),
      });
      expect(resPatch.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);
    });

    it("invalidates task summary cache on DELETE and POST /api/admin/tasks/stale-pending", async () => {
      // Test DELETE /tasks/stale-pending
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      mockUserTaskDeleteMany.mockResolvedValue({ count: 3 });

      const resDelete = await app.request("/api/admin/tasks/stale-pending", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resDelete.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);

      // Test POST /tasks/stale-pending
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      const resPost = await app.request("/api/admin/tasks/stale-pending", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resPost.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);
    });

    it("invalidates task summary cache on DELETE /api/admin/tasks/:id", async () => {
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, JSON.stringify({ totalPoints: 50000 }));
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, JSON.stringify({ totalPoints: 40000 }));

      mockUserTaskFindUnique.mockResolvedValue({
        id: "ut-test-del",
        userId: staffUserId,
      });
      mockUserTaskDelete.mockResolvedValue({ id: "ut-test-del" });

      const res = await app.request("/api/admin/tasks/ut-test-del", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res.status).toBe(200);
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Unit Tests for invalidateTaskSummaryCache Helper
  // ==========================================================================
  describe("5. invalidateTaskSummaryCache Helper Function", () => {
    it("invalidates only scoped user summaries when userId is provided", async () => {
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, "val1");
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, "val2");
      memoryStore.set(`staff:tasks:packing-summary:${otherStaffUserId}`, "val3");
      memoryStore.set(`staff:tasks:carrying-summary:${otherStaffUserId}`, "val4");

      await invalidateTaskSummaryCache(staffUserId);

      // Target user keys deleted
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);

      // Other user keys retained
      expect(memoryStore.has(`staff:tasks:packing-summary:${otherStaffUserId}`)).toBe(true);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${otherStaffUserId}`)).toBe(true);
    });

    it("invalidates all task summaries when userId is omitted", async () => {
      memoryStore.set(`staff:tasks:packing-summary:${staffUserId}`, "val1");
      memoryStore.set(`staff:tasks:carrying-summary:${staffUserId}`, "val2");
      memoryStore.set(`staff:tasks:packing-summary:${otherStaffUserId}`, "val3");
      memoryStore.set(`staff:tasks:carrying-summary:${otherStaffUserId}`, "val4");

      await invalidateTaskSummaryCache();

      // All task summary keys deleted
      expect(memoryStore.has(`staff:tasks:packing-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${staffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:packing-summary:${otherStaffUserId}`)).toBe(false);
      expect(memoryStore.has(`staff:tasks:carrying-summary:${otherStaffUserId}`)).toBe(false);
    });
  });
});
