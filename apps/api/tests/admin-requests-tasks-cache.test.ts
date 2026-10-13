import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindMany,
  mockUserFindUnique,
  mockRequestFindMany,
  mockRequestFindUnique,
  mockRequestCreate,
  mockRequestUpdate,
  mockUserTaskFindMany,
  mockUserTaskFindUnique,
  mockUserTaskUpdate,
  mockUserTaskDelete,
  mockUserTaskDeleteMany,
  mockPayrollAdjustmentCreate,
  mockPayrollAdjustmentDeleteMany,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockRequestFindUnique: vi.fn(),
  mockRequestCreate: vi.fn(),
  mockRequestUpdate: vi.fn(),
  mockUserTaskFindMany: vi.fn(),
  mockUserTaskFindUnique: vi.fn(),
  mockUserTaskUpdate: vi.fn(),
  mockUserTaskDelete: vi.fn(),
  mockUserTaskDeleteMany: vi.fn(),
  mockPayrollAdjustmentCreate: vi.fn(),
  mockPayrollAdjustmentDeleteMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      count: vi.fn().mockResolvedValue(5),
    },
    request: {
      findMany: mockRequestFindMany,
      findUnique: mockRequestFindUnique,
      create: mockRequestCreate,
      update: mockRequestUpdate,
      count: vi.fn().mockResolvedValue(1),
    },
    userTask: {
      findMany: mockUserTaskFindMany,
      findUnique: mockUserTaskFindUnique,
      update: mockUserTaskUpdate,
      delete: mockUserTaskDelete,
      deleteMany: mockUserTaskDeleteMany,
      count: vi.fn().mockResolvedValue(1),
    },
    payrollAdjustment: {
      create: mockPayrollAdjustmentCreate,
      deleteMany: mockPayrollAdjustmentDeleteMany,
    },
    workShift: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    allowedIP: {
      count: vi.fn().mockResolvedValue(1),
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Admin Requests & Tasks Valkey Caching Suite", () => {
  let adminToken: string;
  let userToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockAdminUser = {
    id: "admin-1",
    name: "Admin User",
    email: "admin@example.com",
    role: "ADMIN",
    image: null,
  };

  const mockStaffUser = {
    id: "user-1",
    name: "Staff Member",
    email: "staff@example.com",
    role: "USER",
    image: null,
  };

  const sampleRequest = {
    id: 10,
    userId: "user-1",
    type: "LEAVE",
    date: new Date("2026-10-15T00:00:00.000Z"),
    reason: "Family emergency",
    status: "PENDING",
    createdAt: new Date("2026-10-13T10:00:00.000Z"),
    updatedAt: new Date("2026-10-13T10:00:00.000Z"),
    user: mockStaffUser,
  };

  const sampleTask = {
    id: "ut-100",
    userId: "user-1",
    taskDefId: "td-1",
    taskItemId: "ti-1",
    quantity: 10,
    unitPrice: 25000,
    finalAmount: null,
    bonusPenalty: 0,
    adminNote: null,
    evidenceLink: "https://photos.example.com/proof-100",
    note: "Completed morning shift packaging",
    status: "SUBMITTED",
    startedAt: new Date("2026-10-13T08:00:00.000Z"),
    submittedAt: new Date("2026-10-13T09:30:00.000Z"),
    reviewedAt: null,
    reviewedBy: null,
    createdAt: new Date("2026-10-13T08:00:00.000Z"),
    user: mockStaffUser,
    taskDefinition: {
      id: "td-1",
      name: "Package Delivery Item",
      type: "PACKAGING",
      unit: "kiện",
      baseReward: 25000,
    },
    taskItem: {
      id: "ti-1",
      title: "Morning Shift Delivery Pack",
    },
  };

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

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "admin-1") return mockAdminUser;
      if (where.id === "user-1") return mockStaffUser;
      return null;
    });

    adminToken = await signAccessToken({
      sub: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
    });

    userToken = await signAccessToken({
      sub: "user-1",
      email: "staff@example.com",
      role: "USER",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  describe("1. GET /api/admin/requests Caching & Invalidation", () => {
    it("caches requests under admin:requests:all on first request and serves from cache on repeated request", async () => {
      mockRequestFindMany.mockResolvedValueOnce([sampleRequest]);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/admin/requests", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(json1.data[0].id).toBe(10);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex was called with "admin:requests:all"
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "admin:requests:all",
        expect.any(Number),
        expect.any(String)
      );
      expect(memoryStore.has("admin:requests:all")).toBe(true);

      // Request 2: Cache Hit
      const res2 = await app.request("/api/admin/requests", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      // DB was NOT called again
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates admin:requests:* on POST /api/admin/requests/:id/action", async () => {
      // Warm up cache
      mockRequestFindMany.mockResolvedValueOnce([sampleRequest]);
      await app.request("/api/admin/requests", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:requests:all")).toBe(true);

      // Execute action
      mockRequestUpdate.mockResolvedValueOnce({ ...sampleRequest, status: "APPROVED" });
      const actionRes = await app.request("/api/admin/requests/10/action", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "APPROVED" }),
      });

      expect(actionRes.status).toBe(200);
      const actionJson = await actionRes.json();
      expect(actionJson.success).toBe(true);

      // Verify admin:requests:all was deleted from cache
      expect(memoryStore.has("admin:requests:all")).toBe(false);

      // Next GET causes a cache miss and queries database
      mockRequestFindMany.mockResolvedValueOnce([{ ...sampleRequest, status: "APPROVED" }]);
      const resAfter = await app.request("/api/admin/requests", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resAfter.status).toBe(200);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(2);
    });

    it("invalidates admin:requests:* on POST /api/admin/requests/:id/approve", async () => {
      // Warm up cache
      mockRequestFindMany.mockResolvedValueOnce([sampleRequest]);
      await app.request("/api/admin/requests", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:requests:all")).toBe(true);

      // Call approve
      mockRequestUpdate.mockResolvedValueOnce({ ...sampleRequest, status: "APPROVED" });
      const approveRes = await app.request("/api/admin/requests/10/approve", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(approveRes.status).toBe(200);
      expect(memoryStore.has("admin:requests:all")).toBe(false);
    });

    it("invalidates admin:requests:* on POST /api/admin/requests/:id/reject", async () => {
      // Warm up cache
      mockRequestFindMany.mockResolvedValueOnce([sampleRequest]);
      await app.request("/api/admin/requests", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:requests:all")).toBe(true);

      // Call reject
      mockRequestUpdate.mockResolvedValueOnce({ ...sampleRequest, status: "REJECTED" });
      const rejectRes = await app.request("/api/admin/requests/10/reject", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(rejectRes.status).toBe(200);
      expect(memoryStore.has("admin:requests:all")).toBe(false);
    });

    it("invalidates admin:requests:* when staff submits new request via POST /api/requests", async () => {
      // Admin visits requests -> cache warmed
      mockRequestFindMany.mockResolvedValueOnce([sampleRequest]);
      await app.request("/api/admin/requests", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:requests:all")).toBe(true);

      // Staff member submits a new request
      mockRequestCreate.mockResolvedValueOnce({
        id: 11,
        userId: "user-1",
        type: "WFH",
        date: new Date("2026-10-16T00:00:00.000Z"),
        reason: "Working from home for personal errand",
        status: "PENDING",
      });

      const createRes = await app.request("/api/requests", {
        method: "POST",
        headers: {
          Cookie: `access_token=${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "WFH",
          date: "2026-10-16",
          reason: "Working from home for personal errand",
        }),
      });

      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      expect(createJson.success).toBe(true);

      // Verify admin:requests:all was automatically invalidated
      expect(memoryStore.has("admin:requests:all")).toBe(false);

      // When admin refetches requests, DB is hit to get newest list
      mockRequestFindMany.mockResolvedValueOnce([
        { ...sampleRequest, id: 11, type: "WFH" },
        sampleRequest,
      ]);
      const resAfter = await app.request("/api/admin/requests", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resAfter.status).toBe(200);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("2. GET /api/admin/tasks Caching & Invalidation", () => {
    it("caches formatted tasks under admin:tasks:all with 60s TTL on GET /api/admin/tasks", async () => {
      mockUserTaskFindMany.mockResolvedValueOnce([sampleTask]);

      // Request 1: Cache Miss
      const res1 = await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(json1.data[0].id).toBe("ut-100");
      expect(json1.data[0].title).toBe("Morning Shift Delivery Pack");
      expect(json1.data[0].totalReward).toBe(250000); // 10 * 25000
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex was called with "admin:tasks:all"
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "admin:tasks:all",
        expect.any(Number),
        expect.any(String)
      );
      expect(memoryStore.has("admin:tasks:all")).toBe(true);

      // Request 2: Cache Hit
      const res2 = await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(1);
      expect(json2.data[0].id).toBe("ut-100");
      // DB was NOT called again
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates admin:tasks:* on POST /api/admin/tasks/:id/approve", async () => {
      // Warm up cache
      mockUserTaskFindMany.mockResolvedValueOnce([sampleTask]);
      await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:tasks:all")).toBe(true);

      // Approve task
      mockUserTaskFindUnique.mockResolvedValueOnce(sampleTask);
      mockUserTaskUpdate.mockResolvedValueOnce({
        ...sampleTask,
        status: "APPROVED",
        finalAmount: 260000,
        bonusPenalty: 10000,
        adminNote: "Rất tốt",
      });
      mockPayrollAdjustmentCreate.mockResolvedValueOnce({ id: "pa-1" });

      const approveRes = await app.request("/api/admin/tasks/ut-100/approve", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bonusPenalty: 10000,
          adminNote: "Rất tốt",
        }),
      });

      expect(approveRes.status).toBe(200);
      const approveJson = await approveRes.json();
      expect(approveJson.success).toBe(true);

      // Verify admin:tasks:all was deleted from cache
      expect(memoryStore.has("admin:tasks:all")).toBe(false);

      // Next GET triggers DB query again
      mockUserTaskFindMany.mockResolvedValueOnce([
        { ...sampleTask, status: "APPROVED", finalAmount: 260000 },
      ]);
      const resAfter = await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(resAfter.status).toBe(200);
      expect(mockUserTaskFindMany).toHaveBeenCalledTimes(2);
    });

    it("invalidates admin:tasks:* on POST /api/admin/tasks/:id/reject", async () => {
      // Warm up cache
      mockUserTaskFindMany.mockResolvedValueOnce([sampleTask]);
      await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:tasks:all")).toBe(true);

      // Reject task
      mockUserTaskFindUnique.mockResolvedValueOnce(sampleTask);
      mockUserTaskUpdate.mockResolvedValueOnce({
        ...sampleTask,
        status: "REJECTED",
        finalAmount: 0,
        adminNote: "Thiếu hình ảnh bằng chứng",
      });

      const rejectRes = await app.request("/api/admin/tasks/ut-100/reject", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Thiếu hình ảnh bằng chứng",
        }),
      });

      expect(rejectRes.status).toBe(200);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
    });

    it("invalidates admin:tasks:* on POST /api/admin/tasks/:id/review (APPROVED decision)", async () => {
      // Warm up cache
      mockUserTaskFindMany.mockResolvedValueOnce([sampleTask]);
      await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:tasks:all")).toBe(true);

      // Review approve
      mockUserTaskFindUnique.mockResolvedValueOnce(sampleTask);
      mockUserTaskUpdate.mockResolvedValueOnce({
        ...sampleTask,
        status: "APPROVED",
        finalAmount: 250000,
      });

      const reviewRes = await app.request("/api/admin/tasks/ut-100/review", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "APPROVED",
          bonusPenalty: 0,
        }),
      });

      expect(reviewRes.status).toBe(200);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
    });

    it("invalidates admin:tasks:* on POST /api/admin/tasks/:id/review (REJECTED decision)", async () => {
      // Warm up cache
      mockUserTaskFindMany.mockResolvedValueOnce([sampleTask]);
      await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:tasks:all")).toBe(true);

      // Review reject
      mockUserTaskFindUnique.mockResolvedValueOnce(sampleTask);
      mockUserTaskUpdate.mockResolvedValueOnce({
        ...sampleTask,
        status: "REJECTED",
        finalAmount: 0,
      });

      const reviewRes = await app.request("/api/admin/tasks/ut-100/review", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "REJECTED",
          reason: "Hàng lỗi",
        }),
      });

      expect(reviewRes.status).toBe(200);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
    });

    it("invalidates admin:tasks:* on DELETE /api/admin/tasks/:id", async () => {
      // Warm up cache
      mockUserTaskFindMany.mockResolvedValueOnce([sampleTask]);
      await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:tasks:all")).toBe(true);

      // Delete task
      mockUserTaskFindUnique.mockResolvedValueOnce(sampleTask);
      mockUserTaskDelete.mockResolvedValueOnce(sampleTask);

      const delRes = await app.request("/api/admin/tasks/ut-100", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(delRes.status).toBe(200);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
    });

    it("invalidates admin:tasks:* on DELETE /api/admin/tasks/stale-pending", async () => {
      // Warm up cache
      mockUserTaskFindMany.mockResolvedValueOnce([sampleTask]);
      await app.request("/api/admin/tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(memoryStore.has("admin:tasks:all")).toBe(true);

      // Delete stale tasks
      mockUserTaskDeleteMany.mockResolvedValueOnce({ count: 5 });

      const delStaleRes = await app.request("/api/admin/tasks/stale-pending", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(delStaleRes.status).toBe(200);
      expect(memoryStore.has("admin:tasks:all")).toBe(false);
    });
  });
});
