import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockUserFindUnique,
  mockUserFindMany,
  mockPayrollPeriodFindUnique,
  mockPayslipFindUnique,
  mockPayslipFindMany,
  mockShiftDutyFindMany,
  mockShiftDutyCreate,
  mockShiftDutyDelete,
  mockStaffTaskFindMany,
  mockStaffTaskFindUnique,
  mockStaffTaskCreate,
  mockStaffTaskUpdate,
  mockStaffTaskDelete,
  mockCheckInFindMany,
  mockWorkShiftFindMany,
  mockRequestFindMany,
  mockHolidayFindMany,
  mockAdjustmentFindMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockPayrollPeriodFindUnique: vi.fn(),
  mockPayslipFindUnique: vi.fn(),
  mockPayslipFindMany: vi.fn(),
  mockShiftDutyFindMany: vi.fn(),
  mockShiftDutyCreate: vi.fn(),
  mockShiftDutyDelete: vi.fn(),
  mockStaffTaskFindMany: vi.fn(),
  mockStaffTaskFindUnique: vi.fn(),
  mockStaffTaskCreate: vi.fn(),
  mockStaffTaskUpdate: vi.fn(),
  mockStaffTaskDelete: vi.fn(),
  mockCheckInFindMany: vi.fn(),
  mockWorkShiftFindMany: vi.fn(),
  mockRequestFindMany: vi.fn(),
  mockHolidayFindMany: vi.fn(),
  mockAdjustmentFindMany: vi.fn(),
}));

vi.mock("@checkin/db", () => {
  const prismaMock: any = {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
      count: vi.fn().mockResolvedValue(1),
    },
    payrollPeriod: {
      findUnique: mockPayrollPeriodFindUnique,
    },
    payslip: {
      findUnique: mockPayslipFindUnique,
      findMany: mockPayslipFindMany,
    },
    shiftDuty: {
      findMany: mockShiftDutyFindMany,
      create: mockShiftDutyCreate,
      delete: mockShiftDutyDelete,
    },
    staffTask: {
      findMany: mockStaffTaskFindMany,
      findUnique: mockStaffTaskFindUnique,
      create: mockStaffTaskCreate,
      update: mockStaffTaskUpdate,
      delete: mockStaffTaskDelete,
    },
    checkIn: {
      findMany: mockCheckInFindMany,
    },
    workShift: {
      findMany: mockWorkShiftFindMany,
      findUnique: vi.fn(),
    },
    request: {
      findMany: mockRequestFindMany,
    },
    holiday: {
      findMany: mockHolidayFindMany,
    },
    adjustment: {
      findMany: mockAdjustmentFindMany,
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-test" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

import { app } from "../src/app";
import { signAccessToken } from "../src/lib/auth";
import { setRedisClient, inFlightPromises } from "../src/lib/cache";
import { _resetLocks } from "../src/lib/lock";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Admin Payroll, User Payroll, Shift Duties, and Staff Tasks Valkey Caching Suite", () => {
  let adminToken: string;
  let staffToken: string;
  let memoryStore: Map<string, string>;
  let mockRedis: any;

  const testAdminId = "admin-user-id-1";
  const testStaffId = "staff-user-id-1";

  beforeEach(async () => {
    vi.clearAllMocks();
    inFlightPromises.clear();
    _resetLocks();
    _resetRateLimits();

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
        const regexStr = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        const regex = new RegExp(`^${regexStr}$`);
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
      email: "staff@limart.vn",
      role: "USER",
    });

    // Default mock setup
    mockCheckInFindMany.mockResolvedValue([]);
    mockWorkShiftFindMany.mockResolvedValue([]);
    mockRequestFindMany.mockResolvedValue([]);
    mockHolidayFindMany.mockResolvedValue([]);
    mockAdjustmentFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    setRedisClient(null);
    inFlightPromises.clear();
  });

  // ==========================================================================
  // 1. GET /api/admin/payroll Caching & Invalidation
  // ==========================================================================
  describe("1. GET /api/admin/payroll Caching & Hits", () => {
    it("caches payroll calculation and serves repeated requests directly from Valkey cache", async () => {
      mockUserFindMany.mockResolvedValue([
        {
          id: testStaffId,
          name: "Nguyễn Văn A",
          email: "staff@limart.vn",
          role: "USER",
          hourlyRate: 30000,
          monthlySalary: null,
          employmentType: "PART_TIME",
          adjustments: [],
        },
      ]);

      mockUserFindUnique.mockResolvedValue({
        id: testStaffId,
        name: "Nguyễn Văn A",
        email: "staff@limart.vn",
        role: "USER",
        hourlyRate: 30000,
        monthlySalary: null,
        employmentType: "PART_TIME",
        adjustments: [],
        payslips: [],
        staffTasksAllowed: true,
      });

      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-10-2026",
        month: 10,
        year: 2026,
        status: "OPEN",
        bonusPercent: 10,
        bonusTargets: ["PART_TIME"],
        excludedBonusUsers: [],
      });

      // 1st request: Cache MISS -> executes prisma.user.findMany
      const res1 = await app.request("/api/admin/payroll?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1);

      // Verify Valkey cache key
      const expectedKey = "admin:payroll:10:2026";
      expect(memoryStore.has(expectedKey)).toBe(true);

      // 2nd request: Cache HIT -> served from Valkey, prisma.user.findMany not called again
      const res2 = await app.request("/api/admin/payroll?month=10&year=2026", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(json1.data);
      expect(mockUserFindMany).toHaveBeenCalledTimes(1); // Still 1!
    });
  });

  // ==========================================================================
  // 2. GET /api/admin/payroll/:userId Caching & Hits
  // ==========================================================================
  describe("2. GET /api/admin/payroll/:userId Caching & Hits", () => {
    it("caches user payroll detail calculation and serves repeated requests from Valkey", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: testStaffId,
        name: "Nguyễn Văn A",
        email: "staff@limart.vn",
        role: "USER",
        hourlyRate: 30000,
        monthlySalary: null,
        employmentType: "PART_TIME",
        adjustments: [],
        payslips: [],
        staffTasksAllowed: true,
      });

      mockPayrollPeriodFindUnique.mockResolvedValue({
        id: "period-10-2026",
        month: 10,
        year: 2026,
        status: "OPEN",
        bonusPercent: 10,
        bonusTargets: ["PART_TIME"],
        excludedBonusUsers: [],
      });

      mockPayslipFindUnique.mockResolvedValue(null);

      // 1st request: Cache MISS
      const res1 = await app.request(`/api/admin/payroll/${testStaffId}?month=10&year=2026`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.user.id).toBe(testStaffId);
      expect(mockUserFindUnique).toHaveBeenCalled();

      const callCountAfterFirst = mockUserFindUnique.mock.calls.length;

      // Verify Valkey cache key
      const expectedKey = `admin:payroll-user:${testStaffId}:10:2026`;
      expect(memoryStore.has(expectedKey)).toBe(true);

      // 2nd request: Cache HIT
      const res2 = await app.request(`/api/admin/payroll/${testStaffId}?month=10&year=2026`, {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.user.id).toBe(testStaffId);
      expect(mockUserFindUnique.mock.calls.length).toBe(callCountAfterFirst); // No new calls
    });
  });

  // ==========================================================================
  // 3. GET /api/admin/schedule/:id/duties & Invalidation on Create/Delete
  // ==========================================================================
  describe("3. GET /api/admin/schedule/:id/duties Caching & Invalidation", () => {
    it("caches shift duties and serves repeated requests from Valkey", async () => {
      const sampleDuties = [
        {
          id: "duty-1",
          title: "Vệ sinh máy pha cafe",
          description: "Vệ sinh kỹ vòi hơi",
          shiftId: 101,
          userId: testStaffId,
          user: { id: testStaffId, name: "Nguyễn Văn A", email: "staff@limart.vn", image: null },
        },
      ];

      mockShiftDutyFindMany.mockResolvedValue(sampleDuties);

      // 1st request: Cache MISS
      const res1 = await app.request("/api/admin/schedule/101/duties", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data).toHaveLength(1);
      expect(mockShiftDutyFindMany).toHaveBeenCalledTimes(1);

      // Verify Valkey cache key
      const expectedKey = "admin:schedule:duties:101";
      expect(memoryStore.has(expectedKey)).toBe(true);

      // 2nd request: Cache HIT
      const res2 = await app.request("/api/admin/schedule/101/duties", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data).toEqual(json1.data);
      expect(mockShiftDutyFindMany).toHaveBeenCalledTimes(1); // No second query
    });

    it("invalidates admin:schedule:duties:* when creating a duty", async () => {
      // Seed duty cache
      memoryStore.set("admin:schedule:duties:101", JSON.stringify([{ id: "duty-1" }]));
      expect(memoryStore.has("admin:schedule:duties:101")).toBe(true);

      mockShiftDutyCreate.mockResolvedValue({
        id: "duty-2",
        title: "Kiểm đếm kho",
        shiftId: 101,
        userId: testStaffId,
        user: { id: testStaffId, name: "Nguyễn Văn A", email: "staff@limart.vn", image: null },
      });

      const res = await app.request("/api/admin/schedule/duties", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Kiểm đếm kho",
          userId: testStaffId,
          shiftId: 101,
        }),
      });

      expect(res.status).toBe(201);
      // Key should be invalidated
      expect(memoryStore.has("admin:schedule:duties:101")).toBe(false);
    });

    it("invalidates admin:schedule:duties:* when deleting a duty", async () => {
      // Seed duty cache
      memoryStore.set("admin:schedule:duties:101", JSON.stringify([{ id: "duty-1" }]));
      expect(memoryStore.has("admin:schedule:duties:101")).toBe(true);

      mockShiftDutyDelete.mockResolvedValue({ id: "duty-1" });

      const res = await app.request("/api/admin/schedule/duties/duty-1", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      // Key should be invalidated
      expect(memoryStore.has("admin:schedule:duties:101")).toBe(false);
    });
  });

  // ==========================================================================
  // 4. GET /api/staff-tasks Caching & Hits
  // ==========================================================================
  describe("4. GET /api/staff-tasks Caching & Hits", () => {
    it("caches staff tasks list and serves repeated requests from Valkey", async () => {
      mockUserFindUnique.mockResolvedValue({
        id: testAdminId,
        role: "ADMIN",
        staffTasksAllowed: true,
      });

      const sampleTasks = [
        {
          id: "task-101",
          title: "Chụp ảnh sản phẩm giỏ quà Tết",
          status: "TODO",
          assigneeId: testStaffId,
          assignee: {
            id: testStaffId,
            name: "Nguyễn Văn A",
            email: "staff@limart.vn",
            image: null,
            staffTasksAllowed: true,
          },
          createdBy: { id: testAdminId, name: "Admin" },
        },
      ];

      const sampleUsers = [
        {
          id: testStaffId,
          name: "Nguyễn Văn A",
          email: "staff@limart.vn",
          image: null,
          staffTasksAllowed: true,
        },
      ];

      mockStaffTaskFindMany.mockResolvedValue(sampleTasks);
      mockUserFindMany.mockResolvedValue(sampleUsers);

      // 1st request: Cache MISS
      const res1 = await app.request("/api/staff-tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.data.tasks).toHaveLength(1);
      expect(mockStaffTaskFindMany).toHaveBeenCalledTimes(1);

      // Verify Valkey cache key
      const expectedKey = "tasks:staff-tasks:all";
      expect(memoryStore.has(expectedKey)).toBe(true);

      // 2nd request: Cache HIT
      const res2 = await app.request("/api/staff-tasks", {
        headers: { Cookie: `access_token=${adminToken}` },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.data.tasks).toEqual(json1.data.tasks);
      expect(mockStaffTaskFindMany).toHaveBeenCalledTimes(1); // Not called again!
    });
  });

  // ==========================================================================
  // 5. Staff Tasks Mutation Invalidation
  // ==========================================================================
  describe("5. Staff Tasks Mutation Cache Invalidation (tasks:staff-tasks:*)", () => {
    it("invalidates tasks:staff-tasks:* on POST /api/staff-tasks", async () => {
      memoryStore.set("tasks:staff-tasks:all", JSON.stringify({ tasks: [], users: [] }));
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(true);

      mockUserFindUnique.mockResolvedValue({
        id: testStaffId,
        name: "Nguyễn Văn A",
        staffTasksAllowed: true,
      });

      mockStaffTaskCreate.mockResolvedValue({
        id: "task-new",
        title: "Nhiệm vụ mới",
        status: "TODO",
        assigneeId: testStaffId,
        assignee: { id: testStaffId, name: "Nguyễn Văn A" },
        createdBy: { id: testAdminId, name: "Admin" },
      });

      const res = await app.request("/api/staff-tasks", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Nhiệm vụ mới",
          assigneeId: testStaffId,
        }),
      });

      expect(res.status).toBe(201);
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(false);
    });

    it("invalidates tasks:staff-tasks:* on PATCH /api/staff-tasks/:id", async () => {
      memoryStore.set("tasks:staff-tasks:all", JSON.stringify({ tasks: [], users: [] }));
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(true);

      mockStaffTaskFindUnique.mockResolvedValue({
        id: "task-101",
        title: "Cũ",
        assigneeId: testStaffId,
      });

      mockStaffTaskUpdate.mockResolvedValue({
        id: "task-101",
        title: "Mới",
        assigneeId: testStaffId,
      });

      const res = await app.request("/api/staff-tasks/task-101", {
        method: "PATCH",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Mới",
        }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(false);
    });

    it("invalidates tasks:staff-tasks:* on POST /api/staff-tasks/:id/approve", async () => {
      memoryStore.set("tasks:staff-tasks:all", JSON.stringify({ tasks: [], users: [] }));
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(true);

      mockStaffTaskFindUnique.mockResolvedValue({
        id: "task-101",
        status: "DONE",
        assigneeId: testStaffId,
      });

      mockStaffTaskUpdate.mockResolvedValue({
        id: "task-101",
        status: "APPROVED",
        assigneeId: testStaffId,
      });

      const res = await app.request("/api/staff-tasks/task-101/approve", {
        method: "POST",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(false);
    });

    it("invalidates tasks:staff-tasks:* on POST /api/staff-tasks/:id/reject", async () => {
      memoryStore.set("tasks:staff-tasks:all", JSON.stringify({ tasks: [], users: [] }));
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(true);

      mockStaffTaskFindUnique.mockResolvedValue({
        id: "task-101",
        status: "DONE",
        assigneeId: testStaffId,
      });

      mockStaffTaskUpdate.mockResolvedValue({
        id: "task-101",
        status: "REJECTED",
        assigneeId: testStaffId,
      });

      const res = await app.request("/api/staff-tasks/task-101/reject", {
        method: "POST",
        headers: {
          Cookie: `access_token=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Làm lại ảnh sản phẩm" }),
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(false);
    });

    it("invalidates tasks:staff-tasks:* on DELETE /api/staff-tasks/:id", async () => {
      memoryStore.set("tasks:staff-tasks:all", JSON.stringify({ tasks: [], users: [] }));
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(true);

      mockStaffTaskFindUnique.mockResolvedValue({
        id: "task-101",
        assigneeId: testStaffId,
      });

      mockStaffTaskDelete.mockResolvedValue({ id: "task-101" });

      const res = await app.request("/api/staff-tasks/task-101", {
        method: "DELETE",
        headers: { Cookie: `access_token=${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(memoryStore.has("tasks:staff-tasks:all")).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Invalidate Payroll Cache Helper Coverage
  // ==========================================================================
  describe("6. invalidatePayrollCache Helper Pattern Invalidation", () => {
    it("invalidates admin:payroll:*, admin:payroll-user:*, and admin:employee-detail:* when invalidatePayrollCache() is invoked", async () => {
      const { invalidatePayrollCache } = await import("../src/lib/cache");

      memoryStore.set("admin:payroll:10:2026", JSON.stringify({ data: [] }));
      memoryStore.set(`admin:payroll-user:${testStaffId}:10:2026`, JSON.stringify({ user: {} }));
      memoryStore.set(`admin:employee-detail:${testStaffId}:10:2026`, JSON.stringify({ user: {} }));
      memoryStore.set("staff:payroll:10:2026", JSON.stringify({ summary: {} }));

      expect(memoryStore.has("admin:payroll:10:2026")).toBe(true);
      expect(memoryStore.has(`admin:payroll-user:${testStaffId}:10:2026`)).toBe(true);
      expect(memoryStore.has(`admin:employee-detail:${testStaffId}:10:2026`)).toBe(true);
      expect(memoryStore.has("staff:payroll:10:2026")).toBe(true);

      await invalidatePayrollCache();

      expect(memoryStore.has("admin:payroll:10:2026")).toBe(false);
      expect(memoryStore.has(`admin:payroll-user:${testStaffId}:10:2026`)).toBe(false);
      expect(memoryStore.has(`admin:employee-detail:${testStaffId}:10:2026`)).toBe(false);
      expect(memoryStore.has("staff:payroll:10:2026")).toBe(false);
    });
  });
});

