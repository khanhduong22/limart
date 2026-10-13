import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindMany,
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdate,
  mockUserDelete,
  mockRequestFindMany,
  mockRequestCreate,
  mockRequestUpdate,
  mockWorkShiftFindMany,
  mockSessionDeleteMany,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserDelete: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockRequestCreate: vi.fn(),
  mockRequestUpdate: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockSessionDeleteMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
      delete: mockUserDelete,
      count: vi.fn().mockResolvedValue(10),
    },
    request: {
      findMany: mockRequestFindMany,
      create: mockRequestCreate,
      update: mockRequestUpdate,
      count: vi.fn().mockResolvedValue(0),
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      deleteMany: mockSessionDeleteMany,
    },
    allowedIP: {
      count: vi.fn().mockResolvedValue(1),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  },
}));

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient } from "../src/lib/cache";

describe("Manager Tasks Users & Staff Requests Valkey Caching Suite", () => {
  let adminToken: string;
  let userToken: string;
  let user2Token: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

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

    adminToken = await signAccessToken({
      sub: "admin-mgr-test",
      email: "admin.mgr@example.com",
      role: "ADMIN",
    });

    userToken = await signAccessToken({
      sub: "user-req-1",
      email: "user1@example.com",
      role: "USER",
    });

    user2Token = await signAccessToken({
      sub: "user-req-2",
      email: "user2@example.com",
      role: "USER",
    });
  });

  afterEach(() => {
    setRedisClient(null);
  });

  describe("1. GET /api/manager-tasks/users Valkey Caching", () => {
    const mockUsers = [
      {
        id: "usr-1",
        name: "Alice Nguyen",
        email: "alice@example.com",
        image: null,
        role: "USER",
      },
      {
        id: "usr-2",
        name: "Bob Tran",
        email: "bob@example.com",
        image: null,
        role: "USER",
      },
    ];

    it("caches active users under admin:manager-tasks:users for 300s TTL on cache miss", async () => {
      mockUserFindMany.mockResolvedValueOnce(mockUsers);

      // First call: cache miss
      const res1 = await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(2);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex was called with key and ~300s TTL (within jitter ±15%)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "admin:manager-tasks:users",
        expect.any(Number),
        JSON.stringify(mockUsers)
      );
      const setexTTL = mockRedis.setex.mock.calls[0][1];
      expect(setexTTL).toBeGreaterThanOrEqual(255);
      expect(setexTTL).toBeLessThanOrEqual(345);
    });

    it("serves subsequent requests directly from cache without hitting DB (Cache Hit)", async () => {
      mockUserFindMany.mockResolvedValueOnce(mockUsers);

      // First call: miss
      await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);

      // Second call: hit
      const res2 = await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(mockUsers);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1); // Still 1!
      expect(mockRedis.get).toHaveBeenCalledWith("admin:manager-tasks:users");
    });
  });

  describe("2. GET /api/requests/me Valkey Caching", () => {
    const mockUser1Requests = [
      {
        id: 101,
        userId: "user-req-1",
        type: "LEAVE",
        date: "2026-10-15T00:00:00.000Z",
        reason: "Nghỉ phép thường niên",
        status: "PENDING",
        createdAt: "2026-10-13T10:00:00.000Z",
      },
    ];

    const mockUser2Requests = [
      {
        id: 102,
        userId: "user-req-2",
        type: "WFH",
        date: "2026-10-16T00:00:00.000Z",
        reason: "Làm việc từ xa",
        status: "APPROVED",
        createdAt: "2026-10-13T09:00:00.000Z",
      },
    ];

    it("caches requests under user:requests:<userId> for 60s TTL on cache miss", async () => {
      mockRequestFindMany.mockResolvedValueOnce(mockUser1Requests);

      const res1 = await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);

      // Verify Redis setex with user:requests:user-req-1 and ~60s TTL
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "user:requests:user-req-1",
        expect.any(Number),
        JSON.stringify(mockUser1Requests)
      );
      const ttl = mockRedis.setex.mock.calls[0][1];
      expect(ttl).toBeGreaterThanOrEqual(50);
      expect(ttl).toBeLessThanOrEqual(70);
    });

    it("serves subsequent GET /api/requests/me from cache without hitting DB (Cache Hit)", async () => {
      mockRequestFindMany.mockResolvedValueOnce(mockUser1Requests);

      // Miss
      await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1);

      // Hit
      const res2 = await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(mockUser1Requests);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(1); // Still 1!
    });

    it("isolates cache keys between different users", async () => {
      mockRequestFindMany
        .mockResolvedValueOnce(mockUser1Requests)
        .mockResolvedValueOnce(mockUser2Requests);

      // User 1
      await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      // User 2
      await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${user2Token}` },
      });

      expect(mockRedis.get).toHaveBeenCalledWith("user:requests:user-req-1");
      expect(mockRedis.get).toHaveBeenCalledWith("user:requests:user-req-2");
      expect(mockRequestFindMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("3. Invalidation on Request Creation (POST /api/requests)", () => {
    it("invalidates user:requests:<userId> when user submits a new request", async () => {
      // 1. Prime cache
      mockRequestFindMany.mockResolvedValueOnce([]);
      await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has("user:requests:user-req-1")).toBe(true);

      // 2. Submit new request
      const newReq = {
        id: 201,
        userId: "user-req-1",
        type: "LEAVE",
        date: new Date("2026-10-20"),
        reason: "Nghỉ khám bệnh",
        status: "PENDING",
      };
      mockRequestCreate.mockResolvedValueOnce(newReq);

      const postRes = await app.request("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${userToken}`,
        },
        body: JSON.stringify({
          type: "LEAVE",
          date: "2026-10-20",
          reason: "Nghỉ khám bệnh",
        }),
      });

      expect(postRes.status).toBe(201);
      // Key should now be invalidated
      expect(memoryStore.has("user:requests:user-req-1")).toBe(false);

      // 3. Next GET /api/requests/me should miss cache and fetch from DB
      mockRequestFindMany.mockResolvedValueOnce([newReq]);
      const resAfter = await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });

      expect(resAfter.status).toBe(200);
      expect(mockRequestFindMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("4. Invalidation on Admin Request Approval / Rejection / Action", () => {
    it("invalidates user:requests:* pattern when admin approves a request", async () => {
      // 1. Prime cache for user 1 and user 2
      mockRequestFindMany
        .mockResolvedValueOnce([{ id: 101 }])
        .mockResolvedValueOnce([{ id: 102 }]);

      await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${user2Token}` },
      });

      expect(memoryStore.has("user:requests:user-req-1")).toBe(true);
      expect(memoryStore.has("user:requests:user-req-2")).toBe(true);

      // 2. Admin approves request 101
      mockRequestUpdate.mockResolvedValueOnce({
        id: 101,
        status: "APPROVED",
      });

      const approveRes = await app.request("/api/admin/requests/101/approve", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(approveRes.status).toBe(200);
      // All user request caches matching pattern user:requests:* should be cleared
      expect(memoryStore.has("user:requests:user-req-1")).toBe(false);
      expect(memoryStore.has("user:requests:user-req-2")).toBe(false);
    });

    it("invalidates user:requests:* pattern when admin rejects a request", async () => {
      // Prime cache
      mockRequestFindMany.mockResolvedValueOnce([{ id: 101 }]);
      await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has("user:requests:user-req-1")).toBe(true);

      // Admin rejects
      mockRequestUpdate.mockResolvedValueOnce({
        id: 101,
        status: "REJECTED",
      });

      const rejectRes = await app.request("/api/admin/requests/101/reject", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(rejectRes.status).toBe(200);
      expect(memoryStore.has("user:requests:user-req-1")).toBe(false);
    });

    it("invalidates user:requests:* pattern when admin uses /action endpoint", async () => {
      // Prime cache
      mockRequestFindMany.mockResolvedValueOnce([{ id: 101 }]);
      await app.request("/api/requests/me", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has("user:requests:user-req-1")).toBe(true);

      // Admin action
      mockRequestUpdate.mockResolvedValueOnce({
        id: 101,
        status: "APPROVED",
      });

      const actionRes = await app.request("/api/admin/requests/101/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ action: "APPROVED" }),
      });

      expect(actionRes.status).toBe(200);
      expect(memoryStore.has("user:requests:user-req-1")).toBe(false);
    });
  });

  describe("5. Invalidation of admin:manager-tasks:* on Admin User / Employee Updates", () => {
    it("invalidates admin:manager-tasks:users when admin updates user via PUT /api/admin/users/:id", async () => {
      // 1. Prime manager-tasks users cache
      mockUserFindMany.mockResolvedValueOnce([{ id: "usr-1", name: "Alice" }]);
      await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(true);

      // 2. Admin updates user
      mockUserUpdate.mockResolvedValueOnce({
        id: "usr-1",
        name: "Alice Nguyen Updated",
      });

      const updateRes = await app.request("/api/admin/users/usr-1", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Alice Nguyen Updated",
        }),
      });

      expect(updateRes.status).toBe(200);
      // Key should be invalidated
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);

      // 3. Next GET /api/manager-tasks/users should miss and query DB
      mockUserFindMany.mockResolvedValueOnce([
        { id: "usr-1", name: "Alice Nguyen Updated" },
      ]);
      await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(mockUserFindMany).toHaveBeenCalledTimes(2);
    });

    it("invalidates admin:manager-tasks:users when admin updates employee via PUT /api/admin/employees/:id", async () => {
      // Prime cache
      mockUserFindMany.mockResolvedValueOnce([{ id: "usr-1", name: "Alice" }]);
      await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(true);

      // Update employee
      mockUserUpdate.mockResolvedValueOnce({
        id: "usr-1",
        name: "Alice Tran",
      });

      const updateRes = await app.request("/api/admin/employees/usr-1", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: "Alice Tran",
        }),
      });

      expect(updateRes.status).toBe(200);
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
    });

    it("invalidates admin:manager-tasks:users when admin updates status via PATCH /api/admin/employees/:id/status", async () => {
      // Prime cache
      mockUserFindMany.mockResolvedValueOnce([{ id: "usr-1", name: "Alice" }]);
      await app.request("/api/manager-tasks/users", {
        headers: { Cookie: `access_token=${userToken}` },
      });
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(true);

      // Update status
      mockUserUpdate.mockResolvedValueOnce({
        id: "usr-1",
        isActive: false,
      });

      const patchRes = await app.request("/api/admin/employees/usr-1/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${adminToken}`,
        },
        body: JSON.stringify({ isActive: false }),
      });

      expect(patchRes.status).toBe(200);
      expect(memoryStore.has("admin:manager-tasks:users")).toBe(false);
    });
  });
});
