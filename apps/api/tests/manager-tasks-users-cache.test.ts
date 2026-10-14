import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindMany,
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdate,
  mockUserDelete,
  mockSessionDeleteMany,
  mockWorkShiftFindMany,
  mockWorkShiftCreateMany,
  mockChecklistTaskCount,
  mockChecklistTaskFindMany,
  mockChecklistTaskFindUnique,
  mockChecklistTaskCreate,
  mockChecklistTaskUpdate,
  mockChecklistTaskDelete,
  mockTransaction,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserDelete: vi.fn(),
  mockSessionDeleteMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockWorkShiftCreateMany: vi.fn(),
  mockChecklistTaskCount: vi.fn(),
  mockChecklistTaskFindMany: vi.fn(),
  mockChecklistTaskFindUnique: vi.fn(),
  mockChecklistTaskCreate: vi.fn(),
  mockChecklistTaskUpdate: vi.fn(),
  mockChecklistTaskDelete: vi.fn(),
  mockTransaction: vi.fn((actions) =>
    Array.isArray(actions) ? Promise.all(actions) : actions(prisma)
  ),
  mockQueryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
      delete: mockUserDelete,
    },
    session: {
      deleteMany: mockSessionDeleteMany,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      createMany: mockWorkShiftCreateMany,
    },
    managerChecklistTask: {
      count: mockChecklistTaskCount,
      findMany: mockChecklistTaskFindMany,
      findUnique: mockChecklistTaskFindUnique,
      create: mockChecklistTaskCreate,
      update: mockChecklistTaskUpdate,
      delete: mockChecklistTaskDelete,
    },
    managerChecklistCompletion: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
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
import { setRedisClient, inFlightPromises } from "../src/lib/cache";

describe("Manager Tasks Users Cache & Invalidation Suite", () => {
  let adminToken: string;
  let userToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const mockUsersList = [
    {
      id: "user-1",
      name: "An Nguyen",
      email: "an@limart.vn",
      image: null,
      role: "USER",
    },
    {
      id: "user-2",
      name: "Binh Tran",
      email: "binh@limart.vn",
      image: "https://limart.vn/avatar.png",
      role: "STAFF",
    },
  ];

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
      sub: "admin-mgr-1",
      email: "admin@limart.vn",
      role: "ADMIN",
    });

    userToken = await signAccessToken({
      sub: "user-mgr-1",
      email: "user@limart.vn",
      role: "USER",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  // ============================================================================
  // 1. GET /api/manager-tasks/users: Cache Hit & Serving from Valkey
  // ============================================================================
  describe("1. GET /api/manager-tasks/users Cache Lifecycle", () => {
    it("serves from DB on cache miss and stores in admin:manager-tasks:users with TTL", async () => {
      mockUserFindMany.mockResolvedValueOnce(mockUsersList);

      const res = await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].name).toBe("An Nguyen");
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex was called with "admin:manager-tasks:users" and ~300s TTL (255 - 345s)
      const cachedRaw = memoryStore.get("admin:manager-tasks:users");
      expect(cachedRaw).toBeDefined();
      expect(JSON.parse(cachedRaw!)).toEqual(mockUsersList);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        "admin:manager-tasks:users",
        expect.any(Number),
        JSON.stringify(mockUsersList)
      );
      const ttlArg = mockRedis.setex.mock.calls[0][1];
      expect(ttlArg).toBeGreaterThanOrEqual(255);
      expect(ttlArg).toBeLessThanOrEqual(345);
    });

    it("serves from cache on repeated GET without querying DB", async () => {
      mockUserFindMany.mockResolvedValueOnce(mockUsersList);

      // 1st request -> cache miss
      const res1 = await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res1.status).toBe(200);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);

      // 2nd request -> cache hit
      const res2 = await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(mockUsersList);

      // DB should NOT be called again
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).toHaveBeenCalledWith("admin:manager-tasks:users");
    });

    it("deduplicates concurrent requests using SingleFlight in-flight map", async () => {
      let resolveDb: (data: any) => void;
      const dbPromise = new Promise((resolve) => {
        resolveDb = resolve;
      });
      mockUserFindMany.mockReturnValueOnce(dbPromise);

      // Fire 3 concurrent requests simultaneously
      const req1 = app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      const req2 = app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      const req3 = app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      // Resolve the single in-flight DB call
      resolveDb!(mockUsersList);

      const [res1, res2, res3] = await Promise.all([req1, req2, req3]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(200);

      // Only ONE call to prisma.user.findMany
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // 2. Cache Invalidation via Admin Employee Mutations
  // ============================================================================
  describe("2. Cache Invalidation on Admin Employee Updates", () => {
    it("invalidates admin:manager-tasks:* when employee profile is updated via PUT /api/admin/employees/:id", async () => {
      // Seed cache
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(true);

      mockUserUpdate.mockResolvedValueOnce({
        id: "user-1",
        name: "An Nguyen Updated",
        role: "USER",
      });

      const res = await app.request("/api/admin/employees/user-1", {
        method: "PUT",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "An Nguyen Updated" }),
      });

      expect(res.status).toBe(200);
      expect(mockUserUpdate).toHaveBeenCalledTimes(1);

      // Cache pattern admin:manager-tasks:* must have been invalidated
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);

      // Next GET /api/manager-tasks/users must be a cache miss
      const freshUsers = [
        { id: "user-1", name: "An Nguyen Updated", email: "an@limart.vn", image: null, role: "USER" },
        mockUsersList[1],
      ];
      mockUserFindMany.mockResolvedValueOnce(freshUsers);

      const getRes = await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(getRes.status).toBe(200);
      const json = await getRes.json();
      expect(json.data[0].name).toBe("An Nguyen Updated");
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    });

    it("invalidates admin:manager-tasks:* when employee is updated via PATCH /api/admin/employees/:id", async () => {
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(true);

      mockUserUpdate.mockResolvedValueOnce({
        id: "user-1",
        name: "An Nguyen Patched",
        role: "ADMIN",
      });

      const res = await app.request("/api/admin/employees/user-1", {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "ADMIN" }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
    });

    it("invalidates admin:manager-tasks:* when employee status is updated via PATCH /api/admin/employees/:id/status", async () => {
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(true);

      mockUserUpdate.mockResolvedValueOnce({
        id: "user-2",
        name: "Binh Tran",
        isActive: false,
      });
      mockSessionDeleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.request("/api/admin/employees/user-2/status", {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: false }),
      });

      expect(res.status).toBe(200);
      expect(mockUserUpdate).toHaveBeenCalledTimes(1);
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
    });

    it("invalidates admin:manager-tasks:* when employee is created via POST /api/admin/employees", async () => {
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(true);

      mockUserFindUnique.mockResolvedValueOnce(null); // No email conflict
      mockUserCreate.mockResolvedValueOnce({
        id: "user-3",
        name: "Cuong Le",
        email: "cuong@limart.vn",
        role: "USER",
        employmentType: "PART_TIME",
        hourlyRate: 30000,
        monthlySalary: 0,
        isActive: true,
      });

      const res = await app.request("/api/admin/employees", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Cuong Le",
          email: "cuong@limart.vn",
          role: "USER",
          employmentType: "PART_TIME",
          hourlyRate: 30000,
          monthlySalary: 0,
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
    });

    it("invalidates admin:manager-tasks:* when employee is deleted via DELETE /api/admin/employees/:id", async () => {
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(true);

      mockUserDelete.mockResolvedValueOnce({ id: "user-2" });

      const res = await app.request("/api/admin/employees/user-2", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(mockUserDelete).toHaveBeenCalledTimes(1);
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
    });
  });

  // ============================================================================
  // 3. Cache Invalidation via Manager Tasks Template Mutations
  // ============================================================================
  describe("3. Cache Invalidation on Template Mutations in Manager Tasks", () => {
    it("invalidates admin:manager-tasks:* and manager-tasks:templates:* on POST /api/manager-tasks/templates", async () => {
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      memoryStore.set("manager-tasks:templates:user-1", JSON.stringify([{ id: "task-1" }]));

      mockChecklistTaskCreate.mockResolvedValueOnce({
        id: "task-new-1",
        title: "🧹 Dọn dẹp quầy kệ",
        assigneeId: "user-1",
        active: true,
      });

      const res = await app.request("/api/manager-tasks/templates", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "🧹 Dọn dẹp quầy kệ",
          description: "Quét dọn sạch sẽ",
          assigneeId: "user-1",
        }),
      });

      expect(res.status).toBe(200);
      expect(mockChecklistTaskCreate).toHaveBeenCalledTimes(1);

      // Both admin:manager-tasks:* and manager-tasks:templates:* must be purged
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
      expect(memoryStore.has("manager-tasks:templates:user-1")).toBe(false);
    });

    it("invalidates admin:manager-tasks:* and manager-tasks:templates:* on DELETE /api/manager-tasks/templates/:id", async () => {
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      memoryStore.set("manager-tasks:templates:user-1", JSON.stringify([{ id: "task-1" }]));

      mockChecklistTaskFindUnique.mockResolvedValueOnce({
        id: "task-1",
        title: "Test Task",
        assigneeId: "user-1",
      });
      mockChecklistTaskDelete.mockResolvedValueOnce({ id: "task-1" });

      const res = await app.request("/api/manager-tasks/templates/task-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(mockChecklistTaskDelete).toHaveBeenCalledTimes(1);

      // Both admin:manager-tasks:* and manager-tasks:templates:* must be purged
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
      expect(memoryStore.has("manager-tasks:templates:user-1")).toBe(false);
    });

    it("invalidates admin:manager-tasks:* on PUT and PATCH /api/manager-tasks/templates/:id", async () => {
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      memoryStore.set("manager-tasks:templates:user-1", JSON.stringify([{ id: "task-1" }]));

      mockChecklistTaskFindUnique.mockResolvedValueOnce({
        id: "task-1",
        title: "Test Task",
        assigneeId: "user-1",
      });
      mockChecklistTaskUpdate.mockResolvedValueOnce({
        id: "task-1",
        title: "Test Task Updated",
        assigneeId: "user-1",
      });

      const res = await app.request("/api/manager-tasks/templates/task-1", {
        method: "PUT",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Task Updated" }),
      });

      expect(res.status).toBe(200);
      expect(mockChecklistTaskUpdate).toHaveBeenCalledTimes(1);
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
      expect(memoryStore.has("manager-tasks:templates:user-1")).toBe(false);
    });

    it("invalidates admin:manager-tasks:* on POST /api/manager-tasks/checklist/reorder", async () => {
      memoryStore.set("admin:manager-tasks:users", JSON.stringify(mockUsersList));
      mockChecklistTaskUpdate.mockResolvedValue({});

      const res = await app.request("/api/manager-tasks/checklist/reorder", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskIds: ["task-1", "task-2"] }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
    });
  });
});
