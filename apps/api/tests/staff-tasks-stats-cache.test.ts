import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockStaffTaskFindMany,
  mockStaffTaskFindUnique,
  mockStaffTaskCreate,
  mockStaffTaskUpdate,
  mockStaffTaskUpdateMany,
  mockStaffTaskDelete,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockStaffTaskFindMany: vi.fn(),
  mockStaffTaskFindUnique: vi.fn(),
  mockStaffTaskCreate: vi.fn(),
  mockStaffTaskUpdate: vi.fn(),
  mockStaffTaskUpdateMany: vi.fn(),
  mockStaffTaskDelete: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
      count: vi.fn().mockResolvedValue(2),
    },
    staffTask: {
      findMany: mockStaffTaskFindMany,
      findUnique: mockStaffTaskFindUnique,
      create: mockStaffTaskCreate,
      update: mockStaffTaskUpdate,
      updateMany: mockStaffTaskUpdateMany,
      delete: mockStaffTaskDelete,
    },
    $queryRaw: mockQueryRaw,
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  };
  return { prisma: prismaMock };
});

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Staff Tasks & KPI Stats Valkey Caching Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const testAdminId = "admin-user-1";
  const testStaffId = "staff-user-1";
  const otherStaffId = "staff-user-2";

  const sampleStaffTasks = [
    {
      id: "task-1",
      title: "Chụp ảnh sản phẩm giỏ quà",
      description: "Chụp 10 ảnh chất lượng cao",
      status: "APPROVED",
      assigneeId: testStaffId,
      createdById: testAdminId,
      createdAt: new Date(),
      updatedAt: new Date(),
      startDate: new Date(),
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      adminNote: "Tốt",
      evidenceLink: "https://example.com/img1.jpg",
      evidenceNote: "Đã nộp",
      assignee: {
        id: testStaffId,
        name: "Nhân Viên 1",
        email: "staff1@limart.vn",
        image: null,
        staffTasksAllowed: true,
      },
      createdBy: {
        id: testAdminId,
        name: "Admin Quản Lý",
      },
    },
    {
      id: "task-2",
      title: "Kiểm kê hàng hoá kho A",
      description: "Kiểm đếm hộp quà",
      status: "DOING",
      assigneeId: testStaffId,
      createdById: testAdminId,
      createdAt: new Date(),
      updatedAt: new Date(),
      startDate: new Date(),
      deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
      adminNote: null,
      evidenceLink: null,
      evidenceNote: null,
      assignee: {
        id: testStaffId,
        name: "Nhân Viên 1",
        email: "staff1@limart.vn",
        image: null,
        staffTasksAllowed: true,
      },
      createdBy: {
        id: testAdminId,
        name: "Admin Quản Lý",
      },
    },
  ];

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

    adminToken = await signAccessToken({
      sub: testAdminId,
      email: "admin@limart.vn",
      role: "ADMIN",
    });

    staffToken = await signAccessToken({
      sub: testStaffId,
      email: "staff1@limart.vn",
      role: "USER",
    });

    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/staff-tasks/stats Caching & Hits
  // ==========================================================================
  describe("1. GET /api/staff-tasks/stats Caching & Hits", () => {
    it("caches stats calculation and serves repeated requests directly from Valkey cache", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: testAdminId,
        role: "ADMIN",
        staffTasksAllowed: true,
      });

      mockStaffTaskFindMany.mockResolvedValueOnce(sampleStaffTasks);

      // First call: cache MISS
      const res1 = await app.request(`/api/staff-tasks/stats?userId=${testStaffId}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(data1.monthly).toBeDefined();
      expect(data1.monthly.total).toBe(2);
      expect(data1.monthly.approved).toBe(1);
      expect(mockStaffTaskFindMany).toHaveBeenCalledTimes(1);

      // Check cache store
      const expectedKey = `staff-tasks:stats:admin:${testStaffId}`;
      expect(memoryStore.has(expectedKey)).toBe(true);

      // Second call: cache HIT (prisma.staffTask.findMany should NOT be called again)
      const res2 = await app.request(`/api/staff-tasks/stats?userId=${testStaffId}`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.monthly.total).toBe(2);
      expect(mockStaffTaskFindMany).toHaveBeenCalledTimes(1); // Call count remains 1!
    });

    it("caches stats for staff users under staff namespace key", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: testStaffId,
        role: "USER",
        staffTasksAllowed: true,
      });

      mockStaffTaskFindMany.mockResolvedValueOnce(sampleStaffTasks);

      // Staff call
      const res = await app.request("/api/staff-tasks/stats", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const staffKey = `staff-tasks:stats:staff:${testStaffId}`;
      expect(memoryStore.has(staffKey)).toBe(true);

      // Second staff call serves from cache
      const res2 = await app.request("/api/staff-tasks/stats", {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      expect(res2.status).toBe(200);
      expect(mockStaffTaskFindMany).toHaveBeenCalledTimes(1);
    });

    it("sorts targetUserIds deterministically in the cache key", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: testAdminId,
        role: "ADMIN",
        staffTasksAllowed: true,
      });

      mockStaffTaskFindMany.mockResolvedValue(sampleStaffTasks);

      // Query with unsorted userIds
      const res = await app.request(
        `/api/staff-tasks/stats?userIds=${otherStaffId},${testStaffId}`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );
      expect(res.status).toBe(200);

      // Expected sorted key
      const sortedKey = `staff-tasks:stats:admin:${[otherStaffId, testStaffId].sort().join(",")}`;
      expect(memoryStore.has(sortedKey)).toBe(true);

      // Querying with reversed order should hit the exact same cache key
      const resReversed = await app.request(
        `/api/staff-tasks/stats?userIds=${testStaffId},${otherStaffId}`,
        {
          headers: { Cookie: `access_token=${adminToken}` },
        }
      );
      expect(resReversed.status).toBe(200);
      expect(mockStaffTaskFindMany).toHaveBeenCalledTimes(1); // Cached hit!
    });
  });

  // ==========================================================================
  // 2. Cache Invalidation on Mutations
  // ==========================================================================
  describe("2. Cache Invalidation on Mutations", () => {
    beforeEach(() => {
      // Pre-populate cache store with mock stats keys
      memoryStore.set(`staff-tasks:stats:admin:${testStaffId}`, JSON.stringify({}));
      memoryStore.set(`staff-tasks:stats:staff:${testStaffId}`, JSON.stringify({}));
      memoryStore.set(`staff-tasks:stats:admin:all`, JSON.stringify({}));
      expect(memoryStore.size).toBe(3);
    });

    it("invalidates staff-tasks:stats:* on POST /api/staff-tasks", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: testAdminId,
        role: "ADMIN",
        staffTasksAllowed: true,
      });
      mockUserFindUnique.mockResolvedValueOnce({
        id: testStaffId,
        name: "Nhân Viên 1",
        email: "staff1@limart.vn",
        staffTasksAllowed: true,
      });

      mockStaffTaskCreate.mockResolvedValueOnce(sampleStaffTasks[0]);

      const res = await app.request("/api/staff-tasks", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Công việc mới",
          assigneeId: testStaffId,
        }),
      });

      expect(res.status).toBe(201);
      // All staff-tasks:stats:* keys should be cleared
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });

    it("invalidates staff-tasks:stats:* on PATCH /api/staff-tasks/:id", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: testAdminId,
        role: "ADMIN",
        staffTasksAllowed: true,
      });

      mockStaffTaskFindUnique.mockResolvedValueOnce(sampleStaffTasks[0]);
      mockStaffTaskUpdate.mockResolvedValueOnce({
        ...sampleStaffTasks[0],
        title: "Tên công việc cập nhật",
      });

      const res = await app.request(`/api/staff-tasks/${sampleStaffTasks[0].id}`, {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Tên công việc cập nhật",
        }),
      });

      expect(res.status).toBe(200);
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });

    it("invalidates staff-tasks:stats:* on PUT /api/staff-tasks/:id", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: testAdminId,
        role: "ADMIN",
        staffTasksAllowed: true,
      });

      mockStaffTaskFindUnique.mockResolvedValueOnce(sampleStaffTasks[0]);
      mockStaffTaskUpdate.mockResolvedValueOnce({
        ...sampleStaffTasks[0],
        title: "Tên công việc qua PUT",
      });

      const res = await app.request(`/api/staff-tasks/${sampleStaffTasks[0].id}`, {
        method: "PUT",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Tên công việc qua PUT",
        }),
      });

      expect(res.status).toBe(200);
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });

    it("invalidates staff-tasks:stats:* on DELETE /api/staff-tasks/:id", async () => {
      mockStaffTaskFindUnique.mockResolvedValueOnce(sampleStaffTasks[0]);
      mockStaffTaskDelete.mockResolvedValueOnce(sampleStaffTasks[0]);

      const res = await app.request(`/api/staff-tasks/${sampleStaffTasks[0].id}`, {
        method: "DELETE",
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });

    it("invalidates staff-tasks:stats:* on PATCH /api/staff-tasks/:id/status", async () => {
      mockStaffTaskFindUnique.mockResolvedValueOnce(sampleStaffTasks[1]);
      mockStaffTaskUpdate.mockResolvedValueOnce({
        ...sampleStaffTasks[1],
        status: "DONE",
      });

      const res = await app.request(`/api/staff-tasks/${sampleStaffTasks[1].id}/status`, {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "DONE",
        }),
      });

      expect(res.status).toBe(200);
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });

    it("invalidates staff-tasks:stats:* on POST /api/staff-tasks/bulk-status", async () => {
      mockStaffTaskUpdateMany.mockResolvedValueOnce({ count: 2 });

      const res = await app.request("/api/staff-tasks/bulk-status", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: ["task-1", "task-2"],
          status: "APPROVED",
        }),
      });

      expect(res.status).toBe(200);
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });

    it("invalidates staff-tasks:stats:* on POST /api/staff-tasks/:id/approve", async () => {
      mockStaffTaskFindUnique.mockResolvedValueOnce(sampleStaffTasks[1]);
      mockStaffTaskUpdate.mockResolvedValueOnce({
        ...sampleStaffTasks[1],
        status: "APPROVED",
      });

      const res = await app.request(`/api/staff-tasks/${sampleStaffTasks[1].id}/approve`, {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminNote: "Đã duyệt công việc xuất sắc",
        }),
      });

      expect(res.status).toBe(200);
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });

    it("invalidates staff-tasks:stats:* on POST /api/staff-tasks/:id/reject", async () => {
      mockStaffTaskFindUnique.mockResolvedValueOnce(sampleStaffTasks[1]);
      mockStaffTaskUpdate.mockResolvedValueOnce({
        ...sampleStaffTasks[1],
        status: "REJECTED",
      });

      const res = await app.request(`/api/staff-tasks/${sampleStaffTasks[1].id}/reject`, {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminNote: "Yêu cầu chụp lại ảnh rõ nét",
        }),
      });

      expect(res.status).toBe(200);
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });

    it("invalidates staff-tasks:stats:* on POST /api/staff/staff-tasks/:id/toggle", async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        id: testStaffId,
        role: "USER",
        staffTasksAllowed: true,
      });

      mockStaffTaskFindUnique.mockResolvedValueOnce(sampleStaffTasks[1]);
      mockStaffTaskUpdate.mockResolvedValueOnce({
        ...sampleStaffTasks[1],
        status: "DONE",
      });

      const res = await app.request(`/api/staff/staff-tasks/${sampleStaffTasks[1].id}/toggle`, {
        method: "POST",
        headers: {
          Cookie: `access_token=${staffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "DONE",
        }),
      });

      expect(res.status).toBe(200);
      const remainingStatsKeys = Array.from(memoryStore.keys()).filter((k) =>
        k.startsWith("staff-tasks:stats:")
      );
      expect(remainingStatsKeys.length).toBe(0);
    });
  });
});
