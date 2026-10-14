import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockChecklistCount,
  mockChecklistFindMany,
  mockChecklistFindUnique,
  mockCompletionFindMany,
  mockCompletionUpsert,
  mockWeeklyFindUnique,
  mockWeeklyCreate,
  mockWeeklyUpdate,
  mockRequestCreate,
  mockShiftDutyFindMany,
  mockTransaction,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockChecklistCount: vi.fn(),
  mockChecklistFindMany: vi.fn(),
  mockChecklistFindUnique: vi.fn(),
  mockCompletionFindMany: vi.fn(),
  mockCompletionUpsert: vi.fn(),
  mockWeeklyFindUnique: vi.fn(),
  mockWeeklyCreate: vi.fn(),
  mockWeeklyUpdate: vi.fn(),
  mockRequestCreate: vi.fn(),
  mockShiftDutyFindMany: vi.fn(),
  mockTransaction: vi.fn((actions) =>
    Array.isArray(actions) ? Promise.all(actions) : actions({})
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
    },
    managerChecklistCompletion: {
      findMany: mockCompletionFindMany,
      upsert: mockCompletionUpsert,
    },
    managerWeeklyTask: {
      findUnique: mockWeeklyFindUnique,
      create: mockWeeklyCreate,
      update: mockWeeklyUpdate,
    },
    request: {
      create: mockRequestCreate,
    },
    shiftDuty: {
      findMany: mockShiftDutyFindMany,
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

describe("Manager Tasks Parallelization & Schedule Duties Valkey Caching Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockAdmin = {
    id: "admin-duties-1",
    email: "admin-duties@limart.vn",
    role: "ADMIN",
    isActive: true,
  };

  const mockStaff = {
    id: "staff-duties-1",
    email: "staff-duties@limart.vn",
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

    staffToken = await signAccessToken({
      sub: mockStaff.id,
      email: mockStaff.email,
      role: mockStaff.role,
    });

    mockUserFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === mockAdmin.id || where.email === mockAdmin.email) return mockAdmin;
      if (where.id === mockStaff.id || where.email === mockStaff.email) return mockStaff;
      return null;
    });

    mockChecklistCount.mockResolvedValue(2);
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ==========================================================================
  // 1. GET /api/schedule/:id/duties Valkey Caching
  // ==========================================================================
  describe("1. GET /api/schedule/:id/duties Valkey Caching", () => {
    const sampleDuties = [
      {
        id: "duty-1",
        shiftId: 101,
        userId: mockStaff.id,
        title: "Lau dọn quầy thu ngân",
        description: "Lau sạch mặt bàn và màn hình POS",
        isCompleted: false,
        createdAt: new Date("2026-10-14T08:00:00Z"),
        user: {
          id: mockStaff.id,
          name: "Staff 1",
          email: mockStaff.email,
          image: null,
        },
      },
      {
        id: "duty-2",
        shiftId: 101,
        userId: mockStaff.id,
        title: "Kiểm hàng trưng bày",
        description: "Bổ sung kệ thiếu",
        isCompleted: true,
        createdAt: new Date("2026-10-14T08:05:00Z"),
        user: {
          id: mockStaff.id,
          name: "Staff 1",
          email: mockStaff.email,
          image: null,
        },
      },
    ];

    it("caches shift duties under shift-duties:shift:<shiftId> with 60s TTL (±15% jitter) and serves repeat calls from cache", async () => {
      mockShiftDutyFindMany.mockResolvedValueOnce(sampleDuties);

      // 1st call: Cache Miss -> hits DB and populates Valkey
      const res1 = await app.request("/api/schedule/101/duties", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(2);
      expect(mockShiftDutyFindMany).toHaveBeenCalledTimes(1);

      const expectedCacheKey = "shift-duties:shift:101";
      expect(memoryStore.has(expectedCacheKey)).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedCacheKey,
        expect.any(Number),
        expect.any(String)
      );

      const actualTTL = mockRedis.setex.mock.calls[0][1];
      expect(actualTTL).toBeGreaterThanOrEqual(Math.floor(60 * (1 - 0.15)));
      expect(actualTTL).toBeLessThanOrEqual(Math.ceil(60 * (1 + 0.15)) + 1);

      // 2nd call: Cache Hit -> served directly from Valkey without calling Prisma
      const res2 = await app.request("/api/schedule/101/duties", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toHaveLength(2);
      expect(json2.data[0].title).toBe("Lau dọn quầy thu ngân");

      expect(mockShiftDutyFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith(expectedCacheKey);
    });

    it("returns 400 for non-numeric shiftId without querying DB or caching", async () => {
      const res = await app.request("/api/schedule/invalid-id/duties", {
        headers: { Cookie: `access_token=${staffToken}` },
      });

      expect(res.status).toBe(400);
      expect(mockShiftDutyFindMany).not.toHaveBeenCalled();
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. POST /api/manager-tasks/checklist/toggle Cache Invalidation
  // ==========================================================================
  describe("2. POST /api/manager-tasks/checklist/toggle Cache Invalidation", () => {
    it("invalidates manager-tasks:stats-history:* alongside manager-tasks:checklist:*", async () => {
      const testDate = "2026-10-14";
      const checklistKey = `manager-tasks:checklist:${mockStaff.id}:${testDate}`;
      const statsHistoryKey = `manager-tasks:stats-history:${mockStaff.id}:2026-10`;
      const statsKey = `stats:monthly:${mockStaff.id}:2026-10`;
      const payrollKey = "payroll:2026-10";

      memoryStore.set(checklistKey, JSON.stringify([{ id: "task-1", completed: false }]));
      memoryStore.set(statsHistoryKey, JSON.stringify({ totalDeficiencies: 2 }));
      memoryStore.set(statsKey, JSON.stringify({ totalHours: 40 }));
      memoryStore.set(payrollKey, JSON.stringify({ totalPay: 5000000 }));

      mockChecklistFindUnique.mockResolvedValueOnce({
        id: "task-1",
        assigneeId: mockStaff.id,
      });
      mockCompletionUpsert.mockResolvedValueOnce({
        id: "comp-1",
        taskId: "task-1",
        date: testDate,
        completed: true,
        completedAt: new Date(),
      });

      const res = await app.request("/api/manager-tasks/checklist/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({
          taskId: "task-1",
          date: testDate,
          completed: true,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify both checklist and stats-history caches (plus stats and payroll) are invalidated
      expect(memoryStore.has(checklistKey)).toBe(false);
      expect(memoryStore.has(statsHistoryKey)).toBe(false);
      expect(memoryStore.has(statsKey)).toBe(false);
      expect(memoryStore.has(payrollKey)).toBe(false);
    });
  });

  // ==========================================================================
  // 3. POST /api/manager-tasks/weekly/:id/carry-over Parallel Writes & Invalidation
  // ==========================================================================
  describe("3. POST /api/manager-tasks/weekly/:id/carry-over Parallel DB Writes & Cross-Domain Cache Invalidation", () => {
    it("executes update, create, and request.create in parallel and invalidates admin:requests:*, admin:dashboard*, and user:requests:*", async () => {
      const weeklyKey = `manager-tasks:weekly:${mockStaff.id}:2026-10-12`;
      const statsHistoryKey = `manager-tasks:stats-history:${mockStaff.id}:2026-10`;
      const userRequestsKey = `user:requests:${mockStaff.id}:page:1`;
      const adminRequestsKey = "admin:requests:PENDING:1";
      const adminDashboardKey = "admin:dashboard:summary";

      memoryStore.set(weeklyKey, JSON.stringify([]));
      memoryStore.set(statsHistoryKey, JSON.stringify({}));
      memoryStore.set(userRequestsKey, JSON.stringify([]));
      memoryStore.set(adminRequestsKey, JSON.stringify([]));
      memoryStore.set(adminDashboardKey, JSON.stringify({}));

      mockWeeklyFindUnique.mockResolvedValueOnce({
        id: "weekly-task-99",
        title: "Đối soát kho cuối tuần",
        description: "Kiểm kê kệ A và B",
        assigneeId: mockStaff.id,
        weekStart: new Date("2026-10-12T00:00:00Z"),
        weekEnd: new Date("2026-10-18T23:59:59Z"),
      });

      mockWeeklyUpdate.mockResolvedValueOnce({
        id: "weekly-task-99",
        title: "Đối soát kho cuối tuần",
        explanation: "Chờ hàng nhập về kho tối Chủ Nhật",
      });

      mockWeeklyCreate.mockResolvedValueOnce({
        id: "weekly-task-100",
        title: "Đối soát kho cuối tuần",
        description: "Kiểm kê kệ A và B (Chuyển tiếp)",
        assigneeId: mockStaff.id,
        isCarriedOver: true,
      });

      mockRequestCreate.mockResolvedValueOnce({
        id: "req-weekly-99",
        userId: mockStaff.id,
        type: "WEEKLY_TASK",
        status: "PENDING",
      });

      const res = await app.request("/api/manager-tasks/weekly/weekly-task-99/carry-over", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({
          explanation: "Chờ hàng nhập về kho tối Chủ Nhật",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.updatedTask.id).toBe("weekly-task-99");
      expect(json.data.carriedOverTask.id).toBe("weekly-task-100");

      // Verify all 3 DB writes were invoked
      expect(mockWeeklyUpdate).toHaveBeenCalledTimes(1);
      expect(mockWeeklyCreate).toHaveBeenCalledTimes(1);
      expect(mockRequestCreate).toHaveBeenCalledTimes(1);

      // Verify cross-domain cache invalidations
      expect(memoryStore.has(weeklyKey)).toBe(false);
      expect(memoryStore.has(statsHistoryKey)).toBe(false);
      expect(memoryStore.has(userRequestsKey)).toBe(false);
      expect(memoryStore.has(adminRequestsKey)).toBe(false);
      expect(memoryStore.has(adminDashboardKey)).toBe(false);
    });
  });
});
